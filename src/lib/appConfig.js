// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// appConfig.js — ค่าที่ต้อง customize ทั้งหมดเมื่อนำระบบไปใช้กับสถาบันใหม่
// All owner-specific values live here. Edit this file to rebrand the app.
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// BRANDING — ชื่อแอปและข้อความบนหน้า Login
// ══════════════════════════════════════════════════════════════════════════════

// ชื่อแอปหลัก — แสดงบน Login page, Sidebar, และ PWA home screen
export const APP_NAME = 'SHIFTHIGHBURY';

// คำบรรยายใต้ชื่อแอปบนหน้า Login
export const APP_SUBTITLE = 'ระบบจัดการติวสายวิทย์-คณิต-วิศวกรรมโยธา';

// คำอธิบายแอปใน PWA manifest (ปรากฏตอน install บนมือถือ)
export const APP_PWA_DESCRIPTION = 'Science, Math & Civil Engineering tutoring portal';

// ป้ายกำกับช่อง "ครูผู้สอน" บนหน้า Login (บรรทัดบน)
export const TEACHER_ROLE_LABEL = 'พี่แพท';

// ป้ายกำกับรอง "ครูผู้สอน" บนหน้า Login (บรรทัดล่าง)
export const TEACHER_ROLE_SUBLABEL = 'ผู้สอน / Admin';

// ข้อความปุ่ม Student Portal บนหน้า Login
export const STUDENT_PORTAL_LINK_TEXT = 'เข้า Student Portal →';

// ข้อความใต้ปุ่ม Student Portal อธิบายวิธีเข้าระบบ
export const STUDENT_CODE_HINT = 'ใช้รหัสที่ได้รับจากพี่แพทเข้าระบบได้เลยค่ะ';

// URL ของ Privacy Policy — แสดงที่ footer หน้า Login (จำเป็นสำหรับ Google OAuth verification)
// ไฟล์จริงอยู่ที่ public/privacy.html และถูก serve ที่ /privacy ผ่าน vercel.json rewrite
export const PRIVACY_POLICY_URL = '/privacy';

// URL ของ Terms of Use — ใส่ '' เพื่อซ่อน ถ้ายังไม่มี
export const TERMS_OF_USE_URL = '';

// อีเมลติดต่อสำหรับแสดงใน Privacy Policy และเอกสารสาธารณะ
export const SUPPORT_EMAIL = 'phatwich.pp@gmail.com';

// URL หลักของแอปที่ deploy แล้ว — ใช้ใน Privacy Policy (footer และ contact section)
// TODO: อัปเดตเป็น URL จริงหลัง deploy ขึ้น Vercel
export const HOMEPAGE_URL = 'https://shifthighbury.vercel.app';

// ══════════════════════════════════════════════════════════════════════════════
// SUBJECT & BUSINESS — วิชา ป้ายเอกสาร และเหตุผลยกเลิกคลาส
// ══════════════════════════════════════════════════════════════════════════════

// รายการวิชาที่แสดงใน dropdown เลือกวิชา (SubjectComboInput)
// TODO: นี่คือรายการตัวอย่าง — แก้ให้ตรงกับวิชาที่สอนจริง
export const SUBJECT_PRESETS = [
  'คณิตศาสตร์', 'ฟิสิกส์', 'เคมี', 'แคลคูลัส',
  'กลศาสตร์วิศวกรรม', 'การสำรวจ (Surveying)', 'วัสดุวิศวกรรม', 'อื่นๆ',
];

// ชื่อวิชา default ที่ใช้ใน Google Calendar เมื่อไม่ได้ระบุวิชา
export const DEFAULT_CALENDAR_SUBJECT = 'ติวพิเศษ';

// ชื่อแอปที่ต่อท้ายคำอธิบาย Google Calendar event ("บันทึกโดย ...")
export const CALENDAR_APP_NAME = 'SHIFTHIGHBURY';

// ป้ายหัวข้อใน Invoice สำหรับแต่ละ session (ใช้เมื่อไม่มีชื่อวิชา)
export const INVOICE_LINE_LABEL = 'ค่าเรียนพิเศษ';

// ป้ายหัวข้อในใบเสร็จรับเงินปกติ (ReceiptDocument)
export const RECEIPT_SERVICE_LABEL = 'ค่าเรียนพิเศษ';

// ป้ายหัวข้อในใบเสร็จเติมแพ็กเกจ (PackageReceiptDocument)
export const PACKAGE_RECEIPT_LABEL = 'แพ็กเกจชั่วโมงเรียนพิเศษ';

// ชื่อวิชา default ใน Invoice document เมื่อ session ไม่มีวิชา
export const INVOICE_DEFAULT_SUBJECT = 'ติวพิเศษ';

// รายการเหตุผลที่แสดงใน modal ยกเลิก/เลื่อนคลาส
export const CANCEL_CLASS_REASONS = [
  'นักเรียนขอเลื่อน',
  'นักเรียนติดธุระ',
  'นักเรียนป่วย',
  'พี่แพทขอเลื่อน',
  'พี่แพทติดธุระ',
  'พี่แพทป่วย',
  'วันหยุดนักขัตฤกษ์',
  'อื่นๆ',
];

// ป้ายกำกับ 4 หัวข้อประเมินผลรายคาบ (LogSessionModal, Dashboard, StudentPortal,
// GroupPortal, Students, ProgressReportDocument, PortalHelpModal ทั้งหมดอ่านจากที่นี่
// ที่เดียว — คอลัมน์ในชีตยังชื่อ listening/speaking/reading/writing_score เหมือนเดิม
// เพราะเป็นแค่ internal key ไม่ได้แสดงผลตรงๆ ให้ผู้ใช้เห็น)
// icon ต้องตรงกับชื่อ export จริงของ lucide-react
export const SKILL_LABELS = [
  { key: 'listening', label: 'ความเข้าใจเนื้อหา', icon: 'Brain' },
  { key: 'speaking', label: 'การคำนวณ/แก้โจทย์', icon: 'Calculator' },
  { key: 'reading', label: 'การบ้าน/แบบฝึกหัด', icon: 'BookOpen' },
  { key: 'writing', label: 'การมีส่วนร่วมในคาบ', icon: 'Users' },
];

// ══════════════════════════════════════════════════════════════════════════════
// LOCALIZATION — Timezone, ภาษา, สกุลเงิน
// ══════════════════════════════════════════════════════════════════════════════

// Timezone สำหรับนาฬิกาใน Sidebar และการแสดงเวลา
// รายการ timezone: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
export const APP_TIMEZONE = 'Asia/Bangkok';

// Locale สำหรับ toLocaleTimeString / toLocaleDateString
// เช่น 'th-TH', 'en-US', 'zh-TW'
export const APP_LOCALE = 'th-TH';

// สัญลักษณ์สกุลเงิน (ใช้แสดงในเอกสาร)
export const APP_CURRENCY_SYMBOL = '฿';

// VAT default (%) — ใช้เป็นค่าเริ่มต้นก่อนตั้งค่าจากหน้า Settings
export const DEFAULT_VAT_RATE = 7;

// ══════════════════════════════════════════════════════════════════════════════
// DATABASE — Google Sheets IDs
// ══════════════════════════════════════════════════════════════════════════════

// Spreadsheet ID ที่เปิดเป็น "Anyone with link → Viewer" สำหรับ Student Portal
// หลังสร้าง database ใหม่ ให้แชร์ link แล้วนำ ID (ส่วน /d/XXXX/edit) มาใส่ที่นี่
export const PUBLISHED_SHEET_ID = '';

// ชื่อไฟล์ Google Spreadsheet ที่ระบบจะค้นหาใน Google Drive ตอน login ครั้งแรก
// เปลี่ยนให้ตรงกับชื่อที่คุณต้องการตั้งให้ฐานข้อมูล
export const DATABASE_NAME = 'Shifthighbury_Database';
