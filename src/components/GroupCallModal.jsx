// @ts-nocheck
// GroupCallModal — teacher-side group call (hub-spoke multi-peer)
// Each student gets a sub-room: ${groupId}__${participantId}
// Lobby room: ${groupId}__lobby — students announce here on join
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
// Dynamic import avoids Rollup generating a synchronous TDZ binding for this CJS module
let _Peer = null;
let _PeerReady = false;
import('simple-peer').then(m => {
  _Peer = m.default || m;
  _PeerReady = true;
  console.log('[GroupCall] simple-peer loaded successfully');
}).catch(err => {
  console.error('[GroupCall] Failed to load simple-peer:', err);
});
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  MessageSquare, Send, Users, Wifi, WifiOff, PenLine,
} from 'lucide-react';
const InteractiveBoard = lazy(() => import('./InteractiveBoard.jsx').then(m => ({ default: m.InteractiveBoard })));

// ── PDF chunk transfer (binary) — same wire format VideoCallModal uses ────────
const _pdfEnc = new TextEncoder();
// Backpressure: the SCTP send buffer force-closes the DataChannel if we outrun
// the network — with N students receiving at once this is the likeliest failure
// mode for a large PDF, so pause above the high-water mark until it drains.
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

// ── Board SYNC sender — pushes full board state to one newly-connected peer ──
function doSyncNow(peer, getSyncData) {
  if (!peer?.connected || peer.destroyed) return;
  const sd = getSyncData?.();
  if (!sd) return;
  try {
    peer.send(JSON.stringify({
      type: 'SYNC',
      strokesByTab: sd.strokesByTab,
      tabs: (sd.tabs || []).map(t => ({ ...t, url: null })),
      activeTabId: sd.activeTabId,
      pageNumber: sd.pageNumber,
      canStudentDraw: false,
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

const AVATAR_COLORS = ['#2D8CFF', '#00BFA5', '#FF6B35', '#9333EA', '#F59E0B', '#10B981', '#EC4899', '#06B6D4'];
const getInitials = (n) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
const getAvatarColor = (n) => AVATAR_COLORS[(n || 'X').charCodeAt(0) % AVATAR_COLORS.length];
const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
  return `${h > 0 ? h + ':' : ''}${h > 0 ? String(m).padStart(2, '0') : m}:${String(sc).padStart(2, '0')}`;
};

// ── ZoomBtn ───────────────────────────────────────────────────────────────────
const Btn = ({ label, icon: Icon, onClick, danger = false, active = false, badge = 0, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative flex flex-col items-center justify-center gap-0.5
                px-2 sm:px-3 min-w-[56px] sm:min-w-[68px] h-[52px] sm:h-[56px]
                rounded-xl transition-colors active:scale-95 disabled:opacity-40
                ${active ? 'bg-blue-500/20 hover:bg-blue-500/30' : 'hover:bg-white/10'}`}
  >
    <Icon size={20} className={`sm:w-[22px] sm:h-[22px] ${danger ? 'text-red-400' : active ? 'text-blue-400' : 'text-white'}`} />
    <span className={`text-[9px] sm:text-[10px] font-medium leading-none ${danger ? 'text-red-400' : active ? 'text-blue-400' : 'text-white/70'}`}>{label}</span>
    {badge > 0 && (
      <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[8px] font-bold">
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

// ── StudentTile ───────────────────────────────────────────────────────────────
function StudentTile({ participantId, name, stream, connected, onVideoMount }) {
  const vidRef = useRef(null);

  const setRef = useCallback((el) => {
    vidRef.current = el;
    onVideoMount(participantId, el);
  }, [participantId, onVideoMount]);

  useEffect(() => {
    if (vidRef.current && stream) {
      vidRef.current.srcObject = stream;
      vidRef.current.play().catch(() => {});
    }
  }, [stream]);

  const camOn = connected && !!stream;

  return (
    <div
      className="relative rounded-[12px] overflow-hidden flex-shrink-0"
      style={{ background: '#2d2d2d', aspectRatio: '16/9' }}
    >
      <video
        ref={setRef}
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: camOn ? 'block' : 'none' }}
      />
      {!camOn && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: getAvatarColor(name),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 700, color: 'white',
          }}>
            {getInitials(name)}
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
            {connected ? 'กล้องปิด' : 'รอเข้าห้อง...'}
          </span>
        </div>
      )}
      {/* Name label */}
      <div style={{
        position: 'absolute', bottom: 6, left: 8,
        fontSize: 10, fontWeight: 600, color: 'white',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        borderRadius: 99, padding: '2px 7px', pointerEvents: 'none',
      }}>
        {name}
      </div>
      {/* Connection dot */}
      <div style={{
        position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%',
        background: connected ? '#22c55e' : '#f59e0b',
        boxShadow: connected ? '0 0 6px #22c55e' : 'none',
      }} />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function GroupCallModal({ groupId, groupMembers = [], onClose, toast }) {
  const [isMicOn, setIsMicOn]       = useState(true);
  const [isCamOn, setIsCamOn]       = useState(true);
  const [duration, setDuration]     = useState(0);
  const [participants, setParticipants] = useState([]);
  const [chatOpen, setChatOpen]     = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]   = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showLeave, setShowLeave]   = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showBoard, setShowBoard]   = useState(false);

  const streamRef        = useRef(null);
  const myVideoRef       = useRef(null);
  const peersRef         = useRef(new Map());      // participantId → Peer
  const videoRefMap      = useRef(new Map());      // participantId → <video>
  const lastTsRef        = useRef(new Map());      // participantId → number
  const peerPollsRef     = useRef(new Map());      // participantId → intervalId
  const candidateBufsRef = useRef(new Map());      // participantId → []
  const candidateTimersRef = useRef(new Map());    // participantId → timerId
  const signalChainsRef  = useRef(new Map());      // participantId → Promise
  const lobbyTsRef       = useRef(0);
  const lobbyPollRef     = useRef(null);
  const durationRef      = useRef(null);
  const isCleaningUpRef  = useRef(false);
  const chatEndRef       = useRef(null);
  const chatOpenRef      = useRef(false);
  const chatStartRef     = useRef(Date.now());
  const audioCtxRef      = useRef(null);
  const speakTimerRef    = useRef(null);
  const getSyncDataRef   = useRef(null);      // latest InteractiveBoard state getter
  const boardSyncedRef   = useRef(new Set()); // participantIds already sent a full board SYNC

  const SIGNALING_URL   = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
  const TURN_USERNAME   = import.meta.env.VITE_TURN_USERNAME;
  const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;

  // Validate configuration on mount
  useEffect(() => {
    if (!SIGNALING_URL || SIGNALING_URL === 'https://YOUR_WORKER_NAME.YOUR_ACCOUNT.workers.dev') {
      console.error('[GroupCall] Invalid SIGNALING_URL:', SIGNALING_URL);
      toast?.('WebRTC signaling URL not configured. Please check .env file.', 'error');
      return;
    }
    if (!TURN_USERNAME || !TURN_CREDENTIAL) {
      console.warn('[GroupCall] TURN credentials not configured. Using STUN only (may fail through NAT/firewall)');
      toast?.('TURN server not configured. Video calls may fail through firewalls.', 'warning');
    }
    console.log('[GroupCall] Configuration check:', {
      signalingUrl: SIGNALING_URL,
      hasTurn: !!(TURN_USERNAME && TURN_CREDENTIAL),
      groupId,
    });
  }, [SIGNALING_URL, TURN_USERNAME, TURN_CREDENTIAL, groupId, toast]);

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

  const LOBBY_ROOM = `${groupId}__lobby`;

  useEffect(() => { chatOpenRef.current = chatOpen; if (chatOpen) setUnreadCount(0); }, [chatOpen]);
  useEffect(() => { if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, chatOpen]);

  // ── Speaking detection ──────────────────────────────────────────────────────
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
        setIsSpeaking(buf.slice(0, 20).reduce((a, b) => a + b, 0) / 20 > 8);
        speakTimerRef.current = setTimeout(check, 150);
      };
      check();
    } catch (_) {}
  }, []);

  // ── Register video element ref from StudentTile ─────────────────────────────
  const handleVideoMount = useCallback((participantId, el) => {
    if (el) {
      videoRefMap.current.set(participantId, el);
    } else {
      videoRefMap.current.delete(participantId);
    }
  }, []);

  // ── Add a participant once lobby announces them ─────────────────────────────
  const addParticipant = useCallback((participantId, name) => {
    if (peersRef.current.has(participantId) || isCleaningUpRef.current) return;
    const subRoom = `${groupId}__${participantId}`;
    signalChainsRef.current.set(participantId, Promise.resolve());
    candidateBufsRef.current.set(participantId, []);

    if (!_PeerReady || !_Peer) {
      console.warn('[GroupCall] simple-peer not ready for participant:', participantId);
      toast?.('Loading WebRTC library...', 'info');
      return;
    }
    const peer = new _Peer({
      initiator: true,
      trickle: true,
      stream: streamRef.current,
      config: { iceServers: ICE_SERVERS },
    });

    // Fully forget this participant so a later join-announce (rejoin after a
    // drop or an intentional leave) can create a fresh peer instead of being
    // silently ignored by the `peersRef.current.has(participantId)` guard above.
    const forgetParticipant = () => {
      peersRef.current.delete(participantId);
      clearInterval(peerPollsRef.current.get(participantId));
      peerPollsRef.current.delete(participantId);
      clearTimeout(candidateTimersRef.current.get(participantId));
      candidateTimersRef.current.delete(participantId);
      candidateBufsRef.current.delete(participantId);
      lastTsRef.current.delete(participantId);
      signalChainsRef.current.delete(participantId);
      boardSyncedRef.current.delete(participantId); // rejoin gets a fresh full board SYNC
    };

    const flushCandidates = () => {
      const batch = (candidateBufsRef.current.get(participantId) || []).splice(0);
      if (batch.length === 0) return;
      const chain = signalChainsRef.current.get(participantId) || Promise.resolve();
      signalChainsRef.current.set(participantId, chain.then(() =>
        fetch(`${SIGNALING_URL}/room/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: subRoom, sender: 'teacher', signal: { type: 'candidates', items: batch } }),
        }).catch(() => {})
      ));
    };

    peer.on('signal', (data) => {
      if (data?.type === 'offer' || data?.type === 'answer') {
        const chain = signalChainsRef.current.get(participantId) || Promise.resolve();
        signalChainsRef.current.set(participantId, chain.then(() =>
          fetch(`${SIGNALING_URL}/room/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: subRoom, sender: 'teacher', signal: data }),
          }).catch(() => {})
        ));
        return;
      }
      const buf = candidateBufsRef.current.get(participantId) || [];
      buf.push(data);
      candidateBufsRef.current.set(participantId, buf);
      clearTimeout(candidateTimersRef.current.get(participantId));
      candidateTimersRef.current.set(participantId, setTimeout(flushCandidates, 400));
    });

    peer.on('stream', (remoteStream) => {
      setParticipants(prev => prev.map(p =>
        p.participantId === participantId ? { ...p, stream: remoteStream, connected: true } : p
      ));
      const el = videoRefMap.current.get(participantId);
      if (el) { el.srcObject = remoteStream; el.play().catch(() => {}); }
    });

    peer.on('connect', () => {
      setParticipants(prev => prev.map(p =>
        p.participantId === participantId ? { ...p, connected: true } : p
      ));
      toast?.(`${name} เข้าร่วมแล้ว`, 'success');
      // Board was already open before this student joined — catch them up
      if (getSyncDataRef.current && !boardSyncedRef.current.has(participantId)) {
        doSyncNow(peer, getSyncDataRef.current);
        boardSyncedRef.current.add(participantId);
      }
    });

    peer.on('close', () => {
      setParticipants(prev => prev.map(p =>
        p.participantId === participantId ? { ...p, connected: false, stream: null } : p
      ));
      // Guard against a stale peer's close firing after the participant already
      // rejoined and got a brand-new peer instance for the same participantId.
      if (peersRef.current.get(participantId) === peer) forgetParticipant();
    });

    peer.on('error', () => {});

    peersRef.current.set(participantId, peer);
    lastTsRef.current.set(participantId, 0);
    setParticipants(prev => [...prev, { participantId, name, connected: false, stream: null }]);

    // Poll sub-room for this participant's signals
    const pollSub = async () => {
      if (isCleaningUpRef.current) return;
      const p = peersRef.current.get(participantId);
      if (!p || p.destroyed) return;
      try {
        const lastTs = lastTsRef.current.get(participantId) || 0;
        const res = await fetch(
          `${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(subRoom)}&lastTimestamp=${lastTs}`,
        );
        const { messages = [] } = await res.json();
        messages.forEach(msg => {
          if (msg.sender === 'teacher') return;
          lastTsRef.current.set(participantId, Math.max(lastTsRef.current.get(participantId) || 0, msg.timestamp));
          if (msg.signal?.type === 'leave') {
            setParticipants(prev => prev.map(pp =>
              pp.participantId === participantId ? { ...pp, connected: false, stream: null } : pp
            ));
            p.destroy();
            forgetParticipant();
          } else if (msg.signal?.type === 'chat' && msg.timestamp >= chatStartRef.current) {
            setChatMessages(prev => {
              if (prev.some(m => m.timestamp === msg.timestamp && m.from === msg.signal.from)) return prev;
              return [...prev, { text: msg.signal.text, from: msg.signal.from, name: msg.signal.name || name, timestamp: msg.timestamp }];
            });
            if (!chatOpenRef.current) setUnreadCount(c => c + 1);
          } else if (msg.signal && !p.destroyed) {
            p.signal(msg.signal);
          }
        });
      } catch (_) {}
    };
    pollSub();
    peerPollsRef.current.set(participantId, setInterval(pollSub, 2000));
  }, [groupId, ICE_SERVERS, SIGNALING_URL, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lobby poll ──────────────────────────────────────────────────────────────
  const startLobbyPoll = useCallback(() => {
    const poll = async () => {
      if (isCleaningUpRef.current) return;
      try {
        const res = await fetch(
          `${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(LOBBY_ROOM)}&lastTimestamp=${lobbyTsRef.current}`,
        );
        const { messages = [] } = await res.json();
        messages.forEach(msg => {
          lobbyTsRef.current = Math.max(lobbyTsRef.current, msg.timestamp);
          if (msg.signal?.type === 'join-announce') {
            const { participantId, name } = msg.signal;
            if (participantId && !peersRef.current.has(participantId)) {
              addParticipant(participantId, name || 'นักเรียน');
            }
          }
        });
      } catch (_) {}
    };
    poll();
    lobbyPollRef.current = setInterval(poll, 2000);
  }, [LOBBY_ROOM, SIGNALING_URL, addParticipant]);

  // ── Init media ──────────────────────────────────────────────────────────────
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
        if (myVideoRef.current) myVideoRef.current.srcObject = stream;
        startSpeakDetect(stream);
        durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        startLobbyPoll();
      })
      .catch(err => {
        if (!cancelled) { toast?.(`กล้อง/ไมค์ไม่ได้รับอนุญาต: ${err.message}`, 'error'); onClose(); }
      });
    return () => { cancelled = true; cleanup(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    clearInterval(lobbyPollRef.current);
    clearInterval(durationRef.current);
    clearTimeout(speakTimerRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    peerPollsRef.current.forEach(id => clearInterval(id));
    candidateTimersRef.current.forEach(id => clearTimeout(id));
    peersRef.current.forEach((peer, participantId) => {
      peer.destroy();
      const subRoom = `${groupId}__${participantId}`;
      const body = JSON.stringify({ roomId: subRoom, sender: 'teacher' });
      const sent = navigator.sendBeacon?.(`${SIGNALING_URL}/room/leave`, new Blob([body], { type: 'application/json' }));
      if (!sent) fetch(`${SIGNALING_URL}/room/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    });
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, [groupId, SIGNALING_URL]);

  // ── Controls ────────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMicOn(t.enabled); }
  };
  const toggleCam = () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCamOn(t.enabled); }
  };
  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    const ts = Date.now();
    const signal = { type: 'chat', text, from: 'teacher', name: 'ครู' };
    setChatMessages(prev => [...prev, { text, from: 'teacher', name: 'ครู', timestamp: ts }]);
    peersRef.current.forEach((peer, participantId) => {
      if (peer.destroyed) return;
      const subRoom = `${groupId}__${participantId}`;
      fetch(`${SIGNALING_URL}/room/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: subRoom, sender: 'teacher', signal }),
      }).catch(() => {});
    });
  };
  const handleLeave = async () => {
    await cleanup();
    onClose();
  };

  // ── Whiteboard: fan out to every connected student's data channel ───────────
  const broadcastBoardData = (data) => {
    const msg = JSON.stringify(data);
    peersRef.current.forEach(peer => {
      if (!peer.destroyed && peer.connected) {
        try { peer.send(msg); } catch (_) {}
      }
    });
  };

  const handlePdfUpload = useCallback(async (tabId, file) => {
    try {
      const buf = await file.arrayBuffer();
      const name = file.name.replace(/\.pdf$/i, '').slice(0, 28);
      peersRef.current.forEach(peer => {
        if (!peer.destroyed && peer.connected) sendPdfChunks(peer, tabId, name, file.name, buf);
      });
    } catch (e) {
      console.warn('[GroupCall] Failed to send PDF:', e);
    }
  }, []);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const connectedCount = participants.filter(p => p.connected).length;
  const totalTiles = participants.length + 1; // +1 for teacher own tile
  const gridCols = totalTiles <= 2 ? 2 : totalTiles <= 4 ? 2 : 3;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#1c1c1c', display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', 'Noto Sans Thai', system-ui, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        height: 52, background: '#242424',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={14} style={{ color: 'white' }} />
          </div>
          <div>
            <p style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>คาบกลุ่ม</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
              {connectedCount}/{groupMembers.length || participants.length} คน · {fmtDur(duration)}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {connectedCount > 0
            ? <Wifi size={14} style={{ color: '#22c55e' }} />
            : <WifiOff size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />}
          <span style={{ fontSize: 12, color: connectedCount > 0 ? '#22c55e' : 'rgba(255,255,255,0.3)' }}>
            {connectedCount > 0 ? 'Connected' : 'Waiting...'}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Video grid / whiteboard */}
        <div style={{ flex: 1, padding: showBoard ? 0 : 12, overflow: showBoard ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          {showBoard ? (
            <Suspense fallback={
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                กำลังโหลดกระดาน...
              </div>
            }>
              <InteractiveBoard
                role="teacher"
                canStudentDraw={false}
                studentId={groupId}
                onPermissionToggle={() => toast?.('อนุญาตนักเรียนเขียนยังไม่รองรับสำหรับคาบกลุ่มครับ', 'info')}
                onStrokeEnd={(stroke, page) => broadcastBoardData({ type: 'DRAW', stroke, page })}
                onStrokePoint={(data) => broadcastBoardData({ type: 'DRAW_POINT', data })}
                onPageSync={(page) => broadcastBoardData({ type: 'PAGE', page })}
                onTabSync={(tabId, tabMeta) => broadcastBoardData({ type: 'TAB', tabId, tabMeta })}
                onUndo={(tabId, page) => broadcastBoardData({ type: 'UNDO', tabId, page })}
                onRedo={(tabId, page) => broadcastBoardData({ type: 'REDO', tabId, page })}
                onClearPage={(tabId, page) => broadcastBoardData({ type: 'CLEAR_PAGE', tabId, page })}
                onErase={(tabId, page, point) => broadcastBoardData({ type: 'ERASE', tabId, page, point })}
                onPdfUpload={handlePdfUpload}
                onSyncRequest={(getCb) => {
                  getSyncDataRef.current = getCb;
                  peersRef.current.forEach((peer, participantId) => {
                    if (peer.connected && !peer.destroyed && !boardSyncedRef.current.has(participantId)) {
                      doSyncNow(peer, getCb);
                      boardSyncedRef.current.add(participantId);
                    }
                  });
                }}
                onBoardRestored={() => {
                  // Tabs restored from Drive never went through onTabSync/onPdfUpload —
                  // force a fresh full SYNC to every currently-connected student.
                  peersRef.current.forEach((peer, participantId) => {
                    if (peer.connected && !peer.destroyed) {
                      doSyncNow(peer, getSyncDataRef.current);
                      boardSyncedRef.current.add(participantId);
                    }
                  });
                }}
              />
            </Suspense>
          ) : participants.length === 0 ? (
            /* Waiting state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              {/* Teacher own camera while waiting */}
              <div style={{ position: 'relative', width: 220, borderRadius: 16, overflow: 'hidden', border: `2px solid ${isSpeaking ? '#22c55e' : 'rgba(255,255,255,0.12)'}`, boxShadow: isSpeaking ? '0 0 0 3px rgba(34,197,94,0.3)' : 'none', transition: 'border-color 0.2s, box-shadow 0.2s', aspectRatio: '16/9', background: '#2d2d2d' }}>
                <video ref={myVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isCamOn ? 'block' : 'none' }} />
                {!isCamOn && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'white' }}>ครู</div>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 10, fontWeight: 600, color: 'white', background: 'rgba(0,0,0,0.55)', borderRadius: 99, padding: '2px 7px' }}>ครู (คุณ)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 20px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>รอนักเรียนเข้าห้อง...</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 8 }}>นักเรียนกดลิงก์เข้าเรียนจาก LINE หรือ Student Portal</p>
              </div>
              {/* Expected members list */}
              {groupMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 320 }}>
                  {groupMembers.map((m, i) => (
                    <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: 99, padding: '3px 10px' }}>
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Grid with teacher tile */
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: 8,
              alignContent: 'start',
            }}>
              {participants.map(p => (
                <StudentTile key={p.participantId} {...p} onVideoMount={handleVideoMount} />
              ))}
              {/* Teacher's own tile */}
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#2d2d2d', aspectRatio: '16/9', border: `2px solid ${isSpeaking ? '#22c55e' : 'transparent'}`, boxShadow: isSpeaking ? '0 0 0 2px rgba(34,197,94,0.3)' : 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}>
                <video ref={myVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isCamOn ? 'block' : 'none' }} />
                {!isCamOn && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2d2d2d' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'white' }}>ครู</div>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 10, fontWeight: 600, color: 'white', background: 'rgba(0,0,0,0.55)', borderRadius: 99, padding: '2px 7px' }}>
                  ครู (คุณ) {isSpeaking ? '▶' : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div style={{ width: 280, background: '#242424', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>แชท</span>
              <button onClick={() => setChatOpen(false)} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chatMessages.length === 0 && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 16 }}>ยังไม่มีข้อความ</p>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'teacher' ? 'flex-end' : 'flex-start' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{m.name}</span>
                  <div style={{ background: m.from === 'teacher' ? '#3b82f6' : 'rgba(255,255,255,0.12)', color: 'white', padding: '6px 10px', borderRadius: 12, fontSize: 13, maxWidth: '88%', wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="พิมพ์ข้อความ..."
                style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={sendChat}
                style={{ background: '#3b82f6', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', color: 'white', flexShrink: 0 }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        height: 64, background: '#242424',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, flexShrink: 0,
      }}>
        <Btn label={isMicOn ? 'ไมค์' : 'ปิดไมค์'} icon={isMicOn ? Mic : MicOff} onClick={toggleMic} active={!isMicOn} />
        <Btn label={isCamOn ? 'กล้อง' : 'ปิดกล้อง'} icon={isCamOn ? Video : VideoOff} onClick={toggleCam} active={!isCamOn} />
        <Btn label="กระดาน" icon={PenLine} onClick={() => setShowBoard(b => !b)} active={showBoard} />
        <Btn label="แชท" icon={MessageSquare} onClick={() => setChatOpen(o => !o)} active={chatOpen} badge={!chatOpen ? unreadCount : 0} />
        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
        <Btn label="ออก" icon={PhoneOff} onClick={() => setShowLeave(true)} danger />
      </div>

      {/* ── Leave Confirm ── */}
      {showLeave && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}>
          <div style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '28px 32px', width: 300, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <PhoneOff size={20} style={{ color: '#ef4444' }} />
            </div>
            <p style={{ color: 'white', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>สิ้นสุดคาบกลุ่ม?</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>นักเรียนทุกคนจะถูกตัดการเชื่อมต่อ</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowLeave(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >ยกเลิก</button>
              <button
                onClick={handleLeave}
                style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: '#ef4444', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >ออกจากห้อง</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
