// src/services/googleCalendar.js
// Google Calendar API integration
// Handles auto-sync of teaching schedules to Google Calendar
import { DEFAULT_CALENDAR_SUBJECT, CALENDAR_APP_NAME, APP_TIMEZONE } from '../lib/appConfig';

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

// ============================================================
// HELPERS
// ============================================================

/**
 * Converts a date string (YYYY-MM-DD) and time string (HH:MM) to RFC3339 format
 * e.g. "2025-01-15" + "18:00" → "2025-01-15T18:00:00+07:00"
 */
function toRFC3339(dateStr, timeStr) {
  // UTC offset สำหรับ APP_TIMEZONE (Asia/Bangkok = +07:00)
  // ถ้าเปลี่ยน APP_TIMEZONE ใน appConfig.js ให้อัพเดท offset นี้ด้วย
  return `${dateStr}T${timeStr}:00+07:00`;
}

/**
 * Builds a Google Calendar event object from schedule data
 */
function buildEventPayload({ studentName, subject, dateStr, timeStart, timeEnd, hours, note, repeatType, repeatUntil }) {
  const title = `🎓 ${studentName} — ${subject || DEFAULT_CALENDAR_SUBJECT}`;
  const description = [
    subject ? `วิชา: ${subject}` : '',
    `จำนวน: ${hours} ชั่วโมง`,
    note ? `หมายเหตุ: ${note}` : '',
    '',
    `บันทึกโดย ${CALENDAR_APP_NAME}`,
  ].filter(Boolean).join('\n');

  const event = {
    summary: title,
    description,
    start: {
      dateTime: toRFC3339(dateStr, timeStart || '09:00'),
      timeZone: APP_TIMEZONE,  // ← จำเป็นต้องมี ไม่งั้น Google ส่ง 400
    },
    end: {
      dateTime: toRFC3339(dateStr, timeEnd || '10:00'),
      timeZone: APP_TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 10 },
      ],
    },
    colorId: '1', // Tomato red
  };

  // Handle recurring events
  if (repeatType === 'weekly') {
    const until = repeatUntil ? repeatUntil.replace(/-/g, '') + 'T235959Z' : null;
    event.recurrence = [
      `RRULE:FREQ=WEEKLY${until ? `;UNTIL=${until}` : ''}`,
    ];
  } else if (repeatType === 'biweekly') {
    const until = repeatUntil ? repeatUntil.replace(/-/g, '') + 'T235959Z' : null;
    event.recurrence = [
      `RRULE:FREQ=WEEKLY;INTERVAL=2${until ? `;UNTIL=${until}` : ''}`,
    ];
  }

  return event;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Creates a new event on the user's primary Google Calendar
 * Returns the event ID to store in Google Sheets for future updates/deletes
 */
export async function createCalendarEvent(accessToken, { studentName, subject, dateStr, timeStart, timeEnd, hours, note, repeatType, repeatUntil }) {
  const payload = buildEventPayload({ studentName, subject, dateStr, timeStart, timeEnd, hours, note, repeatType, repeatUntil });

  const res = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar: สร้าง event ไม่สำเร็จ — ${err?.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.id; // Store this in Google Sheets column M (gcal_event_id)
}

/**
 * Updates an existing Calendar event by its event ID
 */
export async function updateCalendarEvent(accessToken, eventId, { studentName, subject, dateStr, timeStart, timeEnd, hours, note, repeatType, repeatUntil }) {
  if (!eventId) return null;

  const payload = buildEventPayload({ studentName, subject, dateStr, timeStart, timeEnd, hours, note, repeatType, repeatUntil });

  const res = await fetch(`${GCAL_BASE}/calendars/primary/events/${eventId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // 404/410 = event ถูกลบออกจาก Google Calendar ด้วยมือ — ไม่ใช่ error ร้ายแรง
    if (res.status === 404 || res.status === 410) {
      console.warn(`[GoogleCalendar] event ${eventId} not found (${res.status}) — skipping update`);
      return null;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar: แก้ไข event ไม่สำเร็จ — ${err?.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Deletes a Calendar event by its event ID
 * Silent-fails if the event is already gone
 */
export async function deleteCalendarEvent(accessToken, eventId) {
  if (!eventId) return;

  const res = await fetch(`${GCAL_BASE}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  // 404 = already deleted manually — that's fine
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.warn(`[GoogleCalendar] delete failed for event ${eventId}:`, res.status);
  }
}