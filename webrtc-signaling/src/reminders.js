// Cron-driven "class starting soon" LINE reminders.
//
// This used to live in the teacher's browser tab (useZoomReminder.js) — which
// meant no reminders whenever the teacher's laptop was closed. The cron trigger
// runs every 5 minutes regardless.
//
// Data comes from the same public GViz CSV export the student portal uses
// (the spreadsheet is already link-shared for the portal to work). The LINE
// channel token comes from KV `line_config`, the active sheet from KV
// `config_sheet_id`. Dedup per schedule+date is a KV key with a 1-day TTL.
//
// ⚠️ Column indexes below MUST stay in sync with src/lib/constants.js in the
// frontend repo — when a migration adds a column, update both.

const SCHEDULE = { ID: 0, STUDENT_ID: 1, DATE: 2, SUBJECT: 3, REPEAT_TYPE: 6, REPEAT_UNTIL: 7, TIME_START: 8, TIME_END: 9, DELETED: 10 };
const STUDENT = { ID: 0, NAME: 1, NICKNAME: 4, DELETED: 7 };
const STUDENT_LINE_USER_ID = 9;
const CANCELLATION = { SCHEDULE_ID: 1, ORIGINAL_DATE: 3 };
const SETTINGS = { UNUSED_1: 1, NOTIFY_STUDENT_30MIN: 25, MSG_PORTAL_REMINDER: 31, CLASS_CODE: 36 };

// ── CSV (ported from src/services/googleSheets.js parseCsv) ─────────────────

const cleanCell = (v) => (typeof v === 'string' && v.startsWith("'")) ? v.slice(1) : v;

function parseCsvLine(line) {
  const result = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(cleanCell(cur)); cur = ''; }
      else cur += c;
    }
  }
  result.push(cleanCell(cur));
  return result;
}

function parseCsv(text) {
  const rows = [];
  let cur = '', inQuotes = false;
  const lines = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && !inQuotes) { inQuotes = true; cur += c; continue; }
    if (c === '"' && inQuotes && text[i + 1] === '"') { cur += '"'; i++; continue; }
    if (c === '"' && inQuotes) { inQuotes = false; cur += c; continue; }
    if (c === '\n' && !inQuotes) { lines.push(cur); cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur) lines.push(cur);
  lines.forEach(l => { if (l.trim() !== '') rows.push(parseCsvLine(l)); });
  return rows;
}

async function fetchSheetRows(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GViz ${sheetName} HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  return rows.length > 0 ? rows.slice(1) : [];
}

// ── Login code (ported from src/lib/business.js) ────────────────────────────

const NAME_PREFIX_WORDS_TO_SKIP = ['น้อง', 'พี่'];
const THAI_CONSONANT_SOUND = {
  'ก': 'K', 'ข': 'KH', 'ฃ': 'KH', 'ค': 'KH', 'ฅ': 'KH', 'ฆ': 'KH', 'ง': 'NG',
  'จ': 'CH', 'ฉ': 'CH', 'ช': 'CH', 'ซ': 'S', 'ฌ': 'CH', 'ญ': 'Y',
  'ฎ': 'D', 'ฏ': 'T', 'ฐ': 'TH', 'ฑ': 'TH', 'ฒ': 'TH', 'ณ': 'N',
  'ด': 'D', 'ต': 'T', 'ถ': 'TH', 'ท': 'TH', 'ธ': 'TH', 'น': 'N',
  'บ': 'B', 'ป': 'P', 'ผ': 'PH', 'ฝ': 'F', 'พ': 'PH', 'ฟ': 'F', 'ภ': 'PH', 'ม': 'M',
  'ย': 'Y', 'ร': 'R', 'ล': 'L', 'ฬ': 'L', 'ว': 'W',
  'ศ': 'S', 'ษ': 'S', 'ส': 'S', 'ห': 'H', 'ฮ': 'H', 'อ': 'O',
};

function thaiNameToLatinPrefix(rawName) {
  let name = (rawName || '').trim();
  for (const word of NAME_PREFIX_WORDS_TO_SKIP) {
    if (name.startsWith(word)) { name = name.slice(word.length).trim(); break; }
  }
  if (!name) name = (rawName || '').trim();
  if (/^[A-Za-z]/.test(name)) return name.slice(0, 2).toUpperCase();
  const letters = [];
  for (const ch of name) {
    const sound = THAI_CONSONANT_SOUND[ch];
    if (sound) {
      letters.push(sound[0]);
      if (letters.length === 2) break;
    }
  }
  if (letters.length === 2) return letters.join('');
  if (letters.length === 1) return `${letters[0]}X`;
  return 'ST';
}

function buildStudentLoginCode(storedCode, name) {
  if (!storedCode || !name) return '';
  const prefix = thaiNameToLatinPrefix(name);
  if (!prefix) return '';
  return `${prefix}${storedCode}`.toUpperCase();
}

// ── Schedule recurrence (ported from src/lib/business.js) ───────────────────

function scheduleOccursOnDate(schedule, dateStr) {
  if (schedule[SCHEDULE.DATE] === dateStr) return true;
  const repeatType = schedule[SCHEDULE.REPEAT_TYPE];
  if (repeatType !== 'weekly' && repeatType !== 'biweekly') return false;
  const start = new Date(schedule[SCHEDULE.DATE] + 'T12:00:00');
  const target = new Date(dateStr + 'T12:00:00');
  const until = schedule[SCHEDULE.REPEAT_UNTIL] ? new Date(schedule[SCHEDULE.REPEAT_UNTIL] + 'T12:00:00') : null;
  if (target < start) return false;
  if (until && target > until) return false;
  const diffDays = Math.round((target - start) / 86_400_000);
  const interval = repeatType === 'weekly' ? 7 : 14;
  return diffDays % interval === 0;
}

// ── Message template (ported from src/lib/business.js buildPortalMessage) ───

const DEFAULT_TPL_PORTAL_REMINDER =
`สวัสดีครับคุณ{name} 😊
ใกล้ถึงเวลาเรียนแล้วนะครับ{subject}
{time}

📱 เข้า Portal เพื่อกดลิงก์เข้าห้องเรียนได้เลยนะครับ:
👉 {url}
Class Code: {class_code}
Login Code: {code}`;

function fillSysTpl(tpl, vars) {
  let s = tpl;
  for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v || '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function buildPortalMessage({ studentName, subject, timeStart, timeEnd, portalUrl, stuCode, classCode, template }) {
  const tpl = (template || '').trim() || DEFAULT_TPL_PORTAL_REMINDER;
  return fillSysTpl(tpl, {
    name: studentName || '',
    subject: subject ? ` วิชา ${subject}` : '',
    time: timeStart ? `🕐 เวลา: ${timeStart}${timeEnd ? `–${timeEnd}` : ''} น.` : '',
    url: portalUrl || '',
    code: stuCode || '',
    class_code: classCode || '',
  });
}

// ── Main entry, called from the scheduled() handler ─────────────────────────

export async function sendClassReminders(env) {
  const sheetId = await env.WEBRTC_KV.get('config_sheet_id');
  if (!sheetId) return;
  const lineCfgRaw = await env.WEBRTC_KV.get('line_config');
  const lineToken = lineCfgRaw ? (JSON.parse(lineCfgRaw).lineToken || '') : '';
  if (!lineToken) return;

  const settingsRows = await fetchSheetRows(sheetId, 'settings');
  const settings = settingsRows[0] || [];
  if (settings[SETTINGS.UNUSED_1] === 'FALSE') return; // LINE OA disabled system-wide
  const notifyRaw = settings[SETTINGS.NOTIFY_STUDENT_30MIN];
  if (notifyRaw === 'FALSE') return; // student reminders turned off
  const notifyMins = parseInt(notifyRaw) || 30;

  // Bangkok is fixed UTC+7 (no DST)
  const bkk = new Date(Date.now() + 7 * 3600_000);
  const todayStr = bkk.toISOString().slice(0, 10);
  const nowMins = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
  const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };

  const [schedules, students, cancellations] = await Promise.all([
    fetchSheetRows(sheetId, 'schedules'),
    fetchSheetRows(sheetId, 'students'),
    fetchSheetRows(sheetId, 'cancellations').catch(() => []),
  ]);

  const classCode = settings[SETTINGS.CLASS_CODE] || '';
  const template = settings[SETTINGS.MSG_PORTAL_REMINDER] || '';
  const appOrigin = (env.APP_ORIGIN || '').replace(/\/$/, '');
  let sent = 0;

  for (const s of schedules) {
    if (s[SCHEDULE.DELETED] === 'TRUE') continue;
    if (!scheduleOccursOnDate(s, todayStr)) continue;
    const diffToClass = toMins(s[SCHEDULE.TIME_START]) - nowMins;
    if (diffToClass <= 0 || diffToClass > notifyMins) continue;

    const cancelled = cancellations.some(c => c[CANCELLATION.SCHEDULE_ID] === s[SCHEDULE.ID] && c[CANCELLATION.ORIGINAL_DATE] === todayStr);
    if (cancelled) continue;

    const stu = students.find(st => st[STUDENT.ID] === s[SCHEDULE.STUDENT_ID] && st[STUDENT.DELETED] !== 'TRUE');
    const lineUserId = stu?.[STUDENT_LINE_USER_ID] || '';
    if (!lineUserId) continue;

    const dedupKey = `reminded_${s[SCHEDULE.ID]}_${todayStr}`;
    if (await env.WEBRTC_KV.get(dedupKey)) continue;
    // Mark before sending — a duplicate LINE message is worse than a rare miss.
    await env.WEBRTC_KV.put(dedupKey, '1', { expirationTtl: 86400 });

    const stuCode = buildStudentLoginCode(stu[STUDENT.NICKNAME], stu[STUDENT.NAME]);
    const portalUrl = appOrigin
      ? (classCode
          ? `${appOrigin}/portal?class=${encodeURIComponent(classCode)}&code=${encodeURIComponent(stuCode)}`
          : `${appOrigin}/portal?code=${encodeURIComponent(stuCode)}`)
      : '';
    const msg = buildPortalMessage({
      studentName: stu[STUDENT.NAME],
      subject: s[SCHEDULE.SUBJECT] || '',
      timeStart: s[SCHEDULE.TIME_START] || '',
      timeEnd: s[SCHEDULE.TIME_END] || '',
      portalUrl, stuCode, classCode, template,
    });

    const resp = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lineToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: msg }] }),
    });
    if (resp.ok) sent += 1;
    else console.error('[REMINDER] LINE push failed:', resp.status, await resp.text().catch(() => ''));
  }

  if (sent > 0) console.log(`[REMINDER] sent ${sent} class reminder(s) for ${todayStr}`);
}
