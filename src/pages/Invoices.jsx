// @ts-nocheck
import { useState, useEffect } from 'react';
import { STUDENT, SESSION, INVOICE, RECEIPT, SETTINGS, GROUP, STUDENT_LINE_USER_ID, isLineOAEnabled, canSendLine } from '../lib/constants';
import { safeFloat, runWithFeedback, buildInvoiceLineMessage, elementToJpegDataUrl, exportElementAsJPG, exportElementAsPDF, generatePromptPayQRCode, localDateStr } from '../lib/business';
import { useSheetData } from '../hooks/useSheetData';
import { useConfirm } from '../hooks/useConfirm';
import { InvoiceDocument } from '../components/documents/InvoiceDocument';
import { ReceiptDocument } from '../components/documents/ReceiptDocument';
import { InvoicePreviewModal } from '../components/modals/InvoicePreviewModal';
import { getStudents, getSessions, getInvoices, getSettings, getReceipts, getGroups, addReceipt, linkReceiptToInvoice, updateInvoiceStatus, updateInvoiceLineSentAt, sendLineMessage, sendLineImageMessage, sendLineMulticast, voidInvoiceComplete } from '../services/googleSheets';
import { StateDisplay } from '../components/ui/StateDisplay';
import { Megaphone, Search, X, Users, Check } from 'lucide-react';

const STATUS_CONFIG = {
  UNPAID: { label: 'รอชำระ',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  SENT:   { label: 'ส่งแล้ว', bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  PAID:   { label: 'ชำระแล้ว',bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-700',dot: 'bg-emerald-500' },
  VOID:   { label: 'ยกเลิก',  bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-600',    dot: 'bg-red-400' },
};

function StatusBadge({ status, interactive, onChange }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['UNPAID'];
  if (interactive) {
    return (
      <select value={status} onChange={e => onChange(e.target.value)}
        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer outline-none transition-colors appearance-none text-center ${cfg.bg} ${cfg.border} ${cfg.text}`}>
        <option value="UNPAID">รอชำระ</option>
        <option value="SENT">ส่งแล้ว</option>
        <option value="PAID">ชำระแล้ว</option>
      </select>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function Invoices({ accessToken, dbId, toast }) {
  const [previewData, setPreviewData]       = useState(null);
  const [isExporting, setIsExporting]       = useState(false);
  const [qrCodeUrl, setQrCodeUrl]           = useState('');
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isIssuingReceipt, setIsIssuingReceipt] = useState(false);
  const [searchTerm, setSearchTerm]         = useState('');
  const [filterStatus, setFilterStatus]     = useState('ALL');
  const { confirm, Dialog }                 = useConfirm();

  const { data, loading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { students: getStudents, sessions: getSessions, invoices: getInvoices, settings: getSettings, receipts: getReceipts, groups: getGroups } });
  const students    = data.students || [];
  const sessions    = data.sessions || [];
  const invoices    = data.invoices || [];
  const receipts    = data.receipts || [];
  const groups      = data.groups   || [];
  const settingsRow = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
  const lineOAEnabled = isLineOAEnabled(settingsRow);
  const lineToken     = settingsRow?.[SETTINGS.LINE_TOKEN]      || '';
  const lineWorkerUrl = settingsRow?.[SETTINGS.LINE_WORKER_URL] || '';
  const accentColor    = settingsRow?.[SETTINGS.ACCENT_COLOR]    || '#1d4ed8';
  const logoUrl        = settingsRow?.[SETTINGS.LOGO_URL]        || '';
  const instituteName  = settingsRow?.[SETTINGS.INSTITUTE_NAME]  || 'SHIFTHIGHBURY';
  const paymentMethods = settingsRow?.[SETTINGS.PAYMENT_METHODS] || 'กรุณาตั้งค่าช่องทางการชำระเงินในเมนูตั้งค่า';
  const footerNote     = settingsRow?.[SETTINGS.FOOTER_NOTE]     || 'ขอขอบคุณที่ไว้วางใจให้เราดูแลการเรียนของคุณนะคะ';
  const signatureUrl   = settingsRow?.[SETTINGS.SIGNATURE_URL]   || '';

  const [isSendingLine, setIsSendingLine]                 = useState(false);
  const [isSendingLineImage, setIsSendingLineImage]       = useState(false);
  const [isSendingReceiptImage, setIsSendingReceiptImage] = useState(false);
  const [sendingLineForId, setSendingLineForId]           = useState(null);
  const [sharingInvoiceId, setSharingInvoiceId]           = useState(null);
  const [sharePreviewData, setSharePreviewData]           = useState(null);
  const [shareQrCodeUrl, setShareQrCodeUrl]               = useState('');

  useEffect(() => {
    let active = true;
    if (previewData && settingsRow?.[SETTINGS.PROMPTPAY_ID]) {
      generatePromptPayQRCode(settingsRow[SETTINGS.PROMPTPAY_ID], previewData.totalAmount).then(url => { if (active) setQrCodeUrl(url || ''); });
    } else setQrCodeUrl('');
    return () => { active = false; };
  }, [previewData, settingsRow]);

  const sortBySessionDateAsc = (a, b) => (a[SESSION.DATE] || '').localeCompare(b[SESSION.DATE] || '');

  const getLineUserId = (studentId) => {
    const stu = students.find(s => s[STUDENT.ID] === studentId);
    return stu ? stu[STUDENT_LINE_USER_ID] || '' : '';
  };

  const getInvoiceLineItems = (inv) =>
    sessions.filter(s => s[SESSION.INVOICE_ID] === inv[INVOICE.ID] && s[SESSION.DELETED] !== 'TRUE')
      .sort(sortBySessionDateAsc)
      .map(s => ({ date: s[SESSION.DATE], subject: s[SESSION.SUBJECT], hours: s[SESSION.HOURS], amount: safeFloat(s[SESSION.HOURS]) * safeFloat(inv[INVOICE.RATE]) }));

  const buildInvoicePreviewData = (invoice, arrayIndex) => {
    const student = students.find(s => s[STUDENT.ID] === invoice[INVOICE.STUDENT_ID]);
    const tiedSessions = sessions
      .filter(s => s[SESSION.INVOICE_ID] === invoice[INVOICE.ID] && s[SESSION.DELETED] !== 'TRUE')
      .sort(sortBySessionDateAsc);
    const resolvedName = student ? student[STUDENT.NAME] : (getGroupName(invoice) || invoice[INVOICE.STUDENT_ID] || 'ไม่พบข้อมูล');
    return {
      invoiceId: invoice[INVOICE.ID],
      arrayIndex,
      status: invoice[INVOICE.STATUS] || 'UNPAID',
      invoiceNumber: invoice[INVOICE.NUMBER],
      date: invoice[INVOICE.DATE],
      studentId: invoice[INVOICE.STUDENT_ID],
      studentName: resolvedName,
      items: tiedSessions.map(s => ({
        date: s[SESSION.DATE],
        subject: s[SESSION.SUBJECT],
        hours: s[SESSION.HOURS],
        rate: safeFloat(invoice[INVOICE.RATE]),
        amount: safeFloat(s[SESSION.HOURS]) * safeFloat(invoice[INVOICE.RATE]),
      })),
      totalHours: safeFloat(invoice[INVOICE.TOTAL_HOURS]),
      totalAmount: safeFloat(invoice[INVOICE.TOTAL]),
      vatAmount: safeFloat(invoice[INVOICE.TAX]),
      vatRate: safeFloat(invoice[INVOICE.DISCOUNT]),
      lineSentAt: invoice[INVOICE.LINE_SENT_AT] || '',
    };
  };

  const hasReceipt = (invoiceId) => receipts.some(r => r[RECEIPT.INVOICE_ID] === invoiceId);
  const getReceiptForInvoice = (invoiceId) => receipts.find(r => r[RECEIPT.INVOICE_ID] === invoiceId);

  const isConsolidatedGroup = (inv) => !!(inv[INVOICE.GROUP_INVOICE_KEY]);
  const getGroupName = (inv) => {
    const groupKey = inv[INVOICE.GROUP_INVOICE_KEY] || '';
    const groupIdFromKey = groupKey.split('_')[0];
    if (groupIdFromKey) {
      const grpById = groups.find(g => g[GROUP.DELETED] !== 'TRUE' && g[GROUP.ID] === groupIdFromKey);
      if (grpById) return grpById[GROUP.NAME];
    }
    const sid = inv[INVOICE.STUDENT_ID];
    const grp = groups.find(g => g[GROUP.DELETED] !== 'TRUE' && (g[GROUP.STUDENT_IDS] || '').split(',').map(x => x.trim()).includes(sid));
    return grp ? grp[GROUP.NAME] : null;
  };

  const handleSendInvoiceLine = async (inv) => {
    const student = students.find(s => s[STUDENT.ID] === inv[INVOICE.STUDENT_ID]);
    if (!student) return toast('ไม่พบข้อมูลนักเรียน', 'error');
    const lineUserId = student[STUDENT_LINE_USER_ID] || '';
    if (!lineUserId) return toast('นักเรียนคนนี้ยังไม่มี LINE User ID — กรอกได้ที่หน้า "นักเรียน" → แก้ไข', 'error');
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าค่ะ', 'error');
    if (settingsRow?.[SETTINGS.SEND_INVOICE_RECEIPT] === 'FALSE') return toast('การส่งบิล/ใบเสร็จทาง LINE ถูกปิดอยู่ — เปิดได้ที่หน้าตั้งค่า LINE OA ค่ะ', 'error');
    setSendingLineForId(inv[INVOICE.ID]);
    setIsSendingLine(true);
    const items = getInvoiceLineItems(inv);
    const msg = buildInvoiceLineMessage({ instituteName, studentName: student[STUDENT.NAME], invoiceNumber: inv[INVOICE.NUMBER], date: inv[INVOICE.DATE], dueDate: inv[INVOICE.DUE_DATE], items, totalHours: inv[INVOICE.TOTAL_HOURS], totalAmount: inv[INVOICE.TOTAL], status: inv[INVOICE.STATUS] });
    const invoiceIndex = invoices.findIndex(i => i[INVOICE.ID] === inv[INVOICE.ID]);
    const sentAt = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      await sendLineMessage(lineWorkerUrl, lineToken, lineUserId, msg);
      if (invoiceIndex >= 0) await updateInvoiceLineSentAt(accessToken, dbId, invoiceIndex + 2, sentAt);
    }, toast, `ส่ง LINE หา ${student[STUDENT.NAME]} สำเร็จ!`);
    if (ok) { setPreviewData(prev => prev?.invoiceId === inv[INVOICE.ID] ? { ...prev, lineSentAt: sentAt } : prev); refresh({ force: true }); }
    setIsSendingLine(false);
    setSendingLineForId(null);
  };

  const handleSendInvoiceImageLine = async () => {
    if (!previewData) return;
    const student = students.find(s => s[STUDENT.ID] === previewData.studentId);
    const lineUserId = student ? (student[STUDENT_LINE_USER_ID] || '') : '';
    if (!lineUserId) return toast('นักเรียนคนนี้ยังไม่มี LINE User ID — กรอกได้ที่หน้า "นักเรียน" → แก้ไข', 'error');
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าค่ะ', 'error');
    if (settingsRow?.[SETTINGS.SEND_INVOICE_RECEIPT] === 'FALSE') return toast('การส่งบิล/ใบเสร็จทาง LINE ถูกปิดอยู่ — เปิดได้ที่หน้าตั้งค่า LINE OA ค่ะ', 'error');
    setIsSendingLineImage(true);
    const sentAt = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      const imageDataUrl = await elementToJpegDataUrl('invoice-preview-container');
      await sendLineImageMessage(lineWorkerUrl, lineToken, lineUserId, imageDataUrl);
      const invoiceIndex = invoices.findIndex(i => i[INVOICE.ID] === previewData.invoiceId);
      if (invoiceIndex >= 0) await updateInvoiceLineSentAt(accessToken, dbId, invoiceIndex + 2, sentAt);
    }, toast, `ส่งรูปบิลทาง LINE หา ${previewData.studentName} สำเร็จ!`);
    if (ok) { setPreviewData(prev => prev ? { ...prev, lineSentAt: sentAt } : prev); refresh({ force: true }); }
    setIsSendingLineImage(false);
  };

  const handleSendReceiptImageLine = async () => {
    if (!receiptPreview) return;
    const inv = receiptPreview.invoice;
    const student = students.find(s => s[STUDENT.ID] === inv[INVOICE.STUDENT_ID]);
    const lineUserId = student ? (student[STUDENT_LINE_USER_ID] || '') : '';
    if (!lineUserId) return toast('นักเรียนคนนี้ยังไม่มี LINE User ID — กรอกได้ที่หน้า "นักเรียน" → แก้ไข', 'error');
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าค่ะ', 'error');
    if (settingsRow?.[SETTINGS.SEND_INVOICE_RECEIPT] === 'FALSE') return toast('การส่งบิล/ใบเสร็จทาง LINE ถูกปิดอยู่ — เปิดได้ที่หน้าตั้งค่า LINE OA ค่ะ', 'error');
    setIsSendingReceiptImage(true);
    const sentAt = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      const imageDataUrl = await elementToJpegDataUrl('receipt-preview-container');
      await sendLineImageMessage(lineWorkerUrl, lineToken, lineUserId, imageDataUrl);
    }, toast, `ส่งรูปใบเสร็จทาง LINE หา ${receiptPreview.studentName} สำเร็จ!`);
    if (ok) setReceiptPreview(prev => prev ? { ...prev, lineSentAt: sentAt } : prev);
    setIsSendingReceiptImage(false);
  };

  const waitForNextPaint = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

  const handleShareInvoiceImage = async (inv, arrayIndex) => {
    if (inv[INVOICE.STATUS] === 'VOID') return;
    setSharingInvoiceId(inv[INVOICE.ID]);
    const previewForShare = buildInvoicePreviewData(inv, arrayIndex);

    try {
      const qr = settingsRow?.[SETTINGS.PROMPTPAY_ID]
        ? await generatePromptPayQRCode(settingsRow[SETTINGS.PROMPTPAY_ID], previewForShare.totalAmount)
        : '';

      setSharePreviewData(previewForShare);
      setShareQrCodeUrl(qr || '');
      await waitForNextPaint();
      await waitForNextPaint();

      const imageDataUrl = await elementToJpegDataUrl('invoice-share-render-container');
      const fileName = `Invoice_${previewForShare.invoiceNumber}.jpg`;

      if (navigator.share) {
        const blob = await (await fetch(imageDataUrl)).blob();
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `บิล ${previewForShare.invoiceNumber}` });
        } else {
          await navigator.share({ title: `บิล ${previewForShare.invoiceNumber}`, text: `ใบแจ้งค่าเรียน ${previewForShare.invoiceNumber}` });
        }
      } else {
        const a = document.createElement('a');
        a.href = imageDataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('อุปกรณ์นี้ไม่รองรับ Share โดยตรง — ดาวน์โหลดรูปบิลให้แล้ว', 'success');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        toast(`แชร์บิลไม่สำเร็จ: ${e?.message || 'unknown error'}`, 'error');
      }
    } finally {
      setSharePreviewData(null);
      setShareQrCodeUrl('');
      setSharingInvoiceId(null);
    }
  };

  const handleBroadcastLine = async () => {
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าค่ะ', 'error');
    const msg = prompt('พิมพ์ข้อความที่อยากส่งถึงนักเรียนทุกคน:');
    if (!msg) return;
    const allUserIds = students.filter(s => s[STUDENT.DELETED] !== 'TRUE' && s[STUDENT_LINE_USER_ID]).map(s => s[STUDENT_LINE_USER_ID]);
    if (allUserIds.length === 0) return toast('ยังไม่มีนักเรียนคนไหนที่มี LINE User ID ค่ะ', 'error');
    setIsSendingLine(true);
    await runWithFeedback(() => sendLineMulticast(lineWorkerUrl, lineToken, allUserIds, msg), toast, `ส่ง LINE ถึง ${allUserIds.length} คนสำเร็จ!`);
    setIsSendingLine(false);
  };

  const handleIssueReceipt = async (invoiceItem) => {
    const inv = invoiceItem.data;
    if (hasReceipt(inv[INVOICE.ID])) return toast('ออกใบเสร็จสำหรับบิลนี้ไปแล้วค่ะ', 'error');
    const ok = await confirm(`ออกใบเสร็จสำหรับบิล ${inv[INVOICE.NUMBER]} ยอด ${safeFloat(inv[INVOICE.TOTAL]).toLocaleString()} ฿ ใช่ไหมคะ?`);
    if (!ok) return;
    setIsIssuingReceipt(true);
    const recCount = receipts.filter(r => (r[RECEIPT.NUMBER] || '').startsWith('REC-')).length;
    const receiptNum = 'REC-' + new Date().getFullYear() + '-' + String(recCount + 1).padStart(3, '0');
    const receiptId  = 'REC-ID-' + Date.now();
    const dateNow    = localDateStr();
    const issuedBy   = settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'SHIFTHIGHBURY';
    const studentName = (students.find(s => s[STUDENT.ID] === inv[INVOICE.STUDENT_ID]) || [])[STUDENT.NAME] || 'ไม่พบ';
    const success = await runWithFeedback(async () => {
      const row = [receiptId, receiptNum, inv[INVOICE.ID], inv[INVOICE.STUDENT_ID], dateNow, inv[INVOICE.PAYMENT_METHOD] || 'โอนเงิน', inv[INVOICE.TOTAL], '', issuedBy, new Date().toLocaleString('th-TH')];
      await addReceipt(accessToken, dbId, row);
      await linkReceiptToInvoice(accessToken, dbId, invoiceItem.originalIndex + 2, receiptId);
    }, toast, 'ออกใบเสร็จสำเร็จ!');
    if (success) {
      setReceiptPreview({ receiptId, receiptNum, invoice: inv, dateNow, issuedBy, paymentMethod: inv[INVOICE.PAYMENT_METHOD] || 'โอนเงิน', amount: safeFloat(inv[INVOICE.TOTAL]), studentName });
      refresh({ force: true });
    }
    setIsIssuingReceipt(false);
  };

  const handleVoidInvoice = async (invoiceId, arrayIndex) => {
    const receiptForThisInvoice = getReceiptForInvoice(invoiceId);
    const ok = await confirm(
      receiptForThisInvoice
        ? `บิลนี้ออกใบเสร็จ ${receiptForThisInvoice[RECEIPT.NUMBER]} ไปแล้ว — ยกเลิกบิลจะไม่ลบใบเสร็จนั้น กรุณาจัดการบัญชี/แจ้งลูกค้าเองด้วย ยืนยันยกเลิกใช่ไหมคะ? คาบเรียนทั้งหมดจะถูกคืนกลับเป็น "รอออกบิล"`
        : 'ยืนยันยกเลิกใบแจ้งค่าเรียนใบนี้? คาบเรียนทั้งหมดจะถูกคืนกลับเป็น "รอออกบิล"',
      true
    );
    if (!ok) return;
    const sessionsToRevert = sessions.map((s, i) => ({ data: s, rowIndex: i + 2 })).filter(s => s.data[SESSION.INVOICE_ID] === invoiceId && s.data[SESSION.DELETED] !== 'TRUE');
    const success = await runWithFeedback(() => voidInvoiceComplete(accessToken, dbId, arrayIndex + 2, sessionsToRevert), toast, 'ยกเลิกใบแจ้งค่าเรียนสำเร็จ!');
    if (success) refresh({ force: true });
  };

  const handleChangeInvoiceStatus = async (invoiceId, arrayIndex, newStatus) => {
    // ยืนยันเฉพาะการเปลี่ยนที่เกี่ยวกับ PAID (เข้า/ออก) — เสี่ยงกว่าเพราะมีผลกับการออกใบเสร็จ
    // ส่วน UNPAID<->SENT สลับกันบ่อยและความเสี่ยงต่ำ ไม่ต้อง confirm ทุกครั้ง
    const currentStatus = invoices[arrayIndex]?.[INVOICE.STATUS] || 'UNPAID';
    if (newStatus === 'PAID' || currentStatus === 'PAID') {
      const ok = await confirm(`เปลี่ยนสถานะบิลเป็น "${newStatus}" ยืนยันใช่ไหมคะ?`);
      if (!ok) return;
    }
    const success = await runWithFeedback(() => updateInvoiceStatus(accessToken, dbId, arrayIndex + 2, newStatus), toast, 'อัปเดตสถานะเรียบร้อย!');
    if (success) { setPreviewData(prev => prev?.invoiceId === invoiceId ? { ...prev, status: newStatus } : prev); refresh({ force: true }); }
  };

  const handleViewInvoiceFromHistory = (invoice, arrayIndex) => {
    setPreviewData(buildInvoicePreviewData(invoice, arrayIndex));
  };

  const filteredInvoices = invoices
    .map((inv, i) => ({ data: inv, originalIndex: i }))
    .filter(item => {
      const student     = students.find(s => s[STUDENT.ID] === item.data[INVOICE.STUDENT_ID]);
      const studentName = student ? `${student[STUDENT.NAME]} ${student[STUDENT.SUBJECT] || ''}`.toLowerCase() : '';
      const matchesSearch = item.data[INVOICE.NUMBER].toLowerCase().includes(searchTerm.toLowerCase()) || studentName.includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || item.data[INVOICE.STATUS] === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const dateCmp = (b.data[INVOICE.DATE] || '').localeCompare(a.data[INVOICE.DATE] || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.data[INVOICE.CREATED_AT] || '').localeCompare(a.data[INVOICE.CREATED_AT] || '');
    });

  const statusCounts = invoices.reduce((acc, inv) => { const s = inv[INVOICE.STATUS] || 'UNPAID'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const unpaidTotal = invoices.filter(i => (i[INVOICE.STATUS] === 'UNPAID' || i[INVOICE.STATUS] === 'SENT')).reduce((sum, i) => sum + safeFloat(i[INVOICE.TOTAL] || 0), 0);
  const paidTotal   = invoices.filter(i => i[INVOICE.STATUS] === 'PAID').reduce((sum, i) => sum + safeFloat(i[INVOICE.TOTAL] || 0), 0);

  if (receiptPreview) {
    return (
      <div className="p-6">
        <Dialog />
        <InvoicePreviewModal previewData={{ invoiceNumber: receiptPreview.receiptNum, status: 'PAID' }} settings={settingsRow} onClose={() => setReceiptPreview(null)}
          onDownloadJPG={() => { setIsExporting(true); exportElementAsJPG('receipt-preview-container', `Receipt_${receiptPreview.receiptNum}.jpg`, toast).finally(() => setIsExporting(false)); }}
          onDownloadPDF={() => { setIsExporting(true); exportElementAsPDF('receipt-preview-container', `Receipt_${receiptPreview.receiptNum}.pdf`, toast).finally(() => setIsExporting(false)); }}
          isExporting={isExporting} onSendLineImage={lineToken && lineWorkerUrl ? handleSendReceiptImageLine : undefined} isSendingLineImage={isSendingReceiptImage} sendImageLabel="ใบเสร็จ" lineSentAt={receiptPreview.lineSentAt} elementId="receipt-preview-container" filename={`Receipt_${receiptPreview.receiptNum}.jpg`}>
          <ReceiptDocument id="receipt-preview-container" receipt={receiptPreview} accentColor={accentColor} logoUrl={logoUrl} instituteName={instituteName} footerNote={footerNote} signatureUrl={signatureUrl} />
        </InvoicePreviewModal>
      </div>
    );
  }

  if (previewData) {
    return (
      <div className="p-6">
        <Dialog />
        <InvoicePreviewModal previewData={previewData} settings={settingsRow} onClose={() => setPreviewData(null)} onConfirmPaid={() => handleChangeInvoiceStatus(previewData.invoiceId, previewData.arrayIndex, 'PAID')}
          onDownloadJPG={() => { setIsExporting(true); exportElementAsJPG('invoice-preview-container', `Invoice_${previewData.invoiceNumber}.jpg`, toast).finally(() => { setIsExporting(false); setPreviewData(prev => prev ? { ...prev, lastSharedAt: new Date().toLocaleString('th-TH') } : prev); }); }}
          onDownloadPDF={() => { setIsExporting(true); exportElementAsPDF('invoice-preview-container', `Invoice_${previewData.invoiceNumber}.pdf`, toast).finally(() => { setIsExporting(false); setPreviewData(prev => prev ? { ...prev, lastSharedAt: new Date().toLocaleString('th-TH') } : prev); }); }}
          isExporting={isExporting} onSendLineImage={lineToken && lineWorkerUrl && previewData.status !== 'VOID' ? handleSendInvoiceImageLine : undefined} isSendingLineImage={isSendingLineImage} lineSentAt={previewData.lineSentAt} lastSharedAt={previewData.lastSharedAt}>
          <InvoiceDocument id="invoice-preview-container" previewData={previewData} accentColor={accentColor} logoUrl={logoUrl} instituteName={instituteName} paymentMethods={paymentMethods} footerNote={footerNote} qrCodeUrl={qrCodeUrl} promptpayId={settingsRow?.[SETTINGS.PROMPTPAY_ID]} />
        </InvoicePreviewModal>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <Dialog />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold text-gray-900">บิล &amp; ใบเสร็จ</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">รายการบิลทั้งหมด — คลิกแถวเพื่อดูรายละเอียด</p>
        </div>
        {lineToken && lineWorkerUrl && (
          <button onClick={handleBroadcastLine} disabled={isSendingLine} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-[10px] active:scale-95 transition-all text-[13px] shadow-sm whitespace-nowrap">
            <Megaphone className="w-4 h-4" /> ส่งประกาศ LINE ทุกคน
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'ทั้งหมด', value: invoices.length, unit: 'ใบ', color: 'text-gray-900', bg: 'bg-white border-gray-200' },
          { label: 'รอชำระ', value: (statusCounts['UNPAID'] || 0) + (statusCounts['SENT'] || 0), unit: 'ใบ', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', sub: `${unpaidTotal.toLocaleString()} ฿` },
          { label: 'ชำระแล้ว', value: statusCounts['PAID'] || 0, unit: 'ใบ', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', sub: `${paidTotal.toLocaleString()} ฿` },
          { label: 'ยกเลิก', value: statusCounts['VOID'] || 0, unit: 'ใบ', color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
        ].map((card, i) => (
          <div key={i} className={`rounded-[14px] border p-4 ${card.bg} cursor-pointer transition-all hover:shadow-md active:scale-[0.98]`} onClick={() => { if (i === 0) setFilterStatus('ALL'); else if (i === 1) setFilterStatus(filterStatus === 'UNPAID' ? 'SENT' : 'UNPAID'); else if (i === 2) setFilterStatus('PAID'); else setFilterStatus('VOID'); }}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{card.label}</p>
            <p className={`text-[26px] font-extrabold leading-none ${card.color}`}>{card.value}<span className="text-[13px] font-normal text-gray-400 ml-1">{card.unit}</span></p>
            {card.sub && <p className={`text-[12px] font-semibold mt-1 ${card.color}`}>{card.sub}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Search className="w-4 h-4" /></span>
          <input type="text" placeholder="ค้นหาชื่อนักเรียน หรือเลขที่บิล..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-[10px] text-[14px] bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-400 outline-none transition-all placeholder-gray-400" />
          {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {[
            { value: 'ALL', label: 'ทั้งหมด', count: invoices.length },
            { value: 'UNPAID', label: 'รอชำระ', count: statusCounts['UNPAID'] || 0 },
            { value: 'SENT', label: 'ส่งแล้ว', count: statusCounts['SENT'] || 0 },
            { value: 'PAID', label: 'ชำระแล้ว', count: statusCounts['PAID'] || 0 },
            { value: 'VOID', label: 'ยกเลิก', count: statusCounts['VOID'] || 0 },
          ].map(opt => (
            <button key={opt.value} onClick={() => setFilterStatus(opt.value)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all whitespace-nowrap ${filterStatus === opt.value ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900'}`}>
              {opt.label}
              {opt.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filterStatus === opt.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{opt.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <StateDisplay loading={loading} error={error} onRetry={refresh}>
      <div className="bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[780px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['เลขที่บิล', 'วันที่', 'นักเรียน / ผู้ชำระ', 'ยอดเงิน', 'สถานะ', 'การดำเนินการ'].map((h, i) => (
                  <th key={h} className={`px-5 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${i === 3 ? 'text-right' : ''} ${i === 4 || i === 5 ? 'text-center' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16"><Search className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-[15px] font-semibold text-gray-500">ไม่พบบิลที่ตรงกับเงื่อนไข</p><p className="text-[13px] text-gray-400 mt-1">ลองเปลี่ยน filter หรือล้างคำค้นหาดูค่ะ</p></td></tr>
              ) : filteredInvoices.map((item, idx) => {
                const inv         = item.data;
                const student     = students.find(s => s[STUDENT.ID] === inv[INVOICE.STUDENT_ID]);
                const isGroupBill = isConsolidatedGroup(inv);
                const groupName   = isGroupBill ? getGroupName(inv) : null;
                const studentName = student ? student[STUDENT.NAME] : (groupName || inv[INVOICE.STUDENT_ID] || 'ไม่พบข้อมูล');
                const subject     = student?.[STUDENT.SUBJECT] || '';
                const isVoided    = inv[INVOICE.STATUS] === 'VOID';
                const receipt     = getReceiptForInvoice(inv[INVOICE.ID]);
                const isSharingThisRow = sharingInvoiceId === inv[INVOICE.ID];

                return (
                  <tr key={idx} className={`group transition-colors ${isVoided ? 'opacity-50 bg-gray-50' : 'hover:bg-blue-50/30 cursor-pointer'}`}>
                    <td className="px-5 py-4 align-middle" onClick={() => !isVoided && handleViewInvoiceFromHistory(inv, item.originalIndex)}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-gray-800">{inv[INVOICE.NUMBER]}</span>
                        {isGroupBill && <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full border border-indigo-200 whitespace-nowrap"><Users className="w-3 h-3" /> รวมบิล</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle text-[13px] text-gray-500 whitespace-nowrap" onClick={() => !isVoided && handleViewInvoiceFromHistory(inv, item.originalIndex)}>{inv[INVOICE.DATE]}</td>
                    <td className="px-5 py-4 align-middle" onClick={() => !isVoided && handleViewInvoiceFromHistory(inv, item.originalIndex)}>
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900 leading-tight">{studentName}{isGroupBill && groupName && <span className="ml-2 text-[11px] font-normal text-indigo-500">· {groupName}</span>}</p>
                        {subject && <p className="text-[11px] text-gray-400 mt-0.5">{subject}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle text-right whitespace-nowrap" onClick={() => !isVoided && handleViewInvoiceFromHistory(inv, item.originalIndex)}>
                      <p className="text-[15px] font-bold text-gray-900 tabular-nums">{safeFloat(inv[INVOICE.TOTAL]).toLocaleString()}<span className="text-[11px] text-gray-400 font-normal ml-1">฿</span></p>
                      <p className="text-[11px] text-gray-400 tabular-nums">{safeFloat(inv[INVOICE.TOTAL_HOURS])} ชม.</p>
                    </td>
                    <td className="px-5 py-4 align-middle text-center">
                      {isVoided ? <StatusBadge status="VOID" /> : <StatusBadge status={inv[INVOICE.STATUS] || 'UNPAID'} interactive onChange={val => handleChangeInvoiceStatus(inv[INVOICE.ID], item.originalIndex, val)} />}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button onClick={() => handleViewInvoiceFromHistory(inv, item.originalIndex)} className="inline-flex items-center px-2.5 py-1.5 rounded-[8px] bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-600 transition-all active:scale-95 text-[12px] font-medium whitespace-nowrap">ดูบิล</button>
                        {!isVoided && (
                          <button onClick={() => handleShareInvoiceImage(inv, item.originalIndex)} disabled={isSharingThisRow} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] transition-all active:scale-95 text-[12px] font-medium whitespace-nowrap bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed">
                            {isSharingThisRow && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />}
                            {isSharingThisRow ? 'กำลังแชร์...' : 'แชร์บิล'}
                          </button>
                        )}
                        {!isVoided && inv[INVOICE.STATUS] !== 'PAID' && (
                          <button onClick={() => handleChangeInvoiceStatus(inv[INVOICE.ID], item.originalIndex, 'PAID')} className="inline-flex items-center px-2.5 py-1.5 rounded-[8px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all active:scale-95 text-[12px] font-medium whitespace-nowrap">รับชำระ</button>
                        )}
                        {inv[INVOICE.STATUS] === 'PAID' && (
                          receipt ? (
                            <button onClick={() => { const sName = (students.find(s => s[STUDENT.ID] === inv[INVOICE.STUDENT_ID]) || [])[STUDENT.NAME] || studentName; setReceiptPreview({ receiptId: receipt[RECEIPT.ID], receiptNum: receipt[RECEIPT.NUMBER], invoice: inv, dateNow: receipt[RECEIPT.DATE], issuedBy: receipt[RECEIPT.ISSUED_BY], paymentMethod: receipt[RECEIPT.PAYMENT_METHOD], amount: safeFloat(receipt[RECEIPT.AMOUNT]), studentName: sName }); }} className="inline-flex items-center px-2.5 py-1.5 rounded-[8px] bg-teal-50 text-teal-700 hover:bg-teal-100 transition-all active:scale-95 text-[12px] font-medium whitespace-nowrap">ดูใบเสร็จ</button>
                          ) : (
                            <button onClick={() => handleIssueReceipt(item)} disabled={isIssuingReceipt} className="inline-flex items-center px-2.5 py-1.5 rounded-[8px] bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-40 transition-all active:scale-95 text-[12px] font-medium whitespace-nowrap">ออกใบเสร็จ</button>
                          )
                        )}
                        {!isVoided && (
                          <button onClick={() => handleVoidInvoice(inv[INVOICE.ID], item.originalIndex)} className="inline-flex items-center px-2.5 py-1.5 rounded-[8px] bg-red-50 text-red-500 hover:bg-red-100 transition-all active:scale-95 text-[12px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100">ยกเลิกบิล</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredInvoices.length > 0 && (
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-[12px] text-gray-400">แสดง {filteredInvoices.length} จาก {invoices.length} ใบ</p>
            <div className="flex gap-4 text-[12px] font-semibold">
              {filteredInvoices.filter(i => i.data[INVOICE.STATUS] !== 'VOID').length > 0 && (
                <span className="text-gray-500">ยอดรวมที่แสดง: <span className="text-gray-900">{filteredInvoices.filter(i => i.data[INVOICE.STATUS] !== 'VOID').reduce((sum, i) => sum + safeFloat(i.data[INVOICE.TOTAL] || 0), 0).toLocaleString()} ฿</span></span>
              )}
            </div>
          </div>
        )}
      </div>
      </StateDisplay>

      <div className="flex flex-wrap gap-4 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> บิลรวม (Consolidated)</span>
        <span className="flex items-center gap-1.5 ml-auto text-gray-300">ปุ่ม "ยกเลิกบิล" จะปรากฏเมื่อ hover บนแถว</span>
      </div>

      {sharePreviewData && (
        <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }}>
          <InvoiceDocument
            id="invoice-share-render-container"
            previewData={sharePreviewData}
            accentColor={accentColor}
            logoUrl={logoUrl}
            instituteName={instituteName}
            paymentMethods={paymentMethods}
            footerNote={footerNote}
            qrCodeUrl={shareQrCodeUrl}
            promptpayId={settingsRow?.[SETTINGS.PROMPTPAY_ID]}
          />
        </div>
      )}
    </div>
  );
}
