// @ts-nocheck
// Schema column-index constants for all Google Sheets tables
import { SUBJECT_PRESETS as _SUBJECT_PRESETS, PUBLISHED_SHEET_ID as _PUBLISHED_SHEET_ID } from './appConfig';

export const STUDENT = { ID: 0, NAME: 1, SUBJECT: 2, BIRTHDATE: 3, NICKNAME: 4, RATE: 5, DELETED: 7, CREATED_AT: 8, PACKAGE_HOURS: 10 };
export const SESSION = { ID: 0, STUDENT_ID: 1, DATE: 2, SUBJECT: 3, HOURS: 4, NOTE: 5, INVOICED: 6, INVOICE_ID: 7, DELETED: 8, CREATED_AT: 9, LISTENING_SCORE: 10, SPEAKING_SCORE: 11, READING_SCORE: 12, WRITING_SCORE: 13, GROUP_ID: 14 };
export const SCHEDULE = { ID: 0, STUDENT_ID: 1, DATE: 2, SUBJECT: 3, HOURS: 4, NOTE: 5, REPEAT_TYPE: 6, REPEAT_UNTIL: 7, TIME_START: 8, TIME_END: 9, DELETED: 10, CREATED_AT: 11, GCAL_EVENT_ID: 12, GROUP_ID: 14 };
export const CANCELLATION = { ID: 0, SCHEDULE_ID: 1, STUDENT_ID: 2, ORIGINAL_DATE: 3, REASON: 4, RESCHEDULED_TO: 5, NEW_SCHEDULE_ID: 6, CANCELLED_AT: 7, NOTE: 8 };
// feedback sheet — กล่องข้อเสนอแนะสำหรับครู; AI ผู้ช่วย (Claude) อ่านผ่าน GViz CSV เพื่อนำไปพัฒนาระบบ
export const FEEDBACK = { ID: 0, DATE: 1, CATEGORY: 2, MESSAGE: 3, STATUS: 4, CREATED_AT: 5 };
export const INVOICE = { ID: 0, NUMBER: 1, STUDENT_ID: 2, DATE: 3, DUE_DATE: 4, CURRENCY: 5, TOTAL_HOURS: 6, RATE: 7, SUBTOTAL: 8, DISCOUNT: 9, TAX: 10, TOTAL: 11, PAYMENT_METHOD: 12, STATUS: 13, NOTE: 14, CREATED_AT: 15, RECEIPT_ID: 16, LINE_SENT_AT: 17, GROUP_INVOICE_KEY: 18 };
export const RECEIPT = { ID: 0, NUMBER: 1, INVOICE_ID: 2, STUDENT_ID: 3, DATE: 4, PAYMENT_METHOD: 5, AMOUNT: 6, NOTE: 7, ISSUED_BY: 8, CREATED_AT: 9 };
export const INVOICE_ITEM = { ID: 0, INVOICE_ID: 1, SESSION_ID: 2, DATE: 3, SUBJECT: 4, HOURS: 5, RATE: 6, AMOUNT: 7, STUDENT_ID: 8 };
export const GROUP = { ID: 0, NAME: 1, STUDENT_IDS: 2, LINE_GROUP_ID: 3, DEFAULT_SUBJECT: 4, DELETED: 5, CREATED_AT: 6, CODE: 7, ZOOM_LINK: 8, SCHEDULE_DAY: 9, SCHEDULE_TIME: 10, PACKAGE_HOURS: 11, PACKAGE_HOURS_REMAINING: 12, PACKAGE_RATE: 13 };
// ZOOM_LINK/TEACHER_LINE_USER_ID/ZOOM_AUTO_REMINDER เพิ่มต่อท้าย (index 21-23) ต้องตรงกับ worker.js
export const SETTINGS = { INSTITUTE_NAME: 0, UNUSED_1: 1, ADDRESS: 2, PHONE: 3, TAX_ID: 4, DEFAULT_RATE: 5, DELETED: 6, TAX_RATE: 7, PREFIX: 8, COUNTER: 9, PAYMENT_METHODS: 10, CURRENCY: 11, DB_ID: 12, PROMPTPAY_ID: 13, ACCENT_COLOR: 14, FONT_FAMILY: 15, FOOTER_NOTE: 16, LOGO_URL: 17, SIGNATURE_URL: 18, LINE_TOKEN: 19, LINE_WORKER_URL: 20, ZOOM_LINK: 21, TEACHER_LINE_USER_ID: 22, ZOOM_AUTO_REMINDER: 23, NOTIFY_TEACHER_40MIN: 24, NOTIFY_STUDENT_30MIN: 25, SEND_ZOOM_LINK: 26, SEND_INVOICE_RECEIPT: 27, SEND_TEMPLATES: 28, ZOOM_LINKS_POOL: 29, VIDEO_CALL_ENABLED: 30, MSG_PORTAL_REMINDER: 31, MSG_GROUP_PORTAL_REMINDER: 32, MSG_PORTAL_INTRO: 33, MSG_GROUP_PORTAL_INTRO: 34, MSG_ZOOM: 35, CLASS_CODE: 36 };

export const STUDENT_LINE_USER_ID = 9;  // column J ใน students sheet
export const STUDENT_LINE_GROUP_ID = 11; // column L ใน students sheet

// UNUSED_1 (column B ใน settings) = สถานะเปิด/ปิด LINE OA ทั้งระบบ
export const isLineOAEnabled = (settingsRow) => settingsRow ? settingsRow[SETTINGS.UNUSED_1] !== 'FALSE' : true;

// guard รวม: OA เปิด + token + worker URL ครบ — ใช้ก่อนทุก sendLine call
export const canSendLine = (settingsRow) =>
  isLineOAEnabled(settingsRow) &&
  !!(settingsRow?.[SETTINGS.LINE_TOKEN]?.trim()) &&
  !!(settingsRow?.[SETTINGS.LINE_WORKER_URL]?.trim());

// true = ใช้ระบบวิดีโอคอลในตัวแอป (Classroom), false = ใช้ลิงก์ Zoom ภายนอก
export const isVideoCallEnabled = (settingsRow) => settingsRow?.[SETTINGS.VIDEO_CALL_ENABLED] !== 'FALSE';

// Group helpers
export const groupStudentIds = (groupRow) => (groupRow?.[GROUP.STUDENT_IDS] || '').split(',').map(s => s.trim()).filter(Boolean);
export const isGroupRow = (row, groupIdIndex) => !!(row?.[groupIdIndex] || '').trim();
export const groupOccurrenceKey = (groupId, dateStr, timeStart) => `${groupId}_${dateStr}_${timeStart}`;

// Spreadsheet ID สาธารณะ (เปิดเป็น Anyone with link → Viewer) สำหรับหน้า /portal
// ← แก้ค่าในไฟล์ src/lib/appConfig.js
export const PUBLISHED_SHEET_ID = _PUBLISHED_SHEET_ID;

// ← แก้รายการวิชาในไฟล์ src/lib/appConfig.js
export const SUBJECT_PRESETS = _SUBJECT_PRESETS;

export const STUDENT_COLORS = ['#B5D4F4', '#9FE1CB', '#FAC775', '#F4C0D1', '#CED0F6', '#C0DD97', '#F5C4B3'];
export const STUDENT_TEXT_COLORS = ['#0C447C', '#085041', '#633806', '#72243E', '#3C3489', '#27500A', '#712B13'];

// Logo สถาบัน (base64 SVG — placeholder wordmark, swap for real artwork)
export const LOGO_B64 = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTYwIiB2aWV3Qm94PSIwIDAgMTYwIDE2MCI+CiAgPHJlY3Qgd2lkdGg9IjE2MCIgaGVpZ2h0PSIxNjAiIHJ4PSIzMiIgZmlsbD0iIzQzMzhjYSIvPgogIDx0ZXh0IHg9IjgwIiB5PSIxMDQiIGZvbnQtZmFtaWx5PSJTZWdvZSBVSSwgQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNjQiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiNmZmZmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlNIPC90ZXh0Pgo8L3N2Zz4=";
