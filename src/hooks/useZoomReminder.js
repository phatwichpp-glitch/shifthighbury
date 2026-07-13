// @ts-nocheck
import { useEffect, useRef } from 'react';
import { SCHEDULE } from '../lib/constants';

// NOTE: the student-LINE "class starting soon" reminder no longer lives here —
// it moved to the signaling worker's cron trigger (webrtc-signaling/src/reminders.js)
// so it fires even when the teacher's browser is closed. This hook now only
// handles the teacher-facing toasts/notifications for Zoom mode.
export function useZoomReminder({ enabledBefore, enabledExtend, todaySchedules, getStudentName, toast, zoomLink, videoCallEnabled }) {
  const notifiedRef = useRef(new Set());

  // Zoom-specific reminders (before-class + 40-min warning) are meaningless
  // once the school teaches through the built-in Classroom system instead.
  const zoomBeforeEnabled = enabledBefore && !videoCallEnabled;
  const zoomExtendEnabled = enabledExtend && !videoCallEnabled;

  useEffect(() => {
    if (!zoomBeforeEnabled && !zoomExtendEnabled) return;
    if (!zoomLink) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const checkUpcoming = () => {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };

      for (const item of (todaySchedules || [])) {
        const s = item.data;
        const id = s[SCHEDULE.ID];
        const studentName = getStudentName(s[SCHEDULE.STUDENT_ID]);
        const startMins = toMins(s[SCHEDULE.TIME_START]);
        const endMins = toMins(s[SCHEDULE.TIME_END]);
        const durationMins = endMins - startMins;

        // Teacher toast/notification 15min before class
        if (zoomBeforeEnabled && zoomLink) {
          const beforeKey = `${id}-before`;
          const diffBefore = startMins - nowMins;
          if (!notifiedRef.current.has(beforeKey) && diffBefore <= 15 && diffBefore >= 0) {
            notifiedRef.current.add(beforeKey);
            const text = `อีก ${diffBefore} นาทีถึงเวลาเรียนของ ${studentName} แล้วค่ะ`;
            toast(text, 'info');
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try { new Notification('ใกล้ถึงเวลาคลาสแล้ว', { body: `${studentName} · ${s[SCHEDULE.TIME_START]}–${s[SCHEDULE.TIME_END]} น.` }); } catch { /* ignore */ }
            }
          }
        }

        // Teacher notification at 30min in
        if (zoomExtendEnabled && zoomLink) {
          if (durationMins <= 30) continue;
          const extendKey = `${id}-extend`;
          const diffExtend = nowMins - startMins;
          if (!notifiedRef.current.has(extendKey) && diffExtend >= 30 && diffExtend <= 35) {
            notifiedRef.current.add(extendKey);
            const text = `⏳ ${studentName} สอนมาแล้วประมาณ 30 นาที — ใกล้ครบ 40 นาทีของ Zoom Free แล้วค่ะ กด End Meeting แล้วเปิดลิงก์เดิมใหม่ได้เลย จะไม่ติดรอ 10 นาที`;
            toast(text, 'info');
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try { new Notification('⏳ ใกล้ครบ 40 นาทีแล้ว', { body: `${studentName} · กด End Meeting แล้วเปิดลิงก์เดิมใหม่ทันทีนะคะ` }); } catch { /* ignore */ }
            }
          }
        }

      }
    };

    checkUpcoming();
    const timer = setInterval(checkUpcoming, 30 * 1000);
    return () => clearInterval(timer);
  }, [zoomBeforeEnabled, zoomExtendEnabled, todaySchedules, getStudentName, toast, zoomLink]);
}
