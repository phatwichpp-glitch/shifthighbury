// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { STUDENT, SESSION, INVOICE, RECEIPT, SETTINGS, STUDENT_LINE_USER_ID, STUDENT_LINE_GROUP_ID, isLineOAEnabled, canSendLine } from '../lib/constants';
import { TEACHER_ROLE_LABEL, SKILL_LABELS } from '../lib/appConfig';
import { AppError, runWithFeedback, safeFloat, buildLineFootnote, buildInvoiceLineMessage, toastLineError, generateStudentLoginCode, buildStudentLoginCode, buildPortalIntroMessage, elementToJpegDataUrl, exportElementAsJPG, exportElementAsPDF, generatePromptPayQRCode, copyText, localDateStr } from '../lib/business';
import { useSheetData } from '../hooks/useSheetData';
import { useConfirm } from '../hooks/useConfirm';
import { inputClasses, labelClasses, btnPrimary, btnSecondary, btnSuccess } from '../components/ui/styles';
import { SubjectComboInput } from '../components/ui/SubjectComboInput';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { InvoiceDocument } from '../components/documents/InvoiceDocument';
import { ReceiptDocument } from '../components/documents/ReceiptDocument';
import { ProgressReportDocument } from '../components/documents/ProgressReportDocument';
import { PackageReceiptDocument } from '../components/documents/PackageReceiptDocument';
import { InvoicePreviewModal } from '../components/modals/InvoicePreviewModal';
import { PackageHistoryModal } from '../components/modals/PackageHistoryModal';
import { SendTemplateModal } from '../components/modals/SendTemplateModal';
import { getStudents, getSessions, getInvoices, getSettings, getReceipts, addStudent, updateStudent, updateStudentPackageHours, addReceipt, addInvoiceComplete, markSessionsAsInvoiced, updateInvoiceCounter, sendLineMessage, sendLineImageMessage, updateInvoiceStatus, updateInvoiceLineSentAt, updateStudentLineGroupId } from '../services/googleSheets';
import { X, GraduationCap, Search, Users, MessageSquare, Package, ClipboardList, Link2, BarChart2, Key, Pencil, Trash2, CheckCircle2, Share2, Send, Copy } from 'lucide-react';
import { StateDisplay } from '../components/ui/StateDisplay';

export function Students({ accessToken, dbId, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({ name: '', subject: '', rate: '', line_user_id: '', line_group_id: '', loginCode: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [billingStudent, setBillingStudent] = useState(null);
  const [unbilledSessions, setUnbilledSessions] = useState([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [previewData, setPreviewData] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isSendingLine, setIsSendingLine] = useState(false);
  const [isSendingLineImage, setIsSendingLineImage] = useState(false);
  const [isSendingPkgReceipt, setIsSendingPkgReceipt] = useState(false);
  const [isExportingPkgReceipt, setIsExportingPkgReceipt] = useState(false);
  const { confirm, Dialog } = useConfirm();

  const [topUpStudent, setTopUpStudent] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpMode, setTopUpMode] = useState('hours');
  const [topUpMoneyAmount, setTopUpMoneyAmount] = useState('');
  const [isToppingUp, setIsToppingUp] = useState(false);

  const [reportStudent, setReportStudent] = useState(null);
  const [reportMonth, setReportMonth] = useState(localDateStr().slice(0, 7));
  const [isExportingReport, setIsExportingReport] = useState(false);

  const [isBulkBilling, setIsBulkBilling] = useState(false);
  const [failedBulkStudents, setFailedBulkStudents] = useState([]);
  const [pkgReceiptPreview, setPkgReceiptPreview] = useState(null);
  const [pkgHistoryStudent, setPkgHistoryStudent] = useState(null);
  const [sendTemplateStudent, setSendTemplateStudent] = useState(null);

  const { data, loading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { students: getStudents, sessions: getSessions, invoices: getInvoices, settings: getSettings, receipts: getReceipts } });
  const students = data.students || [];
  const sessions = data.sessions || [];
  const invoices = data.invoices || [];
  const receipts = data.receipts || [];
  const settingsRow = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
  const lineOAEnabled = isLineOAEnabled(settingsRow);

  useEffect(() => {
    let active = true;
    if (previewData && settingsRow?.[SETTINGS.PROMPTPAY_ID]) {
      generatePromptPayQRCode(settingsRow[SETTINGS.PROMPTPAY_ID], previewData.totalAmount).then(url => { if (active) setQrCodeUrl(url || ''); });
    } else setQrCodeUrl('');
    return () => { active = false; };
  }, [previewData, settingsRow]);

  const getStudentSummary = (studentId, rate) => {
    const unbilled = sessions.filter(s => s[SESSION.STUDENT_ID] === studentId && s[SESSION.INVOICED] === 'FALSE' && s[SESSION.DELETED] !== 'TRUE');
    const pendingHours = unbilled.reduce((sum, s) => sum + parseFloat(s[SESSION.HOURS] || 0), 0);
    return { unbilledCount: unbilled.length, pendingAmount: pendingHours * parseFloat(rate || 0) };
  };

  const reportData = useMemo(() => {
    if (!reportStudent) return null;
    const monthSessions = sessions.filter(s => s[SESSION.STUDENT_ID] === reportStudent.data[STUDENT.ID] && s[SESSION.DELETED] !== 'TRUE' && (s[SESSION.DATE] || '').startsWith(reportMonth));
    const avg = (idx) => { const scored = monthSessions.map(s => safeFloat(s[idx])).filter(n => n > 0); return scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0; };
    const totalHours = monthSessions.reduce((sum, s) => sum + safeFloat(s[SESSION.HOURS]), 0);
    const [y, m] = reportMonth.split('-');
    const monthLabel = new Date(`${y}-${m}-01T12:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    return { studentName: reportStudent.data[STUDENT.NAME], monthLabel, sessionCount: monthSessions.length, totalHours, averages: { listening: avg(SESSION.LISTENING_SCORE), speaking: avg(SESSION.SPEAKING_SCORE), reading: avg(SESSION.READING_SCORE), writing: avg(SESSION.WRITING_SCORE) } };
  }, [reportStudent, reportMonth, sessions]);

  const isValid = formData.name?.trim() && safeFloat(formData.rate) > 0;
  const studentLoginCode = buildStudentLoginCode(formData.loginCode, formData.name);
  const isDuplicateLoginCode = !!studentLoginCode && students.some(s => s[STUDENT.DELETED] !== 'TRUE' && (!editingStudent || s[STUDENT.ID] !== editingStudent.data[STUDENT.ID]) && buildStudentLoginCode(s[STUDENT.NICKNAME], s[STUDENT.NAME]) === studentLoginCode);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const dateNow = new Date().toLocaleString('th-TH');
    let loginCodeChanged = null;
    const ok = await runWithFeedback(async () => {
      if (editingStudent) {
        const row = [...editingStudent.data];
        row[STUDENT.NAME] = formData.name; row[STUDENT.SUBJECT] = formData.subject;
        let codeToSave = formData.loginCode || '';
        const stillValid = !!buildStudentLoginCode(codeToSave, formData.name) && !isDuplicateLoginCode;
        if (!stillValid) {
          const regenerated = generateStudentLoginCode(formData.name, students, editingStudent.data[STUDENT.ID]);
          if (regenerated === null) throw new AppError('ไม่สามารถออกรหัส Portal ใหม่ได้ | ชื่อ 2 ตัวแรกนี้มีรหัสครบ 100 แบบแล้ว');
          codeToSave = regenerated;
        }
        const oldPortalCode = buildStudentLoginCode(editingStudent.data[STUDENT.NICKNAME], editingStudent.data[STUDENT.NAME]);
        const newPortalCode = buildStudentLoginCode(codeToSave, formData.name);
        if (oldPortalCode && newPortalCode && oldPortalCode !== newPortalCode) loginCodeChanged = { from: oldPortalCode, to: newPortalCode };
        row[STUDENT.NICKNAME] = codeToSave; row[STUDENT.RATE] = formData.rate;
        row[STUDENT_LINE_USER_ID] = formData.line_user_id || ''; row[STUDENT_LINE_GROUP_ID] = formData.line_group_id || '';
        while (row.length < 12) row.push('');
        await updateStudent(accessToken, dbId, editingStudent.rowIndex, row);
      } else {
        const newCode = generateStudentLoginCode(formData.name, students, null);
        if (newCode === null) throw new AppError('ไม่สามารถออกรหัส Portal ได้ | ชื่อ 2 ตัวแรกนี้มีรหัสครบ 100 แบบแล้ว ลองใช้ชื่ออื่น');
        await addStudent(accessToken, dbId, ['STU-' + Date.now(), formData.name, formData.subject, '', newCode, formData.rate, '', 'FALSE', dateNow, formData.line_user_id || '', '0', formData.line_group_id || '']);
      }
    }, toast, editingStudent ? 'อัปเดตข้อมูลนักเรียนเรียบร้อย!' : 'เพิ่มรายชื่อนักเรียนสำเร็จ!');
    if (ok) {
      setShowForm(false); setEditingStudent(null); setFormData({ name: '', subject: '', rate: '', line_user_id: '', line_group_id: '', loginCode: '' }); refresh({ force: true });
      if (loginCodeChanged) toast(`รหัส Portal เปลี่ยนจาก ${loginCodeChanged.from} เป็น ${loginCodeChanged.to} (รหัสเดิมชนกับคนอื่น) — อย่าลืมส่งรหัสใหม่ให้ผู้ปกครองอีกครั้งนะครับ รหัสเก่าใช้ไม่ได้แล้ว`, 'info');
    }
    setIsSubmitting(false);
  };

  const handleDeleteClick = async (student) => {
    const summary = getStudentSummary(student.data[STUDENT.ID], student.data[STUDENT.RATE]);
    const ok = await confirm(
      summary.unbilledCount > 0
        ? `"${student.data[STUDENT.NAME]}" ยังมีคาบค้างออกบิล ${summary.unbilledCount} คาบ (${summary.pendingAmount.toLocaleString()} ฿) — ลบแล้วจะไม่เห็นในหน้าออกบิลอีก แนะนำให้ออกบิลก่อนลบ ยืนยันลบเลยใช่ไหมครับ?`
        : `ลบชื่อ "${student.data[STUDENT.NAME]}" ออกจากระบบใช่ไหมครับ?`,
      true
    );
    if (!ok) return;
    const row = [...student.data]; row[STUDENT.DELETED] = 'TRUE';
    const success = await runWithFeedback(() => updateStudent(accessToken, dbId, student.rowIndex, row), toast, 'ลบรายชื่อนักเรียนออกจากระบบสำเร็จ!');
    if (success) refresh({ force: true });
  };

  const studentRateForTopUp = safeFloat(topUpStudent?.data?.[STUDENT.RATE]);
  const topUpHoursFromAmount = studentRateForTopUp > 0 ? Math.round((safeFloat(topUpMoneyAmount) / studentRateForTopUp) * 100) / 100 : 0;
  const effectiveTopUpHours = topUpMode === 'amount' ? topUpHoursFromAmount : safeFloat(topUpAmount);

  const handleTopUp = async (e) => {
    e.preventDefault();
    if (!topUpStudent) return;
    if (topUpMode === 'amount') {
      if (safeFloat(topUpMoneyAmount) <= 0) return toast('กรุณากรอกยอดเงินที่ถูกต้อง', 'error');
      if (studentRateForTopUp <= 0) return toast('นักเรียนคนนี้ยังไม่ได้ตั้งเรทค่าเรียน/ชม. กรุณาแก้ไขข้อมูลนักเรียนก่อน', 'error');
    } else {
      if (safeFloat(topUpAmount) <= 0) return toast('กรุณากรอกจำนวนชั่วโมงที่ถูกต้อง', 'error');
    }
    setIsToppingUp(true);
    const current = safeFloat(topUpStudent.data[STUDENT.PACKAGE_HOURS]);
    const newHours = current + effectiveTopUpHours;
    const pkgCount = (receipts || []).filter(r => (r[RECEIPT.NUMBER] || '').startsWith('PKG')).length;
    const pkgReceiptNum = `PKG-${new Date().getFullYear()}-${String(pkgCount + 1).padStart(3, '0')}`;
    const pkgReceiptId = 'PKG-ID-' + Date.now();
    const dateNow = new Date().toLocaleDateString('th-TH');
    const paymentMethodUsed = 'โอนเงิน';
    const issuedBy = settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY';
    const topUpAmount_value = topUpMode === 'amount' ? safeFloat(topUpMoneyAmount) : (effectiveTopUpHours * safeFloat(topUpStudent.data[STUDENT.RATE] || 0));
    const ok = await runWithFeedback(async () => {
      await updateStudentPackageHours(accessToken, dbId, topUpStudent.rowIndex, newHours);
      await addReceipt(accessToken, dbId, [pkgReceiptId, pkgReceiptNum, '', topUpStudent.data[STUDENT.ID], dateNow, paymentMethodUsed, topUpAmount_value, `เติมแพ็กเกจ ${effectiveTopUpHours} ชม. (จาก ${current} → ${newHours} ชม.)`, issuedBy, new Date().toLocaleString('th-TH')]);
    }, toast, `เติมแพ็กเกจให้ ${topUpStudent.data[STUDENT.NAME]} สำเร็จ! (คงเหลือ ${newHours} ชม.)`);
    if (ok) {
      setPkgReceiptPreview({ receiptNum: pkgReceiptNum, studentName: topUpStudent.data[STUDENT.NAME], hours: effectiveTopUpHours, hoursBefore: current, hoursAfter: newHours, amount: topUpAmount_value, paymentMethod: paymentMethodUsed, dateNow, issuedBy });
      setTopUpStudent(null); setTopUpAmount(''); setTopUpMoneyAmount(''); setTopUpMode('hours');
      refresh({ force: true });
    }
    setIsToppingUp(false);
  };

  const handleOpenBilling = (studentData) => {
    setBillingStudent(studentData);
    const prefix = settingsRow?.[SETTINGS.PREFIX] || 'ZW';
    const counter = parseInt(settingsRow?.[SETTINGS.COUNTER] || '1', 10);
    const year = new Date().getFullYear();
    setInvoiceNumber(`${prefix}-${year}-${String(counter).padStart(4, '0')}`);
    setDateFrom(''); setDateTo('');
    const filtered = sessions.map((s, i) => ({ data: s, rowIndex: i + 2 })).filter(s => s.data[SESSION.STUDENT_ID] === studentData[STUDENT.ID] && s.data[SESSION.INVOICED] === 'FALSE' && s.data[SESSION.DELETED] !== 'TRUE').sort((a, b) => new Date(a.data[SESSION.DATE]) - new Date(b.data[SESSION.DATE]));
    setUnbilledSessions(filtered);
    setSelectedSessionIds(filtered.map(s => s.data[SESSION.ID]));
  };

  const filteredUnbilled = unbilledSessions.filter(s => { if (dateFrom && s.data[SESSION.DATE] < dateFrom) return false; if (dateTo && s.data[SESSION.DATE] > dateTo) return false; return true; });
  const allFilteredIds = filteredUnbilled.map(s => s.data[SESSION.ID]);
  const allFilteredSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedSessionIds.includes(id));
  const handleSelectAllSessions = () => { if (allFilteredSelected) setSelectedSessionIds(prev => prev.filter(id => !allFilteredIds.includes(id))); else setSelectedSessionIds(prev => [...new Set([...prev, ...allFilteredIds])]); };
  const handleCheckboxChange = (sessionId) => setSelectedSessionIds(prev => prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId]);
  const totalSelectedHours = unbilledSessions.filter(s => selectedSessionIds.includes(s.data[SESSION.ID])).reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    if (selectedSessionIds.length === 0) return toast('กรุณาเลือกคาบเรียนอย่างน้อย 1 คาบครับ', 'error');
    setIsSubmitting(true);
    const rate = safeFloat(billingStudent[STUDENT.RATE]);
    const subtotal = Math.round(totalSelectedHours * rate * 100) / 100;
    const vatRate = safeFloat(settingsRow?.[SETTINGS.TAX_RATE] || 0) / 100;
    const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;
    const invoiceId = 'INV-ID-' + Date.now();
    const dateNow = localDateStr();
    const counter = parseInt(settingsRow?.[SETTINGS.COUNTER] || '1', 10);
    const sessionsForBill = unbilledSessions.filter(s => selectedSessionIds.includes(s.data[SESSION.ID]));
    const sessionsForBillSorted = [...sessionsForBill].sort((a, b) => (a.data[SESSION.DATE] || '').localeCompare(b.data[SESSION.DATE] || ''));
    const ok = await runWithFeedback(async () => {
      const invoiceRow = [invoiceId, invoiceNumber, billingStudent[STUDENT.ID], dateNow, '', 'TH', totalSelectedHours, rate, subtotal, vatRate, vatAmount, total, 'โอนเงิน', 'UNPAID', '', new Date().toLocaleString('th-TH'), '', ''];
      const itemsForDb = sessionsForBillSorted.map(s => ['ITEM-' + Date.now() + Math.floor(Math.random() * 1000), invoiceId, s.data[SESSION.ID], s.data[SESSION.DATE], s.data[SESSION.SUBJECT], s.data[SESSION.HOURS], rate, safeFloat(s.data[SESSION.HOURS]) * rate]);
      await addInvoiceComplete(accessToken, dbId, invoiceRow, itemsForDb);
      await markSessionsAsInvoiced(accessToken, dbId, sessionsForBill.map(s => ({ rowIndex: s.rowIndex, invoiceId })));
    }, toast, 'ออกใบแจ้งค่าเรียนสำเร็จ!');
    if (ok) {
      try { await updateInvoiceCounter(accessToken, dbId, counter + 1); } catch (e) { console.warn('[COUNTER]', e); }
      setPreviewData({ invoiceId, arrayIndex: invoices.length, status: 'UNPAID', invoiceNumber, date: dateNow, studentName: billingStudent[STUDENT.NAME], studentId: billingStudent[STUDENT.ID], items: sessionsForBillSorted.map(s => ({ date: s.data[SESSION.DATE], subject: s.data[SESSION.SUBJECT], hours: s.data[SESSION.HOURS], rate, amount: safeFloat(s.data[SESSION.HOURS]) * rate })), totalHours: totalSelectedHours, totalAmount: total, vatAmount, vatRate });
      setBillingStudent(null); setUnbilledSessions([]); setSelectedSessionIds([]);
      refresh({ force: true });
    }
    setIsSubmitting(false);
  };

  // สร้างบิลให้ทุกคนที่มีคาบค้างในคลิกเดียว — ใช้สูตรเดียวกับ handleCreateInvoice
  // ทุกบรรทัด (คาบทั้งหมดของแต่ละคน, ไม่กรองช่วงวันที่) แล้วขยับ counter ทีเดียวตอนจบ
  // onlyStudentIds: ใช้ตอนกด "ลองใหม่เฉพาะที่พลาด" หลัง bulk billing รอบก่อนมีคนล้มเหลว
  const handleBulkInvoice = async (onlyStudentIds = null) => {
    const targets = students
      .filter(s => s[STUDENT.DELETED] !== 'TRUE' && (!onlyStudentIds || onlyStudentIds.includes(s[STUDENT.ID])))
      .map(stu => ({
        student: stu,
        unbilled: sessions
          .map((se, i) => ({ data: se, rowIndex: i + 2 }))
          .filter(x => x.data[SESSION.STUDENT_ID] === stu[STUDENT.ID] && x.data[SESSION.INVOICED] === 'FALSE' && x.data[SESSION.DELETED] !== 'TRUE')
          .sort((a, b) => (a.data[SESSION.DATE] || '').localeCompare(b.data[SESSION.DATE] || '')),
      }))
      .filter(t => t.unbilled.length > 0 && safeFloat(t.student[STUDENT.RATE]) > 0);
    if (targets.length === 0) return toast('ไม่มีนักเรียนที่มีคาบค้างชำระครับ', 'error');
    if (!onlyStudentIds) {
      const totalSessionCount = targets.reduce((n, t) => n + t.unbilled.length, 0);
      const ok = await confirm(`ออกบิลให้ ${targets.length} คน (รวม ${totalSessionCount} คาบที่ค้างอยู่ทั้งหมด) ยืนยันใช่ไหมครับ?`);
      if (!ok) return;
    }
    setIsBulkBilling(true);
    const prefix = settingsRow?.[SETTINGS.PREFIX] || 'ZW';
    const counter = parseInt(settingsRow?.[SETTINGS.COUNTER] || '1', 10);
    const year = new Date().getFullYear();
    const vatRate = safeFloat(settingsRow?.[SETTINGS.TAX_RATE] || 0) / 100;
    const dateNow = localDateStr();
    let created = 0;
    const failed = [];
    for (const [i, t] of targets.entries()) {
      const rate = safeFloat(t.student[STUDENT.RATE]);
      const totalHours = t.unbilled.reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);
      const subtotal = Math.round(totalHours * rate * 100) / 100;
      const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
      const total = Math.round((subtotal + vatAmount) * 100) / 100;
      const invoiceId = `INV-ID-${Date.now()}-${i}`;
      const invNumber = `${prefix}-${year}-${String(counter + created).padStart(4, '0')}`;
      try {
        const invoiceRow = [invoiceId, invNumber, t.student[STUDENT.ID], dateNow, '', 'TH', totalHours, rate, subtotal, vatRate, vatAmount, total, 'โอนเงิน', 'UNPAID', '', new Date().toLocaleString('th-TH'), '', ''];
        const itemsForDb = t.unbilled.map(s => ['ITEM-' + Date.now() + Math.floor(Math.random() * 1000), invoiceId, s.data[SESSION.ID], s.data[SESSION.DATE], s.data[SESSION.SUBJECT], s.data[SESSION.HOURS], rate, safeFloat(s.data[SESSION.HOURS]) * rate]);
        await addInvoiceComplete(accessToken, dbId, invoiceRow, itemsForDb);
        await markSessionsAsInvoiced(accessToken, dbId, t.unbilled.map(s => ({ rowIndex: s.rowIndex, invoiceId })));
        created += 1;
      } catch (err) {
        console.error('[BULK BILL]', t.student[STUDENT.NAME], err);
        failed.push({ id: t.student[STUDENT.ID], name: t.student[STUDENT.NAME] });
      }
    }
    if (created > 0) {
      try { await updateInvoiceCounter(accessToken, dbId, counter + created); } catch (e) { console.warn('[COUNTER]', e); }
    }
    setIsBulkBilling(false);
    refresh({ force: true });
    setFailedBulkStudents(failed);
    if (failed.length === 0) toast(`ออกบิลสำเร็จ ${created} ใบ! ดู/ส่งบิลได้ที่หน้า "ใบแจ้งหนี้" ครับ`, 'success');
    else toast(`ออกบิลสำเร็จ ${created} ใบ แต่ไม่สำเร็จ ${failed.length} คน (${failed.map(f => f.name).join(', ')}) — กดปุ่ม "ลองใหม่เฉพาะที่พลาด" ด้านบนได้เลยครับ`, 'error');
  };

  const handleChangeInvoiceStatus = async (invoiceId, arrayIndex, newStatus) => {
    const ok = await confirm(`เปลี่ยนสถานะบิลเป็น "${newStatus}" ยืนยันใช่ไหมครับ?`);
    if (!ok) return;
    const success = await runWithFeedback(() => updateInvoiceStatus(accessToken, dbId, arrayIndex + 2, newStatus), toast, 'อัปเดตสถานะเรียบร้อย!');
    if (success) { setPreviewData(prev => (prev?.invoiceId === invoiceId) ? { ...prev, status: newStatus } : prev); refresh({ force: true }); }
  };

  const handleSendLineFromPreview = async () => {
    if (!previewData) return;
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error');
    if (settingsRow?.[SETTINGS.SEND_INVOICE_RECEIPT] === 'FALSE') return toast('การส่งบิล/ใบเสร็จทาง LINE ถูกปิดอยู่ — เปิดได้ที่หน้าตั้งค่า LINE OA ครับ', 'error');
    const lineToken = settingsRow[SETTINGS.LINE_TOKEN];
    const lineWorkerUrl = settingsRow[SETTINGS.LINE_WORKER_URL];
    const student = students.find(s => s[STUDENT.ID] === previewData.studentId);
    if (!student) return toast('ไม่พบข้อมูลนักเรียน', 'error');
    const lineUserId = student[STUDENT_LINE_USER_ID] || '';
    if (!lineUserId) return toast('นักเรียนคนนี้ยังไม่มี LINE User ID ครับ', 'error');
    const instituteName = settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY';
    const stuCode = buildStudentLoginCode(student[STUDENT.NICKNAME], student[STUDENT.NAME]);
    const footnote = buildLineFootnote({ portalUrl: `${window.location.origin}/portal`, studentCode: stuCode });
    const msg = buildInvoiceLineMessage({ instituteName, studentName: previewData.studentName, invoiceNumber: previewData.invoiceNumber, date: previewData.date, dueDate: '', items: previewData.items, totalHours: previewData.totalHours, totalAmount: previewData.totalAmount, status: previewData.status, footnote });
    setIsSendingLine(true);
    const sentAt = new Date().toLocaleString('th-TH');
    try {
      await sendLineMessage(lineWorkerUrl, lineToken, lineUserId, msg);
      const invoiceIndex = invoices.findIndex(i => i[INVOICE.ID] === previewData.invoiceId);
      if (invoiceIndex >= 0) await updateInvoiceLineSentAt(accessToken, dbId, invoiceIndex + 2, sentAt);
      toast(`ส่ง LINE หา ${previewData.studentName} สำเร็จ!`, 'success');
      setPreviewData(prev => prev ? { ...prev, lineSentAt: sentAt } : prev);
    } catch (err) { toastLineError(toast, err, '/settings'); }
    setIsSendingLine(false);
  };

  const handleSendLineImageFromPreview = async () => {
    if (!previewData) return;
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error');
    if (settingsRow?.[SETTINGS.SEND_INVOICE_RECEIPT] === 'FALSE') return toast('การส่งบิล/ใบเสร็จทาง LINE ถูกปิดอยู่ — เปิดได้ที่หน้าตั้งค่า LINE OA ครับ', 'error');
    const lineToken = settingsRow[SETTINGS.LINE_TOKEN];
    const lineWorkerUrl = settingsRow[SETTINGS.LINE_WORKER_URL];
    const student = students.find(s => s[STUDENT.ID] === previewData.studentId);
    const lineUserId = student?.[STUDENT_LINE_USER_ID] || '';
    if (!lineUserId) return toast('นักเรียนคนนี้ยังไม่มี LINE User ID ครับ', 'error');
    setIsSendingLineImage(true);
    const sentAt = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      const imageDataUrl = await elementToJpegDataUrl('invoice-preview-container');
      await sendLineImageMessage(lineWorkerUrl, lineToken, lineUserId, imageDataUrl);
      const invoiceIndex = invoices.findIndex(i => i[INVOICE.ID] === previewData.invoiceId);
      if (invoiceIndex >= 0) await updateInvoiceLineSentAt(accessToken, dbId, invoiceIndex + 2, sentAt);
    }, toast, `ส่งรูปบิลทาง LINE หา ${previewData.studentName} สำเร็จ!`);
    if (ok) setPreviewData(prev => prev ? { ...prev, lineSentAt: sentAt } : prev);
    setIsSendingLineImage(false);
  };

  const allActiveStudents = students.map((s, i) => ({ data: s, rowIndex: i + 2 })).filter(item => item.data[STUDENT.DELETED] !== 'TRUE').sort((a, b) => (a.data[STUDENT.NAME] || '').localeCompare(b.data[STUDENT.NAME] || '', 'th'));
  const activeStudents = searchTerm ? allActiveStudents.filter(item => { const term = searchTerm.toLowerCase(); return (item.data[STUDENT.NAME] || '').toLowerCase().includes(term) || (item.data[STUDENT.SUBJECT] || '').toLowerCase().includes(term); }) : allActiveStudents;

  return (
    <div className="p-6 max-w-6xl mx-auto relative">
      <Dialog />

      {sendTemplateStudent && <SendTemplateModal student={sendTemplateStudent} settingsRow={settingsRow} lineOAEnabled={lineOAEnabled} invoices={invoices} sessions={sessions} onClose={() => setSendTemplateStudent(null)} toast={toast} />}
      {pkgHistoryStudent && <PackageHistoryModal student={pkgHistoryStudent} sessions={sessions} receipts={receipts} onClose={() => setPkgHistoryStudent(null)} />}

      {pkgReceiptPreview && (
        <InvoicePreviewModal
          previewData={{ invoiceNumber: pkgReceiptPreview.receiptNum, status: 'PAID' }}
          settings={settingsRow}
          onClose={() => setPkgReceiptPreview(null)}
          onDownloadJPG={() => { setIsExportingPkgReceipt(true); exportElementAsJPG('pkg-receipt-container', `PackageReceipt_${pkgReceiptPreview.receiptNum}.jpg`, toast).finally(() => setIsExportingPkgReceipt(false)); }}
          onDownloadPDF={() => { setIsExportingPkgReceipt(true); exportElementAsPDF('pkg-receipt-container', `PackageReceipt_${pkgReceiptPreview.receiptNum}.pdf`, toast).finally(() => setIsExportingPkgReceipt(false)); }}
          isExporting={isExportingPkgReceipt}
          elementId="pkg-receipt-container"
          filename={`PackageReceipt_${pkgReceiptPreview.receiptNum}.jpg`}
          onSendLineImage={lineOAEnabled && settingsRow?.[SETTINGS.LINE_TOKEN] && settingsRow?.[SETTINGS.LINE_WORKER_URL] ? async () => {
            const stu = students.find(s => s[STUDENT.NAME] === pkgReceiptPreview.studentName);
            const lineUserId = stu?.[STUDENT_LINE_USER_ID] || '';
            if (!lineUserId) return toast('นักเรียนคนนี้ยังไม่มี LINE User ID ครับ', 'error');
            setIsSendingPkgReceipt(true);
            try { const imageDataUrl = await elementToJpegDataUrl('pkg-receipt-container'); await sendLineImageMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, imageDataUrl); toast(`ส่งใบเสร็จเติมแพ็กเกจทาง LINE ให้ ${pkgReceiptPreview.studentName} แล้วครับ`, 'success'); } catch (e) { toast(`ส่งไม่สำเร็จ: ${e.message}`, 'error'); }
            finally { setIsSendingPkgReceipt(false); }
          } : undefined}
          isSendingLineImage={isSendingPkgReceipt}
          sendImageLabel="ใบเสร็จแพ็กเกจ"
        >
          <PackageReceiptDocument id="pkg-receipt-container" receipt={pkgReceiptPreview} accentColor={settingsRow?.[SETTINGS.ACCENT_COLOR] || '#1d4ed8'} logoUrl={settingsRow?.[SETTINGS.LOGO_URL] || ''} instituteName={settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY'} footerNote={settingsRow?.[SETTINGS.FOOTER_NOTE] || 'ขอบคุณที่ไว้วางใจครับ'} signatureUrl={settingsRow?.[SETTINGS.SIGNATURE_URL] || ''} />
        </InvoicePreviewModal>
      )}

      {previewData && (
        <InvoicePreviewModal
          previewData={previewData} settings={settingsRow} onClose={() => setPreviewData(null)}
          onConfirmPaid={() => handleChangeInvoiceStatus(previewData.invoiceId, previewData.arrayIndex, 'PAID')}
          onDownloadJPG={() => { setIsExporting(true); exportElementAsJPG('invoice-preview-container', `Invoice_${previewData.invoiceNumber}.jpg`, toast).finally(() => { setIsExporting(false); setPreviewData(prev => prev ? { ...prev, lastSharedAt: new Date().toLocaleString('th-TH') } : prev); }); }}
          onDownloadPDF={() => { setIsExporting(true); exportElementAsPDF('invoice-preview-container', `Invoice_${previewData.invoiceNumber}.pdf`, toast).finally(() => { setIsExporting(false); setPreviewData(prev => prev ? { ...prev, lastSharedAt: new Date().toLocaleString('th-TH') } : prev); }); }}
          isExporting={isExporting}
          onSendLine={lineOAEnabled && settingsRow?.[SETTINGS.LINE_TOKEN] && settingsRow?.[SETTINGS.LINE_WORKER_URL] ? handleSendLineFromPreview : undefined}
          isSendingLine={isSendingLine}
          onSendLineImage={lineOAEnabled && settingsRow?.[SETTINGS.LINE_TOKEN] && settingsRow?.[SETTINGS.LINE_WORKER_URL] ? handleSendLineImageFromPreview : undefined}
          isSendingLineImage={isSendingLineImage}
          lineSentAt={previewData.lineSentAt}
          lastSharedAt={previewData.lastSharedAt}
        >
          <InvoiceDocument id="invoice-preview-container" previewData={previewData} accentColor={settingsRow?.[SETTINGS.ACCENT_COLOR] || '#1d4ed8'} logoUrl={settingsRow?.[SETTINGS.LOGO_URL] || ''} instituteName={settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY'} paymentMethods={settingsRow?.[SETTINGS.PAYMENT_METHODS] || 'กรุณาตั้งค่าช่องทางการชำระเงินในเมนูตั้งค่า'} footerNote={settingsRow?.[SETTINGS.FOOTER_NOTE] || 'ขอขอบคุณที่ไว้วางใจให้เราดูแลการเรียนของคุณนะครับ'} qrCodeUrl={qrCodeUrl} promptpayId={settingsRow?.[SETTINGS.PROMPTPAY_ID]} />
        </InvoicePreviewModal>
      )}

      {topUpStudent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold text-gray-900 text-[18px]">เติมแพ็กเกจเหมาจ่าย</h3>
              <button onClick={() => setTopUpStudent(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleTopUp} className="space-y-4">
              <div className="bg-purple-50 border border-purple-100 p-4 rounded-[12px] text-[14px] text-gray-800">
                <p><span className="font-semibold text-purple-900">นักเรียน:</span> {topUpStudent.data[STUDENT.NAME]}</p>
                <p className="mt-1"><span className="font-semibold text-purple-900">คงเหลือปัจจุบัน:</span> {safeFloat(topUpStudent.data[STUDENT.PACKAGE_HOURS])} ชม.</p>
                <p className="mt-1"><span className="font-semibold text-purple-900">เรทค่าเรียน:</span> {studentRateForTopUp > 0 ? `${studentRateForTopUp.toLocaleString()} บาท/ชม.` : 'ยังไม่ได้ตั้งเรท'}</p>
                {studentRateForTopUp <= 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const stu = topUpStudent;
                      setTopUpStudent(null);
                      setEditingStudent(stu);
                      setFormData({ name: stu.data[STUDENT.NAME], subject: stu.data[STUDENT.SUBJECT] || '', rate: stu.data[STUDENT.RATE], line_user_id: stu.data[STUDENT_LINE_USER_ID] || '', line_group_id: stu.data[STUDENT_LINE_GROUP_ID] || '', loginCode: stu.data[STUDENT.NICKNAME] || '' });
                      setShowForm(true);
                    }}
                    className="mt-2 text-[12px] font-semibold text-purple-700 hover:text-purple-900 underline"
                  >
                    ตั้งเรทให้นักเรียนคนนี้ก่อน →
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-[10px]">
                <button type="button" onClick={() => setTopUpMode('hours')} className={`py-2 rounded-[8px] text-[13px] font-medium transition-all ${topUpMode === 'hours' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>กรอกจำนวนชั่วโมง</button>
                <button type="button" onClick={() => setTopUpMode('amount')} className={`py-2 rounded-[8px] text-[13px] font-medium transition-all ${topUpMode === 'amount' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>กรอกยอดเงิน</button>
              </div>
              {topUpMode === 'hours' ? (
                <div><label className={labelClasses}>จำนวนชั่วโมงที่เติม</label><input type="number" step="0.5" min="0.5" required autoFocus value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} className={inputClasses} placeholder="เช่น 10" /></div>
              ) : (
                <div>
                  <label className={labelClasses}>ยอดเงินที่รับ (บาท)</label>
                  <input type="number" step="1" min="1" required autoFocus value={topUpMoneyAmount} onChange={e => setTopUpMoneyAmount(e.target.value)} className={inputClasses} placeholder="เช่น 5000" disabled={studentRateForTopUp <= 0} />
                  <p className="text-[12px] text-gray-500 mt-2">{studentRateForTopUp > 0 ? <>= <span className="font-semibold text-purple-700">{topUpHoursFromAmount.toLocaleString()}</span> ชม. (หารด้วยเรท {studentRateForTopUp.toLocaleString()} บาท/ชม.)</> : 'นักเรียนคนนี้ยังไม่ได้ตั้งเรทค่าเรียน/ชม.'}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setTopUpStudent(null)} className={btnSecondary}>ยกเลิก</button>
                <button type="submit" disabled={isToppingUp} className={`${btnPrimary} flex-1`}>{isToppingUp ? 'กำลังเติม...' : 'ยืนยันเติมแพ็กเกจ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reportStudent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[16px] p-6 max-w-md w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)] my-8">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold text-gray-900 text-[18px]">ออกรายงานประเมินผล</h3>
              <button onClick={() => setReportStudent(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-[12px] text-[14px] text-gray-800 mb-4"><p><span className="font-semibold text-amber-900">นักเรียน:</span> {reportStudent.data[STUDENT.NAME]}</p></div>
            <div className="mb-5"><label className={labelClasses}>เลือกเดือน</label><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className={inputClasses} /></div>
            {reportData && (
              <div className="bg-gray-50 border border-gray-200 rounded-[12px] p-4 mb-5 text-[13px] space-y-1.5">
                <p className="text-gray-600">คาบเรียนในเดือนนี้: <span className="font-semibold text-gray-900">{reportData.sessionCount} คาบ</span> ({reportData.totalHours} ชม.)</p>
                {SKILL_LABELS.map(s => (
                  <p key={s.key} className="text-gray-600">{s.label}: <span className="font-semibold text-gray-900">{reportData.averages[s.key] > 0 ? reportData.averages[s.key].toFixed(1) : '—'}/5</span></p>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setReportStudent(null)} className={btnSecondary}>ปิด</button>
              <button type="button" disabled={isExportingReport || !reportData || reportData.sessionCount === 0} onClick={() => { setIsExportingReport(true); exportElementAsPDF('progress-report-container', `Progress_${reportStudent.data[STUDENT.NAME]}_${reportMonth}.pdf`, toast).finally(() => setIsExportingReport(false)); }} className={`${btnPrimary} flex-1 disabled:bg-gray-300`}>{isExportingReport ? 'กำลังสร้าง PDF...' : reportData?.sessionCount === 0 ? 'ไม่มีคาบเรียนในเดือนนี้' : 'ดาวน์โหลด PDF'}</button>
            </div>
            {reportData && <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }}><ProgressReportDocument id="progress-report-container" reportData={reportData} accentColor={settingsRow?.[SETTINGS.ACCENT_COLOR] || '#1d4ed8'} logoUrl={settingsRow?.[SETTINGS.LOGO_URL] || ''} instituteName={settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY'} /></div>}
          </div>
        </div>
      )}

      {billingStudent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-[700px] w-full max-h-[90vh] flex flex-col shadow-[0_20px_40px_rgba(0,0,0,0.15)] animate-[slideIn_200ms_ease-out]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 text-[20px]">ออกใบแจ้งค่าเรียน</h3>
              <button onClick={() => setBillingStudent(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateInvoice} className="flex-1 overflow-y-auto pr-2 space-y-5">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-[12px] text-[14px] text-gray-800">
                <p className="text-[16px]"><span className="font-semibold text-blue-900">นักเรียน:</span> {billingStudent[STUDENT.NAME]}</p>
                <p className="mt-1"><span className="font-semibold text-blue-900">เรทค่าสอน:</span> {billingStudent[STUDENT.RATE]} บาท/ชม.</p>
              </div>
              <div><label className={labelClasses}>เลขที่ใบแจ้งค่าเรียน</label><input type="text" required value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className={`${inputClasses} font-mono`} /></div>
              <div className="flex gap-3 items-end">
                <div className="flex-1"><label className={labelClasses}>กรองช่วงวันที่: จาก</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClasses} /></div>
                <div className="flex-1"><label className={labelClasses}>ถึง</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClasses} /></div>
                {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className={btnSecondary}>ล้าง</button>}
              </div>
              <div className="border border-gray-200 rounded-[12px] overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <span className="font-semibold text-gray-900 text-[14px]">รายการคาบเรียนที่ค้างชำระ</span>
                  <button type="button" onClick={handleSelectAllSessions} className="text-[12px] font-semibold text-blue-600 hover:text-blue-800">{allFilteredSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}</button>
                </div>
                <div className="p-4 max-h-60 overflow-y-auto bg-white">
                  {filteredUnbilled.length === 0 ? <p className="text-center text-gray-500 py-4 text-[14px]">{unbilledSessions.length === 0 ? 'ไม่มีคาบเรียนที่ค้างชำระ' : 'ไม่มีคาบในช่วงวันที่ที่เลือก'}</p>
                    : filteredUnbilled.map((session, idx) => (
                      <label key={idx} className="flex items-center p-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer rounded-[8px] transition-colors">
                        <input type="checkbox" className="w-5 h-5 text-blue-600 rounded mr-3" checked={selectedSessionIds.includes(session.data[SESSION.ID])} onChange={() => handleCheckboxChange(session.data[SESSION.ID])} />
                        <div className="flex-1"><p className="font-medium text-gray-900 text-[14px]">{session.data[SESSION.SUBJECT]} <span className="text-[12px] text-gray-500 font-normal ml-2">({session.data[SESSION.DATE]})</span></p></div>
                        <div className="text-right"><p className="font-semibold text-gray-900 text-[14px]">{session.data[SESSION.HOURS]} ชม.</p><p className="text-[12px] text-gray-500">{(safeFloat(session.data[SESSION.HOURS]) * safeFloat(billingStudent[STUDENT.RATE])).toLocaleString()} ฿</p></div>
                      </label>
                    ))}
                </div>
              </div>
              {selectedSessionIds.length > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-[12px] text-center shadow-sm">
                  <p className="text-[14px] text-green-800 font-medium">รวมเวลาสอน {totalSelectedHours} ชั่วโมง</p>
                  <p className="text-[12px] text-gray-600 mb-1">({totalSelectedHours} ชม. × {billingStudent[STUDENT.RATE]} บาท)</p>
                  <p className="text-[24px] font-bold text-gray-900 mt-1">{(totalSelectedHours * safeFloat(billingStudent[STUDENT.RATE])).toLocaleString()} ฿</p>
                </div>
              )}
              <div className="pt-2"><button type="submit" disabled={selectedSessionIds.length === 0 || isSubmitting} className={`w-full py-3 ${selectedSessionIds.length === 0 || isSubmitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'} rounded-[12px] font-semibold transition-all shadow-sm`}>{isSubmitting ? 'กำลังออกบิล...' : 'ยืนยันออกใบแจ้งค่าเรียน'}</button></div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-[24px] font-bold text-gray-900">นักเรียน & ออกบิล</h2>
          <p className="text-[14px] text-gray-500 mt-1">จัดการรายชื่อและคำนวณค่าเรียน</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const unbilledStudentCount = students.filter(s => s[STUDENT.DELETED] !== 'TRUE' && safeFloat(s[STUDENT.RATE]) > 0 && sessions.some(se => se[SESSION.STUDENT_ID] === s[STUDENT.ID] && se[SESSION.INVOICED] === 'FALSE' && se[SESSION.DELETED] !== 'TRUE')).length;
            if (unbilledStudentCount === 0) return null;
            return (
              <button onClick={() => handleBulkInvoice()} disabled={isBulkBilling} className={`${btnSuccess} disabled:opacity-60`}>
                {isBulkBilling ? 'กำลังออกบิล...' : `ออกบิลทุกคนที่ค้าง (${unbilledStudentCount})`}
              </button>
            );
          })()}
          {failedBulkStudents.length > 0 && (
            <button onClick={() => handleBulkInvoice(failedBulkStudents.map(f => f.id))} disabled={isBulkBilling} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-[10px] active:scale-95 transition-all text-[13px] disabled:opacity-60">
              ลองใหม่เฉพาะที่พลาด ({failedBulkStudents.length} คน)
            </button>
          )}
          <button onClick={() => { if (showForm) { setEditingStudent(null); setFormData({ name: '', subject: '', rate: '', line_user_id: '', line_group_id: '', loginCode: '' }); } setShowForm(!showForm); }} className={showForm ? btnSecondary : btnPrimary}>{showForm ? <><X className="w-4 h-4 inline mr-1" />ยกเลิก</> : '+ เพิ่มนักเรียนใหม่'}</button>
        </div>
      </div>

      {showForm && (
        <form id="group-form-anchor" onSubmit={handleSubmit} className="mb-8 p-6 bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] animate-[slideIn_150ms_ease-out]">
          <h3 className="font-semibold text-gray-900 mb-5 text-[16px]">{editingStudent ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มรายชื่อนักเรียนใหม่'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div><label className={labelClasses}>ชื่อ <span className="text-red-500">*</span></label><input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputClasses} placeholder="เช่น น้องเก่ง" /></div>
            <div><label className={labelClasses}>วิชาที่เรียน</label><SubjectComboInput value={formData.subject} onChange={v => setFormData({ ...formData, subject: v })} /><p className="text-[11px] text-gray-500 mt-1.5">ช่วยหาตัวง่ายตอนลงเวลาสอน ไม่บังคับ</p></div>
            <div><label className={labelClasses}>ค่าสอน/ชั่วโมง (บาท) <span className="text-red-500">*</span></label><input type="number" required min="1" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} className={inputClasses} placeholder="เช่น 500" /></div>
            <div>
              <label className={labelClasses}>รหัส Portal</label>
              {editingStudent && studentLoginCode ? (
                <><input type="text" disabled value={studentLoginCode} className={`${inputClasses} font-mono bg-gray-50 text-gray-500`} /><p className="text-[11px] text-gray-500 mt-1.5">รหัสนี้ใช้ล็อกอินหน้า Student Portal — ระบบ gen ไว้แล้ว ไม่ต้องแก้</p></>
              ) : (
                <><input type="text" disabled value="จะสุ่มให้อัตโนมัติเมื่อบันทึก" className={`${inputClasses} bg-gray-50 text-gray-400 text-[13px]`} /><p className="text-[11px] text-gray-500 mt-1.5">รูปแบบ: 2 ตัวแรกของชื่อ + เลขสุ่ม 2 หลัก เช่น PA47 (ไม่ซ้ำกับใครแน่นอน)</p></>
              )}
            </div>
            {lineOAEnabled && (
              <div>
                <label className={labelClasses}>LINE User ID</label>
                <input type="text" value={formData.line_user_id || ''} onChange={e => setFormData({ ...formData, line_user_id: e.target.value })} className={`${inputClasses} font-mono text-[13px]`} placeholder="U1a2b3c4d5e6f..." />
                {formData.line_user_id && !/^U[0-9a-f]{32}$/i.test(formData.line_user_id.trim())
                  ? <p className="text-[11px] text-red-500 mt-1">รูปแบบไม่ตรง — LINE User ID ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร/เลข 32 ตัว มิฉะนั้นส่ง LINE จะไม่สำเร็จ</p>
                  : <p className="text-[11px] text-gray-400 mt-1">ดูได้ใน LINE OA Manager → Chats → คลิกชื่อนักเรียน</p>}
              </div>
            )}
            {lineOAEnabled && (
              <div>
                <label className={labelClasses}>LINE Group ID <span className="text-gray-400 font-normal">(ถ้ามีเรียนกลุ่ม)</span></label>
                <input type="text" value={formData.line_group_id || ''} onChange={e => setFormData({ ...formData, line_group_id: e.target.value })} className={`${inputClasses} font-mono text-[13px]`} placeholder="C1a2b3c4d5e6f..." />
                {formData.line_group_id && !/^C[0-9a-f]{32}$/i.test(formData.line_group_id.trim()) && (
                  <p className="text-[11px] text-red-500 mt-1">รูปแบบไม่ตรง — LINE Group ID ต้องขึ้นต้นด้วย C ตามด้วยตัวอักษร/เลข 32 ตัว</p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-4 border-t border-gray-100"><button type="submit" disabled={!isValid || isSubmitting} className={btnPrimary}>{isSubmitting ? 'กำลังบันทึก...' : `${editingStudent ? 'อัปเดตข้อมูล' : 'บันทึกข้อมูลใหม่'}`}</button></div>
        </form>
      )}

      <StateDisplay
        loading={loading}
        error={error}
        empty={allActiveStudents.length === 0}
        emptyMessage={'ยังไม่มีนักเรียนในระบบครับ — กดปุ่ม "เพิ่มนักเรียนใหม่" ด้านบนเพื่อเริ่มต้น'}
        emptyIcon={<GraduationCap className="w-6 h-6 text-gray-400" strokeWidth={1.5} />}
        onRetry={refresh}
      >
        <>
          <div className="mb-5"><input type="text" placeholder="ค้นหาชื่อ หรือวิชาที่เรียน..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={`${inputClasses} max-w-md`} /></div>
          {activeStudents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-[12px] border border-gray-200"><Search className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="font-medium text-gray-600 text-[14px]">ไม่พบนักเรียนที่ค้นหา</p><button onClick={() => setSearchTerm('')} className="mt-2 text-[12px] text-blue-500 hover:underline">ล้างการค้นหา</button></div>
          ) : (
            <div className="overflow-x-auto rounded-[12px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] bg-white">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">ชื่อ</th>
                    <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">วิชาที่เรียน</th>
                    <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">เรท (฿/ชม.)</th>
                    <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">แพ็กเกจคงเหลือ</th>
                    <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">สถานะคาบเรียน</th>
                    <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStudents.map((student, index) => {
                    const summary = getStudentSummary(student.data[STUDENT.ID], student.data[STUDENT.RATE]);
                    return (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="p-4 align-top">
                          <div className="font-medium text-gray-900 text-[14px] leading-tight">{student.data[STUDENT.NAME]}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {(() => {
                              const stuCode = buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]);
                              if (!stuCode) return null;
                              return (
                                <button
                                  onClick={() => { copyText(stuCode); toast(`คัดลอกรหัส ${stuCode} แล้ว`, 'success'); }}
                                  title="คลิกเพื่อคัดลอกรหัส Login"
                                  className="font-mono text-[11px] font-bold tracking-widest bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-[6px] hover:bg-indigo-100 transition-all active:scale-95 inline-flex items-center gap-1"
                                >
                                  <Copy className="w-2.5 h-2.5" strokeWidth={2} />{stuCode}
                                </button>
                              );
                            })()}
                            {student.data[STUDENT_LINE_USER_ID]
                              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />LINE</span>
                              : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">ยังไม่เชื่อม LINE</span>
                            }
                          </div>
                        </td>
                        <td className="p-4">{student.data[STUDENT.SUBJECT] ? <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-[6px] text-[12px] font-medium border border-blue-100">{student.data[STUDENT.SUBJECT]}</span> : <span className="text-gray-400">-</span>}</td>
                        <td className="p-4 text-gray-900 font-medium text-[14px]">{safeFloat(student.data[STUDENT.RATE]).toLocaleString()}</td>
                        <td className="p-4">{safeFloat(student.data[STUDENT.PACKAGE_HOURS]) > 0 ? <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-[6px] text-[12px] font-medium border border-purple-200">{safeFloat(student.data[STUDENT.PACKAGE_HOURS])} ชม.</span> : <span className="text-gray-400 text-[12px]">-</span>}</td>
                        <td className="p-4">{summary.unbilledCount > 0 ? <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-[6px] text-[12px] font-medium border border-amber-200">ค้าง {summary.unbilledCount} คาบ · {summary.pendingAmount.toLocaleString()} ฿</span> : <span className="text-gray-400 text-[12px]">เคลียร์ครบแล้ว</span>}</td>
                        <td className="p-4">
                          <div className="flex justify-center items-center gap-2">
                            {summary.unbilledCount > 0 && <button onClick={() => handleOpenBilling(student.data)} className={btnSuccess}>ออกบิล</button>}
                            <RowActionsMenu items={[
                              { label: 'แก้ไข', icon: <Pencil className="w-3.5 h-3.5" />, onClick: () => { setEditingStudent(student); setFormData({ name: student.data[STUDENT.NAME], subject: student.data[STUDENT.SUBJECT] || '', rate: student.data[STUDENT.RATE], line_user_id: student.data[STUDENT_LINE_USER_ID] || '', line_group_id: student.data[STUDENT_LINE_GROUP_ID] || '', loginCode: student.data[STUDENT.NICKNAME] || '' }); setShowForm(true); } },
                              { label: 'ส่งข้อความ LINE', icon: <MessageSquare className="w-3.5 h-3.5" />, colorClass: 'text-green-700', onClick: () => setSendTemplateStudent(student) },
                              { label: 'ดูประวัติแพ็กเกจ', icon: <ClipboardList className="w-3.5 h-3.5" />, colorClass: 'text-indigo-700', hidden: safeFloat(student.data[STUDENT.PACKAGE_HOURS]) === 0 && !sessions.some(s => s[SESSION.STUDENT_ID] === student.data[STUDENT.ID] && s[SESSION.INVOICED] === 'PREPAID'), onClick: () => setPkgHistoryStudent(student) },
                              { label: 'เติมแพ็กเกจ', icon: <Package className="w-3.5 h-3.5" />, colorClass: 'text-purple-700', onClick: () => { setTopUpStudent(student); setTopUpAmount(''); setTopUpMoneyAmount(''); setTopUpMode('hours'); } },
                              { label: student.data[STUDENT_LINE_USER_ID] ? 'คัดลอกลิงก์ LINE (เชื่อมต่อแล้ว)' : 'คัดลอกลิงก์ LINE', icon: student.data[STUDENT_LINE_USER_ID] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Link2 className="w-3.5 h-3.5" />, colorClass: student.data[STUDENT_LINE_USER_ID] ? 'text-green-700' : 'text-gray-600',
                                onClick: () => {
                                  const oaName = settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'LINE OA ของสถาบัน';
                                  const url = `${window.location.origin}/line-connect?sid=${student.data[STUDENT.ID]}&db=${dbId}&name=${encodeURIComponent(student.data[STUDENT.NAME])}&oa=${encodeURIComponent(oaName)}`;
                                  const msg = `📲 สวัสดีครับคุณ${student.data[STUDENT.NAME]} 😊\n\nกดลิงก์ด้านล่างเพื่อเชื่อมต่อ LINE กับระบบของ${TEACHER_ROLE_LABEL}นะครับ\n\n${url}`;
                                  copyText(msg);
                                  toast(`คัดลอกข้อความ+ลิงก์ของ ${student.data[STUDENT.NAME]} แล้ว`, 'success');
                                }
                              },
                              { label: 'ยกเลิกเชื่อมต่อกลุ่ม LINE', icon: <Users className="w-3.5 h-3.5" />, colorClass: 'text-gray-600', hidden: !student.data[STUDENT_LINE_GROUP_ID], onClick: async () => { const ok = await runWithFeedback(() => updateStudentLineGroupId(accessToken, dbId, student.rowIndex, ''), toast, `ยกเลิกเชื่อมต่อกลุ่ม LINE ของ ${student.data[STUDENT.NAME]} แล้วครับ`); if (ok) refresh({ force: true }); } },
                              { label: 'ออกรายงาน', icon: <BarChart2 className="w-3.5 h-3.5" />, colorClass: 'text-amber-700', onClick: () => { setReportStudent(student); setReportMonth(localDateStr().slice(0, 7)); } },
                              { label: 'คัดลอกข้อความ Portal', icon: <Key className="w-3.5 h-3.5" />, colorClass: 'text-blue-700', hidden: !buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]), onClick: () => { const stuCode = buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]); const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || ''; const portalUrl = classCode ? `${window.location.origin}/portal?class=${encodeURIComponent(classCode)}&code=${stuCode}` : `${window.location.origin}/portal?code=${stuCode}`; copyText(buildPortalIntroMessage({ studentName: student.data[STUDENT.NAME], portalUrl, stuCode, settingsRow })); toast(`คัดลอกข้อความ Portal ของ ${student.data[STUDENT.NAME]} แล้ว`, 'success'); } },
                              { label: 'แชร์ข้อความ Portal', icon: <Share2 className="w-3.5 h-3.5" />, colorClass: 'text-indigo-700', hidden: !buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]), onClick: async () => { const stuCode = buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]); const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || ''; const portalUrl = classCode ? `${window.location.origin}/portal?class=${encodeURIComponent(classCode)}&code=${stuCode}` : `${window.location.origin}/portal?code=${stuCode}`; const msg = buildPortalIntroMessage({ studentName: student.data[STUDENT.NAME], portalUrl, stuCode, settingsRow }); if (navigator.share) { try { await navigator.share({ text: msg }); return; } catch (e) { if (e.name === 'AbortError') return; } } copyText(msg); toast('คัดลอกข้อความแล้ว', 'success'); } },
                              { label: 'ส่ง LINE Portal', icon: <Send className="w-3.5 h-3.5" />, colorClass: 'text-green-700', hidden: !buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]), onClick: async () => { const lineUserId = student.data[STUDENT_LINE_USER_ID]; if (!lineUserId) { toast(`${student.data[STUDENT.NAME]} ยังไม่ได้เชื่อมต่อ LINE ครับ`, 'error'); return; } if (!canSendLine(settingsRow)) { toast('LINE OA ยังไม่ได้ตั้งค่าครับ', 'error'); return; } const stuCode = buildStudentLoginCode(student.data[STUDENT.NICKNAME], student.data[STUDENT.NAME]); const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || ''; const portalUrl = classCode ? `${window.location.origin}/portal?class=${encodeURIComponent(classCode)}&code=${stuCode}` : `${window.location.origin}/portal?code=${stuCode}`; const msg = buildPortalIntroMessage({ studentName: student.data[STUDENT.NAME], portalUrl, stuCode, settingsRow }); try { await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, msg); toast(`ส่ง LINE ให้ ${student.data[STUDENT.NAME]} แล้วครับ`, 'success'); } catch (err) { toastLineError(toast, err); } } },
                              { label: 'ลบ', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: () => handleDeleteClick(student) },
                            ]} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      </StateDisplay>
    </div>
  );
}
