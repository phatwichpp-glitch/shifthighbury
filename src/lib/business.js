// @ts-nocheck
import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import { STUDENT, SESSION, SCHEDULE, INVOICE, SETTINGS, GROUP, CANCELLATION } from './constants';
import { INVOICE_LINE_LABEL } from './appConfig';

// ─── Worker auth ──────────────────────────────────────────────

// Headers for teacher-only endpoints on the signaling worker. The worker
// rejects these calls with 401 when TEACHER_SECRET is set and the token is
// missing, so every teacher-side fetch must merge these in.
export function teacherAuthHeaders() {
  const secret = import.meta.env?.VITE_TEACHER_SECRET;
  return secret ? { 'X-Teacher-Token': secret } : {};
}

// ─── Error helpers ────────────────────────────────────────────

export class AppError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AppError';
    this.cause = cause;
  }
}

export async function runWithFeedback(fn, toast, successMsg, onSuccess) {
  try {
    const result = await fn();
    toast(successMsg, 'success');
    if (onSuccess) onSuccess(result);
    return true;
  } catch (err) {
    const isNetwork = !window.navigator.onLine;
    let uiMessage = 'ไม่สามารถดำเนินการได้ | เกิดข้อผิดพลาดในระบบ';
    if (isNetwork) {
      uiMessage = 'การเชื่อมต่อขาดหาย | กรุณาตรวจสอบอินเทอร์เน็ตของคุณ';
    } else if (err instanceof AppError) {
      uiMessage = err.message;
    } else if (err?.message?.includes('401')) {
      uiMessage = 'เซสชันหมดอายุ | กรุณาเข้าสู่ระบบใหม่';
    } else {
      uiMessage = err?.message || 'ไม่ทราบสาเหตุ';
    }
    toast(uiMessage, 'error');
    console.error('[AppError]', err);
    return false;
  }
}

const parseLineError = (err) => {
  const msg = err?.message || String(err);
  if (/401/.test(msg)) return 'token_expired';
  if (/429/.test(msg)) return 'quota_exceeded';
  if (/403/.test(msg)) return 'forbidden';
  return 'unknown';
};

export function toastLineError(toast, err, settingsPath = '/settings') {
  const kind = parseLineError(err);
  if (kind === 'token_expired') {
    toast(`LINE Token หมดอายุหรือไม่ถูกต้อง — ไปอัปเดตที่หน้าตั้งค่า (${settingsPath})`, 'error');
  } else if (kind === 'quota_exceeded') {
    toast(`LINE API Quota หมดสำหรับเดือนนี้ — ตรวจสอบแผน LINE OA ของคุณที่ manager.line.biz`, 'error');
  } else if (kind === 'forbidden') {
    toast(`LINE ปฏิเสธการส่ง — ตรวจสอบสิทธิ์ Channel Access Token ที่หน้าตั้งค่า (${settingsPath})`, 'error');
  } else {
    toast(`ส่ง LINE ไม่สำเร็จ: ${err?.message || 'ไม่ทราบสาเหตุ'}`, 'error');
  }
}

// ─── Local date string (YYYY-MM-DD in device timezone, not UTC) ───────────────
export const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Clipboard helper (with execCommand fallback for Safari/iOS) ───────────────
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ─── Math helpers ─────────────────────────────────────────────

export const safeFloat = (val) => Number.isFinite(parseFloat(val)) ? parseFloat(val) : 0;

export const calculateEndTime = (startTime, hours) => {
  if (!startTime || !hours) return '';
  const [h, m] = startTime.split(':').map(Number);
  const totalMins = h * 60 + m + parseFloat(hours) * 60;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = Math.round(totalMins % 60);
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

export const calculateHours = (startTime, endTime) => {
  if (!startTime || !endTime) return '1';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60;
  return (Math.round(((end - start) / 60) * 2) / 2).toString();
};

// ─── Student login code ───────────────────────────────────────

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

const thaiNameToLatinPrefix = (rawName) => {
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
};

export const buildStudentLoginCode = (storedCode, name) => {
  if (!storedCode || !name) return '';
  const prefix = thaiNameToLatinPrefix(name);
  if (!prefix) return '';
  return `${prefix}${storedCode}`.toUpperCase();
};

export const generateStudentLoginCode = (name, existingStudents, excludeStudentId) => {
  const prefix = thaiNameToLatinPrefix(name);
  if (!prefix) return '';
  const usedCodes = new Set(
    (existingStudents || [])
      .filter(s => s[STUDENT.DELETED] !== 'TRUE' && s[STUDENT.ID] !== excludeStudentId)
      .map(s => buildStudentLoginCode(s[STUDENT.NICKNAME], s[STUDENT.NAME]))
      .filter(Boolean)
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const candidate = `${prefix}${num}`;
    if (!usedCodes.has(candidate)) return num;
  }
  return null;
};

export const generateGroupCode = (existingGroups = []) => {
  const usedCodes = new Set(
    (existingGroups || [])
      .filter(g => g[GROUP.DELETED] !== 'TRUE')
      .map(g => g[GROUP.CODE])
      .filter(Boolean)
  );
  for (let attempt = 0; attempt < 90; attempt++) {
    const code = 'G' + String(Math.floor(Math.random() * 90) + 10);
    if (!usedCodes.has(code)) return code;
  }
  return 'G' + String(Math.floor(Math.random() * 90) + 10);
};

// ─── Schedule helpers ─────────────────────────────────────────

export const scheduleOccursOnDate = (schedule, dateStr) => {
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
};

export const getOverdueSchedules = (schedules, sessions, todayStr, cancellations = []) => {
  const now = new Date();
  const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const cancelledKeys = new Set(
    (cancellations || []).map(c => `${c[CANCELLATION.SCHEDULE_ID]}__${c[CANCELLATION.ORIGINAL_DATE]}`)
  );
  const results = [];
  schedules.forEach((s, index) => {
    if (s[SCHEDULE.DELETED] === 'TRUE') return;
    const repeatType = s[SCHEDULE.REPEAT_TYPE];
    const datesToCheck = [];
    if (!repeatType || repeatType === 'none') {
      datesToCheck.push(s[SCHEDULE.DATE]);
    } else {
      const startDate = s[SCHEDULE.DATE];
      const untilDate = s[SCHEDULE.REPEAT_UNTIL] || todayStr;
      const interval = repeatType === 'weekly' ? 7 : 14;
      let cur = startDate;
      while (cur <= todayStr && cur <= untilDate) {
        datesToCheck.push(cur);
        const d = new Date(cur + 'T12:00:00');
        d.setDate(d.getDate() + interval);
        cur = d.toISOString().split('T')[0];
      }
    }
    datesToCheck.forEach(dateStr => {
      const isPastDate = dateStr < todayStr;
      const isPastTimeToday = dateStr === todayStr && s[SCHEDULE.TIME_END] <= currentHourMin;
      if (!isPastDate && !isPastTimeToday) return;
      if (cancelledKeys.has(`${s[SCHEDULE.ID]}__${dateStr}`)) return;
      const alreadyLogged = sessions.some(
        se => se[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]
          && se[SESSION.DATE] === dateStr
          && se[SESSION.DELETED] !== 'TRUE'
      );
      if (alreadyLogged) return;
      const alreadyPushed = results.some(r => r.data[SCHEDULE.ID] === s[SCHEDULE.ID] && r.dateStr === dateStr);
      if (alreadyPushed) return;
      results.push({ data: s, rowIndex: index + 2, dateStr });
    });
  });
  return results.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
};

export const computeStats = (students, sessions, invoices) => {
  const activeStudents = (students || []).filter(s => s[STUDENT.DELETED] !== 'TRUE');
  const validSessions = (sessions || []).filter(se => se[SESSION.DELETED] !== 'TRUE');
  const uniqueMap = new Map();
  validSessions.forEach(se => {
    if (!uniqueMap.has(se[SESSION.CREATED_AT]))
      uniqueMap.set(se[SESSION.CREATED_AT], safeFloat(se[SESSION.HOURS] || 0));
  });
  let totalHours = 0;
  uniqueMap.forEach(h => { totalHours += h; });
  const validInvoices = (invoices || []).filter(i => i[INVOICE.STATUS] !== 'VOID');
  const pendingRevenue = validInvoices
    .filter(i => i[INVOICE.STATUS] === 'UNPAID' || i[INVOICE.STATUS] === 'SENT')
    .reduce((sum, i) => sum + safeFloat(i[INVOICE.TOTAL] || 0), 0);
  const collectedRevenue = validInvoices
    .filter(i => i[INVOICE.STATUS] === 'PAID')
    .reduce((sum, i) => sum + safeFloat(i[INVOICE.TOTAL] || 0), 0);
  return { totalStudents: activeStudents.length, totalHours, pendingRevenue, collectedRevenue };
};

// ─── Duration formatter ───────────────────────────────────────
export const formatMins = (mins) => {
  if (mins < 60) return `${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mins < 60 * 24) return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
  const d = Math.floor(mins / (60 * 24));
  if (mins < 60 * 24 * 30) return `${d} วัน`;
  const mo = Math.floor(mins / (60 * 24 * 30));
  if (mins < 60 * 24 * 365) return `${mo} เดือน`;
  return `${Math.floor(mins / (60 * 24 * 365))} ปี`;
};

// ─── LINE message builders ────────────────────────────────────

// แทนตัวแปร {key} ในข้อความ template แล้วยุบบรรทัดว่างซ้ำ
const fillSysTpl = (tpl, vars) => {
  let s = tpl;
  for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v || '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
};

export const buildLineFootnote = ({ portalUrl, studentCode, groupCode, dbId } = {}) => {
  const base = portalUrl || (typeof window !== 'undefined' ? `${window.location.origin}/portal` : '');
  const lines = ['', '— — —', '📌 ดูประวัติการเรียน + บิล:'];
  if (base) lines.push(base);
  if (studentCode) lines.push(`รหัสของคุณ: ${studentCode}`);
  if (groupCode) lines.push(`รหัสกลุ่ม: ${groupCode}`);
  if (dbId) lines.push(`(DB: ${dbId.slice(0, 8)}…)`);
  return lines.join('\n');
};

const DEFAULT_TPL_PORTAL_REMINDER =
`สวัสดีครับคุณ{name} 😊
ใกล้ถึงเวลาเรียนแล้วนะครับ{subject}
{time}

� เข้า Portal เพื่อกดลิงก์เข้าห้องเรียนได้เลยนะครับ:
👉 {url}
Class Code: {class_code}
Login Code: {code}`;

export const buildPortalMessage = ({ studentName, subject, timeStart, timeEnd, portalUrl, stuCode, settingsRow }) => {
  const tpl = settingsRow?.[SETTINGS.MSG_PORTAL_REMINDER]?.trim() || DEFAULT_TPL_PORTAL_REMINDER;
  const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
  return fillSysTpl(tpl, {
    name: studentName || '',
    subject: subject ? ` วิชา ${subject}` : '',
    time: timeStart ? `🕐 เวลา: ${timeStart}${timeEnd ? `–${timeEnd}` : ''} น.` : '',
    url: portalUrl ? `${portalUrl}` : '',
    code: stuCode || '',
    class_code: classCode || '',
  });
};

const formatMemberNames = (members) => {
  if (!members || members.length === 0) return '';
  const names = members.map(m => m[STUDENT.NAME] || '').filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} และ ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} และ ${names[names.length - 1]}`;
};

const DEFAULT_TPL_GROUP_PORTAL_INTRO =
`สวัสดีครับ {member_names} กลุ่ม{group} 😊

สามารถเข้า Student Portal เพื่อดูตารางเรียน คะแนน และข้อมูลการเรียนได้เลยนะครับ

📚 ลิงก์เข้าระบบ:
👉 {url}
Class Code: {class_code}
Group Login Code: {group_code}
{individual_codes}`;

export const buildGroupPortalIntroMessage = ({ groupName, groupCode, groupMembers, portalUrl, settingsRow }) => {
  const tpl = settingsRow?.[SETTINGS.MSG_GROUP_PORTAL_INTRO]?.trim() || DEFAULT_TPL_GROUP_PORTAL_INTRO;
  const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
  
  const memberNames = formatMemberNames(groupMembers);
  
  let individualCodes = '';
  if (groupMembers && groupMembers.length > 0) {
    const lines = ['หรือรายบุคคล'];
    groupMembers.forEach(member => {
      const code = buildStudentLoginCode(member[STUDENT.NICKNAME], member[STUDENT.NAME]);
      lines.push(`${member[STUDENT.NAME]} Login Code: ${code}`);
    });
    individualCodes = lines.join('\n');
  }
  
  return fillSysTpl(tpl, { 
    member_names: memberNames,
    group: groupName ? ` ${groupName}` : '', 
    url: portalUrl || '', 
    class_code: classCode || '',
    group_code: groupCode || '',
    individual_codes: individualCodes
  });
};

const DEFAULT_TPL_PORTAL_INTRO =
`สวัสดีครับคุณ{name} 😊

สามารถเข้า Student Portal เพื่อดูตารางเรียน คะแนน และข้อมูลการเรียนได้เลยนะครับ

📚 ลิงก์เข้าระบบ:
👉 {url}
Class Code: {class_code}
Login Code: {code}`;

export const buildPortalIntroMessage = ({ studentName, portalUrl, stuCode, settingsRow }) => {
  const tpl = settingsRow?.[SETTINGS.MSG_PORTAL_INTRO]?.trim() || DEFAULT_TPL_PORTAL_INTRO;
  const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
  return fillSysTpl(tpl, { name: studentName || '', url: portalUrl || '', code: stuCode || '', class_code: classCode || '' });
};

const DEFAULT_TPL_GROUP_PORTAL_REMINDER =
`สวัสดีครับคุณ{name} 😊
ใกล้ถึงเวลาเรียน{group}แล้วนะครับ{subject}
{time}

� เข้า Portal เพื่อกดลิงก์เข้าห้องเรียนได้เลยนะครับ:
👉 {url}
Class Code: {class_code}
Login Code: {code}`;

export const buildGroupPortalMessage = ({ groupName, studentName, subject, timeStart, timeEnd, portalUrl, stuCode, settingsRow }) => {
  const tpl = settingsRow?.[SETTINGS.MSG_GROUP_PORTAL_REMINDER]?.trim() || DEFAULT_TPL_GROUP_PORTAL_REMINDER;
  const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
  return fillSysTpl(tpl, {
    name: studentName || '',
    group: groupName ? `กลุ่ม ${groupName}` : '',
    subject: subject ? ` วิชา ${subject}` : '',
    time: timeStart ? `🕐 เวลา: ${timeStart}${timeEnd ? `–${timeEnd}` : ''} น.` : '',
    url: portalUrl || '',
    code: stuCode || '',
    class_code: classCode || '',
  });
};

const DEFAULT_TPL_ZOOM =
`🎥 ลิงก์เข้าเรียน Zoom ครับ

สวัสดีครับคุณ{name} 😊
ใกล้ถึงเวลาเรียนแล้วนะครับ{subject}
{time}

🔗 {url}

กดลิงก์เข้าห้องเรียนได้เลยครับ เจอกันนะครับ 🌟`;

export const buildZoomMessage = ({ studentName, subject, timeStart, timeEnd, zoomLink, footnote = '', settingsRow }) => {
  const tpl = settingsRow?.[SETTINGS.MSG_ZOOM]?.trim() || DEFAULT_TPL_ZOOM;
  const body = fillSysTpl(tpl, {
    name: studentName || '',
    subject: subject ? ` วิชา ${subject}` : '',
    time: timeStart ? `🕐 เวลา: ${timeStart}${timeEnd ? `–${timeEnd}` : ''} น.` : '',
    url: zoomLink || '',
  });
  return footnote ? `${body}\n${footnote}` : body;
};

export const buildInvoiceLineMessage = ({ instituteName, studentName, invoiceNumber, date, dueDate, items, totalHours, totalAmount, status, footnote = '' }) => {
  const lines = [
    '🧾 ใบแจ้งชำระค่าเรียน',
    `สถาบัน: ${instituteName}`,
    '',
    `เรียนคุณ ${studentName} ครับ`,
    `เลขที่บิล: ${invoiceNumber}`,
    date ? `วันที่ออกบิล: ${date}` : '',
    dueDate ? `กำหนดชำระ: ${dueDate}` : '',
    '',
    '— รายละเอียดคาบเรียน —',
  ];
  (items || []).forEach(it => {
    lines.push(`• ${it.date} | ${it.subject || INVOICE_LINE_LABEL} | ${it.hours} ชม. | ${safeFloat(it.amount).toLocaleString()} บาท`);
  });
  lines.push('');
  lines.push(`รวมชั่วโมง: ${totalHours} ชม.`);
  lines.push(`ยอดชำระทั้งหมด: ${safeFloat(totalAmount).toLocaleString()} บาท`);
  if (status === 'PAID') {
    lines.push('');
    lines.push('✅ สถานะ: ชำระเงินเรียบร้อยแล้วครับ ขอบคุณครับ 🙏');
  } else {
    lines.push('');
    lines.push('กรุณาโอนชำระภายในกำหนดด้วยนะครับ ขอบคุณครับ 🙏');
  }
  lines.push('');
  lines.push(`— ${instituteName}`);
  if (footnote) lines.push(footnote);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
};

// ─── Image / PDF helpers ──────────────────────────────────────

export async function resizeToBase64(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => reject(new Error('ไม่สามารถประมวลผลไฟล์ภาพได้'));
    img.src = url;
  });
}

export async function waitForImages(el) {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(imgs.map(img => new Promise(resolve => {
    if (img.complete && img.naturalWidth > 0) return resolve();
    img.onload = resolve;
    img.onerror = resolve;
  })));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export async function elementToJpegDataUrl(elementId) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('ไม่พบเอกสารที่จะแปลงเป็นรูปภาพ');
  await waitForImages(el);
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, imageTimeout: 15000, logging: false });
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportElementAsJPG(elementId, filename, toast) {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    await waitForImages(el);
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { scale: 4, useCORS: true, allowTaint: true, imageTimeout: 15000, logging: false });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 1.0);
    link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } catch (e) { toast('ไม่สามารถสร้าง JPG ได้', 'error'); }
}

export async function exportElementAsPDF(elementId, filename, toast) {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    await waitForImages(el);
    const [html2canvas, { jsPDF }] = await Promise.all([
      import('html2canvas').then(m => m.default),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(el, { scale: 4, useCORS: true, allowTaint: true, imageTimeout: 15000, logging: false });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pw, (canvas.height * pw) / canvas.width);
    pdf.save(filename);
  } catch (e) { toast('ไม่สามารถสร้าง PDF ได้', 'error'); }
}

export async function generatePromptPayQRCode(promptpayId, amount) {
  if (!promptpayId) return null;
  try {
    const payload = generatePayload(promptpayId, { amount: parseFloat(amount.toFixed(2)) });
    const size = 300;
    const qrDataUrl = await Promise.race([
      QRCode.toDataURL(payload, { width: size, margin: 1, errorCorrectionLevel: 'H' }),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
    ]);
    return await new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const qrImg = new Image();
      qrImg.onload = () => {
        ctx.drawImage(qrImg, 0, 0, size, size);
        const logoSize = size * 0.22;
        const cx = size / 2; const cy = size / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, logoSize / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.onload = () => {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, logoSize / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(logo, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
          ctx.restore();
          resolve(canvas.toDataURL('image/png'));
        };
        logo.onerror = () => resolve(qrDataUrl);
        logo.src = 'https://upload.wikimedia.org/wikipedia/th/c/c8/PromptPay_logo.png';
      };
      qrImg.onerror = () => resolve(null);
      qrImg.src = qrDataUrl;
    });
  } catch (err) {
    console.error('สร้าง PromptPay QR Code ไม่สำเร็จ:', err);
    return null;
  }
}
