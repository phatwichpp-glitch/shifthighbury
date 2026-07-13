// @ts-nocheck
import { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { GROUP, SESSION, SCHEDULE, STUDENT, STUDENT_COLORS, STUDENT_TEXT_COLORS, groupStudentIds } from '../lib/constants';
import { safeFloat, scheduleOccursOnDate, buildStudentLoginCode } from '../lib/business';
import { LOGO_B64 } from '../lib/constants';
import { SKILL_LABELS } from '../lib/appConfig';
import { Users, BookOpen, Brain, Calculator, BarChart2, Link2, ExternalLink, Copy, HelpCircle, Inbox, FileText, CalendarPlus, X, Check, Maximize2, RefreshCw, Bell, BellOff } from 'lucide-react';
import { PortalHelpModal } from '../components/modals/PortalHelpModal';
import { StudentCalendarModal } from '../components/modals/StudentCalendarModal';
const VideoCallModal = lazy(() => import('../components/VideoCallModal'));

const SIGNALING_URL = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const SKILL_ICONS = { Brain, Calculator, BookOpen, Users };
const SKILL_SCORE_COLUMN = {
  listening: SESSION.LISTENING_SCORE,
  speaking: SESSION.SPEAKING_SCORE,
  reading: SESSION.READING_SCORE,
  writing: SESSION.WRITING_SCORE,
};
const skills = SKILL_LABELS.map(s => ({
  key: s.key,
  label: s.label,
  icon: (() => { const Icon = SKILL_ICONS[s.icon]; return <Icon className="w-3.5 h-3.5" />; })(),
  idx: SKILL_SCORE_COLUMN[s.key],
}));

function copyText(t) { try { navigator.clipboard.writeText(t); } catch (_) {} }

function Stars({ score, size = 'sm' }) {
  const filled = Math.round(score);
  const cls = size === 'lg' ? 'text-[18px]' : 'text-[13px]';
  return (
    <span className={`${cls} tracking-tight`}>
      <span className="text-amber-400">{'★'.repeat(filled)}</span>
      <span className="text-gray-200">{'★'.repeat(5 - filled)}</span>
      {score > 0 && <span className="text-gray-400 text-[11px] ml-1">{score}</span>}
    </span>
  );
}

function Avatar({ name, size = 'md', colorIdx = 0 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const sz = size === 'lg' ? 'w-12 h-12 text-[16px]' : 'w-9 h-9 text-[13px]';
  return (
    <span className={`${sz} rounded-full inline-flex items-center justify-center font-bold flex-shrink-0`}
      style={{ background: STUDENT_COLORS[colorIdx % STUDENT_COLORS.length], color: STUDENT_TEXT_COLORS[colorIdx % STUDENT_TEXT_COLORS.length] }}>
      {initials}
    </span>
  );
}

export function GroupPortal({ group, members = [], sessions = [], schedules = [], sheetId, onBack, onRefresh, videoCallEnabled = true }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMember, setSelectedMember] = useState('all');
  const [showHelp, setShowHelp] = useState(false);
  const [teacherWaiting, setTeacherWaiting] = useState(false);
  const [activeCall, setActiveCall] = useState(null);

  // Stable participant ID per browser tab — several people can open the same
  // group code at once (parents on different phones, several students), each
  // gets their own sub-room and tile in the teacher's group call.
  const participantId = (() => {
    try {
      let pid = sessionStorage.getItem('zw_pid');
      if (!pid) { pid = Math.random().toString(36).slice(2, 14); sessionStorage.setItem('zw_pid', pid); }
      return pid;
    } catch { return Math.random().toString(36).slice(2, 14); }
  })();
  const [copied, setCopied] = useState(false);
  const [zoomSwitched, setZoomSwitched]   = useState(false);
  const [zoomSwitchUrl, setZoomSwitchUrl] = useState(null);
  const [zoomStartUrl, setZoomStartUrl]   = useState(null);
  const [lastPollTime, setLastPollTime]   = useState(null);
  const [pollSecsAgo, setPollSecsAgo]     = useState(0);
  const [pollFailCount, setPollFailCount] = useState(0);
  const [clockTime, setClockTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingForm, setBookingForm] = useState({ date: '', timeStart: '', timeEnd: '', subject: '', note: '' });
  const [pendingBookings, setPendingBookings] = useState([]);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingTargetId, setBookingTargetId] = useState('');
  const [copiedLoginCode, setCopiedLoginCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pushStatus, setPushStatus] = useState('idle'); // idle | subscribing | subscribed | denied | unsupported
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const stripRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);

  const groupId = group[GROUP.ID];
  const groupName = group[GROUP.NAME] || 'Group';
  const groupCode = group[GROUP.CODE] || '';
  const subject = group[GROUP.DEFAULT_SUBJECT] || '';
  const zoomLink = group[GROUP.ZOOM_LINK] || '';
  const scheduleDay = group[GROUP.SCHEDULE_DAY] || '';
  const scheduleTime = group[GROUP.SCHEDULE_TIME] || '';
  const memberIds = groupStudentIds(group);

  // B1: Smart poll — 2s during class hours, 10s outside
  const pollInterval = useMemo(() => {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
    const isNearClass = schedules.some(s => {
      if (s[SCHEDULE.DELETED] === 'TRUE') return false;
      const start = toMins(s[SCHEDULE.TIME_START]);
      const end = toMins(s[SCHEDULE.TIME_END]);
      return nowMins >= start - 30 && nowMins <= end + 30;
    });
    return isNearClass ? 2000 : 10000;
  }, [schedules]);

  // Poll for teacher presence: the plain groupId room carries Zoom-mode
  // broadcasts (zoom-start/zoom-switch), while a built-in-call offer only
  // ever lands in this participant's own sub-room (${groupId}__${participantId}),
  // never the bare groupId room — the old single-room poll never saw offers.
  useEffect(() => {
    if (!SIGNALING_URL || !groupId || activeCall) return;
    const subRoomId = `${groupId}__${participantId}`;
    let cancelled = false;
    const poll = async () => {
      try {
        const [groupRes, subRes] = await Promise.all([
          fetch(`${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(groupId)}&lastTimestamp=0`),
          videoCallEnabled
            ? fetch(`${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(subRoomId)}&lastTimestamp=0`)
            : Promise.resolve(null),
        ]);
        const groupMsgs = (await groupRes.json()).messages || [];
        const subMsgs = subRes ? (await subRes.json()).messages || [] : [];
        const freshOffer = videoCallEnabled && subMsgs.some(m => m.signal?.type === 'offer' && Date.now() - m.timestamp < 60000);
        const freshSwitch = groupMsgs.find(m => m.signal?.type === 'zoom-switch' && Date.now() - m.timestamp < 60000);
        // B2: detect zoom-start signal
        const freshStart = groupMsgs.find(m => m.signal?.type === 'zoom-start' && Date.now() - m.timestamp < 120000);
        if (!cancelled) {
          if (freshOffer || freshStart) setTeacherWaiting(true);
          else setTeacherWaiting(false);
          if (freshSwitch) { setZoomSwitched(true); setZoomSwitchUrl(freshSwitch.signal?.url || null); }
          if (freshStart) setZoomStartUrl(freshStart.signal?.url || null);
          setPollFailCount(0);
          setLastPollTime(Date.now());
        }
      } catch (_) {
        if (!cancelled) setPollFailCount(c => c + 1);
      }
    };
    poll();
    const id = setInterval(poll, pollInterval);
    return () => { cancelled = true; clearInterval(id); };
  }, [groupId, participantId, pollInterval, videoCallEnabled, activeCall]);

  // Explicit "Join Classroom" action — announces this participant in the
  // group's lobby room so the teacher's GroupCallModal creates a peer for
  // them, then opens the same VideoCallModal individual students use.
  const handleJoinClassroom = () => {
    const subRoomId = `${groupId}__${participantId}`;
    const memberName = selectedMember !== 'all'
      ? (members.find(m => m[STUDENT.ID] === selectedMember)?.[STUDENT.NAME])
      : null;
    if (SIGNALING_URL) {
      fetch(`${SIGNALING_URL}/room/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: `${groupId}__lobby`,
          sender: participantId,
          signal: { type: 'join-announce', participantId, name: memberName || groupName },
        }),
      }).catch(() => {});
    }
    try { localStorage.setItem(`zw_room_${subRoomId}`, 'waiting'); } catch (_) {}
    setActiveCall({ scheduleId: subRoomId, studentName: 'Teacher' });
  };

  // B3: Update "X sec ago" every second
  useEffect(() => {
    if (!lastPollTime) return;
    const id = setInterval(() => setPollSecsAgo(Math.round((Date.now() - lastPollTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastPollTime]);

  const filteredSessions = useMemo(() => {
    const src = sessions.filter(s => s[SESSION.DELETED] !== 'TRUE');
    if (selectedMember === 'all') return src.sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || ''));
    return src.filter(s => s[SESSION.STUDENT_ID] === selectedMember).sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || ''));
  }, [sessions, selectedMember]);

  const filteredSchedules = useMemo(() => {
    const src = schedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE');
    if (selectedMember === 'all') return src;
    return src.filter(s => s[SCHEDULE.STUDENT_ID] === selectedMember);
  }, [schedules, selectedMember]);

  const totalSessions = filteredSessions.length;
  const totalHours = filteredSessions.reduce((sum, s) => sum + safeFloat(s[SESSION.HOURS]), 0);
  const fmtLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const thisMonth = fmtLocalDate(new Date()).slice(0, 7);
  const monthHours = filteredSessions.filter(s => (s[SESSION.DATE] || '').startsWith(thisMonth)).reduce((sum, s) => sum + safeFloat(s[SESSION.HOURS]), 0);
  const packageHours = useMemo(() => members.reduce((sum, m) => sum + safeFloat(m[STUDENT.PACKAGE_HOURS]), 0), [members]);

  // Calculate skill averages across filtered sessions
  const averages = useMemo(() => {
    const result = {};
    skills.forEach(sk => {
      const scored = filteredSessions.map(s => parseFloat(s[sk.idx])).filter(n => Number.isFinite(n) && n > 0);
      result[sk.key] = scored.length > 0 ? +(scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : 0;
    });
    return result;
  }, [filteredSessions]);

  const radarData = skills.map(sk => ({ skill: sk.label, score: averages[sk.key] * 20, full: 100 }));

  const monthlyData = useMemo(() => {
    const map = {};
    filteredSessions.forEach(s => { const key = (s[SESSION.DATE] || '').slice(0, 7); if (!key) return; map[key] = (map[key] || 0) + safeFloat(s[SESSION.HOURS]); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([k, v]) => ({ label: new Date(k + '-01T12:00:00').toLocaleDateString('en-US', { month: 'short' }), hours: v }));
  }, [filteredSessions]);

  // Week calendar strip
  const todayStr = fmtLocalDate(new Date());
  const stripDays = useMemo(() => {
    const base = new Date();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() - 15 + i);
      const dateStr = fmtLocalDate(d);
      return {
        dateStr,
        label: dayLabels[d.getDay()],
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
        classes: filteredSchedules.filter(s => scheduleOccursOnDate(s, dateStr)),
      };
    });
  }, [filteredSchedules, todayStr]);

  const selectedDayClasses = useMemo(
    () => filteredSchedules.filter(s => scheduleOccursOnDate(s, selectedDay)),
    [filteredSchedules, selectedDay]
  );

  // Auto-centre the schedule strip on today whenever strip data changes (same as StudentPortal)
  useEffect(() => {
    const center = () => {
      if (!stripRef.current) return;
      const todayEl = stripRef.current.querySelector('[data-today]');
      if (!todayEl) return;
      const c = stripRef.current;
      c.scrollLeft = todayEl.offsetLeft - c.offsetWidth / 2 + todayEl.offsetWidth / 2;
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(center));
    return () => cancelAnimationFrame(id);
  }, [stripDays]);

  const memberLoginCodes = useMemo(
    () => members.map((m) => ({
      id: m[STUDENT.ID],
      name: m[STUDENT.NAME],
      code: buildStudentLoginCode(m[STUDENT.NICKNAME], m[STUDENT.NAME]),
    })),
    [members]
  );

  useEffect(() => {
    if (selectedMember === 'all') {
      setBookingTargetId(members[0]?.[STUDENT.ID] || '');
    } else {
      setBookingTargetId(selectedMember || '');
    }
  }, [selectedMember, members]);

  const fetchBookingRequests = async () => {
    if (!SIGNALING_URL || members.length === 0) return;
    const targetIds = selectedMember === 'all'
      ? members.map(m => m[STUDENT.ID]).filter(Boolean)
      : [selectedMember].filter(Boolean);
    if (targetIds.length === 0) {
      setPendingBookings([]);
      return;
    }
    try {
      const bookingLists = await Promise.all(targetIds.map(async (id) => {
        const res = await fetch(`${SIGNALING_URL}/booking/student/${encodeURIComponent(id)}`);
        if (!res.ok) return [];
        const data = await res.json();
        const studentName = members.find(m => m[STUDENT.ID] === id)?.[STUDENT.NAME] || '';
        return (data.bookings || []).map(b => ({ ...b, studentId: id, studentName }));
      }));
      setPendingBookings(bookingLists.flat().sort((a, b) => (b.requestedDate || '').localeCompare(a.requestedDate || '')));
    } catch (_) {
      setPendingBookings([]);
    }
  };

  useEffect(() => {
    fetchBookingRequests();
  }, [selectedMember, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitBooking = async () => {
    if (!SIGNALING_URL || !bookingForm.date || !bookingTargetId) return;
    const targetMember = members.find(m => m[STUDENT.ID] === bookingTargetId);
    if (!targetMember) return;
    setSubmittingBooking(true);
    setBookingError('');
    try {
      const res = await fetch(`${SIGNALING_URL}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: bookingTargetId,
          studentName: targetMember[STUDENT.NICKNAME] || targetMember[STUDENT.NAME],
          requestedDate: bookingForm.date,
          timeStart: bookingForm.timeStart,
          timeEnd: bookingForm.timeEnd,
          subject: bookingForm.subject,
          note: bookingForm.note,
        }),
      });
      if (res.ok) {
        setBookingSuccess(true);
        setShowBookingForm(false);
        setBookingForm(f => ({ ...f, timeStart: '', timeEnd: '', subject: '', note: '' }));
        fetchBookingRequests();
        setTimeout(() => setBookingSuccess(false), 4000);
      } else {
        setBookingError('Could not send your booking — please try again · ส่งคำขอจองไม่สำเร็จ ลองใหม่นะคะ');
      }
    } catch (_) {
      setBookingError('Could not send your booking — please check your internet and try again · ส่งไม่สำเร็จ ลองใหม่นะคะ');
    }
    setSubmittingBooking(false);
  };

  const handleCopyCode = () => {
    copyText(groupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLoginCode = (code) => {
    copyText(code);
    setCopiedLoginCode(code);
    setTimeout(() => setCopiedLoginCode(''), 2000);
  };

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      fetchBookingRequests();
    } catch (_) {}
    setRefreshing(false);
  };

  const subscribeToGroupPush = async () => {
    if (!SIGNALING_URL || !VAPID_PUBLIC_KEY || members.length === 0) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      const memberIds = members.map(m => m[STUDENT.ID]).filter(Boolean);
      await Promise.all(memberIds.map((studentId) =>
        fetch(`${SIGNALING_URL}/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, subscription: sub.toJSON() }),
        })
      ));
      setPushStatus('subscribed');
    } catch (e) {
      setPushStatus(Notification.permission === 'denied' ? 'denied' : 'idle');
      console.warn('[PUSH][GROUP] subscribe failed:', e.message);
    }
  };

  const unsubscribeFromGroupPush = async () => {
    if (!SIGNALING_URL || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setPushStatus('idle'); return; }
      const endpoint = sub.toJSON().endpoint;
      const memberIds = members.map(m => m[STUDENT.ID]).filter(Boolean);
      await Promise.all(memberIds.map(studentId =>
        fetch(`${SIGNALING_URL}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, endpoint }),
        }).catch(() => {})
      ));
      setPushStatus('idle');
    } catch (e) {
      console.warn('[PUSH][GROUP] unsubscribe failed:', e.message);
    }
  };

  const requestPushPermission = async () => {
    if (!members.length) return;
    setPushStatus('subscribing');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeToGroupPush();
    } else {
      setPushStatus('denied');
    }
  };

  // Only check current permission state on mount — do NOT auto-subscribe.
  // The parent (guardian/parent) must explicitly enable notifications per group.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setPushStatus('denied');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'history', label: 'Class History', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'connect', label: 'Connect', icon: <Link2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); *, body { font-family: 'Inter', sans-serif !important; }`}</style>
      <PortalHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <StudentCalendarModal open={showCalendarModal} onClose={() => setShowCalendarModal(false)} schedules={filteredSchedules} onSelectDay={(dateStr) => { setSelectedDay(dateStr); setActiveTab('overview'); }} />

      {showBookingForm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowBookingForm(false)}>
          <div className="w-full max-w-sm bg-white rounded-[20px] shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-gray-900">Book a Class</h2>
              <button onClick={() => setShowBookingForm(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Student</label>
                <select
                  value={bookingTargetId}
                  onChange={e => setBookingTargetId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[10px] border border-gray-200 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                >
                  {members.map((m, i) => (
                    <option key={i} value={m[STUDENT.ID]}>{m[STUDENT.NAME]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Preferred Date</label>
                <input type="date" value={bookingForm.date} onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))} min={todayStr} className="w-full px-3 py-2.5 rounded-[10px] border border-gray-200 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Time</label>
                  <input type="time" value={bookingForm.timeStart} onChange={e => setBookingForm(f => ({ ...f, timeStart: e.target.value }))} className="w-full px-3 py-2.5 rounded-[10px] border border-gray-200 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End Time</label>
                  <input type="time" value={bookingForm.timeEnd} onChange={e => setBookingForm(f => ({ ...f, timeEnd: e.target.value }))} className="w-full px-3 py-2.5 rounded-[10px] border border-gray-200 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Subject (optional)</label>
                <input type="text" value={bookingForm.subject} onChange={e => setBookingForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Pronunciation, Grammar" className="w-full px-3 py-2.5 rounded-[10px] border border-gray-200 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Note</label>
                <textarea value={bookingForm.note} onChange={e => setBookingForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="Anything specific you'd like to study…" className="w-full px-3 py-2.5 rounded-[10px] border border-gray-200 text-[14px] text-gray-900 resize-none placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
              </div>
            </div>
            <button onClick={handleSubmitBooking} disabled={submittingBooking || !bookingForm.date || !bookingTargetId} className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-[14px] rounded-[12px] transition-all active:scale-[0.98]">
              {submittingBooking ? 'Sending…' : 'Send Booking Request'}
            </button>
            {bookingError && <p className="text-[12px] text-red-600 text-center mt-2">{bookingError}</p>}
            {!SIGNALING_URL && <p className="text-[11px] text-amber-600 text-center mt-2">Signaling URL is required for this feature</p>}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_B64} alt="SHIFTHIGHBURY" className="h-10 w-auto max-w-[120px] object-contain shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider leading-none">Group Portal</p>
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-extrabold text-gray-900 leading-tight">{groupName}</p>
                {groupCode && (
                  <span className="font-mono text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-[6px]">
                    {groupCode}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-mono font-medium text-gray-700 tabular-nums">{clockTime}</span>
            <button onClick={handleRefresh} disabled={refreshing || !onRefresh} title="Refresh" className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-[8px] transition-colors disabled:opacity-40">
              <RefreshCw className="w-3.5 h-3.5" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
            {typeof Notification !== 'undefined' && pushStatus !== 'unsupported' && (
              <button
                onClick={pushStatus === 'subscribed' ? unsubscribeFromGroupPush : requestPushPermission}
                disabled={pushStatus === 'subscribing' || pushStatus === 'denied'}
                title={
                  pushStatus === 'denied' ? 'Notifications blocked — enable in browser Settings' :
                  pushStatus === 'subscribed' ? 'Notifications on — tap to turn off' :
                  'Enable notifications for this group'
                }
                className={`p-1.5 rounded-[8px] transition-colors ${
                  pushStatus === 'denied' ? 'text-gray-300 cursor-not-allowed' :
                  pushStatus === 'subscribed' ? 'text-amber-500 bg-amber-50 hover:text-amber-600 hover:bg-amber-100' :
                  'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                }`}
              >
                {pushStatus === 'denied' ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={() => setShowHelp(true)} title="Help" className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-[8px] transition-colors">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button onClick={onBack} className="text-[12px] text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-[8px] hover:bg-red-50">
              Sign Out
            </button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-1 pb-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-12 space-y-4">

        {/* Teacher waiting banner */}
        {teacherWaiting && (() => {
          const activeZoomUrl = zoomStartUrl || zoomSwitchUrl || zoomLink;
          const openZoom = (url) => {
            if (!url) return;
            const m = url.match(/zoom\.us\/j\/(\d+)(?:\?pwd=([^&]+))?/);
            if (m && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
              window.location.href = `zoommtg://zoom.us/join?confno=${m[1]}${m[2] ? `&pwd=${m[2]}` : ''}`;
              setTimeout(() => window.open(url, '_blank', 'noopener'), 1500);
            } else {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          };
          return (
            <div className="rounded-[16px] overflow-hidden shadow-lg shadow-emerald-900/20">
              <div className="bg-emerald-500 p-4 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                  </span>
                  <p className="text-[14px] font-bold">Teacher is ready — join classroom now</p>
                </div>
                {pollFailCount >= 3 ? (
                  <span className="flex-shrink-0 text-[12px] font-medium text-white/80 px-3 py-1.5 bg-white/20 rounded-[8px]">Reconnecting…</span>
                ) : videoCallEnabled ? (
                  <button onClick={handleJoinClassroom}
                    className="flex-shrink-0 bg-white text-emerald-700 font-extrabold text-[13px] px-4 py-2 rounded-[10px] hover:bg-emerald-50 active:scale-95 transition-all shadow-sm whitespace-nowrap flex items-center gap-1.5">
                    Join Classroom →
                  </button>
                ) : activeZoomUrl ? (
                  <button onClick={() => openZoom(activeZoomUrl)}
                    className="flex-shrink-0 bg-white text-emerald-700 font-extrabold text-[13px] px-4 py-2 rounded-[10px] hover:bg-emerald-50 active:scale-95 transition-all shadow-sm whitespace-nowrap flex items-center gap-1.5">
                    Join Classroom →
                  </button>
                ) : (
                  <span className="flex-shrink-0 bg-white/20 text-white text-[12px] px-3 py-1.5 rounded-[10px] whitespace-nowrap">
                    Waiting for link
                  </span>
                )}
              </div>
              {/* B3: last updated indicator */}
              {lastPollTime && (
                <div className="bg-emerald-600 px-4 py-1">
                  <p className="text-[11px] text-emerald-200">{pollFailCount >= 3 ? 'Reconnecting…' : `Updated ${pollSecsAgo}s ago`}</p>
                </div>
              )}
            </div>
          );
        })()}
        {/* Zoom switch banner */}
        {zoomSwitched && zoomSwitchUrl && (() => {
          const openZoom = (url) => {
            const m = url.match(/zoom\.us\/j\/(\d+)(?:\?pwd=([^&]+))?/);
            if (m && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
              window.location.href = `zoommtg://zoom.us/join?confno=${m[1]}${m[2] ? `&pwd=${m[2]}` : ''}`;
              setTimeout(() => window.open(url, '_blank', 'noopener'), 1500);
            } else {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          };
          return (
            <div className="rounded-[16px] overflow-hidden shadow-lg shadow-amber-900/20">
              <div className="bg-amber-500 p-4 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                  </span>
                  <p className="text-[14px] font-bold">Teacher moved to a new room · tap to join</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {pollFailCount >= 3 ? (
                    <span className="text-[12px] font-medium text-white/80 px-3 py-1.5 bg-white/20 rounded-[8px]">Reconnecting…</span>
                  ) : (
                    <button onClick={() => openZoom(zoomSwitchUrl)}
                      className="bg-white text-amber-700 font-extrabold text-[13px] px-4 py-2 rounded-[10px] hover:bg-amber-50 active:scale-95 transition-all shadow-sm whitespace-nowrap flex items-center gap-1.5">
                      Join New Room <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => setZoomSwitched(false)} className="text-white/70 hover:text-white text-[11px] px-2 py-1">✕</button>
                </div>
              </div>
              {/* B3: last updated indicator */}
              {lastPollTime && (
                <div className="bg-amber-600 px-4 py-1">
                  <p className="text-[11px] text-amber-200">{pollFailCount >= 3 ? 'Reconnecting…' : `Updated ${pollSecsAgo}s ago`}</p>
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'overview' && (
          <>
            {bookingSuccess && (
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-[12px] px-4 py-3">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <p className="text-[13px] font-semibold text-emerald-800">Booking request sent — waiting for teacher confirmation</p>
              </div>
            )}

            {pendingBookings.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-[14px] p-4">
                <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Pending Booking Requests</p>
                <div className="space-y-1.5">
                  {pendingBookings.map((b, i) => (
                    <div key={i} className="bg-white rounded-[10px] px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-800">{new Date(b.requestedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                        <p className="text-[11px] text-gray-400">
                          {[b.timeStart, b.timeEnd].filter(Boolean).join(' – ')}
                          {b.subject ? ` · ${b.subject}` : ''}
                          {selectedMember === 'all' && b.studentName ? ` · ${b.studentName}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full whitespace-nowrap">Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Member selector */}
            <div className="bg-white rounded-[16px] border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[13px] font-bold text-gray-900">View</p>
                <span className="text-[11px] text-gray-500">{selectedMember === 'all' ? 'All members' : members.find(m => m[STUDENT.ID] === selectedMember)?.[STUDENT.NAME] || 'Member'}</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button onClick={() => setSelectedMember('all')}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] font-semibold transition-all ${selectedMember === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  <Users className="w-3.5 h-3.5" /> Everyone
                </button>
                {members.map((m, i) => (
                  <button key={i} onClick={() => setSelectedMember(m[STUDENT.ID])}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] font-semibold transition-all ${selectedMember === m[STUDENT.ID] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {m[STUDENT.NAME]}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-[16px] border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-bold text-gray-900">Schedule</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setSelectedDay(todayStr);
                      requestAnimationFrame(() => {
                        if (!stripRef.current) return;
                        const todayEl = stripRef.current.querySelector('[data-today]');
                        if (!todayEl) return;
                        const c = stripRef.current;
                        c.scrollLeft = todayEl.offsetLeft - c.offsetWidth / 2 + todayEl.offsetWidth / 2;
                      });
                    }}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-[8px] flex items-center gap-1 transition-colors border ${selectedDay === todayStr ? 'text-emerald-700 bg-emerald-100 border-emerald-300' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'}`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      setBookingForm(f => ({ ...f, date: todayStr }));
                      if (!bookingTargetId) setBookingTargetId(members[0]?.[STUDENT.ID] || '');
                      setShowBookingForm(true);
                    }}
                    className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-[8px] flex items-center gap-1 transition-colors"
                  >
                    <CalendarPlus className="w-3 h-3" /> Book
                  </button>
                  <button
                    onClick={() => setShowCalendarModal(true)}
                    title="Full calendar"
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-[8px] transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                ref={stripRef}
                className="relative flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {stripDays.map((day) => (
                  <button
                    key={day.dateStr}
                    data-today={day.isToday ? 'true' : undefined}
                    onClick={() => setSelectedDay(day.dateStr)}
                    className={`flex-shrink-0 w-[54px] rounded-[12px] border p-2 text-center transition-all ${
                      selectedDay === day.dateStr
                        ? day.isToday
                          ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200'
                          : 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                        : day.isToday
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'
                    }`}
                  >
                    <p className={`text-[9px] font-bold uppercase tracking-wider ${day.isToday ? 'text-emerald-600' : selectedDay === day.dateStr ? 'text-blue-600' : 'text-gray-400'}`}>{day.label}</p>
                    <p className={`text-[18px] font-extrabold leading-tight ${day.isToday ? 'text-emerald-600' : selectedDay === day.dateStr ? 'text-blue-600' : 'text-gray-700'}`}>{day.dayNum}</p>
                    {day.classes.length > 0 ? (
                      <div className="flex justify-center mt-0.5 gap-0.5">
                        {day.classes.slice(0, 3).map((_, ci) => (
                          <span key={ci} className={`w-1.5 h-1.5 rounded-full ${day.isToday ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-200 mt-0.5">—</p>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {selectedDay === todayStr
                    ? 'Today'
                    : new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
                </p>
                {selectedDayClasses.length === 0 ? (
                  <p className="text-[12px] text-gray-400 py-1">No classes</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayClasses.map((c, i) => {
                      const toM = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
                      const now = new Date();
                      const nowMins = now.getHours() * 60 + now.getMinutes();
                      const startM = toM(c[SCHEDULE.TIME_START]);
                      const endM = toM(c[SCHEDULE.TIME_END]);
                      const isThisToday = selectedDay === todayStr;
                      const inWindow = isThisToday && nowMins >= startM - 30 && nowMins <= endM + 30;
                      const hasEnded = isThisToday && nowMins > endM;
                      const minsToStart = startM - nowMins;
                      const minsAfterEnd = nowMins - endM;

                      let rightEl = null;
                      if (inWindow && videoCallEnabled) {
                        rightEl = (
                          <button
                            onClick={handleJoinClassroom}
                            className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[12px] px-3.5 py-2 rounded-[10px] active:scale-95 transition-all shadow-sm whitespace-nowrap"
                          >
                            Join Classroom →
                          </button>
                        );
                      } else if (inWindow && zoomLink) {
                        rightEl = (
                          <a
                            href={zoomLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[12px] px-3.5 py-2 rounded-[10px] active:scale-95 transition-all shadow-sm whitespace-nowrap"
                          >
                            Join Classroom →
                          </a>
                        );
                      } else if (isThisToday && !hasEnded) {
                        rightEl = <span className="flex-shrink-0 text-[12px] text-gray-400">Starts in {Math.max(minsToStart, 0)} min</span>;
                      } else if (isThisToday && minsAfterEnd <= 30) {
                        rightEl = <span className="flex-shrink-0 text-[12px] text-gray-400">Ended {minsAfterEnd} min ago</span>;
                      }

                      return (
                        <div key={i} className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-bold text-gray-800">{c[SCHEDULE.SUBJECT] || subject || 'Group Class'}</p>
                            <p className="text-[11px] text-gray-400">
                              {c[SCHEDULE.TIME_START] && c[SCHEDULE.TIME_END]
                                ? `${c[SCHEDULE.TIME_START]} – ${c[SCHEDULE.TIME_END]}`
                                : c[SCHEDULE.TIME_START] || scheduleTime || ''}
                              {c[SCHEDULE.HOURS] ? ` · ${c[SCHEDULE.HOURS]} hr` : ''}
                            </p>
                          </div>
                          {rightEl}
                        </div>
                      );
                    })}
                  </div>
                )}
                {(scheduleDay || scheduleTime) && (
                  <p className="text-[11px] text-gray-400 mt-2">Default schedule: {[scheduleDay, scheduleTime].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Sessions', value: totalSessions, unit: '', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                { label: 'Total Hours', value: totalHours, unit: 'hr', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                { label: 'This Month', value: monthHours, unit: 'hr', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              ].map((stat, i) => (
                <div key={i} className={`${stat.bg} border ${stat.border} rounded-[14px] p-3.5 text-center`}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
                  <p className={`text-[22px] font-extrabold leading-none ${stat.color}`}>
                    {stat.value}<span className="text-[12px] font-medium text-gray-400 ml-1">{stat.unit}</span>
                  </p>
                </div>
              ))}
            </div>

            {(packageHours > 0 || sessions.some(s => s[SESSION.INVOICED] === 'PREPAID')) && (
              <div className={`rounded-[14px] p-4 border ${packageHours <= 2 ? 'bg-red-50 border-red-200' : packageHours <= 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-bold text-gray-700">Package Balance</p>
                  <span className={`text-[18px] font-extrabold ${packageHours <= 2 ? 'text-red-600' : packageHours <= 5 ? 'text-amber-600' : 'text-gray-900'}`}>{packageHours} hr</span>
                </div>
                {/* แถบสีเป็นแค่ระดับความเร่งด่วน (0/ต่ำ/กลาง/สูง) ไม่ใช่เปอร์เซ็นต์ของแพ็กเกจทั้งหมด — ระบบไม่เก็บจำนวนชั่วโมงที่ซื้อครั้งแรกไว้ */}
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${packageHours <= 0 ? 'bg-red-500' : packageHours <= 2 ? 'bg-red-500' : packageHours <= 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${packageHours <= 0 ? 4 : packageHours <= 2 ? 20 : packageHours <= 5 ? 55 : 100}%` }} />
                </div>
                {packageHours <= 0 && <p className="text-[11px] text-red-600 font-semibold mt-1.5">Package fully used — ask your teacher to top up before your next class</p>}
                {packageHours > 0 && packageHours <= 2 && <p className="text-[11px] text-red-600 font-semibold mt-1.5">Package balance is running low</p>}
              </div>
            )}

            <div className="bg-white rounded-[16px] border border-gray-200 p-4 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-4">Overall Skills</p>
              {skills.some(sk => averages[sk.key] > 0) ? (
                <>
                  <div className="flex justify-center mb-4">
                    <RadarChart width={280} height={200} data={radarData} margin={{ top: 16, right: 60, bottom: 16, left: 60 }}>
                      <PolarGrid gridType="polygon" stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="skill" tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} />
                      <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </div>
                  <div className="space-y-2.5">
                    {skills.map(sk => (
                      <div key={sk.key} className="flex items-center gap-3">
                        <span className="text-[13px] w-20 text-gray-600 font-medium flex items-center gap-1">{sk.icon} {sk.label}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(averages[sk.key] / 5) * 100}%` }} /></div>
                        <Stars score={averages[sk.key]} />
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-center text-[13px] text-gray-400 py-4">No score data yet</p>}
            </div>

            {monthlyData.length > 1 && (
              <div className="bg-white rounded-[16px] border border-gray-200 p-4 shadow-sm">
                <p className="text-[13px] font-bold text-gray-900 mb-3">Monthly Hours</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${v} hr`, '']} cursor={{ fill: '#f0f9ff' }} />
                    <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent sessions preview */}
            {filteredSessions.length > 0 && (
              <div className="bg-white rounded-[16px] border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-bold text-gray-900">Recent Sessions</p>
                  <button onClick={() => setActiveTab('history')} className="text-[12px] text-blue-600 hover:underline">View all →</button>
                </div>
                <div className="space-y-2">
                  {filteredSessions.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900">{s[SESSION.SUBJECT] || '—'}</p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(s[SESSION.DATE] + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' })} · {s[SESSION.HOURS]} hr
                          {selectedMember === 'all' && s[SESSION.STUDENT_ID] && (() => {
                            const m = members.find(m => m[STUDENT.ID] === s[SESSION.STUDENT_ID]);
                            return m ? ` · ${m[STUDENT.NAME]}` : '';
                          })()}
                        </p>
                      </div>
                      {skills.some(sk => parseFloat(s[sk.idx]) > 0) && <Stars score={+(skills.map(sk => parseFloat(s[sk.idx])).filter(n => n > 0).reduce((a, b, _, arr) => a + b / arr.length, 0)).toFixed(1)} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <p className="text-[14px] font-bold text-gray-700">{totalSessions} sessions · {totalHours} total hours</p>
            {filteredSessions.length === 0 ? (
              <div className="bg-white rounded-[16px] border border-gray-200 p-10 text-center">
                <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-[14px]">No class history yet</p>
              </div>
            ) : filteredSessions.map((s, i) => {
              const memberName = selectedMember === 'all' ? (members.find(m => m[STUDENT.ID] === s[SESSION.STUDENT_ID])?.[STUDENT.NAME] || '') : '';
              const hasScores = skills.some(sk => parseFloat(s[sk.idx]) > 0);
              const avgScore = hasScores ? +(skills.map(sk => parseFloat(s[sk.idx])).filter(n => n > 0).reduce((a, b, _, arr) => a + b / arr.length, 0)).toFixed(1) : 0;
              return (
                <div key={i} className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[14px] font-bold text-gray-900">{s[SESSION.SUBJECT] || 'Class Session'}</p>
                      <p className="text-[12px] text-gray-400 mt-0.5">
                        {new Date(s[SESSION.DATE] + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · {s[SESSION.HOURS]} hr
                        {memberName ? ` · ${memberName}` : ''}
                      </p>
                    </div>
                    {hasScores && <div className="text-right"><Stars score={avgScore} /><p className="text-[10px] text-gray-400 mt-0.5">Average</p></div>}
                  </div>
                  {s[SESSION.NOTE] && (
                    <div className="bg-amber-50 border border-amber-100 rounded-[8px] px-3 py-2 mb-2.5">
                      <p className="text-[12px] text-amber-800 flex items-center gap-1"><FileText className="w-3 h-3 flex-shrink-0" />{s[SESSION.NOTE]}</p>
                    </div>
                  )}
                  {hasScores && (
                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                      {skills.map(sk => {
                        const v = parseFloat(s[sk.idx]);
                        const valid = Number.isFinite(v) && v > 0;
                        return (
                          <div key={sk.key} className={`rounded-[8px] px-2 py-1.5 text-center ${valid ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                            <p className="text-[10px] text-gray-500 font-medium flex items-center justify-center gap-0.5">{sk.icon} {sk.label}</p>
                            {valid ? <p className="text-[13px] font-bold text-blue-700 mt-0.5">{v}/5</p> : <p className="text-[12px] text-gray-300 mt-0.5">—</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'connect' && (
          <div className="space-y-4">
            {/* Group code */}
            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-3">Group Code</p>
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[12px] p-4 text-center mb-3">
                <p className="font-mono text-[32px] font-extrabold text-gray-900 tracking-[0.2em]">{groupCode || '—'}</p>
                <p className="text-[11px] text-gray-400 mt-1">Use this code to sign in to the group portal</p>
              </div>
              {groupCode && (
                <button onClick={handleCopyCode}
                  className="w-full py-2.5 bg-gray-900 text-white font-semibold text-[13px] rounded-[10px] hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2">
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied' : 'Copy Code'}
                </button>
              )}
            </div>

            {/* Classroom / Zoom link */}
            {videoCallEnabled ? (
              <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
                <p className="text-[13px] font-bold text-gray-900 mb-3">Classroom</p>
                <button onClick={handleJoinClassroom}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[14px] rounded-[12px] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" /> Join Classroom
                </button>
              </div>
            ) : zoomLink && (
              <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
                <p className="text-[13px] font-bold text-gray-900 mb-3">Zoom Classroom</p>
                <a href={zoomLink} target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[14px] rounded-[12px] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" /> Join Classroom
                </a>
              </div>
            )}

            {/* Member login codes */}
            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-3">Member Login Codes</p>
              <div className="space-y-2.5">
                {memberLoginCodes.map((m, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-[10px] px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] text-gray-500">{m.name || 'Member'}</p>
                      <p className="font-mono text-[15px] font-extrabold text-gray-900 tracking-widest">{m.code || '—'}</p>
                    </div>
                    {m.code && (
                      <button onClick={() => handleCopyLoginCode(m.code)} className="flex-shrink-0 px-3 py-1.5 bg-gray-900 text-white text-[12px] font-semibold rounded-[8px] hover:bg-gray-800 transition-colors">
                        {copiedLoginCode === m.code ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Connect LINE */}
            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-1">Connect LINE</p>
              <p className="text-[12px] text-gray-500 mb-3">Each member can receive invoices, lesson summaries, and class links via the LINE Official Account</p>
              <div className="space-y-2 text-[13px] text-gray-700">
                {[
                  { num: '1', text: "Add the institution's LINE Official Account as a friend", color: 'bg-blue-600' },
                  { num: '2', text: 'Send each member login code from the list above to the LINE Official Account', color: 'bg-blue-600' },
                  { num: '✓', text: 'The connection will be confirmed automatically', color: 'bg-emerald-500' },
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 bg-gray-50 rounded-[10px] p-3">
                    <span className={`w-5 h-5 rounded-full ${step.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5`}>{step.num}</span>
                    <p>{step.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Group info */}
            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-3">Group Info</p>
              <div className="space-y-2 text-[13px]">
                {[
                  { label: 'Name', value: groupName },
                  subject && { label: 'Subject', value: subject },
                  scheduleDay && { label: 'Schedule Days', value: scheduleDay },
                  scheduleTime && { label: 'Time', value: scheduleTime },
                  { label: 'Members', value: members.length },
                ].filter(Boolean).map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-semibold text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {activeCall && (
        <Suspense fallback={null}>
          <VideoCallModal
            scheduleId={activeCall.scheduleId}
            role="student"
            studentName="Teacher"
            onClose={() => { if (activeCall.scheduleId) { try { localStorage.removeItem(`zw_room_${activeCall.scheduleId}`); } catch (_) {} } setActiveCall(null); }}
            onPeerJoined={() => { if (activeCall.scheduleId) { try { localStorage.setItem(`zw_room_${activeCall.scheduleId}`, 'joined'); } catch (_) {} } }}
            toast={null}
          />
        </Suspense>
      )}
    </div>
  );
}
