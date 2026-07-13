// src/services/googleSheets.js
import { DATABASE_NAME } from '../lib/appConfig';

// ฟังก์ชันนี้ทำหน้าที่ถือ Master Key เดินไปหา Google เพื่อขอสร้าง Spreadsheet ใหม่
export async function setupNewDatabase(accessToken) {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: DATABASE_NAME },
      sheets: [
        { properties: { title: 'students' } },
        { properties: { title: 'sessions' } },
        { properties: { title: 'invoices' } },
        { properties: { title: 'invoice_items' } },
        { properties: { title: 'settings' } },
        { properties: { title: 'schedules' } },
        { properties: { title: 'groups' } },
        { properties: { title: 'receipts' } },
        { properties: { title: 'cancellations' } },
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`สร้างฐานข้อมูลไม่สำเร็จ: ${err?.error?.message || response.status}`);
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;

  // เขียน headers ทันทีหลังสร้าง — ถ้าข้ามขั้นนี้ไป UI จะโหลดข้อมูลผิดคอลัมน์ทั้งหมด
  await initDatabaseHeaders(accessToken, spreadsheetId);

  return spreadsheetId;
}

// ฟังก์ชันสำหรับเขียนหัวข้อคอลัมน์ (Headers) ลงในทั้ง 5 แผ่นงาน
export async function initDatabaseHeaders(accessToken, spreadsheetId) { //
  // เตรียมข้อมูลหัวตารางตาม Database Schema ในบรีฟ
  const data = [ //
    { //
      range: 'students!A1:L1', // ขยายจาก K1 เป็น L1 เพื่อรองรับ line_group_id (LINE Group Chat สำหรับเรียนกลุ่ม)
      values: [['id', 'name', 'subject', 'phone', 'line_id', 'rate_per_hour', 'note', 'is_deleted', 'created_at', 'line_user_id', 'package_hours_remaining', 'line_group_id']] //
    }, //
    { //
      // ขยายจาก J1 เป็น O1: K-N คือคะแนน 4 ทักษะ (เดิมเติมทีหลังผ่าน migrateSchemaV2 เท่านั้น
      // ฐานข้อมูลใหม่จะได้ครบตั้งแต่ต้น ไม่ต้อง migrate), O คือ group_id (เรียนกลุ่ม schema v5)
      range: 'sessions!A1:O1', //
      values: [['id', 'student_id', 'date', 'subject', 'hours', 'note', 'invoiced', 'invoice_id', 'is_deleted', 'created_at', 'listening_score', 'speaking_score', 'reading_score', 'writing_score', 'group_id']] //
    }, //
    { //
      // ขยายจาก Q1 เป็น S1: R คือ line_sent_at (เดิมเติมทีหลังผ่าน migrateSchemaV3), S คือ
      // group_invoice_key — ใช้ผูกหลาย invoice rows (คนละคนแต่ออกบิลพร้อมกัน) เข้าด้วยกัน
      // ตอนแสดงผล/พิมพ์ PDF เป็นใบเดียว (ดู addGroupInvoicesComplete)
      range: 'invoices!A1:S1', //
      values: [['id', 'invoice_number', 'student_id', 'issue_date', 'due_date', 'language', 'total_hours', 'rate_used', 'subtotal', 'vat_rate', 'vat_amount', 'total_amount', 'payment_method', 'status', 'note', 'created_at', 'receipt_id', 'line_sent_at', 'group_invoice_key']] //
    }, //
    { //
      // ขยายจาก H1 เป็น I1 เพื่อรองรับ student_id — เผื่อ debug/join ตรง ๆ แม้ invoice_id จะบอกอยู่แล้ว
      range: 'invoice_items!A1:I1', //
      values: [['id', 'invoice_id', 'session_id', 'date', 'subject', 'hours', 'rate', 'amount', 'student_id']] //
    }, //
    { //
      // ขยายจาก M1 เป็น O1: N คือ override_zoom_link (ลิงก์ Zoom เฉพาะคาบนี้), O คือ group_id
      // (เรียนกลุ่ม schema v5 — ตั้งใจไม่เก็บ group_occurrence_key เป็น column เพราะคำนวณสด
      // ตอน render จาก group_id + วันที่ที่ expand ได้ + time_start แทน ใช้ได้ทั้ง one-time
      // และ recurring โดยไม่ต้องมี column แยก)
      range: 'schedules!A1:O1', //
      values: [['id', 'student_id', 'date', 'subject', 'hours', 'note', 'repeat_type', 'repeat_until', 'time_start', 'time_end', 'is_deleted', 'created_at', 'gcal_event_id', 'override_zoom_link', 'group_id']] //
    }, //
    { //
      // sheet ใหม่ schema v5 — กลุ่มนักเรียน (เครื่องมือช่วยลงข้อมูลทีเดียว ไม่ใช่หน่วยบัญชีใหม่)
      // C: student_ids เก็บแบบ comma-separated เช่น "STU-111,STU-222,STU-333"
      range: 'groups!A1:K1', //
      values: [['id', 'name', 'student_ids', 'line_group_id', 'default_subject', 'is_deleted', 'created_at']] //
    }, //
    { //
      range: 'receipts!A1:J1', //
      values: [['id', 'receipt_number', 'invoice_id', 'student_id', 'issue_date', 'payment_method', 'amount', 'note', 'issued_by', 'created_at']] //
    }, //
    { //
      range: 'cancellations!A1:I1', //
      values: [['id', 'schedule_id', 'student_id', 'original_date', 'reason', 'rescheduled_to', 'new_schedule_id', 'cancelled_at', 'note']] //
    }, //
    { //
      range: 'settings!A1:AJ1', // ขยาย range: AF-AJ = indices 31-35 (msg templates)
      values: [['institute_name', 'line_oa_enabled', 'address', 'phone', 'tax_id', 'default_rate', 'vat_enabled', 'vat_rate', 'invoice_prefix', 'invoice_running_number', 'payment_methods', 'default_language', 'spreadsheet_id', 'promptpay_id', 'accent_color', 'font_family', 'footer_note', 'logo_url', 'signature_url', 'line_channel_token', 'line_worker_url', 'zoom_link', 'teacher_line_user_id', 'zoom_auto_reminder', 'notify_teacher_40min', 'notify_student_30min', 'send_zoom_link', 'send_invoice_receipt', 'send_templates', 'zoom_links_pool', 'video_call_enabled', 'msg_portal_reminder', 'msg_group_portal_reminder', 'msg_portal_intro', 'msg_group_portal_intro', 'msg_zoom']] //
    } //
  ]; //

  // ส่งคำสั่งแบบรวดเดียว (batchUpdate) ไปที่ Google
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { //
    method: 'POST', //
    headers: { //
      'Authorization': `Bearer ${accessToken}`, //
      'Content-Type': 'application/json' //
    }, //
    body: JSON.stringify({ //
      valueInputOption: 'RAW', //
      data: data //
    }) //
  }); //
} //

// ฟังก์ชันสำหรับค้นหาไฟล์ฐานข้อมูลเดิมใน Google Drive
export async function findExistingDatabase(accessToken) { //
  // ค้นหาไฟล์ฐานข้อมูลตามชื่อที่ตั้งใน appConfig.js (DATABASE_NAME)
  const query = encodeURIComponent(`name='${DATABASE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`); //
  
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, { //
    headers: { //
      'Authorization': `Bearer ${accessToken}` //
    } //
  }); //

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`ค้นหาไฟล์ฐานข้อมูลใน Google Drive ไม่สำเร็จ: ${err?.error?.message || response.status}`);
  }

  const data = await response.json(); //
  
  // ถ้าเจอไฟล์เดิม ให้ส่งรหัสไฟล์ (ID) แรกที่เจอ กลับไปใช้งาน
  if (data.files && data.files.length > 0) { //
    return data.files[0].id; //
  } //
  return null; // ถ้าไม่เจอเลย ให้ส่งค่าว่างกลับไป
} //

// ฟังก์ชันดึงรายชื่อนักเรียนทั้งหมดจากชีต
// หมายเหตุ: ขยาย range จาก A:K เป็น A:L เพื่อรองรับคอลัมน์ใหม่ line_group_id (index 11)
// ใช้เก็บ LINE groupId ของห้องเรียนกลุ่ม (เรียนหลายคน+ผู้ปกครองอยู่ใน LINE group เดียวกัน)
// ของเดิม A:K จะตัดคอลัมน์ L ทิ้งเงียบๆ ตอนอ่าน ทำให้ดูเหมือนค่าที่บันทึกไว้ "หายไป"
export async function getStudents(accessToken, spreadsheetId) { //
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!A:L`, { //
    headers: { 'Authorization': `Bearer ${accessToken}` } //
  }); //
  if (!response.ok) { //
    const err = await response.json().catch(() => ({})); //
    throw new Error(`โหลดข้อมูลนักเรียนไม่สำเร็จ: ${err?.error?.message || response.status}`); //
  } //
  const data = await response.json(); //
  return data.values ? data.values.slice(1).map(parseStudentRow) : []; //
} //

// ฟังก์ชันเพิ่มนักเรียนใหม่ลงไปต่อท้ายตาราง (Append)
// ขยาย range เป็น A:L ด้วยเหตุผลเดียวกับ getStudents ด้านบน (รองรับ line_group_id)
export async function addStudent(accessToken, spreadsheetId, studentData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!A:L:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [studentData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`เพิ่มนักเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// ฟังก์ชันสำหรับบันทึกข้อมูลใบแจ้งค่าเรียน และรายการย่อยลง Google Sheets พร้อมกัน
// ขยาย range invoices จาก A:R เป็น A:S (group_invoice_key) และ invoice_items จาก A:H
// เป็น A:I (student_id) — schema v5 รองรับเรียนกลุ่ม ใช้กับบิลเดี่ยวตามปกติ (ไม่ใช่บิลรวม
// หลายคน) — ถ้าต้องออกบิลรวมหลายคนพร้อมกันให้ใช้ addGroupInvoicesComplete แทน
export async function addInvoiceComplete(accessToken, spreadsheetId, invoiceRow, itemsRows) { //
  // 1. ส่งข้อมูลหลักไปบันทึกที่ชีต invoices
  const r1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!A:S:append?valueInputOption=USER_ENTERED`, { //
    method: 'POST', //
    headers: { //
      'Authorization': `Bearer ${accessToken}`, //
      'Content-Type': 'application/json' //
    }, //
    body: JSON.stringify({ values: [invoiceRow] }) //
  }); //
  if (!r1.ok) { //
    const err = await r1.json().catch(() => ({})); //
    throw new Error(`บันทึกใบแจ้งค่าเรียนไม่สำเร็จ: ${err?.error?.message || r1.status}`); //
  } //

  // 2. ส่งรายการคาบเรียนย่อยๆ ไปบันทึกที่ชีต invoice_items
  if (itemsRows.length > 0) { //
    const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoice_items!A:I:append?valueInputOption=USER_ENTERED`, { //
      method: 'POST', //
      headers: { //
        'Authorization': `Bearer ${accessToken}`, //
        'Content-Type': 'application/json' //
      }, //
      body: JSON.stringify({ values: itemsRows }) //
    }); //
    if (!r2.ok) { //
      const err = await r2.json().catch(() => ({})); //
      throw new Error(`บันทึกรายการคาบเรียนไม่สำเร็จ: ${err?.error?.message || r2.status}`); //
    } //
  } //
} //

// ฟังก์ชันสำหรับ "ออกบิลรวม" หลายคนพร้อมกัน (group billing) — ข้างหลังยังเป็นบิลแยกของ
// แต่ละคนทุกประการ (คิดเงิน/VAT/ประวัติย้อนหลังแยกรายคน 100%) แค่เขียนหลาย invoice rows
// + หลาย invoice_items rows ลงชีตในคำขอเดียว (2 API calls รวม แทนที่จะวน addInvoiceComplete
// ทีละคน) แล้ว tag group_invoice_key เดียวกันไว้ทุกแถว ให้ตอนแสดงผล/พิมพ์ PDF ดึงมารวม
// เป็นใบเดียวได้ — รับ invoicesWithItems = [{ invoiceRow, itemsRows }, ...] ต่อคน
export async function addGroupInvoicesComplete(accessToken, spreadsheetId, invoicesWithItems) {
  const allInvoiceRows = invoicesWithItems.map(x => x.invoiceRow);
  const allItemsRows = invoicesWithItems.flatMap(x => x.itemsRows || []);

  if (allInvoiceRows.length > 0) {
    const r1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!A:S:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: allInvoiceRows })
    });
    if (!r1.ok) {
      const err = await r1.json().catch(() => ({}));
      throw new Error(`บันทึกใบแจ้งค่าเรียนกลุ่มไม่สำเร็จ: ${err?.error?.message || r1.status}`);
    }
  }

  if (allItemsRows.length > 0) {
    const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoice_items!A:I:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: allItemsRows })
    });
    if (!r2.ok) {
      const err = await r2.json().catch(() => ({}));
      throw new Error(`บันทึกรายการคาบเรียนกลุ่มไม่สำเร็จ: ${err?.error?.message || r2.status}`);
    }
  }
}

// ฟังก์ชันสำหรับบันทึกการสอนรายครั้งลงชีต sessions
export async function addSession(accessToken, spreadsheetId, sessionData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/sessions!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [sessionData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`บันทึกคาบเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// ฟังก์ชันดึงข้อมูลคาบเรียนทั้งหมดจากชีต sessions
// ขยาย range จาก A:N เป็น A:O เพื่อรองรับคอลัมน์ใหม่ group_id (index 14, schema v5)
// แค่ tag ไว้สำหรับ filter/รวมบิลตามกลุ่ม ไม่กระทบการคำนวณชั่วโมง/เงินใด ๆ
export async function getSessions(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/sessions!A:O`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.values ? data.values.slice(1).map(parseSessionRow) : [];
}

// ฟังก์ชันสำหรับอัปเดตสถานะคาบเรียนว่า "ถูกเรียกเก็บเงินแล้ว" พร้อมผูกรหัส Invoice
export async function markSessionsAsInvoiced(accessToken, spreadsheetId, sessionsToUpdate) {
  const data = sessionsToUpdate.map(s => ({
    range: `sessions!G${s.rowIndex}:H${s.rowIndex}`,
    values: [['TRUE', s.invoiceId]]
  }));
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: data })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`อัปเดตสถานะคาบเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// ฟังก์ชันดึงข้อมูลการตั้งค่าสถาบัน
// หมายเหตุ: ขยาย range จาก A2:U2 เป็น A2:X2 เพื่อรองรับคอลัมน์ใหม่ที่เพิ่มต่อจาก
// line_worker_url (U) คือ V=zoom_link, W=teacher_line_user_id, X=zoom_auto_reminder
// (ของเดิม A2:U2 ตัดคอลัมน์ V-X ทิ้งเงียบๆ ตอนอ่าน ทำให้ดูเหมือนค่าที่บันทึกไว้ "หายไป")
export async function getSettings(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!A2:AK2`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!data.values) return null;
  const row = data.values[0] ? [...data.values[0]] : [];

  // If LINE token was moved to Cloudflare KV (placeholder '[kv]'), fetch the
  // real values from the worker so every page using settingsRow gets them automatically.
  const SIGNALING_URL = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_WEBRTC_SIGNALING_URL : null;
  const TEACHER_SECRET = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_TEACHER_SECRET : null;
  if (SIGNALING_URL && TEACHER_SECRET && (row[19] === '[kv]' || row[20] === '[kv]')) {
    try {
      const res = await fetch(`${SIGNALING_URL}/admin/line-config`, {
        headers: { 'X-Teacher-Token': TEACHER_SECRET },
      });
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.lineToken)     row[19] = cfg.lineToken;
        if (cfg.lineWorkerUrl) row[20] = cfg.lineWorkerUrl;
      }
    } catch (_) { /* silently ignore — fallback to whatever is in the row */ }
  }

  return row;
}

// ฟังก์ชันบันทึกการตั้งค่าสถาบัน
// หมายเหตุ: ขยาย range จาก A2:U2 เป็น A2:X2 ด้วยเหตุผลเดียวกับ getSettings ด้านบน —
// ของเดิมเขียนได้แค่ 21 ค่าแรก (A-U) ค่าตัวที่ 22-24 (V-X) ที่ส่งมาใน settingsData
// จะถูก Google Sheets API ตัดทิ้งไปเงียบๆ โดยไม่ error เพราะ request เขียนสำเร็จปกติ
export async function updateSettings(accessToken, spreadsheetId, settingsData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!A2:AK2?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [settingsData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`บันทึกการตั้งค่าไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// ฟังก์ชันดึงข้อมูลใบแจ้งค่าเรียนทั้งหมดจากตาราง invoices
// ขยาย range จาก A:R เป็น A:S เพื่อรองรับคอลัมน์ใหม่ group_invoice_key (index 18, schema v5)
export async function getInvoices(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!A:S`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.values ? data.values.slice(1).map(parseInvoiceRow) : [];
}

// ฟังก์ชันยกเลิกใบแจ้งค่าเรียน (Void) และทำลายพันธนาการของ Sessions คืนกลับมาเป็น FALSE
export async function voidInvoiceComplete(accessToken, spreadsheetId, invoiceRowIndex, sessionsToRevert) {
  // 1. วิ่งไปเปลี่ยนสถานะในชีต invoices ช่อง N (status) ให้กลายเป็น 'VOID'
  const r1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!N${invoiceRowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [['VOID']] })
  });
  if (!r1.ok) {
    const err = await r1.json().catch(() => ({}));
    throw new Error(`ยกเลิกใบแจ้งค่าเรียนไม่สำเร็จ: ${err?.error?.message || r1.status}`);
  }

  // 2. คืนค่าสถานะคาบเรียนในชีต sessions ช่อง G (invoiced) = 'FALSE' และ H (invoice_id) = ''
  if (sessionsToRevert.length > 0) {
    const data = sessionsToRevert.map(s => ({
      range: `sessions!G${s.rowIndex}:H${s.rowIndex}`,
      values: [['FALSE', '']]
    }));
    const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: data })
    });
    if (!r2.ok) {
      const err = await r2.json().catch(() => ({}));
      throw new Error(`คืนสถานะคาบเรียนไม่สำเร็จ: ${err?.error?.message || r2.status}`);
    }
  }
}
// --- เพิ่มฟังก์ชันนี้ต่อท้ายไฟล์ googleSheets.js ---

// ฟังก์ชันสำหรับอัปเดตข้อมูลนักเรียนรายคน (ใช้ทั้งตอนแก้ไข และตอนกด Soft Delete)
// หมายเหตุ: ขยาย range จาก A:K เป็น A:L เพื่อรองรับคอลัมน์ใหม่ line_group_id (index 11) —
// ต้องตรงกับ getStudents/addStudent ด้านบน ไม่งั้นตอนแก้ไขข้อมูลจะตัด column L ทิ้งทุกครั้ง
export async function updateStudent(accessToken, spreadsheetId, rowIndex, studentData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!A${rowIndex}:L${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [studentData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`แก้ไขข้อมูลนักเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// อัปเดตชั่วโมงแพ็กเกจเหมาจ่ายคงเหลือ (column K) — ใช้ตอนเติมแพ็กเกจ และตอนหักชั่วโมงอัตโนมัติเมื่อบันทึกคาบเรียน
export async function updateStudentPackageHours(accessToken, spreadsheetId, rowIndex, newHours) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!K${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [[newHours]] })
  });
}
// --- เพิ่มฟังก์ชันนี้ต่อท้ายไฟล์ googleSheets.js ---

// ฟังก์ชันสำหรับอัปเดตสถานะใบแจ้งค่าเรียน (เช่น เปลี่ยนจาก UNPAID เป็น SENT หรือ PAID)
export async function updateInvoiceStatus(accessToken, spreadsheetId, invoiceRowIndex, newStatus) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!N${invoiceRowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [[newStatus]]
    })
  });
}
// --- เพิ่มฟังก์ชันนี้ต่อท้ายไฟล์ googleSheets.js ---

// ฟังก์ชันสำหรับบันทึกคาบเรียนแบบกลุ่ม (ส่งข้อมูลหลายแถวพร้อมกันใน 1 API Call)
// ฟังก์ชันสำหรับแก้ไขข้อมูลคาบเรียนรายครั้ง
export async function updateSession(accessToken, spreadsheetId, rowIndex, sessionData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/sessions!A${rowIndex}:O${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [sessionData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`แก้ไขคาบเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// ฟังก์ชัน Soft Delete คาบเรียน (เซต is_deleted = TRUE)
export async function softDeleteSession(accessToken, spreadsheetId, rowIndex) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/sessions!I${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [['TRUE']] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ลบคาบเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// อัปเดตคะแนนประเมินผล 4 ทักษะของคาบเรียน (column K-N: listening, speaking, reading, writing)
export async function updateSessionScores(accessToken, spreadsheetId, rowIndex, scores) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/sessions!K${rowIndex}:N${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [scores] })
  });
}

export async function addSessionsBatch(accessToken, spreadsheetId, sessionsRows) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/sessions!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: sessionsRows
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`บันทึกคาบเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}
// ==================== SCHEDULES (ปฏิทินการสอน) ====================

// ขยาย range จาก A:N เป็น A:O เพื่อรองรับคอลัมน์ใหม่ group_id (index 14, schema v5) —
// ผูกว่าแถวนี้เป็นส่วนหนึ่งของคาบกลุ่มไหน (ว่าง = คาบเดี่ยว) ไม่เก็บ occurrence key แยก
// เพราะคำนวณสดตอน render จาก group_id + วันที่ + time_start แทน (ดูเหตุผลใน initDatabaseHeaders)
export async function getSchedules(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/schedules!A:O`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.values ? data.values.slice(1).map(parseScheduleRow) : [];
}

export async function addSchedule(accessToken, spreadsheetId, scheduleData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/schedules!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [scheduleData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`บันทึกตารางสอนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

export async function updateSchedule(accessToken, spreadsheetId, rowIndex, scheduleData) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/schedules!A${rowIndex}:O${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [scheduleData] })
  });
}

export async function softDeleteSchedule(accessToken, spreadsheetId, rowIndex) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/schedules!K${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [['TRUE']] })
  });
}

// ==================== RECEIPTS (ใบเสร็จรับเงิน) ====================

export async function getReceipts(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/receipts!A:J`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.values ? data.values.slice(1).map(parseReceiptRow) : [];
}

export async function addReceipt(accessToken, spreadsheetId, receiptData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/receipts!A:J:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [receiptData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`บันทึกใบเสร็จไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// อัปเดต invoice ว่ามีใบเสร็จแล้ว (column Q = receipt_id)
export async function linkReceiptToInvoice(accessToken, spreadsheetId, invoiceRowIndex, receiptId) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!Q${invoiceRowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[receiptId]] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ผูกใบเสร็จกับใบแจ้งค่าเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

export async function updateInvoiceCounter(accessToken, spreadsheetId, newCounter) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!J2?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[String(newCounter)]] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`อัปเดตเลขที่ใบแจ้งค่าเรียนไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// ==================== SETUP: เพิ่ม sheets ใหม่ใน DB ที่มีอยู่แล้ว ====================

export async function addMissingSheets(accessToken, spreadsheetId) {
  // ดึงรายชื่อ sheets ที่มีอยู่ก่อน
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const meta = await res.json();
  const existing = (meta.sheets || []).map(s => s.properties.title);

  const toAdd = [];
  if (!existing.includes('schedules')) toAdd.push({ properties: { title: 'schedules' } });
  if (!existing.includes('groups')) toAdd.push({ properties: { title: 'groups' } });
  if (!existing.includes('receipts')) toAdd.push({ properties: { title: 'receipts' } });
  if (!existing.includes('cancellations')) toAdd.push({ properties: { title: 'cancellations' } });
  if (!existing.includes('feedback')) toAdd.push({ properties: { title: 'feedback' } });

  if (toAdd.length === 0) return; // มีครบแล้ว

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: toAdd.map(s => ({ addSheet: s })) })
  });

  // เพิ่ม headers ให้ sheets ใหม่
  const headers = [];
  if (!existing.includes('schedules')) {
    headers.push({
      range: 'schedules!A1:O1',
      values: [['id', 'student_id', 'date', 'subject', 'hours', 'note', 'repeat_type', 'repeat_until', 'time_start', 'time_end', 'is_deleted', 'created_at', 'gcal_event_id', 'override_zoom_link', 'group_id']]
    });
  }
  if (!existing.includes('groups')) {
    headers.push({
      range: 'groups!A1:K1',
      values: [['id', 'name', 'student_ids', 'line_group_id', 'default_subject', 'is_deleted', 'created_at', 'code', 'zoom_link', 'schedule_day', 'schedule_time']]
    });
  }
  if (!existing.includes('receipts')) {
    headers.push({
      range: 'receipts!A1:J1',
      values: [['id', 'receipt_number', 'invoice_id', 'student_id', 'issue_date', 'payment_method', 'amount', 'note', 'issued_by', 'created_at']]
    });
  }
  if (!existing.includes('cancellations')) {
    headers.push({
      range: 'cancellations!A1:I1',
      values: [['id', 'schedule_id', 'student_id', 'original_date', 'reason', 'rescheduled_to', 'new_schedule_id', 'cancelled_at', 'note']]
    });
  }
  if (!existing.includes('feedback')) {
    headers.push({
      range: 'feedback!A1:F1',
      values: [['id', 'date', 'category', 'message', 'status', 'created_at']]
    });
  }

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data: headers })
  });
}

// ==================== MIGRATION: schema v2 (package_hours_remaining, skill scores, line_sent_at) ====================
// เรียกครั้งเดียวตอน login เพื่อแปะ header คอลัมน์ใหม่ลงฐานข้อมูลเดิม (ไม่แตะข้อมูลแถวเดิม ปลอดภัยเรียกซ้ำได้)
export async function migrateSchemaV2(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!K1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'students!K1', values: [['package_hours_remaining']] },
        { range: 'sessions!K1:N1', values: [['listening_score', 'speaking_score', 'reading_score', 'writing_score']] }
      ]
    })
  });
}

// ==================== MIGRATION: schema v3 (line_sent_at บนใบแจ้งหนี้) ====================
export async function migrateSchemaV3(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!R1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'invoices!R1', values: [['line_sent_at']] }
      ]
    })
  });
}

// ==================== MIGRATION: schema v4 (students.line_group_id — LINE Group Chat) ====================
// เรียกครั้งเดียวตอน login เพื่อแปะ header column L ลงฐานข้อมูลเดิม (ไม่แตะข้อมูลแถวเดิม ปลอดภัยเรียกซ้ำได้)
// column L เก็บ LINE groupId — ใช้กับคาบเรียนกลุ่มที่มีนักเรียนหลายคน/ผู้ปกครองอยู่ใน LINE group เดียวกัน
export async function migrateSchemaV4(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!L1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'students!L1', values: [['line_group_id']] }
      ]
    })
  });
}

// ==================== GROUPS (จัดกลุ่มนักเรียน — schema v5) ====================
// กลุ่ม = เครื่องมือช่วยลงข้อมูลทีเดียว ไม่ใช่หน่วยบัญชีใหม่ — เรท/ชั่วโมง/VAT/แพ็กเกจ
// ยังคิด/เก็บแยกรายคนในพื้นหลังเสมอ ดู migrateSchemaV5 ด้านล่างสำหรับการสร้าง sheet/migrate
// columns: A:id, B:name, C:student_ids (comma-separated เช่น "STU-111,STU-222"),
// D:line_group_id, E:default_subject, F:is_deleted, G:created_at, H:code, I:zoom_link,
// J:schedule_day, K:schedule_time

export async function getGroups(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!A:N`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.values ? data.values.slice(1) : [];
}

export async function addGroup(accessToken, spreadsheetId, groupData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!A:N:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [groupData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`สร้างกลุ่มไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// เพิ่มกลุ่มหลายแถวพร้อมกันในคำขอเดียว — ใช้ตอน migrateSchemaV5 สร้างกลุ่มอัตโนมัติจาก
// line_group_id เดิมของนักเรียนที่มีอยู่แล้วหลายคน (กันยิง API ทีละคน)
export async function addGroupsBatch(accessToken, spreadsheetId, groupsRows) {
  if (!groupsRows || groupsRows.length === 0) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!A:N:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: groupsRows })
  });
}

// แก้ไขข้อมูลกลุ่ม (ชื่อ/สมาชิก/LINE group/วิชา default) — ใช้แถวเต็ม A:K เหมือน updateStudent
export async function updateGroup(accessToken, spreadsheetId, rowIndex, groupData) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!A${rowIndex}:N${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [groupData] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`แก้ไขกลุ่มไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// Soft delete กลุ่ม (เซต is_deleted = TRUE, column F) — ไม่กระทบ schedule/session/invoice
// ที่เคยสร้างไปแล้ว เพราะข้อมูลจริงยังอยู่ที่ตัวนักเรียนเองทั้งหมด (group_id แค่ tag ไว้)
export async function softDeleteGroup(accessToken, spreadsheetId, rowIndex) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!F${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [['TRUE']] })
  });
}

// อัปเดต LINE Group ID ของกลุ่ม (column D) — ใช้ตอน Worker webhook เขียน groupId เข้ามาแทนที่
// students!L แบบเดิม (ดู worker.js ที่จะแก้ใน phase หลัง — ผูก LINE group กับ "กลุ่มเรียน"
// แทนที่จะผูกกับนักเรียนทีละคน เพราะ LINE group หนึ่งกลุ่มมักมีหลายคน/ผู้ปกครองอยู่ด้วยกัน)
export async function updateGroupLineGroupId(accessToken, spreadsheetId, rowIndex, lineGroupId) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!D${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[lineGroupId]] })
  });
}

// ==================== MIGRATION: schema v5 (groups — จัดกลุ่มนักเรียน) ====================
// เรียกครั้งเดียวตอน login เพื่อ:
//   1) สร้าง sheet `groups` (ถ้ายังไม่มี) + แปะ header
//   2) แปะ header column ใหม่: schedules!O1 (group_id), sessions!O1 (group_id),
//      invoices!S1 (group_invoice_key), invoice_items!I1 (student_id)
//   3) Data migration พิเศษ: สแกน students ทุกแถวที่มี column L (line_group_id เดิม) ไม่ว่าง
//      → สร้าง 1 แถวใน groups ให้อัตโนมัติ (1 คน = 1 กลุ่ม) เพื่อไม่ให้ผู้ใช้ที่เคยตั้งค่า
//      LINE group ไว้จาก feature รอบก่อนต้องตั้งใหม่ — คง students!L ไว้เฉยๆ ไม่ลบ (ปลอดภัย
//      กว่าการลบจริง ของเดิมยังอ่านได้ถ้ามีโค้ดส่วนไหนอ้างอิงอยู่)
// ใช้ schedules!O1 เป็น flag เช็คว่า migrate ไปแล้วหรือยัง (เหมือน pattern ของ migrateSchemaV2-V4)
// ปลอดภัยเรียกซ้ำได้ — ถ้า migrate ไปแล้วจะ return ทันทีโดยไม่สร้างกลุ่มซ้ำ
export async function migrateSchemaV5(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/schedules!O1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;

  // 1) สร้าง sheet groups ถ้ายังไม่มี
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const meta = await metaRes.json();
  const existingSheets = (meta.sheets || []).map(s => s.properties.title);

  if (!existingSheets.includes('groups')) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'groups' } } }] })
    });
  }

  // 2) แปะ headers ทั้งหมด
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'groups!A1:K1', values: [['id', 'name', 'student_ids', 'line_group_id', 'default_subject', 'is_deleted', 'created_at', 'code', 'zoom_link', 'schedule_day', 'schedule_time']] },
        { range: 'schedules!O1', values: [['group_id']] },
        { range: 'sessions!O1', values: [['group_id']] },
        { range: 'invoices!S1', values: [['group_invoice_key']] },
        { range: 'invoice_items!I1', values: [['student_id']] },
      ]
    })
  });

  // 3) Data migration: นักเรียนที่มี line_group_id เดิมอยู่แล้ว → สร้าง group ให้คนละ 1 กลุ่ม
  const studentsRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!A:L`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const studentsData = await studentsRes.json();
  const studentRows = studentsData.values ? studentsData.values.slice(1) : [];

  const now = new Date().toLocaleString('th-TH');
  const newGroupRows = studentRows
    .filter(row => (row[11] || '').trim()) // column L = line_group_id เดิม
    .map(row => {
      const studentId = row[0];
      const studentName = row[1] || studentId;
      const lineGroupId = (row[11] || '').trim();
      return [
        `GRP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, // กันชนกันถ้าหลายแถว migrate รอบเดียวกัน
        `${studentName} (Group)`,
        studentId,
        lineGroupId,
        '',
        'FALSE',
        now,
      ];
    });

  if (newGroupRows.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!A:K:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: newGroupRows })
    });
  }
}

// ==================== MIGRATION: schema v6 (groups code + zoom_link + schedule_day/time) ====================
// แปะ header columns H-K ใน groups sheet (code, zoom_link, schedule_day, schedule_time)
export async function migrateSchemaV6(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!I1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!H1:K1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [['code', 'zoom_link', 'schedule_day', 'schedule_time']] })
  });
}

// ==================== MIGRATION: schema v7 (group package columns L-N) ====================
// แปะ header columns L-N ใน groups sheet (package_hours, package_hours_remaining, package_rate)
export async function migrateSchemaV7(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!L1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!L1:N1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [['package_hours', 'package_hours_remaining', 'package_rate']] })
  });
}

// ==================== MIGRATION: schema v8 (settings message template columns AF-AJ) ====================
// แปะ header columns AF-AJ ใน settings sheet (msg_portal_reminder … msg_zoom)
export async function migrateSchemaV8(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!AF1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!AF1:AJ1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [['msg_portal_reminder', 'msg_group_portal_reminder', 'msg_portal_intro', 'msg_group_portal_intro', 'msg_zoom']] })
  });
}

export async function migrateSchemaV9(accessToken, spreadsheetId) {
  const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!AK1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const checkData = await checkRes.json();
  const alreadyMigrated = checkData.values && checkData.values[0] && checkData.values[0][0];
  if (alreadyMigrated) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/settings!AK1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [['class_code']] })
  });
}

// อัปเดต package_hours_remaining (column M) ของกลุ่ม — เรียกหลัง log session เพื่อหักชั่วโมง
export async function updateGroupPackageHours(accessToken, spreadsheetId, rowIndex, remaining) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!M${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[remaining]] })
  });
}

// อัปเดต package_hours (L) และ package_hours_remaining (M) พร้อมกัน — เรียกตอนเติมแพ็กเกจกลุ่ม
export async function updateGroupPackageBoth(accessToken, spreadsheetId, rowIndex, total, remaining) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/groups!L${rowIndex}:M${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[total, remaining]] })
  });
}


// บันทึกเวลาที่ส่งบิลทาง LINE OA สำเร็จ (column R) — ใช้แสดง badge "ส่งแล้ว" ในหน้า UI
export async function updateInvoiceLineSentAt(accessToken, spreadsheetId, invoiceRowIndex, timestamp) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/invoices!R${invoiceRowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[timestamp]] })
  });
}

// ==================== CANCELLATIONS (ประวัติการยกเลิกคลาส) ====================

export async function getCancellations(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/cancellations!A:I`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.values ? data.values.slice(1).map(parseCancellationRow) : [];
}

export async function addCancellation(accessToken, spreadsheetId, cancellationData) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/cancellations!A:I:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [cancellationData] })
  });
}

// ==================== LINE MESSAGING (ผ่าน Cloudflare Worker) ====================

// ในไฟล์ googleSheets.js 

// 1. ฟังก์ชันส่งแบบรายคน (Push)
export async function sendLineMessage(workerUrl, lineToken, lineUserId, message) {
  if (!workerUrl || !lineToken || !lineUserId) throw new Error('ขาด workerUrl, lineToken หรือ lineUserId');
  if (workerUrl === '[kv]') throw new Error('ยังไม่ได้โหลด LINE Worker URL จริงจาก KV — ตรวจสอบ VITE_TEACHER_SECRET และลองรีเฟรชหน้าอีกครั้ง');
  
  const cleanWorkerUrl = workerUrl.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(cleanWorkerUrl)) throw new Error(`LINE Worker URL ไม่ถูกต้อง: ${workerUrl}`);
  const cleanUserId = lineUserId.trim(); // ลบช่องว่างหน้า-หลังเผื่อก๊อปมาผิด
  
  const res = await fetch(`${cleanWorkerUrl}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Line-Token': lineToken },
    body: JSON.stringify({ to: cleanUserId, messages: [{ type: 'text', text: message }] })
  });
  
  if (!res.ok) {
    // ดึง Error ของจริงจาก LINE มาอ่าน
    const errorDetails = await res.text();
    console.error('[LINE Error Details]', errorDetails);
    throw new Error(`LINE แจ้งเตือน: ${errorDetails}`);
  }
}

// 2. ฟังก์ชันส่งแบบหลายคน (Multicast)
export async function sendLineMulticast(workerUrl, lineToken, lineUserIds, message) {
  // ลบช่องว่าง และเอาเฉพาะ ID ที่ไม่ว่าง
  const validIds = lineUserIds.map(id => id?.trim()).filter(Boolean);
  
  if (!workerUrl || !lineToken || validIds.length === 0) throw new Error('ขาด workerUrl, lineToken หรือ lineUserIds');
  if (workerUrl === '[kv]') throw new Error('ยังไม่ได้โหลด LINE Worker URL จริงจาก KV — ตรวจสอบ VITE_TEACHER_SECRET และลองรีเฟรชหน้าอีกครั้ง');
  
  const cleanWorkerUrl = workerUrl.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(cleanWorkerUrl)) throw new Error(`LINE Worker URL ไม่ถูกต้อง: ${workerUrl}`);
  
  const res = await fetch(`${cleanWorkerUrl}/multicast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Line-Token': lineToken },
    body: JSON.stringify({ to: validIds, messages: [{ type: 'text', text: message }] })
  });
  
  if (!res.ok) {
    const errorDetails = await res.text();
    console.error('[LINE Error Details]', errorDetails);
    throw new Error(`LINE แจ้งเตือน: ${errorDetails}`);
  }
}

// 3. ฟังก์ชันส่งรูปบิลทาง LINE (อัปโหลดขึ้น R2 ผ่าน Worker แล้วส่งเป็น Image Message ในคำขอเดียว)
// ต้อง deploy Worker เวอร์ชันใหม่ ที่มี route /push-bill-image ก่อนใช้งาน
export async function sendLineImageMessage(workerUrl, lineToken, lineUserId, imageDataUrl) {
  if (!workerUrl || !lineToken || !lineUserId || !imageDataUrl) throw new Error('ขาด workerUrl, lineToken, lineUserId หรือ imageDataUrl');
  if (workerUrl === '[kv]') throw new Error('ยังไม่ได้โหลด LINE Worker URL จริงจาก KV — ตรวจสอบ VITE_TEACHER_SECRET และลองรีเฟรชหน้าอีกครั้ง');

  const cleanWorkerUrl = workerUrl.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(cleanWorkerUrl)) throw new Error(`LINE Worker URL ไม่ถูกต้อง: ${workerUrl}`);
  const cleanUserId = lineUserId.trim();

  const res = await fetch(`${cleanWorkerUrl}/push-bill-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Line-Token': lineToken },
    body: JSON.stringify({ to: cleanUserId, imageDataUrl }),
  });

  if (!res.ok) {
    const errorDetails = await res.text();
    console.error('[LINE Image Error Details]', errorDetails);
    throw new Error(`ส่งรูปบิลทาง LINE ไม่สำเร็จ — ตรวจสอบว่า deploy Worker เวอร์ชันรองรับรูปภาพแล้วหรือยัง (${errorDetails})`);
  }
  return res.json();
}

// อัปเดต LINE User ID ของนักเรียน (column J)
export async function updateStudentLineUserId(accessToken, spreadsheetId, rowIndex, lineUserId) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!J${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[lineUserId]] })
  });
}

// อัปเดต LINE Group ID ของนักเรียน (column L) — ใช้กับห้องเรียนกลุ่มที่มีผู้ปกครอง/นักเรียนหลายคนอยู่ใน
// LINE group เดียวกัน บันทึกผ่าน Worker webhook ตอนนักเรียนส่งรหัส STU-xxx|DB_ID ในกรุ๊ป (auto-detect)
// หรือกรอกเองในฟอร์มก็ได้ (Worker เขียนทับ column นี้เหมือนกับ updateStudentLineUserId)
export async function updateStudentLineGroupId(accessToken, spreadsheetId, rowIndex, lineGroupId) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/students!L${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[lineGroupId]] })
  });
}

// ==================== TYPE CONVERSION HELPERS ====================
// ทุก getter (ทั้ง authenticated และ public CSV) ผ่าน helper เหล่านี้ก่อน return
// เพื่อให้ caller ได้รับ number เป็น Number จริง และ date เป็น YYYY-MM-DD เสมอ
// Boolean ('TRUE'/'FALSE') คงไว้เป็น string เพราะ comparison sites ทั้ง 70+ แห่งใช้ === 'TRUE'

// Normalize Sheets date to YYYY-MM-DD regardless of spreadsheet locale.
// gviz/tq อาจ export date-type cells เป็น M/D/YYYY (US) หรือ D/M/YYYY (Thai) แทน ISO
function normDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                       // already ISO
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const a = parseInt(mdy[1], 10), b = parseInt(mdy[2], 10), year = mdy[3];
    // if first part > 12 it cannot be a month → D/M/YYYY (Thai gviz locale)
    if (a > 12) return `${year}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
    return `${year}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`;       // M/D/YYYY → ISO
  }
  return s;
}

// Convert numeric string to Number; return '' for empty/missing cells
function normNum(val) {
  if (val === '' || val == null) return '';
  const n = Number(val);
  return Number.isFinite(n) ? n : val;
}

// Per-entity row parsers — returns a mutated copy of the raw string array
// Column indices must stay in sync with constants.js and initDatabaseHeaders

// students: id(0) name(1) subject(2) phone(3) line_id(4) rate_per_hour(5) note(6) is_deleted(7)
//           created_at(8) line_user_id(9) package_hours_remaining(10) line_group_id(11)
function parseStudentRow(row) {
  const r = row.slice();
  r[5]  = normNum(r[5]);   // rate_per_hour
  r[10] = normNum(r[10]);  // package_hours_remaining
  return r;
}

// sessions: id(0) student_id(1) date(2) subject(3) hours(4) note(5) invoiced(6) invoice_id(7)
//           is_deleted(8) created_at(9) listening_score(10) speaking_score(11) reading_score(12)
//           writing_score(13) group_id(14)
function parseSessionRow(row) {
  const r = row.slice();
  r[2]  = normDate(r[2]);  // date
  r[4]  = normNum(r[4]);   // hours
  r[10] = normNum(r[10]);  // listening_score
  r[11] = normNum(r[11]);  // speaking_score
  r[12] = normNum(r[12]);  // reading_score
  r[13] = normNum(r[13]);  // writing_score
  return r;
}

// schedules: id(0) student_id(1) date(2) subject(3) hours(4) note(5) repeat_type(6) repeat_until(7)
//            time_start(8) time_end(9) is_deleted(10) created_at(11) gcal_event_id(12)
//            override_zoom_link(13) group_id(14)
function parseScheduleRow(row) {
  const r = row.slice();
  r[2] = normDate(r[2]);   // date
  r[4] = normNum(r[4]);    // hours
  r[7] = normDate(r[7]);   // repeat_until
  return r;
}

// invoices: id(0) invoice_number(1) student_id(2) issue_date(3) due_date(4) language(5)
//           total_hours(6) rate_used(7) subtotal(8) vat_rate(9) vat_amount(10) total_amount(11)
//           payment_method(12) status(13) note(14) created_at(15) receipt_id(16)
//           line_sent_at(17) group_invoice_key(18)
function parseInvoiceRow(row) {
  const r = row.slice();
  r[3]  = normDate(r[3]);  // issue_date
  r[4]  = normDate(r[4]);  // due_date
  r[6]  = normNum(r[6]);   // total_hours
  r[7]  = normNum(r[7]);   // rate_used
  r[8]  = normNum(r[8]);   // subtotal
  r[9]  = normNum(r[9]);   // vat_rate
  r[10] = normNum(r[10]);  // vat_amount
  r[11] = normNum(r[11]);  // total_amount
  return r;
}

// receipts: id(0) receipt_number(1) invoice_id(2) student_id(3) issue_date(4) payment_method(5)
//           amount(6) note(7) issued_by(8) created_at(9)
function parseReceiptRow(row) {
  const r = row.slice();
  r[4] = normDate(r[4]);  // issue_date
  r[6] = normNum(r[6]);   // amount
  return r;
}

// cancellations: id(0) schedule_id(1) student_id(2) original_date(3) reason(4) rescheduled_to(5)
//                new_schedule_id(6) cancelled_at(7) note(8)
function parseCancellationRow(row) {
  const r = row.slice();
  r[3] = normDate(r[3]);  // original_date
  r[5] = normDate(r[5]);  // rescheduled_to
  r[7] = normDate(r[7]);  // cancelled_at
  return r;
}

// ==================== STUDENT PORTAL (อ่านอย่างเดียว ไม่ใช้ accessToken) ====================
// ใช้ CSV export ของ Google Sheets ที่แชร์แบบ "Anyone with the link → Viewer"
// ห้ามใช้ accessToken ของติวเตอร์ในหน้านี้เด็ดขาด เพราะ token นั้นมีสิทธิ์เขียนทั้งไฟล์

// Sheets lets users prefix a cell with ' to force text storage (e.g. '2026-06-25,
// '07:00, '60). GViz CSV exports the apostrophe verbatim, which breaks date
// comparison, time display, and numeric parsing everywhere downstream.
// Strip it here — the single lowest-level point — so no caller ever sees it.
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
  let cur = '', inQuotes = false, lines = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    // เปิด quote
    if (c === '"' && !inQuotes) { inQuotes = true; cur += c; continue; }
    // escaped quote "" ภายใน field
    if (c === '"' && inQuotes && text[i + 1] === '"') { cur += '"'; i++; continue; }
    // ปิด quote
    if (c === '"' && inQuotes) { inQuotes = false; cur += c; continue; }
    if (c === '\n' && !inQuotes) { lines.push(cur); cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur) lines.push(cur);
  lines.forEach(l => { if (l.trim() !== '') rows.push(parseCsvLine(l)); });
  return rows;
}

async function fetchSheetAsCsv(spreadsheetId, sheetName) {
  // Route through the Cloudflare Worker proxy so the browser never makes a
  // cross-origin request to docs.google.com — iOS Safari rejects those with
  // "TypeError: Load failed". The worker fetches server-side and returns CSV
  // with our own CORS headers. Fall back to direct GViz if no proxy is configured.
  const signalingUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_WEBRTC_SIGNALING_URL : null;
  const url = signalingUrl
    ? `${signalingUrl}/proxy/sheet?sheetId=${encodeURIComponent(spreadsheetId)}&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_cb=${Date.now()}`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new TypeError(`${e.message} — URL: ${url.replace(/&_cb=\d+/, '')}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — URL: ${url.replace(/&_cb=\d+/, '')}`);
  const text = await res.text();
  const rows = parseCsv(text);
  return rows.length > 0 ? rows.slice(1) : [];
}

export async function getPublicStudents(spreadsheetId) {
  const rows = await fetchSheetAsCsv(spreadsheetId, 'students');
  return rows.map(parseStudentRow);
}

export async function getPublicSessions(spreadsheetId) {
  const rows = await fetchSheetAsCsv(spreadsheetId, 'sessions');
  return rows.map(parseSessionRow);
}

export async function getPublicSchedules(spreadsheetId) {
  const rows = await fetchSheetAsCsv(spreadsheetId, 'schedules');
  return rows.map(parseScheduleRow);
}

export async function getPublicGroups(spreadsheetId) {
  const rows = await fetchSheetAsCsv(spreadsheetId, 'groups');
  return rows; // raw string arrays — no numeric columns to normalize
}

// ─── Feedback (กล่องข้อเสนอแนะระบบ — AI ผู้ช่วยอ่านผ่าน GViz CSV) ───

export async function getFeedback(accessToken, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/feedback!A:F`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!data.values) return [];
  return data.values.slice(1); // ตัด header row
}

export async function addFeedback(accessToken, spreadsheetId, feedbackRow) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/feedback!A:F:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [feedbackRow] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`บันทึกข้อเสนอแนะไม่สำเร็จ: ${err?.error?.message || res.status}`);
  }
}

// status: 'NEW' (รอ AI อ่าน) | 'DONE' (ทำแล้ว/ปิดเรื่อง) — column E
export async function updateFeedbackStatus(accessToken, spreadsheetId, feedbackRowIndex, newStatus) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/feedback!E${feedbackRowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[newStatus]] })
  });
}