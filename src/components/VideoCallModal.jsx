// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
const InteractiveBoard = lazy(() => import('./InteractiveBoard.jsx').then(m => ({ default: m.InteractiveBoard })));
// Dynamic import avoids Rollup generating a synchronous TDZ binding for this CJS module
let _Peer = null;
let _PeerReady = false;
import('simple-peer').then(m => {
  _Peer = m.default || m;
  _PeerReady = true;
  console.log('[VideoCall] simple-peer loaded successfully');
}).catch(err => {
  console.error('[VideoCall] Failed to load simple-peer:', err);
});
import {
  Mic, MicOff, Video, VideoOff,
  ScreenShare, ScreenShareOff, Maximize2, Minimize2,
  PhoneOff, AlertTriangle, X, Eye,
  LayoutGrid, RefreshCw, MessageSquare, Send, FlipHorizontal,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#2D8CFF', '#00BFA5', '#FF6B35', '#9333EA', '#F59E0B', '#10B981', '#EC4899', '#06B6D4'];
const getInitials = (n) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
const getAvatarColor = (n) => AVATAR_COLORS[(n || 'X').charCodeAt(0) % AVATAR_COLORS.length];

const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
  return `${h > 0 ? h + ':' : ''}${h > 0 ? String(m).padStart(2, '0') : m}:${String(sc).padStart(2, '0')}`;
};
const fmtMsgTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── ZoomBtn ───────────────────────────────────────────────────────────────────
const ZoomBtn = ({ label, icon: Icon, onClick, danger = false, active = false, badge = 0, disabled = false, hidden = false }) => {
  if (hidden) return null;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center gap-0.5
                  px-2 sm:px-3 min-w-[56px] sm:min-w-[68px] h-[52px] sm:h-[56px]
                  rounded-xl transition-colors active:scale-95 disabled:opacity-40
                  ${active ? 'bg-blue-500/20 hover:bg-blue-500/30' : 'hover:bg-white/10'}`}
    >
      <Icon
        size={20}
        className={`sm:w-[22px] sm:h-[22px] ${danger ? 'text-red-400' : active ? 'text-blue-400' : 'text-white'}`}
      />
      <span className={`text-[9px] sm:text-[10px] font-medium leading-none
        ${danger ? 'text-red-400' : active ? 'text-blue-400' : 'text-white/70'}`}>
        {label}
      </span>
      {badge > 0 && (
        <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-[18px] h-[18px]
                         rounded-full bg-red-500 text-white text-[8px] font-bold">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
};

// ── FloatingCamera ─────────────────────────────────────────────────────────────
// Always mounted — uses display:none to hide so video srcObject is never lost.
function FloatingCamera({ videoRef, pos, onPosChange, visible, onClose, label, mirrored, camOff, speaking = false, hideClose = false }) {
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      onPosChange({ x: cx - offset.current.x, y: cy - offset.current.y });
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [dragging, onPosChange]);

  const handleDown = (e) => {
    if (e.target.closest('[data-no-drag]')) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    offset.current = { x: cx - pos.x, y: cy - pos.y };
    setDragging(true);
    if (e.cancelable) e.preventDefault();
  };

  return (
    <div
      onMouseDown={handleDown}
      onTouchStart={handleDown}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: 160,
        height: 90,
        display: visible ? 'block' : 'none',
        cursor: dragging ? 'grabbing' : 'grab',
        zIndex: 30,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: speaking
          ? '0 0 0 2px #22c55e, 0 8px 24px rgba(0,0,0,0.7)'
          : '0 8px 24px rgba(0,0,0,0.7)',
        border: speaking ? '2px solid #22c55e' : '1.5px solid rgba(255,255,255,0.15)',
        backgroundColor: '#2d2d2d',
        userSelect: 'none',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: mirrored ? 'scaleX(-1)' : 'none',
          pointerEvents: 'none', display: 'block',
        }}
      />
      {camOff && (
        <div style={{
          position: 'absolute', inset: 0, background: '#2d2d2d',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: getAvatarColor(label),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'white',
          }}>
            {getInitials(label)}
          </div>
        </div>
      )}
      {!hideClose && (
        <button
          data-no-drag="true"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 1,
          }}
        >
          <X width={10} height={10} />
        </button>
      )}
      <div style={{
        position: 'absolute', bottom: 4, left: 6, fontSize: 9, fontWeight: 600, color: 'white',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        borderRadius: 99, padding: '2px 6px', pointerEvents: 'none',
      }}>
        {label}
      </div>
    </div>
  );
}

// ── PDF chunk transfer (binary) ───────────────────────────────────────────────
// Sends a PDF as raw binary DataChannel messages.
// Format per message: [4-byte header length (LE)] [JSON header] [raw PDF bytes]
// No base64 — 33% smaller, no padding bugs.
const _pdfEnc = new TextEncoder();
// Backpressure: the SCTP send buffer force-closes the DataChannel if we outrun
// the network on a large PDF — pause above the high-water mark until it drains.
const PDF_BUFFERED_HIGH = 4 * 1024 * 1024; // 4 MB
function waitForDrain(peer) {
  return new Promise((resolve) => {
    const check = () => {
      const ch = peer._channel;
      if (peer.destroyed || !ch || ch.readyState !== 'open' || ch.bufferedAmount <= PDF_BUFFERED_HIGH / 2) return resolve();
      setTimeout(check, 50);
    };
    check();
  });
}
async function sendPdfChunks(peer, tabId, name, pdfName, buffer) {
  if (peer.destroyed || !peer.connected) return;
  const bytes = new Uint8Array(buffer);
  const CHUNK = 65536; // 64 KB per chunk
  const totalChunks = Math.ceil(bytes.length / CHUNK);
  peer.send(JSON.stringify({ type: 'PDF_META', tabId, name, pdfName, totalChunks }));
  for (let i = 0; i < totalChunks; i++) {
    if (peer.destroyed || !peer.connected) return;
    const chunkData = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
    const hdr = _pdfEnc.encode(JSON.stringify({ tabId, chunkIndex: i }));
    const msg = new Uint8Array(4 + hdr.length + chunkData.length);
    msg[0] = hdr.length & 0xff;
    msg[1] = (hdr.length >> 8) & 0xff;
    msg[2] = (hdr.length >> 16) & 0xff;
    msg[3] = (hdr.length >> 24) & 0xff;
    msg.set(hdr, 4);
    msg.set(chunkData, 4 + hdr.length);
    peer.send(msg);
    if ((peer._channel?.bufferedAmount || 0) > PDF_BUFFERED_HIGH) await waitForDrain(peer);
    else if (i % 8 === 7) await new Promise(r => setTimeout(r, 0)); // yield every 8 chunks (512 KB)
  }
}

// ── Board SYNC sender ─────────────────────────────────────────────────────────
// Sends full board state (tabs, strokes, page, permission) to the connected peer.
function doSyncNow(peer, getSyncData, canStudentDraw) {
  if (!peer?.connected || peer.destroyed) return;
  const sd = getSyncData?.();
  if (!sd) return;
  try {
    console.log('[Board] sending SYNC, tabs:', sd.tabs?.length, 'canStudentDraw:', canStudentDraw);
    peer.send(JSON.stringify({
      type: 'SYNC',
      strokesByTab: sd.strokesByTab,
      tabs: (sd.tabs || []).map(t => ({ ...t, url: null })),
      activeTabId: sd.activeTabId,
      pageNumber: sd.pageNumber,
      canStudentDraw,
    }));
    for (const tab of (sd.tabs || [])) {
      if (tab.url && tab.pdfName) {
        fetch(tab.url)
          .then(r => r.arrayBuffer())
          .then(buf => {
            if (!peer.destroyed && peer.connected) sendPdfChunks(peer, tab.id, tab.name, tab.pdfName, buf);
          })
          .catch(() => {});
      }
    }
  } catch (_) {}
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VideoCallModal({
  scheduleId, role, studentName, onClose, onPeerJoined, toast,
  studentId = null,
}) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [isMicOn, setIsMicOn]                   = useState(true);
  const [isCamOn, setIsCamOn]                   = useState(true);
  const [isScreenSharing, setIsScreenSharing]   = useState(false);
  const [showLocalCam, setShowLocalCam]         = useState(true);
  const [showRemoteCam, setShowRemoteCam]       = useState(false);
  const [localCamPos, setLocalCamPos]           = useState(() => ({
    x: Math.max(0, window.innerWidth - 176),
    y: Math.max(0, window.innerHeight - 180),
  }));
  const [remoteCamPos, setRemoteCamPos]         = useState(() => ({
    x: 16,
    y: Math.max(0, window.innerHeight - 180),
  }));
  const [callStatus, setCallStatus]             = useState('Connecting...');
  const [duration, setDuration]                 = useState(0);
  const [isFullscreen, setIsFullscreen]         = useState(false);
  const [facingMode, setFacingMode]             = useState('user');
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [reconnectCount, setReconnectCount]     = useState(0);
  const [networkQuality, setNetworkQuality]     = useState('good');
  const [peerConnected, setPeerConnected]       = useState(false);
  const [joinedBannerVisible, setJoinedBannerVisible] = useState(false);
  const [peerIsScreenSharing, setPeerIsScreenSharing] = useState(false);
  const [peerIsCamOff, setPeerIsCamOff]         = useState(false);
  const [viewMode, setViewMode]                 = useState('speaker');
  const [incomingStroke, setIncomingStroke]     = useState(null);
  const [incomingPage, setIncomingPage]         = useState(null);
  const [incomingTab, setIncomingTab]           = useState(null);
  const [incomingSync, setIncomingSync]         = useState(null);
  const [incomingStrokePoint, setIncomingStrokePoint] = useState(null);
  const [incomingPdfData, setIncomingPdfData]   = useState(null);
  const [incomingUndo, setIncomingUndo]         = useState(null);
  const [incomingRedo, setIncomingRedo]         = useState(null);
  const [incomingClearPage, setIncomingClearPage] = useState(null);
  const [incomingErase, setIncomingErase]       = useState(null);
  const [pdfTransferProgress, setPdfTransferProgress] = useState(null); // { tabId, percent } | null
  const [canStudentDraw, setCanStudentDraw]     = useState(false);
  const [showBoard, setShowBoard]               = useState(false);

  // Chat
  const [chatOpen, setChatOpen]         = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState('');
  const [unreadCount, setUnreadCount]   = useState(0);

  // Leave confirmation
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Local speaking detection
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isMobile       = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isIPad         = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canShareScreen = !isMobile && !isIPad && !!navigator.mediaDevices?.getDisplayMedia;

  // ── Refs ───────────────────────────────────────────────────────────────────
  const containerRef          = useRef();
  const myVideoRef            = useRef();
  const myGalleryVideoRef     = useRef();
  const myScreenVideoRef      = useRef();
  const peerVideoRef          = useRef();
  const peerMainVideoRef      = useRef();
  const peerStreamRef         = useRef(null);
  const peerRef               = useRef();
  const streamRef             = useRef();
  const screenStreamRef       = useRef();
  const screenTrackRef        = useRef();
  const cameraSenderTrackRef  = useRef();
  const lastTimestampRef      = useRef(0);
  const pollIntervalRef       = useRef();
  const durationIntervalRef   = useRef();
  const statsIntervalRef      = useRef();
  const reconnectTimerRef     = useRef();
  const joinTimeRef           = useRef(0);
  const peerAlertedRef        = useRef(false);
  const isCleaningUp          = useRef(false);
  const callTimerStartedRef   = useRef(false);
  const callStartTimeRef      = useRef(null);
  const candidateFlushTimerRef = useRef();
  const candidateBufferRef    = useRef([]);
  const isInitialConnectionRef = useRef(true);
  const processedSignalIdsRef = useRef(new Set());
  const chatEndRef            = useRef();
  const chatOpenRef           = useRef(false);
  const chatStartRef          = useRef(Date.now());
  const audioCtxRef           = useRef(null);
  const speakTimerRef         = useRef(null);
  const getSyncDataRef        = useRef(null);
  const pdfTransferRef        = useRef({});
  const canStudentDrawRef     = useRef(false);
  const boardSyncSentRef      = useRef(false); // true after SYNC sent for current peer session

  const SIGNALING_URL   = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
  const TURN_USERNAME   = import.meta.env.VITE_TURN_USERNAME;
  const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;

  // Validate configuration on mount
  useEffect(() => {
    if (!SIGNALING_URL || SIGNALING_URL === 'https://YOUR_WORKER_NAME.YOUR_ACCOUNT.workers.dev') {
      console.error('[VideoCall] Invalid SIGNALING_URL:', SIGNALING_URL);
      toast?.('WebRTC signaling URL not configured. Please check .env file.', 'error');
      setCallStatus('Configuration Error');
      return;
    }
    if (!TURN_USERNAME || !TURN_CREDENTIAL) {
      console.warn('[VideoCall] TURN credentials not configured. Using STUN only (may fail through NAT/firewall)');
      toast?.('TURN server not configured. Video calls may fail through firewalls.', 'warning');
    }
    console.log('[VideoCall] Configuration check:', {
      signalingUrl: SIGNALING_URL,
      hasTurn: !!(TURN_USERNAME && TURN_CREDENTIAL),
      role,
      scheduleId,
    });
  }, [SIGNALING_URL, TURN_USERNAME, TURN_CREDENTIAL, role, scheduleId, toast]);

  const ICE_SERVERS = (TURN_USERNAME && TURN_CREDENTIAL) ? [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:standard.relay.metered.ca:80',                 username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:standard.relay.metered.ca:80?transport=tcp',   username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:standard.relay.metered.ca:443',                username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  ] : [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const myId = role;

  // ── Sync chatOpenRef + clear unread when chat opens ───────────────────────
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  useEffect(() => { canStudentDrawRef.current = canStudentDraw; }, [canStudentDraw]);

  // ── Scroll chat to bottom on new messages ─────────────────────────────────
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  // ── Fullscreen listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFSChange);
      document.removeEventListener('webkitfullscreenchange', onFSChange);
    };
  }, []);

  // ── Speaking detection (AudioContext, local only) ─────────────────────────
  const startSpeakDetect = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const check = () => {
        if (!audioCtxRef.current) return;
        analyser.getByteFrequencyData(buf);
        const avg = buf.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        setIsSpeaking(avg > 8);
        speakTimerRef.current = setTimeout(check, 150);
      };
      check();
    } catch (_) {}
  }, []);

  // ── Init media + peer ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        cameraSenderTrackRef.current = stream.getVideoTracks()[0];
        if (myVideoRef.current) myVideoRef.current.srcObject = stream;
        if (myGalleryVideoRef.current) myGalleryVideoRef.current.srcObject = stream;
        joinTimeRef.current = Date.now();
        setupPeer(stream);
        startSpeakDetect(stream);
      })
      .catch(err => {
        if (cancelled) return;
        toast?.(`Unable to access camera/microphone: ${err.message}`, 'error');
        onClose();
      });

    return () => { cancelled = true; cleanup(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-bind remote FloatingCamera when showRemoteCam becomes true ──────────
  useEffect(() => {
    if (showRemoteCam && peerVideoRef.current && peerStreamRef.current) {
      if (!peerVideoRef.current.srcObject) peerVideoRef.current.srcObject = peerStreamRef.current;
      peerVideoRef.current.play().catch(() => {});
    }
  }, [showRemoteCam]);

  // ── Keep local camera preview bound after screen share toggle ────────────
  useEffect(() => {
    if (myVideoRef.current && streamRef.current) myVideoRef.current.srcObject = streamRef.current;
  }, [isScreenSharing]);

  // ── Keep screen-share preview bound ───────────────────────────────────────
  useEffect(() => {
    if (isScreenSharing && myScreenVideoRef.current && screenStreamRef.current) {
      myScreenVideoRef.current.srcObject = screenStreamRef.current;
      myScreenVideoRef.current.play().catch(() => {});
    }
  }, [isScreenSharing]);

  // ── Safety net: re-bind remote stream on peerConnected ────────────────────
  useEffect(() => {
    if (!peerConnected || !peerStreamRef.current) return;
    [peerMainVideoRef, peerVideoRef].forEach(r => {
      if (!r.current) return;
      if (!r.current.srcObject) r.current.srcObject = peerStreamRef.current;
      if (r.current.paused) r.current.play().catch(() => {});
    });
  }, [peerConnected]);

  // ── Re-bind streams when switching view mode ───────────────────────────────
  useEffect(() => {
    if (peerStreamRef.current && peerMainVideoRef.current && !peerMainVideoRef.current.srcObject) {
      peerMainVideoRef.current.srcObject = peerStreamRef.current;
      peerMainVideoRef.current.play().catch(() => {});
    }
    if (streamRef.current && myGalleryVideoRef.current && !myGalleryVideoRef.current.srcObject) {
      myGalleryVideoRef.current.srcObject = streamRef.current;
      myGalleryVideoRef.current.play().catch(() => {});
    }
  }, [viewMode]);

  // ── pollSignals ────────────────────────────────────────────────────────────
  const pollSignals = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 5000);
      const res  = await fetch(
        `${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(scheduleId)}&lastTimestamp=${lastTimestampRef.current}`,
        { signal: ctrl.signal },
      );
      clearTimeout(tid);
      const data = await res.json();
      let msgs = data.messages || [];

      if (lastTimestampRef.current === 0) {
        const oppositeRole = role === 'teacher' ? 'student' : 'teacher';
        let lastOppositeLeaveIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].sender === oppositeRole && msgs[i].signal?.type === 'leave') {
            lastOppositeLeaveIdx = i;
            break;
          }
        }
        if (lastOppositeLeaveIdx !== -1) {
          msgs = msgs.filter((m, i) => m.sender !== oppositeRole || i > lastOppositeLeaveIdx);
        } else if (role === 'student') {
          // No leave from teacher found — keep only the most recent teacher offer and
          // subsequent signals. If teacher crashed (no leave), this discards stale offers
          // from the previous session without needing a timestamp comparison (which would
          // fail when the teacher's new offer arrives before the student rejoins).
          let lastTeacherOfferIdx = -1;
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].sender === 'teacher' && msgs[i].signal?.type === 'offer') {
              lastTeacherOfferIdx = i;
              break;
            }
          }
          if (lastTeacherOfferIdx > 0) {
            msgs = msgs.filter((m, i) => m.sender !== 'teacher' || i >= lastTeacherOfferIdx);
          }
        }
      }

      const hasActive = msgs.some(m => m.sender !== role && m.signal?.type !== 'leave');
      if (hasActive && !peerAlertedRef.current) {
        // Don't check callStatus because callStatus is a state that might change!
        peerAlertedRef.current = true;
        toast?.(`${role === 'teacher' ? 'Student' : 'Teacher'} is waiting`, 'success');
      }

      msgs.forEach(msg => {
        if (msg.sender === role) return;
        lastTimestampRef.current = Math.max(lastTimestampRef.current, msg.timestamp);

        // Skip signals older than 30 seconds to prevent replay of very old signals
        if (Date.now() - msg.timestamp > 30000) {
          console.log('[poll] Skipping signal older than 30s:', msg.timestamp, 'age:', Date.now() - msg.timestamp);
          return;
        }

        // Deduplicate signals using a unique ID based on sender + timestamp + signal type
        const signalId = `${msg.sender}_${msg.timestamp}_${msg.signal?.type || 'unknown'}`;
        if (processedSignalIdsRef.current.has(signalId)) {
          console.log('[poll] Skipping duplicate signal:', signalId);
          return;
        }
        processedSignalIdsRef.current.add(signalId);

        // Limit the Set size to prevent memory leaks (keep last 1000)
        if (processedSignalIdsRef.current.size > 1000) {
          const firstItem = processedSignalIdsRef.current.values().next().value;
          processedSignalIdsRef.current.delete(firstItem);
        }

        if (msg.signal?.type === 'leave') {
          const oppositeRole = role === 'teacher' ? 'student' : 'teacher';
          if (msg.sender === oppositeRole && msg.timestamp > joinTimeRef.current) {
            toast?.('The other participant has left the room', 'info');
            cleanup();
            onClose();
          }
        } else if (msg.signal?.type === 'sync-time') {
          if (role === 'student' && msg.signal.startTime) {
            const elapsed = Math.floor((Date.now() - msg.signal.startTime) / 1000);
            setDuration(elapsed > 0 ? elapsed : 0);
          }
        } else if (msg.signal?.type === 'screenshare') {
          setPeerIsScreenSharing(!!msg.signal.active);
        } else if (msg.signal?.type === 'camera') {
          setPeerIsCamOff(!msg.signal.enabled);
        } else if (msg.signal?.type === 'chat' && msg.timestamp >= chatStartRef.current) {
          setChatMessages(prev => {
            if (prev.some(m => m.timestamp === msg.timestamp && m.from === msg.signal.from)) return prev;
            return [...prev, { text: msg.signal.text, from: msg.signal.from, name: msg.signal.name, timestamp: msg.timestamp }];
          });
          if (!chatOpenRef.current) setUnreadCount(c => c + 1);
        } else if (msg.signal && peerRef.current && !peerRef.current.destroyed) {
          // Skip WebRTC signals from before this peer's join time.
          // Teacher: always active (student answers always arrive after teacher's offer).
          // Student: only active during reconnects (teacher's offer may precede student join).
          if (!isInitialConnectionRef.current && msg.timestamp < joinTimeRef.current) {
            console.log('[poll] Ignoring stale signal from before current peer:', msg.timestamp, '<', joinTimeRef.current);
            return;
          }
          // 'candidates' is our custom batch type — simple-peer only understands individual signals
          if (msg.signal.type === 'candidates' && Array.isArray(msg.signal.items)) {
            console.log('[signal] Processing candidates batch:', msg.signal.items.length, 'items');
            msg.signal.items.forEach((candidate, idx) => {
              // Validate candidate before sending to peer
              if (!candidate || typeof candidate !== 'object') {
                console.warn('[signal] Invalid candidate at index', idx, candidate);
                return;
              }
              // Check if candidate has required fields for simple-peer
              if (!candidate.candidate && !candidate.sdpMid && !candidate.sdpMLineIndex) {
                console.warn('[signal] Candidate missing required fields at index', idx, candidate);
                return;
              }
              try {
                peerRef.current.signal(candidate);
                console.log('[signal] Candidate applied successfully at index', idx);
              } catch (e) {
                console.error('[signal] Candidate rejected at index', idx, ':', e.message, 'candidate:', JSON.stringify(candidate));
              }
            });
          } else {
            // Only pass WebRTC signaling types to peer.signal()
            const validWebRTCTypes = ['offer', 'answer', 'candidate', 'pranswer', 'rollback'];
            if (validWebRTCTypes.includes(msg.signal?.type)) {
              try {
                peerRef.current.signal(msg.signal);
                console.log('[signal] Signal applied:', msg.signal?.type);
              } catch (e) {
                console.warn('[signal] Signal rejected:', e.message, 'signal:', msg.signal);
              }
            } else {
              console.log('[signal] Skipping non-WebRTC signal:', msg.signal?.type);
            }
          }
        }
      });
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[poll]', err);
    }
  }, [scheduleId, role, onClose, toast]); // Clean dependencies!

  // ── setupPeer ──────────────────────────────────────────────────────────────
  const setupPeer = useCallback((currentStream) => {
    if (isCleaningUp.current) return;
    if (!_PeerReady || !_Peer) {
      console.warn('[VideoCall] simple-peer not ready, retrying...');
      toast?.('Loading WebRTC library...', 'info');
      // Retry after a short delay
      setTimeout(() => setupPeer(currentStream), 500);
      return;
    }
    // Teacher: valid student answers can never arrive before teacher's joinTimeRef
    // (student answers only after receiving teacher's offer). Enable stale-signal
    // filtering from the start so old answers from crashed sessions are discarded.
    if (role === 'teacher') isInitialConnectionRef.current = false;

    setCallStatus('Waiting for the other participant...');
    console.log('[VideoCall] Setting up peer connection:', { role, scheduleId, initiator: role === 'teacher' });

    const peer = new _Peer({
      initiator: role === 'teacher',
      trickle: true,
      stream: currentStream,
      config: { iceServers: ICE_SERVERS },
    });

    peer.on('connect', () => {
      console.log('[VideoCall] Peer connected!');
      if (!callTimerStartedRef.current) {
        callTimerStartedRef.current = true;
        if (!callStartTimeRef.current) callStartTimeRef.current = Date.now();
        durationIntervalRef.current = setInterval(() => {
          setDuration(prev => {
            if (role === 'teacher' && prev === 3000) setShowTokenWarning(true);
            return prev + 1;
          });
        }, 1000);
      }
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = setInterval(async () => {
        try {
          const pc = peerRef.current?._pc;
          if (!pc) return;
          const stats = await pc.getStats();
          let loss = 0, rtt = 0, hasStat = false;
          stats.forEach(report => {
            if (report.type === 'remote-inbound-rtp') {
              loss = Math.max(loss, report.fractionLost ?? 0);
              rtt  = Math.max(rtt,  report.roundTripTime  ?? 0);
              hasStat = true;
            }
          });
          if (!hasStat) return;
          setNetworkQuality(loss > 0.1 || rtt > 0.5 ? 'poor' : 'good');
        } catch {}
      }, 5000);
      // Teacher sends full board state to student on DataChannel open
      if (role === 'teacher') {
        boardSyncSentRef.current = false; // reset: new peer session
        doSyncNow(peer, getSyncDataRef.current, canStudentDrawRef.current);
        boardSyncSentRef.current = !!getSyncDataRef.current; // mark sent only if board was open
      }
    });

    peer.on('iceStateChange', (iceConnectionState, iceGatheringState) => {
      console.log('[VideoCall] ICE state change:', { iceConnectionState, iceGatheringState });
      if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected') {
        console.error('[VideoCall] ICE connection failed/disconnected');
        toast?.('Connection failed. Check your network.', 'error');
        setCallStatus('Connection Failed');
      }
    });

    let signalSendChain = Promise.resolve();
    clearTimeout(candidateFlushTimerRef.current);
    candidateBufferRef.current = [];

    const flushCandidates = () => {
      const batch = candidateBufferRef.current.splice(0);
      if (batch.length === 0) return;
      signalSendChain = signalSendChain.then(async () => {
        try {
          const res = await fetch(`${SIGNALING_URL}/room/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: scheduleId, sender: role, signal: { type: 'candidates', items: batch } }),
          });
          if (!res.ok) {
            console.error('[POST] candidates batch failed:', res.status);
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (e) {
          console.error('[POST] candidates batch error:', e);
          toast?.('Failed to send connection data. Check signaling server.', 'error');
        }
      });
    };

    peer.on('signal', (data) => {
      console.log('[VideoCall] Peer signal generated:', data?.type);
      if (data?.type === 'offer' || data?.type === 'answer') {
        signalSendChain = signalSendChain.then(async () => {
          try {
            const res = await fetch(`${SIGNALING_URL}/room/signal`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: scheduleId, sender: role, signal: data }),
            });
            if (!res.ok) {
              console.error('[POST] signal send failed:', res.status);
              throw new Error(`HTTP ${res.status}`);
            }
          } catch (e) {
            console.error('[POST] signal send error:', e);
            toast?.('Failed to send signaling data. Check signaling server.', 'error');
          }
        });
        return;
      }
      candidateBufferRef.current.push(data);
      clearTimeout(candidateFlushTimerRef.current);
      candidateFlushTimerRef.current = setTimeout(flushCandidates, 400);
    });

    peer.on('stream', (peerStream) => {
      console.log('[VideoCall] Received remote stream');
      peerStreamRef.current = peerStream;
      [peerMainVideoRef, peerVideoRef].forEach(r => {
        if (r.current) { r.current.srcObject = peerStream; r.current.play().catch(() => {}); }
      });
      setCallStatus('Connected');
      setNetworkQuality('good');
      setReconnectCount(0);
      setPeerConnected(true);
      setShowRemoteCam(true);
      setJoinedBannerVisible(true);
      setTimeout(() => setJoinedBannerVisible(false), 4000);
      toast?.(`${role === 'teacher' ? 'Student' : 'Teacher'} has joined`, 'success');
      onPeerJoined?.();
      playSound();
      if (role === 'teacher' && callStartTimeRef.current) {
        fetch(`${SIGNALING_URL}/room/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: scheduleId, sender: role, signal: { type: 'sync-time', startTime: callStartTimeRef.current } }),
        }).catch(() => {});
      }
    });

    peer.on('close', () => {
      console.log('[VideoCall] Peer connection closed');
      if (isCleaningUp.current) return;
      setCallStatus('Connection lost');
      setNetworkQuality('lost');
      clearInterval(statsIntervalRef.current);
      setPeerConnected(false);
      scheduleReconnect(currentStream);
    });

    peer.on('data', (data) => {
      // Binary message = PDF chunk (raw bytes, no base64)
      if (typeof data !== 'string') {
        try {
          const buf = data instanceof Uint8Array ? data : new Uint8Array(data.buffer ?? data);
          const hLen = buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24);
          const hdr  = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + hLen)));
          const chunk = buf.subarray(4 + hLen); // raw PDF bytes — no decoding needed
          const t = pdfTransferRef.current[hdr.tabId];
          if (t) {
            t.chunks[hdr.chunkIndex] = chunk;
            t.received++;
            if (t.received === t.totalChunks) {
              // Blob accepts Uint8Array array directly — zero-copy assembly
              const url = URL.createObjectURL(new Blob(t.chunks, { type: 'application/pdf' }));
              setIncomingPdfData({ tabId: hdr.tabId, url, _t: Date.now() });
              setPdfTransferProgress(null);
              delete pdfTransferRef.current[hdr.tabId];
            } else {
              // Report at most once per percentage point — avoids a re-render per chunk
              const percent = Math.floor((t.received / t.totalChunks) * 100);
              if (percent !== t.lastReportedPercent) {
                t.lastReportedPercent = percent;
                setPdfTransferProgress({ tabId: hdr.tabId, percent });
              }
            }
          }
        } catch (e) {
          console.warn('[VideoCall] Failed to parse binary chunk:', e);
        }
        return;
      }

      // JSON text message
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'DRAW') {
          setIncomingStroke({ stroke: parsed.stroke, page: parsed.page, _t: Date.now() });
        } else if (parsed.type === 'DRAW_POINT') {
          setIncomingStrokePoint({ ...parsed.data, _t: Date.now() });
        } else if (parsed.type === 'PAGE') {
          setIncomingPage(parsed.page);
        } else if (parsed.type === 'TAB') {
          setIncomingTab({ tabId: parsed.tabId, tabMeta: parsed.tabMeta || null, _t: Date.now() });
        } else if (parsed.type === 'SYNC') {
          setIncomingSync({ strokesByTab: parsed.strokesByTab, tabs: parsed.tabs, activeTabId: parsed.activeTabId, pageNumber: parsed.pageNumber, _t: Date.now() });
          if (parsed.canStudentDraw !== undefined) setCanStudentDraw(!!parsed.canStudentDraw);
        } else if (parsed.type === 'PERMISSION') {
          setCanStudentDraw(!!parsed.canDraw);
        } else if (parsed.type === 'PDF_META') {
          pdfTransferRef.current[parsed.tabId] = { name: parsed.name, pdfName: parsed.pdfName, totalChunks: parsed.totalChunks, chunks: new Array(parsed.totalChunks).fill(null), received: 0, lastReportedPercent: 0 };
          setIncomingTab({ tabId: parsed.tabId, tabMeta: { name: parsed.name, pdfName: parsed.pdfName }, _t: Date.now() });
          setPdfTransferProgress({ tabId: parsed.tabId, percent: 0 });
        } else if (parsed.type === 'UNDO') {
          setIncomingUndo({ tabId: parsed.tabId, page: parsed.page, _t: Date.now() });
        } else if (parsed.type === 'REDO') {
          setIncomingRedo({ tabId: parsed.tabId, page: parsed.page, _t: Date.now() });
        } else if (parsed.type === 'CLEAR_PAGE') {
          setIncomingClearPage({ tabId: parsed.tabId, page: parsed.page, _t: Date.now() });
        } else if (parsed.type === 'ERASE') {
          setIncomingErase({ tabId: parsed.tabId, page: parsed.page, point: parsed.point, _t: Date.now() });
        }
      } catch (e) {
        console.warn('[VideoCall] Failed to parse incoming data:', e);
      }
    });

    peer.on('error', (err) => {
      console.error('[VideoCall] Peer error:', err);
      if (!isCleaningUp.current) {
        toast?.(`Connection error: ${err.message || 'Unknown error'}`, 'error');
        scheduleReconnect(currentStream);
      }
    });

    peerRef.current = peer;
    clearInterval(pollIntervalRef.current);
    pollSignals(); // Poll immediately!
    pollIntervalRef.current = setInterval(pollSignals, 3000);
  }, [role, scheduleId, pollSignals]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = (stream) => {
    clearTimeout(reconnectTimerRef.current);
    setReconnectCount(c => {
      const next = c + 1;
      if (next > 5) { toast?.('Unable to reconnect — please close and reopen the call', 'error'); return c; }
      const delay = Math.min(next * 2000, 10000);
      setCallStatus(`Reconnecting (${next}/5)...`);
      reconnectTimerRef.current = setTimeout(() => {
        if (!isCleaningUp.current && stream) {
          console.log('[VideoCall] Starting reconnect attempt:', next);
          peerRef.current?.destroy();
          peerAlertedRef.current = false;
          isInitialConnectionRef.current = false; // Mark as reconnection to enable stale signal filtering
          joinTimeRef.current = Date.now();
          // Don't reset to 0 — that would re-process stale historical signals from
          // previous sessions in the append-only KV room and immediately crash the new peer.
          // Only process signals that arrive after this reconnect attempt.
          lastTimestampRef.current = joinTimeRef.current - 1;
          // Clear any pending signal processing
          candidateBufferRef.current = [];
          clearTimeout(candidateFlushTimerRef.current);
          setupPeer(stream);
        }
      }, delay);
      return next;
    });
  };

  // ── cleanup ────────────────────────────────────────────────────────────────
  const cleanup = async () => {
    if (isCleaningUp.current) return;
    isCleaningUp.current = true;
    clearInterval(pollIntervalRef.current);
    clearInterval(durationIntervalRef.current);
    clearInterval(statsIntervalRef.current);
    clearTimeout(reconnectTimerRef.current);
    clearTimeout(candidateFlushTimerRef.current);
    clearTimeout(speakTimerRef.current);
    candidateBufferRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    peerRef.current?.destroy();
    streamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenTrackRef.current?.stop();
    const leaveBody = JSON.stringify({ roomId: scheduleId, sender: myId });
    const beaconSent = navigator.sendBeacon?.(
      `${SIGNALING_URL}/room/leave`,
      new Blob([leaveBody], { type: 'application/json' }),
    );
    if (!beaconSent) {
      try {
        await fetch(`${SIGNALING_URL}/room/leave`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: leaveBody,
        });
      } catch (_) {}
    }
  };

  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = () => ctx.close();
    } catch (_) {}
  };

  // ── Controls ───────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMicOn(t.enabled); }
  };

  const toggleCam = () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCamOn(t.enabled); sendCamStateSignal(t.enabled); }
  };

  const switchCamera = async () => {
    if (!isMobile) return;
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newMode } });
      const newTrack  = newStream.getVideoTracks()[0];
      const oldTrack  = streamRef.current?.getVideoTracks()[0];
      if (peerRef.current && oldTrack && !isScreenSharing) {
        peerRef.current.replaceTrack(oldTrack, newTrack, streamRef.current);
      }
      oldTrack?.stop();
      streamRef.current?.removeTrack(oldTrack);
      streamRef.current?.addTrack(newTrack);
      cameraSenderTrackRef.current = newTrack;
      if (myVideoRef.current) myVideoRef.current.srcObject = streamRef.current;
      setFacingMode(newMode);
      setIsCamOn(true);
    } catch { toast?.('Unable to switch camera', 'error'); }
  };

  const sendCamStateSignal = (enabled) => {
    fetch(`${SIGNALING_URL}/room/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: scheduleId, sender: myId, signal: { type: 'camera', enabled } }),
    }).catch(() => {});
  };

  const sendScreenShareSignal = (active) => {
    fetch(`${SIGNALING_URL}/room/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: scheduleId, sender: myId, signal: { type: 'screenshare', active } }),
    }).catch(() => {});
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) { stopScreenShare(); return; }
    if (!peerRef.current || !peerRef.current.connected || peerRef.current.destroyed) {
      toast?.('รอเชื่อมต่อกับอีกฝ่ายก่อนแชร์หน้าจอนะครับ', 'error');
      return;
    }
    try {
      const screen   = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const vidTrack = screen.getVideoTracks()[0];
      screenTrackRef.current = vidTrack;
      screenStreamRef.current = screen;
      const myVid = cameraSenderTrackRef.current;
      if (peerRef.current && myVid) {
        peerRef.current.replaceTrack(myVid, vidTrack, streamRef.current);
      }
      if (myScreenVideoRef.current) myScreenVideoRef.current.srcObject = screen;
      vidTrack.addEventListener('ended', () => stopScreenShare());
      setIsScreenSharing(true);
      sendScreenShareSignal(true);
    } catch { toast?.('Unable to share screen', 'error'); }
  };

  const stopScreenShare = () => {
    if (!screenTrackRef.current) return;
    const myVid = cameraSenderTrackRef.current;
    if (peerRef.current && myVid) {
      try { peerRef.current.replaceTrack(screenTrackRef.current, myVid, streamRef.current); } catch (_) {}
    }
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    if (myVideoRef.current) myVideoRef.current.srcObject = streamRef.current;
    setIsScreenSharing(false);
    sendScreenShareSignal(false);
  };

  const toggleFullscreen = () => {
    const elem = containerRef.current;
    if (!isFullscreen) {
      if (elem.requestFullscreen) { elem.requestFullscreen().catch(() => {}); return; }
      if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); return; }
      const vid = peerMainVideoRef.current;
      if (vid?.webkitEnterFullscreen) {
        vid.webkitEnterFullscreen();
        setIsFullscreen(true);
        const onEnd = () => { setIsFullscreen(false); vid.removeEventListener('webkitendfullscreen', onEnd); };
        vid.addEventListener('webkitendfullscreen', onEnd);
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else setIsFullscreen(false);
    }
  };

  const handleEndCall = () => {
    if (isFullscreen) document.exitFullscreen?.().catch(() => {});
    cleanup();
    onClose();
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !SIGNALING_URL) return;
    const myName = role === 'teacher' ? 'Teacher' : studentName;
    setChatMessages(prev => [...prev, { text, from: myId, name: myName, timestamp: Date.now() }]);
    setChatInput('');
    fetch(`${SIGNALING_URL}/room/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: scheduleId, sender: myId, signal: { type: 'chat', text, from: myId, name: myName } }),
    }).catch(() => {});
  };

  const handlePdfUpload = useCallback(async (tabId, file) => {
    if (!peerRef.current || peerRef.current.destroyed || !peerRef.current.connected) return;
    try {
      const buf = await file.arrayBuffer();
      const name = file.name.replace(/\.pdf$/i, '').slice(0, 28);
      await sendPdfChunks(peerRef.current, tabId, name, file.name, buf);
    } catch (e) {
      console.warn('[VideoCall] Failed to send PDF:', e);
    }
  }, []);

  const broadcastBoardData = (data) => {
    if (peerRef.current && !peerRef.current.destroyed && peerRef.current.connected) {
      try {
        peerRef.current.send(JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to send board data:', e);
      }
    }
  };

  // ── Derived display state ──────────────────────────────────────────────────
  const qualityDot   = networkQuality === 'good' ? '#22c55e' : networkQuality === 'poor' ? '#f59e0b' : '#ef4444';
  const qualityBars  = networkQuality === 'good' ? 3 : networkQuality === 'poor' ? 1 : 0;
  const isGallery    = viewMode === 'gallery' && !isScreenSharing && !peerIsScreenSharing;
  const peerLabel    = studentName || (role === 'teacher' ? 'Student' : 'Teacher');
  const myName       = role === 'teacher' ? 'Teacher' : studentName;

  // ── Always-mounted video styles ────────────────────────────────────────────
  const peerMainStyle = {
    position: 'absolute', background: '#1c1c1c',
    display: isScreenSharing ? 'none' : 'block',
    objectFit: peerIsScreenSharing ? 'contain' : 'cover',
    ...(isGallery ? {
      top: 4, bottom: 4, left: 4,
      width: 'calc(50% - 6px)', height: 'calc(100% - 8px)', borderRadius: 14,
    } : {
      top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%',
    }),
  };

  const selfGalleryStyle = {
    position: 'absolute',
    display: isGallery ? 'block' : 'none',
    top: 4, bottom: 4, right: 4,
    width: 'calc(50% - 6px)', height: 'calc(100% - 8px)',
    objectFit: 'cover', borderRadius: 14, background: '#1c1c1c',
    transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
  };

  const screenShareStyle = {
    position: 'absolute',
    display: isScreenSharing ? 'block' : 'none',
    top: 0, right: 0, bottom: 0, left: 0,
    width: '100%', height: '100%', objectFit: 'contain', background: '#000',
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[99999] flex flex-col select-none"
      style={{ background: '#1c1c1c', fontFamily: 'Inter, system-ui, sans-serif' }}
    >

      {/* ── Top Info Bar ───────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2.5 pointer-events-none"
           style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)' }}>

        {/* Timer + quality */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <div className="flex items-end gap-[2px] h-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-[3px] rounded-full transition-all"
                   style={{ height: `${i * 4}px`, background: i <= qualityBars ? qualityDot : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
          <span className="text-white/80 text-[12px] font-mono tabular-nums">{fmtDur(duration)}</span>
          {reconnectCount > 0 && callStatus.includes('Reconnect') && (
            <span className="flex items-center gap-1 text-amber-400 text-[11px]">
              <RefreshCw size={11} className="animate-spin" /> {callStatus}
            </span>
          )}
        </div>

        {/* Meeting name */}
        <span className="text-white/60 text-[11px] font-medium tracking-wide hidden sm:block">SHIFTHIGHBURY Classroom</span>

        {/* Token warning */}
        <div className="pointer-events-auto flex items-center gap-2">
          {showTokenWarning && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] text-red-200"
                 style={{ background: 'rgba(127,29,29,0.9)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <AlertTriangle size={12} />
              <span>Session expiring</span>
              <button onClick={() => setShowTokenWarning(false)} className="text-red-300 hover:text-white ml-1">
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Video Area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {showBoard ? (
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center" style={{ background: '#1c1c1e' }}><div className="text-white/40 text-sm">กำลังโหลดกระดาน...</div></div>}>
            <InteractiveBoard
              onStrokeEnd={(stroke, page) => broadcastBoardData({ type: 'DRAW', stroke, page })}
              incomingStroke={incomingStroke}
              onStrokePoint={(data) => broadcastBoardData({ type: 'DRAW_POINT', data })}
              incomingStrokePoint={incomingStrokePoint}
              onPageSync={(page) => broadcastBoardData({ type: 'PAGE', page })}
              incomingPage={incomingPage}
              onTabSync={(tabId, tabMeta) => broadcastBoardData({ type: 'TAB', tabId, tabMeta })}
              incomingTab={incomingTab}
              onUndo={(tabId, page) => broadcastBoardData({ type: 'UNDO', tabId, page })}
              incomingUndo={incomingUndo}
              onRedo={(tabId, page) => broadcastBoardData({ type: 'REDO', tabId, page })}
              incomingRedo={incomingRedo}
              onClearPage={(tabId, page) => broadcastBoardData({ type: 'CLEAR_PAGE', tabId, page })}
              incomingClearPage={incomingClearPage}
              onErase={(tabId, page, point) => broadcastBoardData({ type: 'ERASE', tabId, page, point })}
              incomingErase={incomingErase}
              studentId={studentId}
              onSyncRequest={(getCb) => {
                getSyncDataRef.current = getCb;
                // Board opened after peer already connected: send SYNC now (only once per session)
                if (!boardSyncSentRef.current && role === 'teacher' && peerRef.current?.connected) {
                  doSyncNow(peerRef.current, getCb, canStudentDrawRef.current);
                  boardSyncSentRef.current = true;
                }
              }}
              incomingSync={incomingSync}
              onPdfUpload={handlePdfUpload}
              incomingPdfData={incomingPdfData}
              pdfTransferProgress={pdfTransferProgress}
              onBoardRestored={() => {
                // Tabs restored from Drive never went through onTabSync/onPdfUpload —
                // force a fresh full SYNC so an already-connected peer actually sees them
                // (otherwise they stay stuck on the original blank "Whiteboard 1").
                if (role === 'teacher' && peerRef.current?.connected && !peerRef.current.destroyed) {
                  doSyncNow(peerRef.current, getSyncDataRef.current, canStudentDrawRef.current);
                  boardSyncSentRef.current = true;
                }
              }}
              role={role}
              canStudentDraw={canStudentDraw}
              onPermissionToggle={(val) => {
                setCanStudentDraw(val);
                broadcastBoardData({ type: 'PERMISSION', canDraw: val });
              }}
            />
          </Suspense>
        ) : (
          <>
            {/* Always-mounted video elements (never unmount = srcObject stays bound) */}
            <video ref={peerMainVideoRef} autoPlay playsInline style={peerMainStyle} />
            <video ref={myGalleryVideoRef} autoPlay playsInline muted style={selfGalleryStyle} />
            <video ref={myScreenVideoRef} autoPlay playsInline muted style={screenShareStyle} />

            {/* ── Speaker view overlays ───────────────────────────────────────── */}
            {!isGallery && !isScreenSharing && (
              <>
                {/* Remote cam-off: full avatar */}
                {peerConnected && peerIsCamOff && !peerIsScreenSharing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                       style={{ background: '#2d2d2d' }}>
                    <div className="flex items-center justify-center rounded-full text-white text-[32px] font-bold mb-3"
                         style={{ width: 96, height: 96, background: getAvatarColor(peerLabel) }}>
                      {getInitials(peerLabel)}
                    </div>
                    <p className="text-white/80 text-[15px] font-semibold">{peerLabel}</p>
                    <p className="text-white/40 text-[12px] mt-1">Camera is off</p>
                  </div>
                )}

                {/* Remote name label (bottom-left) */}
                {peerConnected && (
                  <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-1.5"
                       style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', borderRadius: 99, padding: '3px 10px' }}>
                    <span className="text-[11px] font-medium text-white">
                      {peerIsScreenSharing ? `${peerLabel} · Sharing screen` : peerLabel}
                    </span>
                  </div>
                )}

                {/* Waiting overlay */}
                {!peerConnected && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 pointer-events-none"
                       style={{ background: '#1c1c1c' }}>
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-24 h-24 rounded-full animate-ping"
                           style={{ background: 'rgba(45,140,255,0.15)' }} />
                      <div className="flex items-center justify-center rounded-full text-white text-[30px] font-bold"
                           style={{ width: 80, height: 80, background: getAvatarColor(peerLabel), position: 'relative' }}>
                        {getInitials(peerLabel)}
                      </div>
                    </div>
                    <div className="text-center px-6">
                      <p className="text-white text-[16px] font-semibold">
                        {callStatus.includes('Reconnect') ? 'Reconnecting...' : `Waiting for ${peerLabel}...`}
                      </p>
                      <p className="text-white/40 text-[12px] mt-1.5">
                        {role === 'teacher' ? 'Share the join link with your student' : 'Your teacher will start shortly'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {[0, 0.15, 0.3].map((d, i) => (
                        <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                             style={{ background: '#2D8CFF', animationDelay: `${d}s` }} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Gallery overlays ────────────────────────────────────────────── */}
            {isGallery && (
              <div className="absolute inset-0 z-10 pointer-events-none">
                {/* Gap between tiles */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[4px]"
                     style={{ background: '#1c1c1c' }} />

                {/* Remote tile cam-off */}
                {peerIsCamOff && (
                  <div style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 6px)',
                                background: '#2d2d2d', borderRadius: 14,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: getAvatarColor(peerLabel),
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 22, fontWeight: 700, color: 'white' }}>
                      {getInitials(peerLabel)}
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>{peerLabel}</span>
                  </div>
                )}

                {/* Self tile cam-off */}
                {!isCamOn && (
                  <div style={{ position: 'absolute', top: 4, bottom: 4, right: 4, width: 'calc(50% - 6px)',
                                background: '#2d2d2d', borderRadius: 14,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: getAvatarColor(myName),
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 22, fontWeight: 700, color: 'white' }}>
                      {getInitials(myName)}
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>You</span>
                  </div>
                )}

                {/* Name labels */}
                <div className="absolute bottom-3 left-5 flex items-center gap-1.5"
                     style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', borderRadius: 99, padding: '2px 8px' }}>
                  <span className="text-[11px] text-white font-medium">{peerLabel}</span>
                </div>
                <div className="absolute bottom-3 right-5 flex items-center gap-1.5"
                     style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', borderRadius: 99, padding: '2px 8px' }}>
                  {!isMicOn && <MicOff size={9} className="text-red-400" />}
                  <span className="text-[11px] text-white font-medium">You</span>
                </div>
              </div>
            )}

            {/* ── Screen share LIVE badge ──────────────────────────────────────── */}
            {(isScreenSharing || peerIsScreenSharing) && (
              <div className="absolute top-12 left-4 z-10 pointer-events-none flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-white text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={{ background: isScreenSharing ? '#16a34a' : '#2D8CFF' }}>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </span>
                <span className="text-white/70 text-[11px] font-medium"
                      style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 99, padding: '2px 8px' }}>
                  {isScreenSharing ? 'You are sharing your screen' : `${peerLabel} is sharing`}
                </span>
              </div>
            )}

            {/* ── Joined banner ────────────────────────────────────────────────── */}
            {joinedBannerVisible && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 text-white text-[13px] font-semibold px-4 py-2 rounded-full shadow-xl"
                   style={{ background: 'rgba(22,163,74,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'zw-slideDown 300ms ease-out' }}>
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {role === 'teacher' ? `${peerLabel} has joined` : 'Teacher has connected'}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Self-view FloatingCamera ─────────────────────────────────────────── */}
      <FloatingCamera
        videoRef={myVideoRef}
        pos={localCamPos}
        onPosChange={setLocalCamPos}
        visible={showLocalCam && !isGallery}
        onClose={() => setShowLocalCam(false)}
        label="You"
        mirrored={!isScreenSharing && facingMode === 'user'}
        camOff={!isCamOn}
        speaking={isSpeaking && isMicOn}
        hideClose={false}
      />

      {/* ── Remote FloatingCamera (only when I'm screen-sharing) ───────────────── */}
      <FloatingCamera
        videoRef={peerVideoRef}
        pos={remoteCamPos}
        onPosChange={setRemoteCamPos}
        visible={showRemoteCam && isScreenSharing && peerConnected}
        onClose={() => setShowRemoteCam(false)}
        label={peerLabel}
        mirrored={false}
        camOff={peerIsCamOff}
        speaking={false}
        hideClose={false}
      />

      {/* ── Chat Panel ───────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 right-0 bottom-0 z-30 flex flex-col transition-transform duration-300 ease-in-out"
        style={{
          width: 'min(320px, 100vw)',
          background: '#1e1e1e',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
          bottom: 64, // above toolbar
        }}
      >
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-white font-semibold text-[14px]">In-Meeting Chat</span>
          <button onClick={() => setChatOpen(false)} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {chatMessages.length === 0 && (
            <p className="text-white/25 text-[12px] text-center mt-10">No messages yet</p>
          )}
          {chatMessages.map((msg, i) => {
            const isMe = msg.from === myId;
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold" style={{ color: getAvatarColor(msg.name) }}>{msg.name}</span>
                  <span className="text-[10px] text-white/25">{fmtMsgTime(msg.timestamp)}</span>
                </div>
                <div className="max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words"
                     style={{ background: isMe ? '#2D8CFF' : '#3a3a3a', color: 'white' }}>
                  {msg.text}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        <div className="px-3 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-white/25 focus:outline-none"
              style={{ background: '#3a3a3a' }}
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="rounded-xl px-3 py-2 text-white disabled:opacity-30 active:scale-95 transition-all"
              style={{ background: '#2D8CFF' }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-center px-3 sm:px-6 z-20"
        style={{ background: '#242424', borderTop: '1px solid rgba(255,255,255,0.06)', height: 64 }}
      >
        <div className="flex items-center gap-0 sm:gap-0.5">

          {/* Mute / Unmute */}
          <ZoomBtn
            icon={isMicOn ? Mic : MicOff}
            label={isMicOn ? 'Mute' : 'Unmute'}
            onClick={toggleMic}
            danger={!isMicOn}
          />

          {/* Stop / Start Video */}
          <ZoomBtn
            icon={isCamOn ? Video : VideoOff}
            label={isCamOn ? 'Stop Video' : 'Start Video'}
            onClick={toggleCam}
            danger={!isCamOn}
          />

          {/* Flip Camera — mobile only */}
          {isMobile && (
            <ZoomBtn icon={FlipHorizontal} label="Flip Cam" onClick={switchCamera} />
          )}

          {/* Restore self-view if hidden */}
          {!showLocalCam && !isGallery && (
            <ZoomBtn icon={Eye} label="Show Self" onClick={() => setShowLocalCam(true)} />
          )}

          {/* Restore remote cam if hidden during screen share */}
          {peerConnected && !showRemoteCam && isScreenSharing && (
            <ZoomBtn icon={Eye} label="Show Them" onClick={() => setShowRemoteCam(true)} />
          )}

          {/* Divider */}
          <div className="w-px h-7 mx-1 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />

          {/* Share Screen — desktop only */}
          {canShareScreen && (
            <ZoomBtn
              icon={isScreenSharing ? ScreenShareOff : ScreenShare}
              label={isScreenSharing ? 'Stop Share' : 'Share Screen'}
              onClick={toggleScreenShare}
              active={isScreenSharing}
            />
          )}

          {/* Gallery / Speaker */}
          <ZoomBtn
            icon={LayoutGrid}
            label={viewMode === 'speaker' ? 'Gallery' : 'Speaker'}
            onClick={() => setViewMode(v => v === 'speaker' ? 'gallery' : 'speaker')}
            active={viewMode === 'gallery'}
          />

          {/* Interactive Board */}
          <ZoomBtn
            icon={Eye}
            label="Board"
            onClick={() => setShowBoard(v => !v)}
            active={showBoard}
          />
          {/* Chat */}
          <ZoomBtn
            icon={MessageSquare}
            label="Chat"
            onClick={() => setChatOpen(v => !v)}
            active={chatOpen}
            badge={!chatOpen ? unreadCount : 0}
          />

          {/* Fullscreen — hide on phone if unsupported */}
          <ZoomBtn
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? 'Exit Full' : 'Full Screen'}
            onClick={toggleFullscreen}
            hidden={isMobile && !isIPad && !document.documentElement?.requestFullscreen}
          />

          {/* Divider */}
          <div className="w-px h-7 mx-1 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />

          {/* Leave */}
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-3 sm:px-4 min-w-[56px] sm:min-w-[72px] h-[44px] rounded-xl text-white active:scale-95 transition-all"
            style={{ background: '#e11d48' }}
          >
            <PhoneOff size={18} className="sm:w-[20px] sm:h-[20px]" />
            <span className="text-[9px] sm:text-[10px] font-semibold leading-none">Leave</span>
          </button>

        </div>
      </div>

      {/* ── Leave Confirmation Overlay ───────────────────────────────────────── */}
      {showLeaveConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center"
             style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          <div className="flex flex-col items-center gap-5 rounded-2xl p-7"
               style={{ background: '#2d2d2d', width: 'min(300px, 90vw)', boxShadow: '0 24px 60px rgba(0,0,0,0.8)' }}>
            <div className="flex items-center justify-center w-14 h-14 rounded-full"
                 style={{ background: 'rgba(225,29,72,0.2)' }}>
              <PhoneOff size={24} className="text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-[17px]">Leave the meeting?</p>
              <p className="text-white/45 text-[12px] mt-1.5 leading-relaxed">
                {peerConnected ? 'The other participant will be notified.' : 'You will disconnect from the room.'}
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white/80 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEndCall}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white"
                style={{ background: '#e11d48' }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes zw-slideDown {
          from { opacity: 0; transform: translate(-50%, -14px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

    </div>,
    document.body
  );
}
