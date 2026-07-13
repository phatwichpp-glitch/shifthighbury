// @ts-nocheck
import { useState, useMemo, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { STUDENT, SESSION, SCHEDULE, CANCELLATION, SETTINGS, GROUP, STUDENT_LINE_USER_ID, STUDENT_LINE_GROUP_ID, isLineOAEnabled, canSendLine, groupStudentIds, isVideoCallEnabled } from '../lib/constants';
import { safeFloat, runWithFeedback, buildLineFootnote, buildPortalMessage, buildGroupPortalMessage, toastLineError, computeStats, getOverdueSchedules, scheduleOccursOnDate, buildStudentLoginCode, localDateStr, teacherAuthHeaders } from '../lib/business';
import { dbStore } from '../lib/tokenStore';
import { useSheetData } from '../hooks/useSheetData';
import { useConfirm } from '../hooks/useConfirm';
import { useWaitingRoomStatus } from '../hooks/useWaitingRoomStatus';
import { useZoomReminder } from '../hooks/useZoomReminder';
import { btnPrimary } from '../components/ui/styles';
import { StatsPanel } from '../components/StatsPanel';
import { ActionInbox } from '../components/ActionInbox';
import CalendarGrid from '../components/CalendarGrid';
import DaySchedulePanel from '../components/DaySchedulePanel';
const VideoCallModal = lazy(() => import('../components/VideoCallModal'));
const GroupCallModal = lazy(() => import('../components/GroupCallModal'));
import { VideoCallErrorBoundary } from '../components/ui/ErrorBoundary';
import { LogSessionModal } from '../components/modals/LogSessionModal';
import { CancelClassModal } from '../components/modals/CancelClassModal';
import { RescheduleTimeModal } from '../components/modals/RescheduleTimeModal';
import { VideoCallLauncher } from '../components/modals/VideoCallLauncher';
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import ZoomClassTimer from '../components/ZoomClassTimer';
import { getStudents, getSchedules, getSessions, getInvoices, getCancellations, getSettings, getGroups, addSchedule, updateSchedule, softDeleteSchedule, addCancellation, addSessionsBatch, updateStudentPackageHours, updateGroupPackageHours, sendLineMessage, setupNewDatabase, initDatabaseHeaders } from '../services/googleSheets';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../services/googleCalendar';

export function Calendar({ accessToken, dbId, setDbId, toast }) {
  const today = new Date();
  const todayStr = localDateStr(today);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingSubmitting, setIsLoggingSubmitting] = useState(false);
  const isLoggingInFlight = useRef(false);
  const [loggingSession, setLoggingSession] = useState(null);
  const [groupDeductedToday, setGroupDeductedToday] = useState(() => new Set());
  const [cancellingClass, setCancellingClass] = useState(null);
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState('');
  const { confirm, Dialog } = useConfirm();
  const [sendingZoomFor, setSendingZoomFor] = useState(null);
  const [rescheduleTimeTarget, setRescheduleTimeTarget] = useState(null);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const [nowMins, setNowMins] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  const [activeCall, setActiveCall] = useState(null);
  const [launcherCall, setLauncherCall] = useState(null);
  const [zoomTimer, setZoomTimer] = useState({ active: false, startedAt: null, currentLinkIdx: -1, currentLink: '' });
  const [showSessionReminder, setShowSessionReminder] = useState(false);

  const ZOOM_SESSION_KEY = 'zw_zoom_session';

  // C2: Restore Zoom session from localStorage on mount (survives refresh within 2 hours)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zw_zoom_session');
      if (!saved) return;
      const { link, startedAt, currentLinkIdx } = JSON.parse(saved);
      if (Date.now() - startedAt < 2 * 60 * 60 * 1000) {
        setZoomTimer({ active: true, startedAt, currentLinkIdx, currentLink: link });
      } else {
        localStorage.removeItem('zw_zoom_session');
      }
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { const n = new Date(); setNowMins(n.getHours() * 60 + n.getMinutes()); }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const { data, loading: statsLoading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { students: getStudents, schedules: getSchedules, sessions: getSessions, invoices: getInvoices, cancellations: getCancellations, settings: getSettings, groups: getGroups } });
  const students = data.students || [];
  const schedules = data.schedules || [];
  const groups = data.groups || [];
  const sessions = data.sessions || [];
  const invoices = data.invoices || [];
  const cancellations = data.cancellations || [];
  const settingsRow = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
  const zoomLink = settingsRow?.[SETTINGS.ZOOM_LINK] || '';
  const lineOAEnabled = isLineOAEnabled(settingsRow);
  const zoomLinksPool = (() => { try { return JSON.parse(settingsRow?.[SETTINGS.ZOOM_LINKS_POOL] || '[]'); } catch { return []; } })();
  const SIGNALING_URL = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
  const [bookingRequests, setBookingRequests] = useState([]);

  // Once the school is on built-in Classroom mode, a leftover Zoom timer
  // session (from before the switch) should never resurrect the 40-min banner.
  useEffect(() => {
    if (!settingsRow) return;
    if (isVideoCallEnabled(settingsRow)) {
      try { localStorage.removeItem('zw_zoom_session'); } catch {}
      setZoomTimer(z => z.active ? { active: false, startedAt: null, currentLinkIdx: -1, currentLink: '' } : z);
    }
  }, [settingsRow]);

  useEffect(() => {
    if (!SIGNALING_URL) return;
    const load = () =>
      fetch(`${SIGNALING_URL}/bookings/pending`, { headers: teacherAuthHeaders() })
        .then(r => r.json())
        .then(d => setBookingRequests(d.bookings || []))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [SIGNALING_URL]);

  const handleApproveBooking = async (booking) => {
    try {
      const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
      const hoursNum = (booking.timeStart && booking.timeEnd)
        ? ((toMins(booking.timeEnd) - toMins(booking.timeStart)) / 60).toFixed(1)
        : '1';
      const scheduleId = 'SCH-' + Date.now() + '-' + booking.studentId;
      await addSchedule(accessToken, dbId, [
        scheduleId, booking.studentId, booking.requestedDate, booking.subject || '', hoursNum,
        `[จองจาก Portal]${booking.note ? ' ' + booking.note : ''}`, 'none', '', booking.timeStart || '', booking.timeEnd || '',
        'FALSE', new Date().toLocaleString('th-TH'), '', '', '',
      ]);
      if (SIGNALING_URL) {
        await fetch(`${SIGNALING_URL}/booking/${booking.id}`, { method: 'DELETE', headers: teacherAuthHeaders() }).catch(() => {});
      }
      if (canSendLine(settingsRow)) {
        const stu = students.find(s => s[STUDENT.ID] === booking.studentId);
        const lineId = stu?.[STUDENT_LINE_USER_ID];
        if (lineId) {
          const dateLabel = new Date(booking.requestedDate + 'T12:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
          const timeLabel = booking.timeStart ? `${booking.timeStart}${booking.timeEnd ? `–${booking.timeEnd}` : ''}` : '';
          const msg = `✅ ยืนยันการจองวันเรียนแล้วครับ\n📅 ${dateLabel}${timeLabel ? `\n⏰ ${timeLabel}` : ''}${booking.subject ? `\n📚 ${booking.subject}` : ''}\nรอพบกันนะครับ!`;
          await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineId, msg).catch(() => {});
        }
      }
      setBookingRequests(r => r.filter(b => b.id !== booking.id));
      toast?.('อนุมัติและสร้างตารางเรียนแล้ว!', 'success');
      refresh();
    } catch (err) {
      toast?.(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    }
  };

  const handleRejectBooking = async (booking, note) => {
    try {
      if (SIGNALING_URL) {
        await fetch(`${SIGNALING_URL}/booking/${booking.id}`, { method: 'DELETE', headers: teacherAuthHeaders() }).catch(() => {});
      }
      if (canSendLine(settingsRow)) {
        const stu = students.find(s => s[STUDENT.ID] === booking.studentId);
        const lineId = stu?.[STUDENT_LINE_USER_ID];
        if (lineId) {
          const dateLabel = new Date(booking.requestedDate + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
          const msg = `❌ ขออภัยครับ ไม่สามารถยืนยันการจองวันที่ ${dateLabel} ได้${note ? `\nเหตุผล: ${note}` : ''}\nกรุณาติดต่อครูเพื่อนัดเวลาใหม่นะครับ`;
          await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineId, msg).catch(() => {});
        }
      }
      setBookingRequests(r => r.filter(b => b.id !== booking.id));
      toast?.('ปฏิเสธการจองแล้ว', 'success');
    } catch (err) {
      toast?.(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    }
  };

  const stats = useMemo(() => computeStats(students, sessions, invoices), [students, sessions, invoices]);
  const overdueSchedules = useMemo(() => getOverdueSchedules(schedules, sessions, todayStr, cancellations), [schedules, sessions, todayStr, cancellations]);

  const getStudentName = useCallback((id) => { const s = students.find(s => s[STUDENT.ID] === id); return s ? s[STUDENT.NAME] : '?'; }, [students]);

  const selectedDateSchedules = useMemo(() => {
    if (!selectedDate) return [];
    const cancelledIds = new Set(cancellations.filter(c => c[CANCELLATION.ORIGINAL_DATE] === selectedDate).map(c => c[CANCELLATION.SCHEDULE_ID]));
    const raw = schedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE' && scheduleOccursOnDate(s, selectedDate) && !cancelledIds.has(s[SCHEDULE.ID])).map((s) => ({ data: s, rowIndex: schedules.findIndex(sc => sc[SCHEDULE.ID] === s[SCHEDULE.ID]) + 2 })).sort((a, b) => (a.data[SCHEDULE.TIME_START] || '').localeCompare(b.data[SCHEDULE.TIME_START] || ''));
    const result = [];
    const groupSeen = new Map();
    for (const item of raw) {
      const gid = item.data[SCHEDULE.GROUP_ID] || '';
      if (gid) {
        const key = `${gid}__${item.data[SCHEDULE.TIME_START]}`;
        if (groupSeen.has(key)) { result[groupSeen.get(key)].groupMembers.push(item); }
        else { groupSeen.set(key, result.length); result.push({ ...item, isGroupCard: true, groupId: gid, groupMembers: [item] }); }
      } else { result.push({ ...item, isGroupCard: false, groupMembers: [] }); }
    }
    return result;
  }, [schedules, cancellations, selectedDate]);

  const todaySchedules = useMemo(() => schedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE' && scheduleOccursOnDate(s, todayStr)).map((s) => ({ data: s, rowIndex: schedules.findIndex(sc => sc[SCHEDULE.ID] === s[SCHEDULE.ID]) + 2 })), [schedules, todayStr]);
  const todayScheduleStudentIds = useMemo(() => [...new Set(todaySchedules.map(item => item.data[SCHEDULE.STUDENT_ID]).filter(Boolean))], [todaySchedules]);
  const waitingRoomStatusMap = useWaitingRoomStatus(todayScheduleStudentIds);
  const prevWaitingRef = useRef({});
  useEffect(() => {
    for (const id of todayScheduleStudentIds) {
      if (waitingRoomStatusMap[id] === 'waiting' && prevWaitingRef.current[id] !== 'waiting') {
        toast(`${getStudentName(id)} มารอในห้องเรียนแล้ว`, 'info');
      }
    }
    prevWaitingRef.current = { ...waitingRoomStatusMap };
  }, [waitingRoomStatusMap, todayScheduleStudentIds, getStudentName, toast]);
  const zoomAutoReminderEnabled = settingsRow?.[SETTINGS.ZOOM_AUTO_REMINDER] === 'TRUE';
  const notifyTeacher40minEnabled = settingsRow?.[SETTINGS.NOTIFY_TEACHER_40MIN] !== 'FALSE';
  const notifyStudentEnabled = !!settingsRow?.[SETTINGS.NOTIFY_STUDENT_30MIN] && settingsRow?.[SETTINGS.NOTIFY_STUDENT_30MIN] !== 'FALSE';
  useZoomReminder({ enabledBefore: zoomAutoReminderEnabled, enabledExtend: notifyTeacher40minEnabled, todaySchedules, getStudentName, toast, zoomLink, notifyStudentEnabled, students, settingsRow, videoCallEnabled: isVideoCallEnabled(settingsRow) });

  const selectedDateSessions = useMemo(() => selectedDate ? sessions.filter(s => s[SESSION.DATE] === selectedDate && s[SESSION.DELETED] !== 'TRUE') : [], [sessions, selectedDate]);
  const selectedDateCancellations = useMemo(() => selectedDate ? cancellations.filter(c => c[CANCELLATION.ORIGINAL_DATE] === selectedDate) : [], [cancellations, selectedDate]);
  const schedulesOnRescheduleDate = useMemo(() => { if (!rescheduleTargetDate) return []; return schedules.filter(s => s[SCHEDULE.DELETED] !== 'TRUE' && scheduleOccursOnDate(s, rescheduleTargetDate)); }, [schedules, rescheduleTargetDate]);

  const handleStartClass = (zoomLinkToOpen) => {
    const link = zoomLinkToOpen || zoomLinksPool[0]?.url || zoomLink || '';
    if (!link) { toast('ยังไม่ได้ตั้งค่าลิงก์ Zoom ครับ', 'error'); return; }
    window.open(link, '_blank', 'noopener,noreferrer');
    const startedAt = Date.now();
    setZoomTimer({ active: true, startedAt, currentLinkIdx: -1, currentLink: link });
    setShowSessionReminder(false);
    // C2: Persist to localStorage
    try { localStorage.setItem('zw_zoom_session', JSON.stringify({ link, startedAt, currentLinkIdx: -1 })); } catch {}
    // B2: Notify student portals that class has started (zoom-start signal)
    if (SIGNALING_URL) {
      const allStudentIds = [...new Set(todaySchedules.map(item => item.data[SCHEDULE.STUDENT_ID]).filter(Boolean))];
      allStudentIds.forEach(sid => {
        fetch(`${SIGNALING_URL}/room/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: sid, sender: 'teacher', target: 'broadcast', signal: { type: 'zoom-start', url: link } }),
        }).catch(() => {});
      });
    }
  };

  const handleSwitchRoom = async () => {
    const pool = zoomLinksPool;
    let nextIdx = zoomTimer.currentLinkIdx;
    let nextLink = zoomLink;
    if (pool.length > 0) {
      nextIdx = (zoomTimer.currentLinkIdx + 1) % pool.length;
      nextLink = pool[nextIdx]?.url || zoomLink;
    }
    if (!nextLink) { toast('ไม่มีลิงก์ Zoom สำรองในคลังครับ', 'error'); return; }

    // C1: Confirm before switching
    const ok = await confirm(
      `สลับห้อง Zoom ใช่ไหมครับ?\n\nห้องถัดไป: ${nextLink}\n\nนักเรียนจะเห็น banner ใน Portal ภายใน 2 วินาที`,
      false,
    );
    if (!ok) return;

    window.open(nextLink, '_blank', 'noopener,noreferrer');

    // Send zoom-switch signal to all student rooms active today
    if (SIGNALING_URL) {
      const allStudentIds = [...new Set(todaySchedules.map(item => item.data[SCHEDULE.STUDENT_ID]).filter(Boolean))];
      const groupIds = [...new Set(todaySchedules.map(item => item.data[SCHEDULE.GROUP_ID]).filter(Boolean))];
      [...allStudentIds, ...groupIds].forEach(id => {
        fetch(`${SIGNALING_URL}/room/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: id, sender: 'teacher', target: 'broadcast', signal: { type: 'zoom-switch', url: nextLink } }),
        }).catch(() => {});
      });
    }

    // C4: Send LINE with portal link (not Zoom link directly)
    if (canSendLine(settingsRow)) {
      const allStudentIds = [...new Set(todaySchedules.map(item => item.data[SCHEDULE.STUDENT_ID]).filter(Boolean))];
      for (const sid of allStudentIds) {
        const stu = students.find(st => st[STUDENT.ID] === sid);
        const lineUserId = stu?.[STUDENT_LINE_USER_ID] || '';
        if (!lineUserId) continue;
        const stuCode = buildStudentLoginCode(stu?.[STUDENT.NICKNAME], stu?.[STUDENT.NAME]);
        const portalUrl = `${window.location.origin}/portal?code=${stuCode}`;
        sendLineMessage(
          settingsRow[SETTINGS.LINE_WORKER_URL],
          settingsRow[SETTINGS.LINE_TOKEN],
          lineUserId,
          `ย้ายห้องใหม่นะครับ เข้าเรียนผ่าน Portal ได้เลย 👉 ${portalUrl}`,
        ).catch(() => {});
      }
    }

    const newTimer = { ...zoomTimer, startedAt: Date.now(), currentLinkIdx: nextIdx, currentLink: nextLink };
    setZoomTimer(newTimer);
    // C2: Update persisted session
    try { localStorage.setItem('zw_zoom_session', JSON.stringify({ link: nextLink, startedAt: newTimer.startedAt, currentLinkIdx: nextIdx })); } catch {}
    toast('สลับห้อง Zoom แล้ว — ส่ง LINE และ signal แล้วครับ', 'success');
  };

  const handleSendClassReminder = async (scheduleData, dateStr, groupId = null) => {
    if (!canSendLine(settingsRow)) { toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error'); return; }
    const lineToken = settingsRow[SETTINGS.LINE_TOKEN];
    const lineWorkerUrl = settingsRow[SETTINGS.LINE_WORKER_URL];
    setSendingZoomFor(scheduleData[SCHEDULE.ID]);
    try {
      if (groupId) {
        const grp = groups.find(g => g[GROUP.ID] === groupId);
        const grpLineId = grp?.[GROUP.LINE_GROUP_ID] || '';
        const grpName = grp?.[GROUP.NAME] || 'กลุ่ม';
        const memberIds = (grp?.[GROUP.STUDENT_IDS] || '').split(',').map(s => s.trim()).filter(Boolean);
        if (grpLineId) {
          const portalBase = `${window.location.origin}/portal`;
          const msg = buildGroupPortalMessage({ groupName: grpName, studentName: grpName, subject: scheduleData[SCHEDULE.SUBJECT] || '', timeStart: scheduleData[SCHEDULE.TIME_START] || '', timeEnd: scheduleData[SCHEDULE.TIME_END] || '', portalUrl: portalBase, stuCode: '', settingsRow });
          await sendLineMessage(lineWorkerUrl, lineToken, grpLineId, msg);
          toast(`ส่งแจ้งเตือนเข้ากลุ่ม "${grpName}" แล้วครับ`, 'success');
        } else {
          let sentCount = 0;
          for (const sid of memberIds) {
            const stu = students.find(st => st[STUDENT.ID] === sid);
            const target = stu?.[STUDENT_LINE_GROUP_ID] || stu?.[STUDENT_LINE_USER_ID] || '';
            if (!target) continue;
            const stuCode = buildStudentLoginCode(stu[STUDENT.NICKNAME], stu[STUDENT.NAME]);
            const portalUrl = `${window.location.origin}/portal?code=${stuCode}`;
            const msg = buildGroupPortalMessage({ groupName: grpName, studentName: stu[STUDENT.NAME], subject: scheduleData[SCHEDULE.SUBJECT] || '', timeStart: scheduleData[SCHEDULE.TIME_START] || '', timeEnd: scheduleData[SCHEDULE.TIME_END] || '', portalUrl, stuCode, settingsRow });
            await sendLineMessage(lineWorkerUrl, lineToken, target, msg);
            sentCount++;
          }
          toast(`ส่งแจ้งเตือนให้กลุ่ม ${grpName} (${sentCount} คน) แล้วครับ`, 'success');
        }
      } else {
        const student = students.find(st => st[STUDENT.ID] === scheduleData[SCHEDULE.STUDENT_ID]);
        const lineGroupId = student?.[STUDENT_LINE_GROUP_ID] || '';
        const lineUserId = student?.[STUDENT_LINE_USER_ID] || '';
        const sendTarget = lineGroupId || lineUserId;
        const studentName = student?.[STUDENT.NAME] || getStudentName(scheduleData[SCHEDULE.STUDENT_ID]);
        if (!sendTarget) { toast(`${studentName} ยังไม่ได้เชื่อมต่อ LINE ครับ`, 'error'); setSendingZoomFor(null); return; }
        const stuCode = buildStudentLoginCode(student?.[STUDENT.NICKNAME], student?.[STUDENT.NAME]);
        const portalUrl = `${window.location.origin}/portal?code=${stuCode}`;
        const msg = buildPortalMessage({ studentName, subject: scheduleData[SCHEDULE.SUBJECT] || '', timeStart: scheduleData[SCHEDULE.TIME_START] || '', timeEnd: scheduleData[SCHEDULE.TIME_END] || '', portalUrl, stuCode, settingsRow });
        await sendLineMessage(lineWorkerUrl, lineToken, sendTarget, msg);
        toast(lineGroupId ? `ส่งแจ้งเตือนเข้ากลุ่มของ ${studentName} แล้วครับ` : `ส่งแจ้งเตือนให้ ${studentName} แล้วครับ`, 'success');
      }
    } catch (err) {
      toastLineError(toast, err, '/settings');
    } finally {
      setSendingZoomFor(null);
    }
  };

  const handleConfirmRescheduleTime = async ({ newTimeStart, newTimeEnd, newHours, notifyLine }) => {
    if (!rescheduleTimeTarget) return;
    const { schedule: s, dateStr } = rescheduleTimeTarget;
    if (!dateStr) { toast('ไม่พบวันที่ — ไม่สามารถเลื่อนเวลาได้ครับ', 'error'); return; }
    setIsSavingReschedule(true);
    try {
      await addCancellation(accessToken, dbId, ['CAN-' + Date.now(), s[SCHEDULE.ID], s[SCHEDULE.STUDENT_ID], dateStr, 'เลื่อนเวลา', dateStr, '', new Date().toLocaleString('th-TH'), `เลื่อนจาก ${s[SCHEDULE.TIME_START]}–${s[SCHEDULE.TIME_END]} → ${newTimeStart}–${newTimeEnd}`]);
      const newSchedId = 'SCH-' + Date.now();
      let gcalId = '';
      try { gcalId = await createCalendarEvent(accessToken, { studentName: getStudentName(s[SCHEDULE.STUDENT_ID]), subject: s[SCHEDULE.SUBJECT], dateStr, timeStart: newTimeStart, timeEnd: newTimeEnd, hours: newHours, note: `[เลื่อนเวลาจาก ${s[SCHEDULE.TIME_START]}–${s[SCHEDULE.TIME_END]}]`, repeatType: 'none', repeatUntil: '' }); } catch (e) { console.warn('[GCal] reschedule time:', e); }
      await addSchedule(accessToken, dbId, [newSchedId, s[SCHEDULE.STUDENT_ID], dateStr, s[SCHEDULE.SUBJECT], newHours, `[เลื่อนเวลาจาก ${s[SCHEDULE.TIME_START]}–${s[SCHEDULE.TIME_END]}]`, 'none', '', newTimeStart, newTimeEnd, 'FALSE', new Date().toLocaleString('th-TH'), gcalId, '']);
      if (notifyLine && canSendLine(settingsRow)) {
        const lineToken = settingsRow[SETTINGS.LINE_TOKEN];
        const lineWorkerUrl = settingsRow[SETTINGS.LINE_WORKER_URL];
        const student = students.find(st => st[STUDENT.ID] === s[SCHEDULE.STUDENT_ID]);
        const lineUserId = student?.[STUDENT_LINE_USER_ID] || '';
        if (lineToken && lineWorkerUrl && lineUserId) {
          const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
          const stuCode = buildStudentLoginCode(student?.[STUDENT.NICKNAME], student?.[STUDENT.NAME]);
          const footnote = buildLineFootnote({ portalUrl: `${window.location.origin}/portal`, studentCode: stuCode });
          const msg = ['⏰ แจ้งเลื่อนเวลาเรียนครับ', '', `สวัสดีครับคุณ${student[STUDENT.NAME]} 😊`, `คาบเรียนวัน${dateLabel}${s[SCHEDULE.SUBJECT] ? ` วิชา ${s[SCHEDULE.SUBJECT]}` : ''} ขอเลื่อนเวลานะครับ`, '', `🕐 เวลาใหม่: ${newTimeStart}–${newTimeEnd} น.`, '', 'ขออภัยในความไม่สะดวกครับ 🙏', footnote].join('\n');
          try { await sendLineMessage(lineWorkerUrl, lineToken, lineUserId, msg); toast(`แจ้งเวลาใหม่ทาง LINE ให้ ${student[STUDENT.NAME]} แล้วครับ`, 'success'); } catch (e) { toastLineError(toast, e, '/settings'); }
        }
      }
      toast(`เลื่อนเวลา ${getStudentName(s[SCHEDULE.STUDENT_ID])} เป็น ${newTimeStart}–${newTimeEnd} น. แล้วครับ`, 'success');
      setRescheduleTimeTarget(null); refresh({ force: true });
    } catch (err) {
      toast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally { setIsSavingReschedule(false); }
  };


  const handleDayClick = (dateStr, monthDelta) => {
    if (monthDelta !== 0) {
      let newMonth = currentMonth + monthDelta, newYear = currentYear;
      if (newMonth < 0) { newMonth = 11; newYear--; }
      if (newMonth > 11) { newMonth = 0; newYear++; }
      setCurrentMonth(newMonth); setCurrentYear(newYear);
      if (dateStr) setSelectedDate(dateStr);
      return;
    }
    setSelectedDate(dateStr); setEditingSchedule(null); setShowForm(false);
  };

  const handleGoToday = () => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth()); setSelectedDate(todayStr); };

  const handleLogSession = (scheduleData, dateStr) => {
    const scheduledH = parseFloat(scheduleData[SCHEDULE.HOURS] || '1');
    const initHours = String(Math.floor(scheduledH));
    const initMinutes = String(Math.round((scheduledH - Math.floor(scheduledH)) * 60));
    setLoggingSession({ scheduleData, dateStr, subject: scheduleData[SCHEDULE.SUBJECT] || '', hours: initHours, minutes: initMinutes, note: scheduleData[SCHEDULE.NOTE] || '', listeningScore: '', speakingScore: '', readingScore: '', writingScore: '', onChangeSubject: v => setLoggingSession(f => ({ ...f, subject: v })), onChangeHours: v => setLoggingSession(f => ({ ...f, hours: v })), onChangeMinutes: v => setLoggingSession(f => ({ ...f, minutes: v })), onChangeNote: v => setLoggingSession(f => ({ ...f, note: v })), onChangeListeningScore: v => setLoggingSession(f => ({ ...f, listeningScore: v })), onChangeSpeakingScore: v => setLoggingSession(f => ({ ...f, speakingScore: v })), onChangeReadingScore: v => setLoggingSession(f => ({ ...f, readingScore: v })), onChangeWritingScore: v => setLoggingSession(f => ({ ...f, writingScore: v })) });
  };

  const handleSubmitLogSession = async (e) => {
    e.preventDefault();
    if (isLoggingInFlight.current) return;
    isLoggingInFlight.current = true;
    setIsLoggingSubmitting(true);
    const { scheduleData, dateStr, subject, hours, minutes, note, listeningScore, speakingScore, readingScore, writingScore } = loggingSession;
    const totalHours = Math.round((parseFloat(hours || '0') + parseInt(minutes || '0') / 60) * 100) / 100;
    if (totalHours <= 0) { toast('กรุณากรอกจำนวนชั่วโมงหรือนาทีครับ', 'error'); setIsLoggingSubmitting(false); isLoggingInFlight.current = false; return; }
    const sessionCount  = sessions.filter(se => se[SESSION.STUDENT_ID] === scheduleData[SCHEDULE.STUDENT_ID] && se[SESSION.DATE] === dateStr && se[SESSION.DELETED] !== 'TRUE').length;
    const scheduleCount = schedules.filter(sc => sc[SCHEDULE.DELETED] !== 'TRUE' && sc[SCHEDULE.STUDENT_ID] === scheduleData[SCHEDULE.STUDENT_ID] && scheduleOccursOnDate(sc, dateStr)).length;
    if (sessionCount >= Math.max(1, scheduleCount)) { toast('บันทึกครบทุกคาบสำหรับวันนี้แล้วครับ', 'error'); setLoggingSession(null); setIsLoggingSubmitting(false); isLoggingInFlight.current = false; return; }
    const studentIdx = students.findIndex(s => s[STUDENT.ID] === scheduleData[SCHEDULE.STUDENT_ID]);
    const stu = studentIdx >= 0 ? students[studentIdx] : null;

    // Group package check — deduct from group pool if available and not yet deducted this session
    const groupId = scheduleData[SCHEDULE.GROUP_ID] || '';
    const grpDeductKey = groupId ? `${groupId}_${dateStr}` : '';
    const grp = groupId ? groups.find(g => g[GROUP.ID] === groupId) : null;
    const grpIdx = groupId ? groups.findIndex(g => g[GROUP.ID] === groupId) : -1;
    const grpPkgRemaining = grp ? safeFloat(grp[GROUP.PACKAGE_HOURS_REMAINING]) : 0;
    const useGroupPkg = grpPkgRemaining > 0 && grpDeductKey && !groupDeductedToday.has(grpDeductKey);

    const packageRemaining = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
    const isPrepaid = useGroupPkg || packageRemaining > 0;
    const invoicedFlag = isPrepaid ? 'PREPAID' : 'FALSE';
    const ok = await runWithFeedback(async () => {
      await addSessionsBatch(accessToken, dbId, [['SES-' + Date.now(), scheduleData[SCHEDULE.STUDENT_ID], dateStr, subject, String(totalHours), note, invoicedFlag, '', 'FALSE', new Date().toLocaleString('th-TH'), listeningScore || '', speakingScore || '', readingScore || '', writingScore || '', scheduleData[SCHEDULE.GROUP_ID] || '']]);
      if (useGroupPkg && grpIdx >= 0) {
        const newGrpRemaining = Math.max(0, grpPkgRemaining - totalHours);
        await updateGroupPackageHours(accessToken, dbId, grpIdx + 2, newGrpRemaining);
      } else if (!useGroupPkg && packageRemaining > 0 && studentIdx >= 0) {
        const newRemaining = Math.max(0, packageRemaining - totalHours);
        await updateStudentPackageHours(accessToken, dbId, studentIdx + 2, newRemaining);
      }
    }, toast, useGroupPkg
      ? `บันทึกคาบเรียนสำเร็จ! หักจากแพ็กเกจกลุ่มแล้ว (คงเหลือ ${Math.max(0, grpPkgRemaining - totalHours)} ชม.)`
      : packageRemaining > 0 ? `บันทึกคาบเรียนสำเร็จ! หักจากแพ็กเกจแล้ว (คงเหลือ ${Math.max(0, packageRemaining - totalHours)} ชม.)` : 'บันทึกรายละเอียดคาบเรียนสำเร็จ!');
    if (ok) {
      if (useGroupPkg && grpDeductKey) {
        setGroupDeductedToday(prev => new Set([...prev, grpDeductKey]));
      }
      try {
        const { getSettings: _getSettings } = await import('../services/googleSheets');
        const settingsData = await _getSettings(accessToken, dbId);
        const lineUserId = stu?.[STUDENT_LINE_USER_ID] || '';
        if (canSendLine(settingsData) && lineUserId && note) {
          const lToken = settingsData[SETTINGS.LINE_TOKEN];
          const lWorker = settingsData[SETTINGS.LINE_WORKER_URL];
          const instituteName = settingsData?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY';
          const stuCode = buildStudentLoginCode(stu[STUDENT.NICKNAME], stu[STUDENT.NAME]);
          const footnote = buildLineFootnote({ portalUrl: `${window.location.origin}/portal`, studentCode: stuCode });
          const hoursLabel = parseInt(minutes || '0') > 0 ? `${Math.floor(totalHours)} ชม. ${parseInt(minutes)} นาที` : `${totalHours} ชม.`;
          const msg = ['📚 สรุปบทเรียนวันนี้', '', `นักเรียน: ${stu[STUDENT.NAME]}`, `วันที่: ${dateStr}`, `วิชา: ${subject}`, `จำนวน: ${hoursLabel}`, '', `📝 ${note}`, '', `— ${instituteName}`, footnote].join('\n');
          await sendLineMessage(lWorker, lToken, lineUserId, msg);
          toast(`ส่งสรุปบทเรียนทาง LINE ให้ ${stu[STUDENT.NAME]} แล้ว`, 'success');
        }
      } catch (e) { if (/401|429|403/.test(e?.message)) toastLineError(toast, e, '/settings'); }
      setLoggingSession(null); refresh({ force: true });
    }
    setIsLoggingSubmitting(false); isLoggingInFlight.current = false;
  };

  const handleSubmitSchedule = async (formData, editing, date) => {
    if (isSubmitting) return;
    if (!date) return toast('ไม่พบวันที่ — กรุณาเลือกวันในปฏิทินก่อนครับ', 'error');
    const isGroup = !!formData.group_id;
    if (!isGroup && !formData.student_id) return toast('กรุณาเลือกนักเรียนครับ', 'error');
    if (isGroup && !formData.group_id) return toast('กรุณาเลือกกลุ่มเรียนครับ', 'error');
    if (isGroup && !editing) {
      const grp = groups.find(g => g[GROUP.ID] === formData.group_id);
      if (!grp) return toast('ไม่พบกลุ่มเรียนครับ', 'error');
      const memberIds = (grp[GROUP.STUDENT_IDS] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (memberIds.length === 0) return toast('กลุ่มนี้ยังไม่มีนักเรียนครับ', 'error');
      setIsSubmitting(true);
      try {
        for (const sid of memberIds) {
          let gcalEventId = '';
          try { gcalEventId = await createCalendarEvent(accessToken, { studentName: getStudentName(sid), subject: formData.subject, dateStr: date, timeStart: formData.time_start, timeEnd: formData.time_end, hours: formData.hours, note: formData.note, repeatType: formData.repeat_type, repeatUntil: formData.repeat_until }); } catch (e) { console.warn('[GCal group]', e); }
          await addSchedule(accessToken, dbId, ['SCH-' + Date.now() + '-' + sid, sid, date, formData.subject, formData.hours, formData.note, formData.repeat_type, formData.repeat_until, formData.time_start, formData.time_end, 'FALSE', new Date().toLocaleString('th-TH'), gcalEventId, '', formData.group_id]);
        }
        toast(`เพิ่มตารางสอนกลุ่ม "${grp[GROUP.NAME]}" (${memberIds.length} คน) สำเร็จ!`);
        setShowForm(false); setEditingSchedule(null); refresh({ force: true });
      } catch (err) { toast(`เกิดข้อผิดพลาด: ${err.message}`, 'error'); } finally { setIsSubmitting(false); }
      return;
    }
    setIsSubmitting(true);
    let gcalEventId = editing?.data?.[SCHEDULE.GCAL_EVENT_ID] || '';
    try {
      const calPayload = { studentName: getStudentName(formData.student_id), subject: formData.subject, dateStr: date, timeStart: formData.time_start, timeEnd: formData.time_end, hours: formData.hours, note: formData.note, repeatType: formData.repeat_type, repeatUntil: formData.repeat_until };
      if (editing && gcalEventId) { gcalEventId = await updateCalendarEvent(accessToken, gcalEventId, calPayload) || gcalEventId; }
      else { gcalEventId = await createCalendarEvent(accessToken, calPayload); }
    } catch (calErr) { console.warn('[Calendar Sync]:', calErr.message); toast('บันทึกตารางสอนแล้ว แต่ sync Google Calendar ไม่สำเร็จ', 'info'); }
    const row = ['SCH-' + Date.now(), formData.student_id, date, formData.subject, formData.hours, formData.note, formData.repeat_type, formData.repeat_until, formData.time_start, formData.time_end, 'FALSE', new Date().toLocaleString('th-TH'), gcalEventId || '', '', ''];
    const ok = await runWithFeedback(() => { if (editing) { const updatedRow = [...row]; updatedRow[0] = editing.data[SCHEDULE.ID]; return updateSchedule(accessToken, dbId, editing.rowIndex, updatedRow); } return addSchedule(accessToken, dbId, row); }, toast, editing ? 'อัปเดตตารางสอน + sync Google Calendar แล้ว!' : 'เพิ่มตารางสอน + sync Google Calendar แล้ว!');
    if (ok) { setShowForm(false); setEditingSchedule(null); refresh({ force: true }); }
    setIsSubmitting(false);
  };

  const handleDeleteSchedule = async (s, rowIndex) => {
    const ok = await confirm(`ลบตารางสอน "${getStudentName(s[SCHEDULE.STUDENT_ID])}" วันที่ ${s[SCHEDULE.DATE]} ออกถาวรใช่ไหมครับ?`, true);
    if (!ok) return;
    if (s[SCHEDULE.GCAL_EVENT_ID]) { try { await deleteCalendarEvent(accessToken, s[SCHEDULE.GCAL_EVENT_ID]); } catch (e) { console.warn('[GCal]', e); } }
    const success = await runWithFeedback(() => softDeleteSchedule(accessToken, dbId, rowIndex), toast, 'ลบตารางสอนถาวรแล้ว');
    if (success) refresh({ force: true });
  };

  const handleCancelClass = (scheduleData, rowIndex, dateStr) => setCancellingClass({ scheduleData, rowIndex, dateStr });

  const handleConfirmCancel = async ({ reason, note, rescheduleDate, rescheduleTimeStart, rescheduleTimeEnd, rescheduleHours }) => {
    if (!cancellingClass) return;
    setIsSubmitting(true);
    const { scheduleData: s, rowIndex, dateStr } = cancellingClass;
    const studentName = getStudentName(s[SCHEDULE.STUDENT_ID]);
    let newScheduleId = '';
    const newTimeStart = rescheduleTimeStart || s[SCHEDULE.TIME_START];
    const newTimeEnd = rescheduleTimeEnd || s[SCHEDULE.TIME_END];
    const newHours = rescheduleHours || s[SCHEDULE.HOURS];
    try {
      if (s[SCHEDULE.GCAL_EVENT_ID]) { try { await deleteCalendarEvent(accessToken, s[SCHEDULE.GCAL_EVENT_ID]); } catch (e) { console.warn('[GCal]', e); } }
      if (rescheduleDate) {
        let newGcalId = '';
        try { newGcalId = await createCalendarEvent(accessToken, { studentName, subject: s[SCHEDULE.SUBJECT], dateStr: rescheduleDate, timeStart: newTimeStart, timeEnd: newTimeEnd, hours: newHours, note: `[เลื่อนจาก ${dateStr}] ${s[SCHEDULE.NOTE] || ''}`.trim(), repeatType: 'none', repeatUntil: '' }); } catch (e) { console.warn('[GCal]', e); }
        newScheduleId = 'SCH-' + Date.now();
        await addSchedule(accessToken, dbId, [newScheduleId, s[SCHEDULE.STUDENT_ID], rescheduleDate, s[SCHEDULE.SUBJECT], newHours, `[เลื่อนจาก ${dateStr}] ${s[SCHEDULE.NOTE] || ''}`.trim(), 'none', '', newTimeStart, newTimeEnd, 'FALSE', new Date().toLocaleString('th-TH'), newGcalId]);
      }
      await addCancellation(accessToken, dbId, ['CAN-' + Date.now(), s[SCHEDULE.ID], s[SCHEDULE.STUDENT_ID], dateStr, reason, rescheduleDate || '', newScheduleId, new Date().toLocaleString('th-TH'), note || '']);
      toast(rescheduleDate ? `ยกเลิกคลาสแล้ว + เลื่อนไป ${new Date(rescheduleDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${newTimeStart} น.` : 'บันทึกการยกเลิกคลาสแล้ว', 'success');
      setCancellingClass(null); refresh({ force: true });
    } catch (err) { toast(`เกิดข้อผิดพลาด: ${err.message}`, 'error'); } finally { setIsSubmitting(false); }
  };

  const handleCreateDB = async () => {
    const ok = await confirm('ระบบจะสร้างฐานข้อมูลใหม่ใน Google Drive ของคุณ ยืนยันใช่ไหมครับ?');
    if (!ok) return;
    await runWithFeedback(async () => { const newDbId = await setupNewDatabase(accessToken); await initDatabaseHeaders(accessToken, newDbId); dbStore.set(newDbId); setDbId(newDbId); }, toast, 'ติดตั้งฐานข้อมูลสำเร็จ!');
  };

  if (!dbId) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center mt-12 bg-white rounded-[16px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-gray-200">
        <Dialog />
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg></div>
        <h2 className="text-[20px] font-semibold text-gray-900 mb-2">ติดตั้งฐานข้อมูล</h2>
        <p className="text-[14px] text-gray-500 mb-6">ไม่พบฐานข้อมูลเดิมใน Google Drive คลิกด้านล่างเพื่อสร้างไฟล์ใหม่</p>
        <button onClick={handleCreateDB} className={btnPrimary}>สร้างและตั้งค่าฐานข้อมูล</button>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-6xl mx-auto">
      <Dialog />
      {error && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-[12px] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-[13px] text-red-700 flex-1">โหลดข้อมูลไม่สำเร็จ — {error.message}</p>
          <button onClick={refresh} className="text-[12px] font-semibold text-red-600 hover:text-red-800 flex items-center gap-1"><RefreshCw className="w-3 h-3" />ลองใหม่</button>
        </div>
      )}
      <LogSessionModal loggingSession={loggingSession} isSubmitting={isLoggingSubmitting} getStudentName={getStudentName} onSubmit={handleSubmitLogSession} onClose={() => { setLoggingSession(null); isLoggingInFlight.current = false; }} packageHoursRemaining={loggingSession ? safeFloat(students.find(s => s[STUDENT.ID] === loggingSession.scheduleData[SCHEDULE.STUDENT_ID])?.[STUDENT.PACKAGE_HOURS]) : 0} groupPackageHoursRemaining={loggingSession ? safeFloat(groups.find(g => g[GROUP.ID] === loggingSession.scheduleData[SCHEDULE.GROUP_ID])?.[GROUP.PACKAGE_HOURS_REMAINING]) : 0} />
      <CancelClassModal schedule={cancellingClass?.scheduleData} studentName={cancellingClass ? getStudentName(cancellingClass.scheduleData[SCHEDULE.STUDENT_ID]) : ''} dateStr={cancellingClass?.dateStr || ''} schedulesOnRescheduleDate={schedulesOnRescheduleDate} onRescheduleDateChange={setRescheduleTargetDate} getStudentName={getStudentName} onConfirm={handleConfirmCancel} onClose={() => { setCancellingClass(null); setRescheduleTargetDate(''); }} isSubmitting={isSubmitting} />
      <StatsPanel stats={stats} loading={statsLoading} />
      <ActionInbox overdueSchedules={overdueSchedules} todaySchedules={todaySchedules} getStudentName={getStudentName} todayStr={todayStr} nowMins={nowMins} zoomLink={zoomLink} onLogSession={handleLogSession} onCancelClass={handleCancelClass} onSendZoomLink={handleSendClassReminder} sendingZoomFor={sendingZoomFor} groups={groups} students={students} settingsRow={settingsRow} onStartClass={handleStartClass} onLaunchClassroom={setLauncherCall} waitingRoomStatusMap={waitingRoomStatusMap} toast={toast} bookingRequests={bookingRequests} schedules={schedules} onApproveBooking={handleApproveBooking} onRejectBooking={handleRejectBooking} />
      {showSessionReminder && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-[12px]">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="flex-1 text-[13px] font-semibold text-amber-800">⏰ ครบ 40 นาทีแล้ว — อย่าลืมบันทึกคาบนะครับ</p>
          <button onClick={() => setShowSessionReminder(false)} className="text-[12px] text-amber-600 hover:text-amber-800 px-2 py-1">ปิด</button>
        </div>
      )}
      {!isVideoCallEnabled(settingsRow) && (
        <ZoomClassTimer
          active={zoomTimer.active}
          startedAt={zoomTimer.startedAt}
          currentLink={zoomTimer.currentLink}
          linksPool={zoomLinksPool}
          onSwitchRoom={handleSwitchRoom}
          onTimeUp={() => setShowSessionReminder(true)}
          onStop={() => { setZoomTimer({ active: false, startedAt: null, currentLinkIdx: -1, currentLink: '' }); setShowSessionReminder(false); try { localStorage.removeItem('zw_zoom_session'); } catch {} }}
        />
      )}
      <CalendarGrid year={currentYear} month={currentMonth} todayStr={todayStr} selectedDate={selectedDate} students={students} schedules={schedules} sessions={sessions} groups={groups} onDayClick={handleDayClick} onGoToday={handleGoToday} />
      <DaySchedulePanel selectedDate={selectedDate} todayStr={todayStr} selectedDateSchedules={selectedDateSchedules} selectedDateSessions={selectedDateSessions} selectedDateCancellations={selectedDateCancellations} getStudentName={getStudentName} showForm={showForm} setShowForm={setShowForm} editingSchedule={editingSchedule} setEditingSchedule={setEditingSchedule} students={students} groups={groups} isSubmitting={isSubmitting} onSubmitSchedule={handleSubmitSchedule} onDeleteSchedule={handleDeleteSchedule} onLogSession={handleLogSession} onCancelClass={handleCancelClass} zoomLink={zoomLink} onSendZoomLink={handleSendClassReminder} sendingZoomFor={sendingZoomFor} onRescheduleTime={(s, d) => setRescheduleTimeTarget({ schedule: s, dateStr: d })} setActiveCall={setActiveCall} setLauncherCall={setLauncherCall} onStartClass={handleStartClass} waitingRoomStatusMap={waitingRoomStatusMap} settingsRow={settingsRow} toast={toast} />
      <RescheduleTimeModal open={!!rescheduleTimeTarget} onClose={() => setRescheduleTimeTarget(null)} schedule={rescheduleTimeTarget?.schedule} studentName={rescheduleTimeTarget ? getStudentName(rescheduleTimeTarget.schedule[SCHEDULE.STUDENT_ID]) : ''} dateStr={rescheduleTimeTarget?.dateStr || ''} onConfirm={handleConfirmRescheduleTime} isSaving={isSavingReschedule} />
      {launcherCall && !activeCall && <VideoCallLauncher scheduleId={launcherCall.scheduleId} studentName={launcherCall.studentName} joinCode={(() => {
        // scheduleId is a groupId for group calls, a studentId for 1:1 —
        // resolve it to the code the student would otherwise type by hand.
        const g = (groups || []).find(gr => gr[GROUP.ID] === launcherCall.scheduleId && gr[GROUP.DELETED] !== 'TRUE');
        if (g) return g[GROUP.CODE] || '';
        const stu = (students || []).find(s => s[STUDENT.ID] === launcherCall.scheduleId && s[STUDENT.DELETED] !== 'TRUE');
        return stu ? buildStudentLoginCode(stu[STUDENT.NICKNAME], stu[STUDENT.NAME]) : '';
      })()} onStart={() => { setActiveCall(launcherCall); setLauncherCall(null); }} onClose={() => setLauncherCall(null)} toast={toast} />}
      {activeCall && (
        <Suspense fallback={null}>
          {activeCall.isGroup ? (
            <GroupCallModal
              groupId={activeCall.groupId}
              groupMembers={activeCall.groupMembers || []}
              onClose={() => setActiveCall(null)}
              toast={toast}
            />
          ) : (
            <VideoCallErrorBoundary onClose={() => setActiveCall(null)}>
              <VideoCallModal scheduleId={activeCall.scheduleId} role="teacher" studentName={activeCall.studentName} studentId={activeCall.studentId || activeCall.scheduleId} onClose={() => setActiveCall(null)} toast={toast} />
            </VideoCallErrorBoundary>
          )}
        </Suspense>
      )}
    </div>
  );
}
