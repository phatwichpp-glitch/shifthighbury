// @ts-nocheck
import { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { STUDENT, SESSION, SCHEDULE, GROUP, STUDENT_LINE_USER_ID, PUBLISHED_SHEET_ID, LOGO_B64, groupStudentIds } from '../lib/constants';
import { APP_TIMEZONE, APP_LOCALE, SKILL_LABELS } from '../lib/appConfig';
import { safeFloat, buildStudentLoginCode, scheduleOccursOnDate, copyText, formatMins } from '../lib/business';
import { getPublicStudents, getPublicSessions, getPublicSchedules, getPublicGroups } from '../services/googleSheets';
import { GroupPortal } from './GroupPortal';
const VideoCallModal = lazy(() => import('../components/VideoCallModal'));
import { Brain, Calculator, BookOpen, Users, BarChart2, Link2, Inbox, FileText, RefreshCw, Clock, Bell, BellOff, HelpCircle, Maximize2, CalendarPlus, X, Check } from 'lucide-react';
import { PortalHelpModal } from '../components/modals/PortalHelpModal';
import { StudentCalendarModal } from '../components/modals/StudentCalendarModal';

const SESSION_KEY = 'zw_portal_student';
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

export function StudentPortal() {
  const [loginInput, setLoginInput] = useState('');
  const [classCodeInput, setClassCodeInput] = useState('');
  const [showHelp, setShowHelp]     = useState(false);
  const [student, setStudent]       = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState('overview');
  const [activeCall, setActiveCall] = useState(null);
  const [schedules, setSchedules]           = useState([]);
  const [teacherWaiting, setTeacherWaiting] = useState(false);
  const [waitingRoomId, setWaitingRoomId]   = useState(null);
  const [zoomSwitched, setZoomSwitched]     = useState(false);
  const [zoomSwitchUrl, setZoomSwitchUrl]   = useState(null);
  const [zoomStartUrl, setZoomStartUrl]     = useState(null);
  const [lastPollTime, setLastPollTime]     = useState(null);
  const [pollSecsAgo, setPollSecsAgo]       = useState(0);
  const [pollFailCount, setPollFailCount]   = useState(0);
  // sheetIdReady = false until /config/sheet responds (or SIGNALING_URL is absent).
  // Prevents signing in against the stale PUBLISHED_SHEET_ID fallback.
  const [sheetId, setSheetId] = useState(PUBLISHED_SHEET_ID);
  const [sheetIdReady, setSheetIdReady] = useState(!import.meta.env.VITE_WEBRTC_SIGNALING_URL);
  const [videoCallEnabled, setVideoCallEnabled] = useState(true);
  const [inWaitingLobby, setInWaitingLobby] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupData, setGroupData] = useState(null);
  const [pushStatus, setPushStatus] = useState('idle'); // idle | subscribing | subscribed | denied | unsupported
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingForm, setBookingForm] = useState({ date: '', timeStart: '', timeEnd: '', subject: '', note: '' });
  const [pendingBookings, setPendingBookings] = useState([]);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const stripRef = useRef(null);
  const lastLoginKeyRef = useRef('');
  const [clockTime, setClockTime] = useState(() => new Date().toLocaleTimeString(APP_LOCALE, { timeZone: APP_TIMEZONE, hour12: false }));
  const [bangkokNowMins, setBangkokNowMins] = useState(() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIMEZONE }));
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date().toLocaleTimeString(APP_LOCALE, { timeZone: APP_TIMEZONE, hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const tick = () => {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIMEZONE }));
      setBangkokNowMins(d.getHours() * 60 + d.getMinutes());
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!SIGNALING_URL) return;
    const classParam = new URLSearchParams(window.location.search).get('class');
    const endpoint = classParam
      ? `${SIGNALING_URL}/class-code/${encodeURIComponent(classParam.toUpperCase())}`
      : `${SIGNALING_URL}/config/sheet`;
    const attempt = (n) =>
      fetch(endpoint)
        .then(r => r.json())
        .then(data => {
          if (data.sheetId) setSheetId(data.sheetId);
          if (data.videoCallEnabled === false) setVideoCallEnabled(false);
          setSheetIdReady(true);
        })
        .catch(err => {
          if (n < 3) return new Promise(res => setTimeout(res, 1500 * n)).then(() => attempt(n + 1));
          console.warn('[PORTAL CONFIG] config fetch failed after 3 attempts:', err.message);
          setSheetIdReady(true); // fall back to PUBLISHED_SHEET_ID
        });
    attempt(1);
  }, []);

  // Auto-resume session — waits for sheetId to be resolved first
  useEffect(() => {
    if (!sheetId || !sheetIdReady) return;
    if (new URLSearchParams(window.location.search).get('code')) return;
    // localStorage so the login survives PWA restarts; fall back to the old
    // sessionStorage slot once so already-logged-in students don't get kicked.
    const savedId = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!savedId) return;
    (async () => {
      try {
        if (savedId.startsWith('GROUP:')) {
          // Group auto-resume
          const groupCode = savedId.slice(6);
          const [allStudents, allGroups] = await Promise.all([getPublicStudents(sheetId), getPublicGroups(sheetId).catch(() => [])]);
          const matchGroup = allGroups.find(g => g[GROUP.DELETED] !== 'TRUE' && (g[GROUP.CODE] || '').toUpperCase() === groupCode.toUpperCase());
          if (!matchGroup) { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); return; }
          const memberIds = groupStudentIds(matchGroup);
          const members = allStudents.filter(s => memberIds.includes(s[STUDENT.ID]) && s[STUDENT.DELETED] !== 'TRUE');
          const allGroupSessions = await getPublicSessions(sheetId).catch(() => []);
          const groupSessions = allGroupSessions.filter(s => s[SESSION.DELETED] !== 'TRUE' && (memberIds.includes(s[SESSION.STUDENT_ID]) || s[SESSION.GROUP_ID] === matchGroup[GROUP.ID]));
          const allGroupSchedules = await getPublicSchedules(sheetId).catch(() => []);
          const groupSchedules = allGroupSchedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE' && (memberIds.includes(s[SCHEDULE.STUDENT_ID]) || s[SCHEDULE.GROUP_ID] === matchGroup[GROUP.ID]));
          setGroupData({ group: matchGroup, members, sessions: groupSessions, schedules: groupSchedules });
          setGroupMode(true);
          return;
        }
        // Individual student auto-resume
        const allStudents = await getPublicStudents(sheetId);
        const found = allStudents.find(s => s[STUDENT.ID] === savedId && s[STUDENT.DELETED] !== 'TRUE');
        if (!found) { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); return; }
        const allSessions = await getPublicSessions(sheetId).catch(e => { console.error('[PORTAL LOAD] sessions:', e.name, e.message); return []; });
        const mySessions = allSessions.filter(s => s[SESSION.STUDENT_ID] === found[STUDENT.ID] && s[SESSION.DELETED] !== 'TRUE').sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || ''));
        const allSchedules = await getPublicSchedules(sheetId).catch(e => { console.error('[PORTAL LOAD] schedules:', e.name, e.message); return []; });
        const mySchedules = allSchedules.filter(s => s[SCHEDULE.STUDENT_ID] === found[STUDENT.ID] && s[SCHEDULE.DELETED] !== 'TRUE');
        setStudent(found);
        setSessions(mySessions);
        setSchedules(mySchedules);
      } catch (err) {
        console.error('[PORTAL LOAD] auto-resume:', err.name, err.message);
      }
    })();
  }, [sheetId]);

  // B1: 2s poll during class hours (±30min of any scheduled class), 10s otherwise
  const pollInterval = useMemo(() => {
    if (!student) return 10000;
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
  }, [student, schedules]);

  useEffect(() => {
    if (!student || activeCall || !SIGNALING_URL) return;
    // Poll individual room + group sub-rooms (${groupId}__${studentId})
    const groupIds = [...new Set(schedules.filter(s => s[SCHEDULE.GROUP_ID]).map(s => s[SCHEDULE.GROUP_ID]))];
    const subRoomIds = groupIds.map(gid => `${gid}__${student[STUDENT.ID]}`);
    const roomIds = [student[STUDENT.ID], ...subRoomIds];
    let cancelled = false;
    const poll = async () => {
      try {
        for (const roomId of roomIds) {
          const res = await fetch(`${SIGNALING_URL}/room/poll?roomId=${encodeURIComponent(roomId)}&lastTimestamp=0`);
          const body = await res.json();
          const msgs = body.messages || [];
          const freshOffer = videoCallEnabled && msgs.some(m => m.signal?.type === 'offer' && Date.now() - m.timestamp < 60000);
          const freshSwitch = msgs.find(m => m.signal?.type === 'zoom-switch' && Date.now() - m.timestamp < 60000);
          const freshStart = msgs.find(m => m.signal?.type === 'zoom-start' && Date.now() - m.timestamp < 120000);
          if (!cancelled) {
            if (freshSwitch) { setZoomSwitched(true); setZoomSwitchUrl(freshSwitch.signal?.url || null); }
            if (freshStart) { setTeacherWaiting(true); setZoomStartUrl(freshStart.signal?.url || null); setInWaitingLobby(false); }
          }
          if (freshOffer || freshStart) {
            if (!cancelled) {
              setTeacherWaiting(true);
              if (!freshStart && videoCallEnabled) setWaitingRoomId(roomId);
            }
            if (!cancelled) { setPollFailCount(0); setLastPollTime(Date.now()); }
            return;
          }
        }
        if (!cancelled) {
          setTeacherWaiting(false);
          setWaitingRoomId(null);
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
  }, [student, activeCall, schedules, pollInterval, videoCallEnabled]);

  const sendStudentWaiting = useCallback(() => {
    if (!SIGNALING_URL || !student) return;
    fetch(`${SIGNALING_URL}/room/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: student[STUDENT.ID],
        sender: student[STUDENT.ID],
        target: 'teacher',
        signal: { type: 'student-waiting', name: student[STUDENT.NICKNAME] || student[STUDENT.NAME] || '' },
      }),
    }).catch(() => {});
  }, [student]);

  useEffect(() => {
    if (!inWaitingLobby || !student) return;
    sendStudentWaiting();
    const id = setInterval(sendStudentWaiting, 60000);
    return () => clearInterval(id);
  }, [inWaitingLobby, student, sendStudentWaiting]);

  // B3: Update "X sec ago" every second
  useEffect(() => {
    if (!lastPollTime) return;
    const id = setInterval(() => setPollSecsAgo(Math.round((Date.now() - lastPollTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastPollTime]);

  // Auto-login from URL ?code= param (links shared via shared join links)
  useEffect(() => {
    if (!sheetId || !sheetIdReady) return;
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) return;
    doLogin(code.trim());
  }, [sheetId, sheetIdReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const doLogin = async (key, overrideSheetId) => {
    const activeSheetId = overrideSheetId || sheetId;
    if (!key || !activeSheetId) return;
    lastLoginKeyRef.current = key;
    setLoading(true);
    setError('');
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError('Connection timed out — please check your internet and try again · เชื่อมต่อนานเกินไป ลองใหม่อีกครั้งนะครับ');
    }, 10000);
    try {
      const allStudents = await getPublicStudents(activeSheetId);
      if (timedOut) return;
      const normalizedKey = key.toUpperCase();
      const found = allStudents.find(s =>
        s[STUDENT.DELETED] !== 'TRUE' && (
          s[STUDENT.ID] === key ||
          (s[STUDENT_LINE_USER_ID] && s[STUDENT_LINE_USER_ID].trim() === key) ||
          buildStudentLoginCode(s[STUDENT.NICKNAME], s[STUDENT.NAME]) === normalizedKey
        )
      );
      if (!found) {
        // Check if it's a group code (e.g. G47)
        const allGroups = await getPublicGroups(activeSheetId).catch(() => []);
        if (timedOut) return;
        const matchGroup = allGroups.find(g => g[GROUP.DELETED] !== 'TRUE' && (g[GROUP.CODE] || '').toUpperCase() === normalizedKey);
        if (matchGroup) {
          const memberIds = groupStudentIds(matchGroup);
          const members = allStudents.filter(s => memberIds.includes(s[STUDENT.ID]) && s[STUDENT.DELETED] !== 'TRUE');
          const allGroupSessions = await getPublicSessions(activeSheetId).catch(() => []);
          const groupSessions = allGroupSessions.filter(s => s[SESSION.DELETED] !== 'TRUE' && (memberIds.includes(s[SESSION.STUDENT_ID]) || s[SESSION.GROUP_ID] === matchGroup[GROUP.ID]));
          const allGroupSchedules = await getPublicSchedules(activeSheetId).catch(() => []);
          const groupSchedules = allGroupSchedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE' && (memberIds.includes(s[SCHEDULE.STUDENT_ID]) || s[SCHEDULE.GROUP_ID] === matchGroup[GROUP.ID]));
          if (timedOut) return;
          localStorage.setItem(SESSION_KEY, 'GROUP:' + normalizedKey);
          setGroupData({ group: matchGroup, members, sessions: groupSessions, schedules: groupSchedules });
          setGroupMode(true);
          return;
        }
        if (!timedOut) setError('Code not found — please check the spelling or ask your teacher · ไม่พบรหัสนี้ ลองตรวจสอบอีกครั้งนะครับ');
        return;
      }
      const allSessions = await getPublicSessions(activeSheetId).catch(e => {
        console.warn('[PORTAL LOAD] sessions:', e.name, e.message);
        if (!timedOut) setError('Could not load your lessons — please refresh · โหลดประวัติการเรียนไม่สำเร็จ ลองรีเฟรชนะครับ');
        return [];
      });
      const mySessions = allSessions.filter(s => s[SESSION.STUDENT_ID] === found[STUDENT.ID] && s[SESSION.DELETED] !== 'TRUE').sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || ''));
      const allSchedules = await getPublicSchedules(activeSheetId).catch(e => {
        console.warn('[PORTAL LOAD] schedules:', e.name, e.message);
        if (!timedOut) setError('Could not load your schedule — please refresh · โหลดตารางเรียนไม่สำเร็จ ลองรีเฟรชนะครับ');
        return [];
      });
      const mySchedules = allSchedules.filter(s => s[SCHEDULE.STUDENT_ID] === found[STUDENT.ID] && s[SCHEDULE.DELETED] !== 'TRUE');
      if (timedOut) return;
      localStorage.setItem(SESSION_KEY, found[STUDENT.ID]);
      setStudent(found);
      setSessions(mySessions);
      setSchedules(mySchedules);
      fetchMyBookings(found[STUDENT.ID]);
      // Auto-subscribe to push (silent — only prompts if permission not yet decided)
      if (Notification.permission === 'granted') subscribeToPush(found[STUDENT.ID]);
    } catch (err) {
      if (!timedOut) {
        console.warn('[PORTAL LOGIN]', err.name, err.message);
        setError('Login failed — please check your internet or contact your teacher · เข้าสู่ระบบไม่สำเร็จ ลองใหม่หรือติดต่อครูนะครับ');
      }
    } finally {
      clearTimeout(timer);
      if (!timedOut) setLoading(false);
    }
  };

  const subscribeToPush = async (studentId) => {
    if (!SIGNALING_URL || !VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported'); return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      await fetch(`${SIGNALING_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, subscription: sub.toJSON() }),
      });
      setPushStatus('subscribed');
    } catch (e) {
      setPushStatus(Notification.permission === 'denied' ? 'denied' : 'idle');
      console.warn('[PUSH] subscribe failed:', e.message);
    }
  };

  const unsubscribeFromPush = async () => {
    if (!SIGNALING_URL || !student || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setPushStatus('idle'); return; }
      const endpoint = sub.toJSON().endpoint;
      await fetch(`${SIGNALING_URL}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student[STUDENT.ID], endpoint }),
      }).catch(() => {});
      setPushStatus('idle');
    } catch (e) {
      console.warn('[PUSH] unsubscribe failed:', e.message);
    }
  };

  const requestPushPermission = async () => {
    if (!student) return;
    setPushStatus('subscribing');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeToPush(student[STUDENT.ID]);
    } else {
      setPushStatus('denied');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const key = loginInput.trim();
    if (!key) return;
    const code = classCodeInput.trim().toUpperCase();
    if (code) {
      const sigUrl = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
      if (!sigUrl) { setError('System not set up yet — please contact your teacher · ระบบยังตั้งค่าไม่เสร็จ ติดต่อครูนะครับ'); return; }
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${sigUrl}/class-code/${encodeURIComponent(code)}`);
        if (!res.ok) { setError(`Class Code "${code}" not found — please check and try again · ไม่พบ Class Code นี้ ลองตรวจสอบอีกครั้งนะครับ`); setLoading(false); return; }
        const { sheetId: resolvedId } = await res.json();
        setSheetId(resolvedId);
        await doLogin(key, resolvedId);
      } catch (err) {
        console.warn('[PORTAL CLASS-CODE]', err.message);
        setError('Could not verify the Class Code — please try again · ตรวจสอบ Class Code ไม่สำเร็จ ลองใหม่นะครับ');
        setLoading(false);
      }
      return;
    }
    if (!sheetId) { setError('System not set up yet — please contact your teacher · ระบบยังตั้งค่าไม่เสร็จ ติดต่อครูนะครับ'); return; }
    await doLogin(key);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setStudent(null); setSessions([]); setSchedules([]); setTeacherWaiting(false); setInWaitingLobby(false); setLoginInput(''); setClassCodeInput(''); setError('');
    setGroupMode(false); setGroupData(null);
    setPendingBookings([]); setBookingSuccess(false); setShowBookingForm(false);
  };


  const handleJoinClass = async (c) => {
    if (videoCallEnabled) {
      // If video call is enabled, use our classroom system
      const groupId = c[SCHEDULE.GROUP_ID];
      let roomId;
      if (groupId) {
        const pid = student[STUDENT.ID];
        roomId = `${groupId}__${pid}`;
        if (SIGNALING_URL) {
          fetch(`${SIGNALING_URL}/room/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: `${groupId}__lobby`, sender: pid, signal: { type: 'join-announce', participantId: pid, name: student[STUDENT.NAME] || '' } }),
          }).catch(() => {});
        }
      } else {
        roomId = student[STUDENT.ID];
      }
      sendStudentWaiting();
      try { localStorage.setItem(`zw_room_${roomId}`, 'waiting'); } catch (_) {}
      setActiveCall({ scheduleId: roomId, studentName: 'Teacher' });
      return;
    }
    
    const zUrl = zoomStartUrl || zoomSwitchUrl;
    if (zUrl) {
      setInWaitingLobby(false);
      const m = zUrl.match(/zoom\.us\/j\/(\d+)(?:\?pwd=([^&]+))?/);
      if (m && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        window.location.href = `zoommtg://zoom.us/join?confno=${m[1]}${m[2] ? `&pwd=${m[2]}` : ''}`;
        setTimeout(() => window.open(zUrl, '_blank', 'noopener'), 1500);
      } else {
        window.open(zUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    
    const groupId = c[SCHEDULE.GROUP_ID];
    let roomId;
    if (groupId) {
      const pid = student[STUDENT.ID];
      roomId = `${groupId}__${pid}`;
      if (SIGNALING_URL) {
        fetch(`${SIGNALING_URL}/room/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: `${groupId}__lobby`, sender: pid, signal: { type: 'join-announce', participantId: pid, name: student[STUDENT.NAME] || '' } }),
        }).catch(() => {});
      }
    } else {
      roomId = student[STUDENT.ID];
    }
    sendStudentWaiting();
    setInWaitingLobby(true); // Wait for Zoom if video call is disabled
  };

  const fetchMyBookings = async (studentId) => {
    if (!SIGNALING_URL || !studentId) return;
    try {
      const res = await fetch(`${SIGNALING_URL}/booking/student/${encodeURIComponent(studentId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingBookings(data.bookings || []);
    } catch (_) {}
  };

  const handleSubmitBooking = async () => {
    if (!SIGNALING_URL || !student || !bookingForm.date) return;
    setSubmittingBooking(true);
    setBookingError('');
    try {
      const res = await fetch(`${SIGNALING_URL}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student[STUDENT.ID],
          studentName: student[STUDENT.NICKNAME] || student[STUDENT.NAME],
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
        fetchMyBookings(student[STUDENT.ID]);
        setTimeout(() => setBookingSuccess(false), 4000);
      } else {
        setBookingError('Could not send your booking — please try again · ส่งคำขอจองไม่สำเร็จ ลองใหม่นะครับ');
      }
    } catch (_) {
      setBookingError('Could not send your booking — please check your internet and try again · ส่งไม่สำเร็จ ลองใหม่นะครับ');
    }
    setSubmittingBooking(false);
  };

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!student || !sheetId || refreshing) return;
    setRefreshing(true);
    try {
      const allSessions = await getPublicSessions(sheetId).catch(e => { console.error('[PORTAL LOAD] refresh sessions:', e.name, e.message); return []; });
      const mySessions = allSessions.filter(s => s[SESSION.STUDENT_ID] === student[STUDENT.ID] && s[SESSION.DELETED] !== 'TRUE').sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || ''));
      const allSchedules = await getPublicSchedules(sheetId).catch(e => { console.error('[PORTAL LOAD] refresh schedules:', e.name, e.message); return []; });
      const mySchedules = allSchedules.filter(s => s[SCHEDULE.STUDENT_ID] === student[STUDENT.ID] && s[SCHEDULE.DELETED] !== 'TRUE');
      setSessions(mySessions);
      setSchedules(mySchedules);
    } catch (_) {}
    setRefreshing(false);
  };

  // Re-fetch when the tab becomes visible again so schedule data never goes stale
  useEffect(() => {
    if (!student || !sheetId) return;
    const onVisible = () => { if (document.visibilityState === 'visible') handleRefresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [student, sheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalHours = useMemo(() => sessions.reduce((sum, s) => sum + safeFloat(s[SESSION.HOURS]), 0), [sessions]);

  const averages = useMemo(() => {
    const result = {};
    skills.forEach(sk => {
      const scored = sessions.map(s => parseFloat(s[sk.idx])).filter(n => Number.isFinite(n) && n > 0);
      result[sk.key] = scored.length > 0 ? +(scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : 0;
    });
    return result;
  }, [sessions]);

  const radarData = skills.map(sk => ({ skill: sk.label, score: averages[sk.key] * 20, full: 100 }));

  const monthlyData = useMemo(() => {
    const map = {};
    sessions.forEach(s => { const key = (s[SESSION.DATE] || '').slice(0, 7); if (!key) return; map[key] = (map[key] || 0) + safeFloat(s[SESSION.HOURS]); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([k, v]) => ({ label: new Date(k + '-01T12:00:00').toLocaleDateString('en-US', { month: 'short' }), hours: v }));
  }, [sessions]);

  const packageHours  = safeFloat(student?.[STUDENT.PACKAGE_HOURS]);
  const loginCode     = student ? buildStudentLoginCode(student[STUDENT.NICKNAME], student[STUDENT.NAME]) : '';
  // Use local date (not toISOString which is UTC) so Thailand UTC+7 doesn't shift to yesterday
  const fmtLocalDate  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr      = fmtLocalDate(new Date());
  const todaySessions = sessions.filter(s => s[SESSION.DATE] === todayStr);

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
        classes: schedules.filter(s => scheduleOccursOnDate(s, dateStr)),
      };
    });
  }, [schedules, todayStr]);

  const todayClasses = useMemo(() => stripDays.find(d => d.isToday)?.classes ?? [], [stripDays]);

  // Auto-scroll strip so today is centered when logged in or when schedule data loads
  // (declared AFTER stripDays to avoid TDZ in production bundles)
  useEffect(() => {
    if (!stripRef.current || !student) return;
    const center = () => {
      if (!stripRef.current) return;
      const todayEl = stripRef.current.querySelector('[data-today]');
      if (!todayEl) return;
      const container = stripRef.current;
      container.scrollLeft = todayEl.offsetLeft - container.offsetWidth / 2 + todayEl.offsetWidth / 2;
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(center));
    return () => cancelAnimationFrame(id);
  }, [student, stripDays]);

  const selectedDayClasses = useMemo(() => {
    if (!selectedDay) return [];
    const found = stripDays.find(d => d.dateStr === selectedDay);
    return found ? found.classes : schedules.filter(s => scheduleOccursOnDate(s, selectedDay));
  }, [stripDays, schedules, selectedDay]);

  const refreshGroupPortalData = async () => {
    if (!groupData || !sheetId) return;
    const currentGroupId = groupData.group?.[GROUP.ID];
    const [allStudents, allGroups, allSessions, allSchedules] = await Promise.all([
      getPublicStudents(sheetId),
      getPublicGroups(sheetId).catch(() => []),
      getPublicSessions(sheetId).catch(() => []),
      getPublicSchedules(sheetId).catch(() => []),
    ]);
    const latestGroup = allGroups.find(g => g[GROUP.ID] === currentGroupId && g[GROUP.DELETED] !== 'TRUE') || groupData.group;
    const memberIds = groupStudentIds(latestGroup);
    const members = allStudents.filter(s => memberIds.includes(s[STUDENT.ID]) && s[STUDENT.DELETED] !== 'TRUE');
    const groupSessions = allSessions.filter(s => s[SESSION.DELETED] !== 'TRUE' && (memberIds.includes(s[SESSION.STUDENT_ID]) || s[SESSION.GROUP_ID] === latestGroup[GROUP.ID]));
    const groupSchedules = allSchedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE' && (memberIds.includes(s[SCHEDULE.STUDENT_ID]) || s[SCHEDULE.GROUP_ID] === latestGroup[GROUP.ID]));
    setGroupData({ group: latestGroup, members, sessions: groupSessions, schedules: groupSchedules });
  };

  if (groupMode && groupData) {
    return <GroupPortal group={groupData.group} members={groupData.members} sessions={groupData.sessions} schedules={groupData.schedules} sheetId={sheetId} onBack={handleLogout} onRefresh={refreshGroupPortalData} videoCallEnabled={videoCallEnabled} />;
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-blue-900 to-slate-800 flex flex-col items-center justify-center p-4">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); *, body { font-family: 'Inter', sans-serif !important; }`}</style>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src={LOGO_B64} alt="SHIFTHIGHBURY" className="h-16 w-auto object-contain mx-auto mb-4 brightness-0 invert drop-shadow-lg" />
            <h1 className="text-[24px] font-extrabold text-white tracking-tight">Student Portal</h1>
            <p className="text-slate-300 text-[13px] mt-1">View your progress, scores, and class schedule</p>
          </div>
          <div className="bg-white/15 backdrop-blur-xl border border-white/25 rounded-[20px] p-6 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-300 uppercase tracking-wider mb-2">Classroom Code <span className="normal-case text-slate-500 text-[11px] font-normal">(if provided)</span></label>
                <input type="text" value={classCodeInput} onChange={e => { const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4); setClassCodeInput(val); }} placeholder="e.g. ZWEN" className="w-full px-4 py-3 rounded-[12px] bg-white/15 border border-white/20 text-white placeholder-slate-400 font-mono text-[16px] text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white/20 transition-all uppercase" maxLength={4} />
                <p className="text-[11px] text-slate-500 mt-1.5 text-center">Your online classroom code — your teacher will give this to you</p>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-300 uppercase tracking-wider mb-2">Login Code</label>
                <input type="text" value={loginInput} onChange={e => { const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); setLoginInput(val); }} placeholder="e.g. PA47" autoFocus className="w-full px-4 py-3 rounded-[12px] bg-white/15 border border-white/20 text-white placeholder-slate-400 font-mono text-[16px] text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/20 transition-all uppercase" />
                <p className="text-[11px] text-slate-500 mt-1.5 text-center">Use the code provided by your teacher</p>
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-400/30 rounded-[10px] px-3 py-2.5 space-y-2" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                  <p className="text-[12px] text-red-300 font-mono break-all whitespace-pre-wrap leading-relaxed">{error}</p>
                  <button
                    type="button"
                    onClick={() => { setError(''); doLogin(lastLoginKeyRef.current || loginInput.trim()); }}
                    className="w-full py-2 bg-white/20 hover:bg-white/30 text-white font-semibold text-[13px] rounded-[8px] transition-colors"
                  >Try again</button>
                </div>
              )}
              <button type="submit" disabled={loading || !loginInput.trim() || !sheetIdReady} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-[15px] rounded-[12px] transition-all active:scale-[0.98]">
                {!sheetIdReady ? 'Connecting...' : loading ? 'Searching...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview',      icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'history',  label: 'Class History', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'connect',  label: 'Connect',        icon: <Link2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); *, body { font-family: 'Inter', sans-serif !important; }`}</style>
      <PortalHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <StudentCalendarModal open={showCalendarModal} onClose={() => setShowCalendarModal(false)} schedules={schedules} onSelectDay={(dateStr) => { setSelectedDay(dateStr); setActiveTab('overview'); }} />

      {/* Booking form modal */}
      {showBookingForm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowBookingForm(false)}>
          <div className="w-full max-w-sm bg-white rounded-[20px] shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-gray-900">Book a Class</h2>
              <button onClick={() => setShowBookingForm(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
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
            <button onClick={handleSubmitBooking} disabled={submittingBooking || !bookingForm.date} className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-[14px] rounded-[12px] transition-all active:scale-[0.98]">
              {submittingBooking ? 'Sending…' : 'Send Booking Request'}
            </button>
            {bookingError && <p className="text-[12px] text-red-600 text-center mt-2">{bookingError}</p>}
            {!SIGNALING_URL && <p className="text-[11px] text-amber-600 text-center mt-2">Signaling URL is required for this feature</p>}
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_B64} alt="SHIFTHIGHBURY" className="h-10 w-auto max-w-[120px] object-contain shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider leading-none">Student Portal</p>
              <h1 className="text-[15px] font-extrabold text-gray-900 leading-tight">{student[STUDENT.NAME]}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-mono font-medium text-gray-700 tabular-nums">{clockTime}</span>
            <button onClick={handleRefresh} disabled={refreshing} title="Refresh" className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-[8px] transition-colors disabled:opacity-40">
              <RefreshCw className="w-3.5 h-3.5" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
            {typeof Notification !== 'undefined' && pushStatus !== 'unsupported' && (
              <button
                onClick={pushStatus === 'subscribed' ? unsubscribeFromPush : requestPushPermission}
                disabled={pushStatus === 'subscribing' || pushStatus === 'denied'}
                title={
                  pushStatus === 'denied' ? 'Notifications blocked — enable in browser Settings' :
                  pushStatus === 'subscribed' ? 'Notifications on — tap to turn off' :
                  'Enable notifications'
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
            <button onClick={handleLogout} className="text-[12px] text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-[8px] hover:bg-red-50">Sign Out</button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-1 pb-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-12 space-y-4">
        {inWaitingLobby && !teacherWaiting && !activeCall && (
          <div className="rounded-[16px] overflow-hidden shadow-md border border-blue-200">
            <div className="bg-blue-500 p-4 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
                <p className="text-[14px] font-bold">Waiting in the classroom · teacher notified</p>
              </div>
              <button
                onClick={() => setInWaitingLobby(false)}
                className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        )}
        {teacherWaiting && !activeCall && (
          <div className="rounded-[16px] overflow-hidden shadow-lg shadow-emerald-900/20">
            <div className="bg-emerald-500 p-4 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
                <p className="text-[14px] font-bold">Teacher is ready · tap to join</p>
              </div>
              {/* B4: hide Join if 3+ consecutive poll failures */}
              {pollFailCount >= 3 ? (
                <span className="flex-shrink-0 text-[12px] font-medium text-white/80 px-3 py-1.5 bg-white/20 rounded-[8px]">Reconnecting…</span>
              ) : (zoomStartUrl || zoomSwitchUrl || videoCallEnabled) ? (
                <button
                  onClick={() => {
                    const zUrl = zoomStartUrl || zoomSwitchUrl;
                    if (zUrl) {
                      setInWaitingLobby(false);
                      const m = zUrl.match(/zoom\.us\/j\/(\d+)(?:\?pwd=([^&]+))?/);
                      if (m && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
                        window.location.href = `zoommtg://zoom.us/join?confno=${m[1]}${m[2] ? `&pwd=${m[2]}` : ''}`;
                        setTimeout(() => window.open(zUrl, '_blank', 'noopener'), 1500);
                      } else {
                        window.open(zUrl, '_blank', 'noopener,noreferrer');
                      }
                    } else if (videoCallEnabled) {
                      const roomId = waitingRoomId || student[STUDENT.ID];
                      try { localStorage.setItem(`zw_room_${roomId}`, 'waiting'); } catch (_) {}
                      setActiveCall({ scheduleId: roomId, studentName: 'Teacher' });
                    }
                  }}
                  className="flex-shrink-0 bg-white text-emerald-700 font-extrabold text-[13px] px-4 py-2 rounded-[10px] hover:bg-emerald-50 active:scale-95 transition-all shadow-sm whitespace-nowrap"
                >
                  Join Classroom →
                </button>
              ) : (
                <span className="flex-shrink-0 text-[12px] font-medium text-white/80 px-3 py-1.5 bg-white/20 rounded-[8px]">Waiting for link</span>
              )}
            </div>
            {/* B3: last updated indicator */}
            {lastPollTime && (
              <div className="bg-emerald-600 px-4 py-1">
                <p className="text-[11px] text-emerald-200">{pollFailCount >= 3 ? 'Reconnecting…' : `Updated ${pollSecsAgo}s ago`}</p>
              </div>
            )}
          </div>
        )}
        {zoomSwitched && zoomSwitchUrl && (
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
                  <button
                    onClick={() => {
                      const m = zoomSwitchUrl.match(/zoom\.us\/j\/(\d+)(?:\?pwd=([^&]+))?/);
                      if (m && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
                        window.location.href = `zoommtg://zoom.us/join?confno=${m[1]}${m[2] ? `&pwd=${m[2]}` : ''}`;
                        setTimeout(() => window.open(zoomSwitchUrl, '_blank', 'noopener'), 1500);
                      } else {
                        window.open(zoomSwitchUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="bg-white text-amber-700 font-extrabold text-[13px] px-4 py-2 rounded-[10px] hover:bg-amber-50 active:scale-95 transition-all shadow-sm whitespace-nowrap"
                  >
                    Join New Room →
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
        )}

        {activeTab === 'overview' && (
          <>
            {/* Booking success banner */}
            {bookingSuccess && (
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-[12px] px-4 py-3">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <p className="text-[13px] font-semibold text-emerald-800">Booking request sent — waiting for teacher confirmation</p>
              </div>
            )}

            {/* Pending bookings */}
            {pendingBookings.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-[14px] p-4">
                <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Pending Booking Requests</p>
                <div className="space-y-1.5">
                  {pendingBookings.map((b, i) => (
                    <div key={i} className="bg-white rounded-[10px] px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-800">{new Date(b.requestedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                        <p className="text-[11px] text-gray-400">{[b.timeStart, b.timeEnd].filter(Boolean).join(' – ')}{b.subject ? ` · ${b.subject}` : ''}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full whitespace-nowrap">Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                    onClick={() => { setBookingForm(f => ({ ...f, date: todayStr })); setShowBookingForm(true); }}
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

              {/* Scrollable 30-day strip — today auto-centered on login */}
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

              {/* Selected day detail */}
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
                      const startM = toM(c[SCHEDULE.TIME_START]);
                      const endM = toM(c[SCHEDULE.TIME_END]);
                      const isThisToday = selectedDay === todayStr;
                      const inWindow = isThisToday && bangkokNowMins >= startM - 30 && bangkokNowMins <= endM + 30;
                      const hasEnded = isThisToday && bangkokNowMins > endM;
                      const minsToStart = startM - bangkokNowMins;
                      const minsAfterEnd = bangkokNowMins - endM;
                      let rightEl = null;
                      if (inWindow) {
                        rightEl = (
                          <button onClick={() => handleJoinClass(c)} className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[12px] px-3.5 py-2 rounded-[10px] active:scale-95 transition-all shadow-sm whitespace-nowrap">
                            Join Classroom →
                          </button>
                        );
                      } else if (isThisToday && !hasEnded) {
                        rightEl = <span className="flex-shrink-0 text-[12px] text-gray-400">Starts in {formatMins(minsToStart)}</span>;
                      } else if (isThisToday && minsAfterEnd <= 30) {
                        rightEl = <span className="flex-shrink-0 text-[12px] text-gray-400">Ended {formatMins(minsAfterEnd)} ago</span>;
                      }
                      return (
                        <div key={i} className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-bold text-gray-800">{c[SCHEDULE.SUBJECT] || 'Class'}</p>
                            <p className="text-[11px] text-gray-400">
                              {c[SCHEDULE.TIME_START] && c[SCHEDULE.TIME_END]
                                ? `${c[SCHEDULE.TIME_START]} – ${c[SCHEDULE.TIME_END]}`
                                : c[SCHEDULE.TIME_START] || ''}
                              {c[SCHEDULE.HOURS] ? ` · ${c[SCHEDULE.HOURS]} hr` : ''}
                            </p>
                          </div>
                          {rightEl}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Sessions', value: sessions.length, unit: '', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                { label: 'Total Hours', value: totalHours, unit: 'hr', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                { label: 'This Month', value: (() => { const m = fmtLocalDate(new Date()).slice(0,7); return sessions.filter(s => (s[SESSION.DATE]||'').startsWith(m)).reduce((sum,s)=>sum+safeFloat(s[SESSION.HOURS]),0); })(), unit: 'hr', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              ].map((stat, i) => (
                <div key={i} className={`${stat.bg} border ${stat.border} rounded-[14px] p-3.5 text-center`}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
                  <p className={`text-[22px] font-extrabold leading-none ${stat.color}`}>{stat.value}<span className="text-[12px] font-medium text-gray-400 ml-1">{stat.unit}</span></p>
                </div>
              ))}
            </div>

            {(packageHours > 0 || sessions.some(s => s[SESSION.INVOICED] === 'PREPAID')) && (
              <div className={`rounded-[14px] p-4 border ${packageHours <= 0 ? 'bg-red-50 border-red-200' : packageHours <= 2 ? 'bg-red-50 border-red-200' : packageHours <= 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-bold text-gray-700">Package Balance</p>
                  <span className={`text-[18px] font-extrabold ${packageHours <= 2 ? 'text-red-600' : packageHours <= 5 ? 'text-amber-600' : 'text-gray-900'}`}>{packageHours} hr</span>
                </div>
                {/* แถบสีเป็นแค่ระดับความเร่งด่วน (0/ต่ำ/กลาง/สูง) ไม่ใช่เปอร์เซ็นต์ของแพ็กเกจทั้งหมด — ระบบไม่เก็บจำนวนชั่วโมงที่ซื้อครั้งแรกไว้ */}
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${packageHours <= 0 ? 'bg-red-500' : packageHours <= 2 ? 'bg-red-500' : packageHours <= 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${packageHours <= 0 ? 4 : packageHours <= 2 ? 20 : packageHours <= 5 ? 55 : 100}%` }} />
                </div>
                {packageHours <= 0 && <p className="text-[11px] text-red-600 font-semibold mt-1.5">Package fully used — ask your teacher to top up before your next class</p>}
                {packageHours > 0 && packageHours <= 2 && <p className="text-[11px] text-red-600 font-semibold mt-1.5">Package is running low — let your teacher know to top up</p>}
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

            {sessions.length > 0 && (
              <div className="bg-white rounded-[16px] border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-bold text-gray-900">Recent Sessions</p>
                  <button onClick={() => setActiveTab('history')} className="text-[12px] text-blue-600 hover:underline">View all →</button>
                </div>
                <div className="space-y-2">
                  {sessions.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900">{s[SESSION.SUBJECT] || '—'}</p>
                        <p className="text-[11px] text-gray-400">{new Date(s[SESSION.DATE]+'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' })} · {s[SESSION.HOURS]} hr</p>
                      </div>
                      {skills.some(sk => parseFloat(s[sk.idx]) > 0) && <Stars score={+(skills.map(sk => parseFloat(s[sk.idx])).filter(n => n > 0).reduce((a,b,_,arr) => a + b/arr.length, 0)).toFixed(1)} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-gray-700">{sessions.length} sessions · {totalHours} total hours</p>
            </div>
            {sessions.length === 0 ? (
              <div className="bg-white rounded-[16px] border border-gray-200 p-10 text-center"><Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-[14px]">No class history yet</p></div>
            ) : sessions.map((s, i) => {
              const hasScores = skills.some(sk => parseFloat(s[sk.idx]) > 0);
              const avgScore  = hasScores ? +(skills.map(sk => parseFloat(s[sk.idx])).filter(n => n > 0).reduce((a,b,_,arr) => a + b/arr.length, 0)).toFixed(1) : 0;
              return (
                <div key={i} className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[14px] font-bold text-gray-900">{s[SESSION.SUBJECT] || 'Class Session'}</p>
                      <p className="text-[12px] text-gray-400 mt-0.5">{new Date(s[SESSION.DATE]+'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · {s[SESSION.HOURS]} hr</p>
                    </div>
                    {hasScores && <div className="text-right"><Stars score={avgScore} /><p className="text-[10px] text-gray-400 mt-0.5">Average</p></div>}
                  </div>
                  {s[SESSION.NOTE] && <div className="bg-amber-50 border border-amber-100 rounded-[8px] px-3 py-2 mb-2.5"><p className="text-[12px] text-amber-800 flex items-center gap-1"><FileText className="w-3 h-3 flex-shrink-0" />{s[SESSION.NOTE]}</p></div>}
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
            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-3">My Login Code</p>
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[12px] p-4 text-center mb-3">
                <p className="font-mono text-[28px] font-extrabold text-gray-900 tracking-[0.2em]">{loginCode || '—'}</p>
                <p className="text-[11px] text-gray-400 mt-1">Use this code to sign in and join your online classroom</p>
              </div>
              <button onClick={() => { copyText(loginCode); }} className="w-full py-2.5 bg-gray-900 text-white font-semibold text-[13px] rounded-[10px] hover:bg-gray-800 active:scale-95 transition-all">Copy Code</button>
            </div>

            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-1">Connect LINE</p>
              <p className="text-[12px] text-gray-500 mb-3">Receive invoices, lesson summaries, and class links via the LINE Official Account</p>
              <div className="space-y-2 text-[13px] text-gray-700">
                {[
                  { num: '1', text: 'Add the institution\'s LINE Official Account as a friend', color: 'bg-blue-600' },
                  { num: '2', text: <>Send the code <span className="font-mono font-bold bg-gray-200 px-1.5 py-0.5 rounded text-gray-900">{loginCode || '—'}</span> to the LINE Official Account</>, color: 'bg-blue-600' },
                  { num: '✓', text: 'The connection will be confirmed automatically', color: 'bg-emerald-500' },
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 bg-gray-50 rounded-[10px] p-3">
                    <span className={`w-5 h-5 rounded-full ${step.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5`}>{step.num}</span>
                    <p>{step.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900 mb-3">My Information</p>
              <div className="space-y-2 text-[13px]">
                {[
                  { label: 'Name', value: student[STUDENT.NAME] },
                  { label: 'Subject', value: student[STUDENT.SUBJECT] || '—' },
                  { label: 'Package', value: packageHours > 0 ? `${packageHours} hr remaining` : 'Pay per session' },
                ].map((item, i) => (
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
