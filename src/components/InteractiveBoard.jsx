import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  Pen, Highlighter, Eraser, Undo2, Redo2,
  Trash2, GripVertical, Upload, Plus, X, ChevronLeft, ChevronRight,
  Cloud, CloudOff, Loader2, Maximize2, Pointer,
} from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { tokenStore } from '../lib/tokenStore.js';
import { useConfirm } from '../hooks/useConfirm';

// Bundle the worker locally (Vite resolves new URL() assets at build time) —
// loading it from a CDN means every PDF open depends on unpkg being reachable.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const COLORS = [
  '#1a1a1a', '#6b7280', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff',
];
const THICKNESSES = [1.5, 3, 6, 12];
const DEFAULT_SIZE = { width: 1280, height: 960 };
const ERASER_RADIUS = 28;

// ── Drive API helpers ───────────────────────────────────────────────────────────

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function driveJson(token, path, options = {}) {
  const res = await fetch(`${DRIVE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`Drive ${res.status} ${path}`);
  return res.json();
}

async function findOrCreateFolder(token, name, parentId = 'root') {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const { files } = await driveJson(token, `/files?q=${encodeURIComponent(q)}&fields=files(id)`);
  if (files?.length) return files[0].id;
  const folder = await driveJson(token, '/files', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return folder.id;
}

async function getStudentFolderId(token, studentId) {
  const tutorId = await findOrCreateFolder(token, 'TutorApp');
  const studsId = await findOrCreateFolder(token, 'students', tutorId);
  return findOrCreateFolder(token, String(studentId), studsId);
}

async function saveToDrive(token, studentId, data) {
  const folderId = await getStudentFolderId(token, studentId);
  const today    = new Date().toISOString().slice(0, 10);
  const filename = `${today}.json`;
  const content  = JSON.stringify(data);

  const q = `name='${filename}' and '${folderId}' in parents and trashed=false`;
  const { files } = await driveJson(token, `/files?q=${encodeURIComponent(q)}&fields=files(id)`);

  if (files?.length) {
    // Update existing file (media-only PATCH)
    const res = await fetch(`${UPLOAD}/files/${files[0].id}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: content,
    });
    if (!res.ok) throw new Error(`Drive PATCH ${res.status}`);
  } else {
    // Create new file via multipart upload
    const boundary = 'zwboundary314159';
    const body = [
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      JSON.stringify({ name: filename, parents: [folderId] }),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');
    const res = await fetch(`${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    });
    if (!res.ok) throw new Error(`Drive POST ${res.status}`);
  }
}

async function loadFromDrive(token, studentId) {
  const folderId = await getStudentFolderId(token, studentId);
  const q = `'${folderId}' in parents and name contains '.json' and trashed=false`;
  const { files } = await driveJson(
    token,
    `/files?q=${encodeURIComponent(q)}&orderBy=name+desc&fields=files(id,name)&pageSize=1`,
  );
  if (!files?.length) return null;

  const res = await fetch(`${DRIVE}/files/${files[0].id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive GET ${res.status}`);
  return res.json();
}

async function findDriveFileId(token, folderId, filename) {
  const safe = filename.replace(/'/g, "\\'");
  const q = `name='${safe}' and '${folderId}' in parents and trashed=false`;
  const { files } = await driveJson(token, `/files?q=${encodeURIComponent(q)}&fields=files(id)`);
  return files?.[0]?.id || null;
}

// Uploads the raw PDF bytes to Drive so any device signed into the same
// account can recover the actual file — not just this browser's local cache.
// PDFs are immutable once uploaded (a re-opened file always has the same
// bytes), so this skips re-uploading if a file with the same name is already there.
async function saveDrivePdfBinary(token, studentId, pdfName, buffer) {
  const folderId = await getStudentFolderId(token, studentId);
  const existingId = await findDriveFileId(token, folderId, pdfName);
  if (existingId) return;
  const boundary = 'zwpdfboundary271828';
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: pdfName, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, buffer, tail]);
  const res = await fetch(`${UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body,
  });
  if (!res.ok) throw new Error(`Drive PDF upload ${res.status}`);
}

async function loadDrivePdfBinary(token, studentId, pdfName) {
  const folderId = await getStudentFolderId(token, studentId);
  const fileId = await findDriveFileId(token, folderId, pdfName);
  if (!fileId) return null;
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

// ── Local PDF binary cache (IndexedDB) ───────────────────────────────────────────
// This is a fast, offline-capable first line of recovery for "closed and
// reopened the call on the same device". Drive (above) is the second line —
// works from any device signed into the same account, just needs a network
// round trip. recoverPdfBinary() below tries local first, then Drive.
const PDF_CACHE_DB = 'zw-board-pdf-cache';
function openPdfCacheDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PDF_CACHE_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('pdfs'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function cachePdfBinary(key, buffer) {
  try {
    const db = await openPdfCacheDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite');
      tx.objectStore('pdfs').put(buffer, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) { /* non-fatal — worst case falls back to the re-upload banner */ }
}
async function loadCachedPdfBinary(key) {
  try {
    const db = await openPdfCacheDb();
    const buffer = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const req = tx.objectStore('pdfs').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return buffer;
  } catch (_) { return null; }
}

// Local cache first (instant, offline), then Drive (any device, needs network) —
// whichever succeeds is also written back to the local cache for next time.
async function recoverPdfBinary(token, studentId, pdfName) {
  const cacheKey = `${studentId}__${pdfName}`;
  const local = await loadCachedPdfBinary(cacheKey);
  if (local) return local;
  try {
    const fromDrive = await loadDrivePdfBinary(token, studentId, pdfName);
    if (fromDrive) { cachePdfBinary(cacheKey, fromDrive).catch(() => {}); return fromDrive; }
  } catch (_) { /* non-fatal — falls back to the re-upload banner */ }
  return null;
}

// ── Drawing helpers ─────────────────────────────────────────────────────────────

function drawStroke(ctx, stroke) {
  const { points, color, lineWidth, tool } = stroke;
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (tool === 'highlighter') {
    ctx.globalAlpha = 0.38;
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
  ctx.restore();
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.12)' }} />;
}

function ToolBtn({ children, onClick, active, disabled, title, danger, size = 32 }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center rounded-xl transition-all disabled:opacity-30 active:scale-90"
      style={{
        width: size, height: size,
        background: active ? '#007AFF' : 'transparent',
        color: active ? '#fff' : danger ? '#ff453a' : 'rgba(255,255,255,0.75)',
        boxShadow: active ? '0 2px 8px rgba(0,122,255,0.4)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active && !disabled)
          e.currentTarget.style.background = danger ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.1)';
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────

export function InteractiveBoard({
  onStrokeEnd, incomingStroke, onPageSync, incomingPage, onTabSync, incomingTab,
  studentId = null, onSyncRequest, incomingSync = null,
  role = 'teacher', canStudentDraw = false, onPermissionToggle,
  onStrokePoint, incomingStrokePoint,
  onPdfUpload, incomingPdfData, pdfTransferProgress = null,
  onUndo, incomingUndo, onRedo, incomingRedo, onClearPage, incomingClearPage,
  onErase, incomingErase, onBoardRestored,
}) {
  const canvasRef          = useRef(null);
  const pageContainerRef   = useRef(null);
  const boardAreaRef       = useRef(null); // outer div — used to measure available width for PDF render
  const transformRef       = useRef(null); // react-zoom-pan-pinch imperative handle (centerView/resetTransform)
  const fileInputRef       = useRef(null);
  const toolbarRef         = useRef(null);
  const activePointers     = useRef(new Set());
  const isDrawingRef       = useRef(false);
  const lastPointRef       = useRef(null);
  const currentPtsRef      = useRef([]);
  const currentStrokeIdRef = useRef(null);
  const liveStrokesRef     = useRef({});
  const dragOffsetRef      = useRef({ x: 0, y: 0 });
  const isDirtyRef         = useRef(false);
  const autoSaveTimerRef   = useRef(null);

  const [tabs, setTabs]           = useState([{ id: 'tab-1', name: 'Whiteboard 1', url: null, pdfName: null }]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [strokesByTab, setStrokesByTab] = useState({ 'tab-1': {} });
  const [redoByTab,    setRedoByTab]    = useState({ 'tab-1': {} });

  const [tool, setTool]           = useState('pen');
  const [color, setColor]         = useState('#1a1a1a');
  const [lineWidth, setLineWidth] = useState(3);
  const [numPages, setNumPages]   = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize]   = useState({ width: 0, height: 0 });
  const [eraserPos, setEraserPos] = useState(null);
  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [pdfRetryKey, setPdfRetryKey]   = useState(0);
  const [isPenActive, setIsPenActive]   = useState(false); // palm rejection: disables pan/pinch while pen is down
  const [touchDraw, setTouchDraw]       = useState(false); // GoodNotes-style: finger draws instead of pans
  const [containerWidth, setContainerWidth] = useState(0); // measured board-area width, reactive to rotation/resize

  const [toolbarPos, setToolbarPos]         = useState({ x: null, y: null });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);

  // Drive state
  const [saveStatus, setSaveStatus]   = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [loadBanner, setLoadBanner]   = useState(null);   // null | pdfName string — re-open prompt

  // Mirror refs so effects keyed on incoming peer data can read the current
  // tab/page without re-running on every tab/page change. Declared before
  // those effects so the sync runs first within the same render pass.
  const activeTabIdRef = useRef(activeTabId);
  const pageNumberRef  = useRef(pageNumber);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { pageNumberRef.current = pageNumber; }, [pageNumber]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdfUrl    = activeTab?.url || '';
  const driveEnabled = !!studentId;

  // Clear any previous load error whenever a different PDF is opened
  useEffect(() => { setPdfLoadError(null); }, [pdfUrl]);

  const canUndo = (strokesByTab[activeTabId]?.[pageNumber]?.length || 0) > 0;
  const canRedo = (redoByTab[activeTabId]?.[pageNumber]?.length || 0) > 0;
  const canDraw = role === 'teacher' || canStudentDraw;

  const { confirm, Dialog } = useConfirm();

  // ── Drawing helpers ───────────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (strokesByTab[activeTabId]?.[pageNumber] || []).forEach(s => drawStroke(ctx, s));
  }, [strokesByTab, activeTabId, pageNumber]);

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const paintLive = useCallback((from, to) => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx || !from) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    if (tool === 'highlighter') ctx.globalAlpha = 0.38;
    ctx.beginPath();
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(from.x, from.y, mx, my);
    ctx.stroke();
    ctx.restore();
  }, [color, lineWidth, tool]);

  const isPointNearStroke = (pt, stroke, threshold) => {
    for (const p of stroke.points) {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) < threshold) return true;
    }
    return false;
  };

  // ── Pointer events ────────────────────────────────────────────────────────────

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'touch' && !touchDraw) return; // touch → TransformWrapper pan/zoom
    if (!canDraw) return;

    const isPen = e.pointerType === 'pen';
    if (isPen) {
      setIsPenActive(true);
      // Pencil detected — GoodNotes behavior: fingers revert to pan/zoom so
      // the palm resting on the glass doesn't scribble alongside the pen.
      if (touchDraw) setTouchDraw(false);
    }

    activePointers.current.add(e.pointerId);
    if (activePointers.current.size > 1) {
      isDrawingRef.current  = false;
      currentPtsRef.current = [];
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    if (!pt) return;
    isDrawingRef.current       = true;
    lastPointRef.current       = pt;
    currentPtsRef.current      = [pt];
    currentStrokeIdRef.current = crypto.randomUUID();
  }, [canDraw, touchDraw]);

  const onPointerMove = useCallback((e) => {
    if (e.pointerType === 'touch' && !touchDraw) return; // handled by TransformWrapper

    if (tool === 'eraser') {
      const canvas = canvasRef.current;
      const rect   = canvas?.getBoundingClientRect();
      if (rect) setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (!isDrawingRef.current || activePointers.current.size > 1) return;

    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (tool === 'pen' || tool === 'highlighter') {
      paintLive(lastPointRef.current, pt);
      lastPointRef.current = pt;
      currentPtsRef.current.push(pt);
      onStrokePoint?.({ id: currentStrokeIdRef.current, point: pt, color, lineWidth, tool, tabId: activeTabId, page: pageNumber });
    } else if (tool === 'eraser') {
      const strokes = strokesByTab[activeTabId]?.[pageNumber] || [];
      let dirty = false;
      const filtered = strokes.filter(s => {
        if (isPointNearStroke(pt, s, ERASER_RADIUS)) { dirty = true; return false; }
        return true;
      });
      if (dirty) {
        setStrokesByTab(prev => ({
          ...prev,
          [activeTabId]: { ...prev[activeTabId], [pageNumber]: filtered },
        }));
        isDirtyRef.current = true;
        // Broadcast the erase point (not the resulting array) — the peer
        // replays the identical isPointNearStroke filter against its own,
        // already-synced stroke list, same "replay the operation" approach
        // undo/redo/clear use.
        onErase?.(activeTabId, pageNumber, pt);
      }
    }
  }, [tool, paintLive, strokesByTab, activeTabId, pageNumber, color, lineWidth, onStrokePoint, onErase, touchDraw]);

  const onPointerUp = useCallback((e) => {
    activePointers.current.delete(e.pointerId);
    if (e.pointerType === 'pen') setIsPenActive(false);
    if (e.pointerType === 'touch' && !touchDraw) return;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if ((tool === 'pen' || tool === 'highlighter') && currentPtsRef.current.length > 1) {
      const stroke = { color, lineWidth, tool, points: [...currentPtsRef.current] };
      setStrokesByTab(prev => ({
        ...prev,
        [activeTabId]: {
          ...prev[activeTabId],
          [pageNumber]: [...(prev[activeTabId]?.[pageNumber] || []), stroke],
        },
      }));
      setRedoByTab(prev => ({
        ...prev,
        [activeTabId]: { ...prev[activeTabId], [pageNumber]: [] },
      }));
      // Embed the full point list in the commit — a peer that connected
      // mid-stroke missed the streamed DRAW_POINTs and can still apply it.
      onStrokeEnd?.({ id: currentStrokeIdRef.current, tabId: activeTabId, points: stroke.points, color, lineWidth, tool }, pageNumber);
      isDirtyRef.current = true;
    }
    currentPtsRef.current = [];
  }, [tool, color, lineWidth, activeTabId, pageNumber, onStrokeEnd, touchDraw]);

  const onPointerLeave = useCallback((e) => {
    setEraserPos(null);
    if (e.pointerType === 'pen') setIsPenActive(false);
    onPointerUp(e);
  }, [onPointerUp]);

  // ── Undo / Redo / Clear ───────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (!canUndo) return;
    setStrokesByTab(prev => {
      const strokes = prev[activeTabId]?.[pageNumber] || [];
      if (!strokes.length) return prev;
      const last = strokes[strokes.length - 1];
      setRedoByTab(r => ({
        ...r,
        [activeTabId]: {
          ...r[activeTabId],
          [pageNumber]: [...(r[activeTabId]?.[pageNumber] || []), last],
        },
      }));
      return { ...prev, [activeTabId]: { ...prev[activeTabId], [pageNumber]: strokes.slice(0, -1) } };
    });
    isDirtyRef.current = true;
    onUndo?.(activeTabId, pageNumber);
  }, [canUndo, activeTabId, pageNumber, onUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    setRedoByTab(prev => {
      const stack = prev[activeTabId]?.[pageNumber] || [];
      if (!stack.length) return prev;
      const top = stack[stack.length - 1];
      setStrokesByTab(s => ({
        ...s,
        [activeTabId]: {
          ...s[activeTabId],
          [pageNumber]: [...(s[activeTabId]?.[pageNumber] || []), top],
        },
      }));
      return { ...prev, [activeTabId]: { ...prev[activeTabId], [pageNumber]: stack.slice(0, -1) } };
    });
    isDirtyRef.current = true;
    onRedo?.(activeTabId, pageNumber);
  }, [canRedo, activeTabId, pageNumber, onRedo]);

  const clearPage = useCallback(async () => {
    const strokes = strokesByTab[activeTabId]?.[pageNumber] || [];
    if (!strokes.length) return;
    const ok = await confirm('ล้างหน้านี้ทั้งหมดใช่ไหมครับ? กู้คืนด้วย Undo ไม่ได้', true);
    if (!ok) return;
    setStrokesByTab(prev => ({
      ...prev,
      [activeTabId]: { ...prev[activeTabId], [pageNumber]: [] },
    }));
    setRedoByTab(prev => ({
      ...prev,
      [activeTabId]: { ...prev[activeTabId], [pageNumber]: [] },
    }));
    isDirtyRef.current = true;
    onClearPage?.(activeTabId, pageNumber);
  }, [strokesByTab, activeTabId, pageNumber, confirm, onClearPage]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── Incoming peer data ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!incomingStroke?.page || !incomingStroke?.stroke) return;
    const s     = incomingStroke.stroke;
    const tabId = s.tabId || activeTabIdRef.current;
    const live  = liveStrokesRef.current[s.id];
    delete liveStrokesRef.current[s.id];
    // Prefer points embedded in the commit (authoritative; covers a peer that
    // joined mid-stroke), fall back to the live-accumulated stroke.
    const stroke = (s.points?.length > 1)
      ? { points: s.points, color: s.color, lineWidth: s.lineWidth, tool: s.tool }
      : live;
    if (!stroke) return;
    setStrokesByTab(prev => ({
      ...prev,
      [tabId]: {
        ...prev[tabId],
        [incomingStroke.page]: [...(prev[tabId]?.[incomingStroke.page] || []), stroke],
      },
    }));
  }, [incomingStroke]); // _t field forces new reference for every stroke end

  useEffect(() => {
    if (!incomingStrokePoint) return;
    const { id, point, color: c, lineWidth: lw, tool: t } = incomingStrokePoint;
    if (!liveStrokesRef.current[id]) {
      liveStrokesRef.current[id] = { points: [], color: c, lineWidth: lw, tool: t };
    }
    const live = liveStrokesRef.current[id];
    live.points.push(point);
    const prev = live.points[live.points.length - 2];
    if (!prev) return;
    // Only paint live when the stroke targets the tab/page currently on
    // screen — otherwise it would ghost onto whatever page the viewer is on.
    // (Points are still accumulated above, so the commit lands correctly.)
    const { tabId: strokeTab, page: strokePage } = incomingStrokePoint;
    if ((strokeTab && strokeTab !== activeTabIdRef.current) ||
        (strokePage && strokePage !== pageNumberRef.current)) return;
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth   = lw;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    if (t === 'highlighter') ctx.globalAlpha = 0.38;
    ctx.beginPath();
    const mx = (prev.x + point.x) / 2;
    const my = (prev.y + point.y) / 2;
    ctx.moveTo(prev.x, prev.y);
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    ctx.stroke();
    ctx.restore();
  }, [incomingStrokePoint]);

  useEffect(() => {
    if (incomingPage && incomingPage !== pageNumber) setPageNumber(incomingPage);
  }, [incomingPage]);

  // Remote undo/redo/clear — replay the same reducer the local button uses so
  // both sides' stroke arrays stay identical (they were already kept in sync
  // by mirroring DRAW/DRAW_POINT the same way).
  useEffect(() => {
    if (!incomingUndo) return;
    const { tabId, page } = incomingUndo;
    setStrokesByTab(prev => {
      const strokes = prev[tabId]?.[page] || [];
      if (!strokes.length) return prev;
      const last = strokes[strokes.length - 1];
      setRedoByTab(r => ({
        ...r,
        [tabId]: { ...r[tabId], [page]: [...(r[tabId]?.[page] || []), last] },
      }));
      return { ...prev, [tabId]: { ...prev[tabId], [page]: strokes.slice(0, -1) } };
    });
  }, [incomingUndo]);

  useEffect(() => {
    if (!incomingRedo) return;
    const { tabId, page } = incomingRedo;
    setRedoByTab(prev => {
      const stack = prev[tabId]?.[page] || [];
      if (!stack.length) return prev;
      const top = stack[stack.length - 1];
      setStrokesByTab(s => ({
        ...s,
        [tabId]: { ...s[tabId], [page]: [...(s[tabId]?.[page] || []), top] },
      }));
      return { ...prev, [tabId]: { ...prev[tabId], [page]: stack.slice(0, -1) } };
    });
  }, [incomingRedo]);

  useEffect(() => {
    if (!incomingClearPage) return;
    const { tabId, page } = incomingClearPage;
    setStrokesByTab(prev => ({ ...prev, [tabId]: { ...prev[tabId], [page]: [] } }));
    setRedoByTab(prev => ({ ...prev, [tabId]: { ...prev[tabId], [page]: [] } }));
  }, [incomingClearPage]);

  useEffect(() => {
    if (!incomingErase) return;
    const { tabId, page, point } = incomingErase;
    setStrokesByTab(prev => {
      const strokes = prev[tabId]?.[page] || [];
      const filtered = strokes.filter(s => !isPointNearStroke(point, s, ERASER_RADIUS));
      if (filtered.length === strokes.length) return prev;
      return { ...prev, [tabId]: { ...prev[tabId], [page]: filtered } };
    });
  }, [incomingErase]);

  useEffect(() => {
    if (!incomingTab) return;
    const tabId  = incomingTab?.tabId  ?? incomingTab;
    const tabMeta = incomingTab?.tabMeta ?? null;
    // Create the tab on this side if the sender just created it
    setTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      if (!tabMeta) return prev;
      return [...prev, { id: tabId, name: tabMeta.name || 'Tab', url: null, pdfName: tabMeta.pdfName || null }];
    });
    setStrokesByTab(prev => prev[tabId] ? prev : { ...prev, [tabId]: {} });
    setRedoByTab(prev => prev[tabId] ? prev : { ...prev, [tabId]: {} });
    setActiveTabId(tabId);
    setPageNumber(1);
  }, [incomingTab]);

  // Update tab URL once PDF binary arrives from peer
  useEffect(() => {
    if (!incomingPdfData) return;
    setTabs(prev => prev.map(t => t.id === incomingPdfData.tabId ? { ...t, url: incomingPdfData.url } : t));
  }, [incomingPdfData]);

  // Expose full board state to VideoCallModal for SYNC on peer join
  useEffect(() => {
    onSyncRequest?.(() => ({ strokesByTab, tabs, activeTabId, pageNumber }));
  }, [strokesByTab, tabs, activeTabId, pageNumber, onSyncRequest]);

  // Apply full-canvas SYNC received from teacher
  useEffect(() => {
    if (!incomingSync) return;
    const sb = incomingSync.strokesByTab ?? incomingSync; // accept both old and new format
    const inTabs = incomingSync.tabs;
    setStrokesByTab(prev => {
      const merged = sb ? { ...sb } : { ...prev };
      if (inTabs) inTabs.forEach(t => { if (!merged[t.id]) merged[t.id] = {}; });
      return merged;
    });
    if (inTabs?.length) {
      setTabs(inTabs.map(t => ({ ...t, url: null }))); // blob URLs are browser-local
      setRedoByTab(prev => {
        const merged = { ...prev };
        inTabs.forEach(t => { if (!merged[t.id]) merged[t.id] = {}; });
        return merged;
      });
    }
    if (incomingSync.activeTabId) setActiveTabId(incomingSync.activeTabId);
    if (incomingSync.pageNumber) setPageNumber(Number(incomingSync.pageNumber));
  }, [incomingSync]);

  // ── Canvas resize ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = pageContainerRef.current;
    if (!canvas || !container) return;
    const size = pageSize.width > 0 ? pageSize : DEFAULT_SIZE;
    container.style.width  = `${size.width}px`;
    container.style.height = `${size.height}px`;
    canvas.width  = size.width;
    canvas.height = size.height;
    redrawCanvas();
    // Content just resized (new PDF loaded, or rotation) — re-fit instantly
    // instead of leaving the view at whatever pan/zoom matched the old size.
    transformRef.current?.centerView(1, 0);
  }, [pageSize, redrawCanvas]);

  useEffect(() => { redrawCanvas(); }, [pageNumber, redrawCanvas]);

  // Re-fit on page turn / tab switch only — deliberately excludes strokesByTab
  // so drawing a stroke never resets the teacher's current zoom/pan.
  useEffect(() => {
    transformRef.current?.centerView(1, 200, 'easeOut');
  }, [pageNumber, activeTabId]);

  // ── Board-area size tracking (rotation / Safari chrome show-hide) ─────────────
  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When the viewport width actually changes after a page is already loaded,
  // rescale pageSize proportionally so the PDF keeps fitting the new width
  // (the effect above then re-centers once pageSize updates).
  const prevContainerWidthRef = useRef(0);
  useEffect(() => {
    if (!containerWidth) return;
    const prevWidth = prevContainerWidthRef.current;
    prevContainerWidthRef.current = containerWidth;
    if (!prevWidth || prevWidth === containerWidth) return;
    setPageSize(prev => {
      if (prev.width <= 0) return prev;
      const ratio = prev.height / prev.width;
      return { width: containerWidth, height: Math.round(containerWidth * ratio) };
    });
  }, [containerWidth]);

  // ── Toolbar drag ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isDraggingToolbar) return;
    // Pointer events (not mouse-only) so dragging works with touch/Apple
    // Pencil on iPad — mousemove/mouseup never fire continuously for touch.
    const onMove = (e) => setToolbarPos({
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    });
    const onUp = () => setIsDraggingToolbar(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',  onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',  onUp);
    };
  }, [isDraggingToolbar]);

  const startToolbarDrag = (e) => {
    e.preventDefault();
    const rect = toolbarRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDraggingToolbar(true);
  };

  // ── Tab management ────────────────────────────────────────────────────────────

  const switchTab = (id) => {
    if (id === activeTabId) return;
    setActiveTabId(id);
    setPageNumber(1);
    const tab = tabs.find(t => t.id === id);
    onTabSync?.(id, tab ? { name: tab.name, pdfName: tab.pdfName || null } : null);
  };

  const closeTab = (id, e) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    setStrokesByTab(prev => { const n = { ...prev }; delete n[id]; return n; });
    setRedoByTab(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (id === activeTabId) { setActiveTabId(next[0].id); setPageNumber(1); }
  };

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    const name = `Whiteboard ${tabs.length + 1}`;
    setTabs(prev => [...prev, { id, name, url: null, pdfName: null }]);
    setStrokesByTab(prev => ({ ...prev, [id]: {} }));
    setRedoByTab(prev => ({ ...prev, [id]: {} }));
    setActiveTabId(id);
    setPageNumber(1);
    onTabSync?.(id, { name, pdfName: null });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url  = URL.createObjectURL(file);
    const id   = `tab-${Date.now()}`;
    const name = file.name.replace(/\.pdf$/i, '').slice(0, 28);
    setTabs(prev => [...prev, { id, name, url, pdfName: file.name }]);
    setStrokesByTab(prev => ({ ...prev, [id]: {} }));
    setRedoByTab(prev => ({ ...prev, [id]: {} }));
    setActiveTabId(id);
    setPageNumber(1);
    onTabSync?.(id, { name, pdfName: file.name });
    onPdfUpload?.(id, file);
    // Cache the raw bytes locally (instant, works offline) AND upload to Drive
    // (works from any device signed into the same account) so re-opening the
    // call never shows a blank page instead of the file.
    if (driveEnabled) {
      file.arrayBuffer().then(buf => {
        cachePdfBinary(`${studentId}__${file.name}`, buf).catch(() => {});
        const token = tokenStore.get();
        if (token) saveDrivePdfBinary(token, studentId, file.name, buf).catch(() => {});
      }).catch(() => {});
    }
    // If we were prompted to re-open this PDF, clear the banner
    if (loadBanner && file.name === loadBanner) setLoadBanner(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    isDirtyRef.current = true;
  };

  // ── Google Drive: save ────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!driveEnabled) return;
    const token = tokenStore.get();
    if (!token) { setSaveStatus('error'); return; }

    setSaveStatus('saving');
    try {
      // v2: persist every tab (not just the active one), so a lesson that used
      // multiple whiteboards/PDFs doesn't lose all but the currently-open tab.
      const data = {
        version: 2,
        activeTabId,
        pageNumber,
        tabsData: tabs.map(t => ({
          id: t.id,
          name: t.name,
          pdfName: t.pdfName || null,
          strokesPerPage: Object.fromEntries(
            Object.entries(strokesByTab[t.id] || {}).filter(([, strokes]) => strokes.length > 0),
          ),
        })),
      };
      await saveToDrive(token, studentId, data);
      isDirtyRef.current = false;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('[Drive] save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 5000);
    }
  }, [driveEnabled, studentId, strokesByTab, activeTabId, tabs, pageNumber]);

  // ── Google Drive: auto-save every 2 minutes when dirty ────────────────────────

  useEffect(() => {
    if (!driveEnabled) return;
    autoSaveTimerRef.current = setInterval(() => {
      if (isDirtyRef.current) handleSave();
    }, 2 * 60 * 1000);
    return () => clearInterval(autoSaveTimerRef.current);
  }, [driveEnabled, handleSave]);

  // ── Google Drive: load latest session on mount ────────────────────────────────

  useEffect(() => {
    if (!driveEnabled) return;
    const token = tokenStore.get();
    if (!token) return;

    (async () => {
      let data;
      try {
        data = await loadFromDrive(token, studentId);
      } catch (err) {
        // Non-fatal: Drive may be unavailable or no session found yet
        console.warn('[Drive] load failed:', err);
        return;
      }
      if (!data) return;

      if (data.version === 2) {
        const rawRestored = (data.tabsData || []).map((t, i) => ({
          newId: `tab-restore-${Date.now()}-${i}`,
          ...t,
        }));
        if (!rawRestored.length) return;
        // Recover each tab's actual PDF bytes — local cache first, then Drive —
        // only fall back to the "please re-open" banner if neither has it.
        const restored = await Promise.all(rawRestored.map(async (t) => {
          if (!t.pdfName) return { ...t, url: null };
          const buf = await recoverPdfBinary(token, studentId, t.pdfName);
          return buf ? { ...t, url: URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })) } : { ...t, url: null };
        }));
        setTabs(prev => [
          ...prev,
          ...restored.map(t => ({ id: t.newId, name: t.name, url: t.url, pdfName: t.pdfName || null })),
        ]);
        setStrokesByTab(prev => {
          const next = { ...prev };
          restored.forEach(t => { next[t.newId] = t.strokesPerPage || {}; });
          return next;
        });
        setRedoByTab(prev => {
          const next = { ...prev };
          restored.forEach(t => { next[t.newId] = {}; });
          return next;
        });
        const activeRestored = restored.find(t => t.id === data.activeTabId) || restored[0];
        setActiveTabId(activeRestored.newId);
        setPageNumber(Number(data.pageNumber) || 1);
        const missingPdf = restored.find(t => t.pdfName && !t.url);
        if (missingPdf) setLoadBanner(missingPdf.pdfName);
        // Restored tabs never went through onTabSync/onPdfUpload — any peer
        // already connected (or connecting moments from now) needs a fresh
        // full sync or it'll only ever see the original blank "Whiteboard 1".
        onBoardRestored?.();
        return;
      }

      // Legacy format (pre-v2): single tab only, read-only backward-compat path
      const { pdfName, currentPage, strokesPerPage } = data;
      const id = `tab-restore-${Date.now()}`;
      const buf = pdfName ? await recoverPdfBinary(token, studentId, pdfName) : null;
      const url = buf ? URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })) : null;
      setTabs(prev => [
        ...prev,
        { id, name: pdfName || 'Restored', url, pdfName: pdfName || null },
      ]);
      setStrokesByTab(prev => ({ ...prev, [id]: strokesPerPage || {} }));
      setRedoByTab(prev => ({ ...prev, [id]: {} }));
      setActiveTabId(id);
      setPageNumber(Number(currentPage) || 1);

      if (pdfName && !url) setLoadBanner(pdfName);
      onBoardRestored?.();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // ── Toolbar position ──────────────────────────────────────────────────────────

  const toolbarStyle = toolbarPos.x !== null
    ? { left: toolbarPos.x, top: toolbarPos.y, transform: 'none' }
    : { left: '50%', top: 54, transform: 'translateX(-50%)' };

  // ── Save status icon ──────────────────────────────────────────────────────────

  const SaveIcon = saveStatus === 'saving' ? Loader2 : saveStatus === 'error' ? CloudOff : Cloud;
  const saveColor = saveStatus === 'error' ? '#ff453a' : saveStatus === 'saved' ? '#22c55e' : 'rgba(255,255,255,0.75)';
  const saveTitle = saveStatus === 'saving' ? 'กำลังบันทึก...'
                  : saveStatus === 'saved'  ? 'บันทึกแล้ว'
                  : saveStatus === 'error'  ? 'บันทึกไม่สำเร็จ'
                  : 'บันทึกลง Drive';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full select-none" style={{ background: '#1c1c1e' }}>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-40 flex items-center gap-0.5 px-2 overflow-x-auto"
        style={{
          height: 44,
          background: 'rgba(28,28,30,0.98)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            title={tab.name}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg cursor-pointer shrink-0 transition-colors"
            style={{
              maxWidth: 160,
              background: tab.id === activeTabId ? 'rgba(255,255,255,0.11)' : 'transparent',
              color:      tab.id === activeTabId ? '#fff' : 'rgba(255,255,255,0.45)',
            }}
          >
            <span className="text-xs truncate">{tab.name}</span>
            {role === 'teacher' && tabs.length > 1 && (
              <button
                onClick={e => closeTab(tab.id, e)}
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <X size={9} />
              </button>
            )}
          </div>
        ))}

        {role === 'teacher' && (
          <>
            <button
              onClick={addTab}
              title="กระดานใหม่"
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors ml-1"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              <Plus size={14} />
            </button>

            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="เปิด PDF"
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors text-xs"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              <Upload size={12} />
              <span>PDF</span>
            </button>
          </>
        )}
      </div>

      {/* ── Re-open PDF banner (shown after Drive load) ──────────────────────── */}
      {loadBanner && (
        <div
          className="absolute z-50 flex items-center gap-2 px-4 py-2 text-xs"
          style={{
            top: 44, left: 0, right: 0,
            background: 'rgba(59,130,246,0.92)',
            color: '#fff',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="flex-1">
            เซสชันที่บันทึกไว้ถูกโหลดแล้ว — กรุณาเปิดไฟล์ PDF เดิม:
            <strong className="ml-1">{loadBanner}</strong>
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 rounded-lg font-medium"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            เปิด PDF
          </button>
          <button
            onClick={() => setLoadBanner(null)}
            className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-white/20"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Floating toolbar (hidden for students in view-only mode) ───────── */}
      {canDraw && <div
        ref={toolbarRef}
        className="absolute z-50 flex items-center gap-1 px-3 py-2"
        style={{
          ...toolbarStyle,
          background:   'rgba(44,44,46,0.97)',
          borderRadius: 18,
          boxShadow:    '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.07)',
          backdropFilter: 'blur(24px)',
          cursor: isDraggingToolbar ? 'grabbing' : 'default',
          top: loadBanner ? (toolbarPos.y !== null ? toolbarPos.y : 90) : (toolbarPos.y !== null ? toolbarPos.y : 54),
        }}
      >
        {/* Drag handle */}
        <div
          className="p-1 rounded-lg hover:bg-white/10 cursor-grab active:cursor-grabbing transition-colors"
          style={{ color: 'rgba(255,255,255,0.3)', touchAction: 'none' }}
          onPointerDown={startToolbarDrag}
          title="ลากย้ายแถบเครื่องมือ"
        >
          <GripVertical size={14} />
        </div>

        <Divider />

        {/* Undo / Redo */}
        <ToolBtn onClick={undo} disabled={!canUndo} title="เลิกทำ (Ctrl+Z)">
          <Undo2 size={16} />
        </ToolBtn>
        <ToolBtn onClick={redo} disabled={!canRedo} title="ทำซ้ำ (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </ToolBtn>

        <Divider />

        {/* Tools */}
        <ToolBtn active={tool === 'pen'}         onClick={() => setTool('pen')}         title="ปากกา">
          <Pen size={16} />
        </ToolBtn>
        <ToolBtn active={tool === 'highlighter'} onClick={() => setTool('highlighter')} title="ไฮไลต์">
          <Highlighter size={16} />
        </ToolBtn>
        <ToolBtn active={tool === 'eraser'}      onClick={() => setTool('eraser')}      title="ยางลบ">
          <Eraser size={16} />
        </ToolBtn>
        {navigator.maxTouchPoints > 0 && (
          <ToolBtn
            active={touchDraw}
            onClick={() => setTouchDraw(v => !v)}
            title={touchDraw ? 'นิ้ว: วาด (แตะเพื่อกลับไปใช้นิ้วเลื่อนหน้าจอ)' : 'นิ้ว: เลื่อนหน้าจอ (แตะเพื่อวาดด้วยนิ้ว)'}
          >
            <Pointer size={16} />
          </ToolBtn>
        )}

        <Divider />

        {/* Colors */}
        <div className="flex items-center gap-1.5 px-1">
          {COLORS.map(c => {
            const isActive = color === c && tool !== 'eraser';
            return (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  if (tool === 'eraser') setTool('pen');
                }}
                title={c}
                className="rounded-full transition-transform hover:scale-110 active:scale-95"
                style={{
                  width: 18, height: 18,
                  backgroundColor: c,
                  border: isActive
                    ? '2.5px solid #ffffff'
                    : c === '#ffffff' ? '1.5px solid rgba(255,255,255,0.25)' : '2px solid transparent',
                  boxShadow: isActive ? '0 0 0 1.5px rgba(255,255,255,0.35)' : 'none',
                }}
              />
            );
          })}
        </div>

        <Divider />

        {/* Thickness */}
        <div className="flex items-center gap-1 px-1">
          {THICKNESSES.map(t => (
            <button
              key={t}
              onClick={() => {
                setLineWidth(t);
                if (tool === 'eraser') setTool('pen');
              }}
              title={`ขนาด ${t}px`}
              className="flex items-center justify-center rounded-xl transition-colors"
              style={{
                width: 32, height: 32,
                background: lineWidth === t ? 'rgba(255,255,255,0.13)' : 'transparent',
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width:  Math.min(t * 2.2, 16),
                  height: Math.min(t * 2.2, 16),
                  background: tool !== 'eraser' ? color : 'rgba(255,255,255,0.6)',
                }}
              />
            </button>
          ))}
        </div>

        <Divider />

        {/* Clear page */}
        <ToolBtn onClick={clearPage} disabled={!canUndo} title="ล้างหน้านี้" danger>
          <Trash2 size={16} />
        </ToolBtn>

        <Divider />

        {/* Fit to screen — recenter/reset zoom if a pinch/pan gesture wanders off */}
        <ToolBtn onClick={() => transformRef.current?.centerView(1, 200, 'easeOut')} title="พอดีจอ">
          <Maximize2 size={16} />
        </ToolBtn>

        {/* Permission toggle (teacher only) */}
        {role === 'teacher' && (
          <>
            <Divider />
            <button
              onClick={() => onPermissionToggle?.(!canStudentDraw)}
              title="อนุญาต/ปิดการวาดของนักเรียน"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all active:scale-90 text-[11px] font-medium leading-none"
              style={{
                color: canStudentDraw ? '#22c55e' : 'rgba(255,255,255,0.5)',
                background: canStudentDraw ? 'rgba(34,197,94,0.12)' : 'transparent',
              }}
            >
              <Pen size={13} />
              อนุญาตนักเรียนเขียน
            </button>
          </>
        )}

        {/* Save to Drive (only when driveEnabled) */}
        {driveEnabled && (
          <>
            <Divider />
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              title={saveTitle}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all disabled:opacity-50 active:scale-90"
              style={{
                color: saveColor,
                background: saveStatus === 'saved' ? 'rgba(34,197,94,0.12)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (saveStatus !== 'saving') e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = saveStatus === 'saved' ? 'rgba(34,197,94,0.12)' : 'transparent';
              }}
            >
              <SaveIcon
                size={15}
                className={saveStatus === 'saving' ? 'animate-spin' : ''}
              />
              <span className="text-[11px] font-medium leading-none">
                {saveStatus === 'saving' ? 'บันทึก...'
                  : saveStatus === 'saved' ? 'บันทึกแล้ว'
                  : saveStatus === 'error' ? 'ผิดพลาด'
                  : 'บันทึก'}
              </span>
            </button>
          </>
        )}
      </div>}

      {/* ── PDF page controls (view-only mode sees the number; teacher drives the page) ── */}
      {pdfUrl && numPages > 1 && (
        <div
          className="absolute bottom-4 z-50 flex items-center gap-1 px-3 py-1.5"
          style={{
            left: '50%', transform: 'translateX(-50%)',
            background:     'rgba(44,44,46,0.97)',
            borderRadius:   999,
            boxShadow:      '0 4px 20px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {canDraw && (
            <button
              onClick={() => {
                const n = Math.max(pageNumber - 1, 1);
                setPageNumber(n);
                onPageSync?.(n);
                isDirtyRef.current = true;
              }}
              disabled={pageNumber <= 1}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
              style={{ color: '#fff' }}
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <span className="text-white text-xs font-medium" style={{ minWidth: 52, textAlign: 'center' }}>
            {pageNumber} / {numPages}
          </span>
          {canDraw && (
            <button
              onClick={() => {
                const n = Math.min(pageNumber + 1, numPages);
                setPageNumber(n);
                onPageSync?.(n);
                isDirtyRef.current = true;
              }}
              disabled={pageNumber >= numPages}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
              style={{ color: '#fff' }}
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}

      {/* ── Drawing canvas area ───────────────────────────────────────────────── */}
      <div ref={boardAreaRef} className="absolute inset-0" style={{ top: 44 }}>
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.1}
          maxScale={8}
          centerOnInit
          limitToBounds={false}
          disabled={isPenActive || touchDraw}
          panning={{ disabled: false, allowLeftClickPan: false, velocityDisabled: true }}
          wheel={{ disabled: false }}
          pinch={{ disabled: false }}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
            <div
              ref={pageContainerRef}
              className="relative"
              style={{
                width:  pageSize.width  > 0 ? pageSize.width  : DEFAULT_SIZE.width,
                height: pageSize.height > 0 ? pageSize.height : DEFAULT_SIZE.height,
                background: '#ffffff',
                boxShadow:  '0 0 0 1px rgba(0,0,0,0.06), 0 12px 48px rgba(0,0,0,0.5)',
              }}
            >
              {/* PDF background — rendered at board pixel width for crisp display */}
              {pdfUrl && !pdfLoadError && (
                <Document
                  key={`${pdfUrl}-${pdfRetryKey}`}
                  file={pdfUrl}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  onLoadError={(err) => setPdfLoadError(err?.message || 'ไม่ทราบสาเหตุ')}
                  loading={
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-[13px]">
                      กำลังโหลด PDF...
                    </div>
                  }
                >
                  <Page
                    pageNumber={pageNumber}
                    width={containerWidth || DEFAULT_SIZE.width}
                    onLoadSuccess={p => {
                      const w = containerWidth || DEFAULT_SIZE.width;
                      const ratio = p.view[3] / p.view[2];
                      setPageSize({ width: w, height: Math.round(w * ratio) });
                    }}
                    onLoadError={(err) => setPdfLoadError(err?.message || 'ไม่ทราบสาเหตุ')}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    devicePixelRatio={Math.min((window.devicePixelRatio || 1) * 2, 4)}
                  />
                </Document>
              )}

              {/* Receiving side: PDF is still arriving in chunks over the data channel —
                  without this the tab just looks blank/frozen for several seconds */}
              {!pdfUrl && pdfTransferProgress?.tabId === activeTabId && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                  <div className="w-10 h-10 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-gray-500 text-[13px] font-medium">กำลังรับไฟล์ PDF... {pdfTransferProgress.percent}%</p>
                </div>
              )}

              {/* PDF failed to load — offer a retry instead of failing silently */}
              {pdfUrl && pdfLoadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <p className="text-red-500 text-[13px] font-semibold">เปิดไฟล์ PDF ไม่สำเร็จ</p>
                  <p className="text-gray-400 text-[11px]">{pdfLoadError}</p>
                  <button
                    onClick={() => { setPdfLoadError(null); setPdfRetryKey(k => k + 1); }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold rounded-[10px] transition-colors"
                  >
                    ลองใหม่
                  </button>
                </div>
              )}

              {/* Draw canvas layer (on top, touch-action:none) */}
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                className="absolute inset-0 w-full h-full"
                style={{
                  touchAction: 'none',
                  cursor: !canDraw         ? 'default'
                        : tool === 'eraser' ? 'none'
                        : 'crosshair',
                  pointerEvents: canDraw ? 'auto' : 'none',
                }}
              />

              {/* Eraser cursor ring */}
              {tool === 'eraser' && eraserPos && (
                <div
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    width:   ERASER_RADIUS * 2,
                    height:  ERASER_RADIUS * 2,
                    left:    eraserPos.x - ERASER_RADIUS,
                    top:     eraserPos.y - ERASER_RADIUS,
                    border:  '2px solid rgba(100,100,100,0.7)',
                    background: 'rgba(255,255,255,0.15)',
                  }}
                />
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      <Dialog />
    </div>
  );
}
