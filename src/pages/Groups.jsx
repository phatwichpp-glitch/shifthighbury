// @ts-nocheck
import { useState, useEffect } from 'react';
import { STUDENT, SESSION, GROUP, SETTINGS, STUDENT_LINE_USER_ID, STUDENT_COLORS, STUDENT_TEXT_COLORS, isLineOAEnabled, canSendLine, groupStudentIds } from '../lib/constants';
import { TEACHER_ROLE_LABEL } from '../lib/appConfig';
import { safeFloat, runWithFeedback, buildGroupPortalMessage, generatePromptPayQRCode, generateGroupCode, copyText, localDateStr, buildPortalIntroMessage, buildGroupPortalIntroMessage, toastLineError, buildStudentLoginCode } from '../lib/business';
import { useSheetData } from '../hooks/useSheetData';
import { useConfirm } from '../hooks/useConfirm';
import { inputClasses, labelClasses, btnPrimary, btnSecondary } from '../components/ui/styles';
import { SubjectComboInput } from '../components/ui/SubjectComboInput';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { CopyButton } from '../components/ui/CopyButton';
import { StateDisplay } from '../components/ui/StateDisplay';
import { SendTemplateModal } from '../components/modals/SendTemplateModal';
import { Copy, Receipt, MessageCircle, Video, Package, Pencil, Trash2, X, AlertTriangle, Share2, Send } from 'lucide-react';
import { getGroups, getStudents, getSessions, getInvoices, getSettings, getReceipts, addGroup, updateGroup, softDeleteGroup, addGroupInvoicesComplete, markSessionsAsInvoiced, updateInvoiceCounter, updateStudentPackageHours, updateGroupPackageHours, updateGroupPackageBoth, sendLineMessage } from '../services/googleSheets';

export function Groups({ accessToken, dbId, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({ name: '', studentIds: [], line_group_id: '', default_subject: '', zoom_link: '', schedule_day: '', schedule_time: '', package_hours: '', package_rate: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const { confirm, Dialog } = useConfirm();

  const [billingGroup, setBillingGroup] = useState(null);
  const [groupUnbilledMap, setGroupUnbilledMap] = useState({});
  const [groupInvoiceNumbers, setGroupInvoiceNumbers] = useState({});
  const [groupSelectedIds, setGroupSelectedIds] = useState({});
  const [sendTemplateTarget, setSendTemplateTarget] = useState(null);

  const [topUpGroup, setTopUpGroup] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpMode, setTopUpMode] = useState('hours');
  const [topUpMoneyAmount, setTopUpMoneyAmount] = useState('');
  const [isToppingUp, setIsToppingUp] = useState(false);

  const [groupPkgModal, setGroupPkgModal] = useState(null);
  const [gpkgHoursToAdd, setGpkgHoursToAdd] = useState('');
  const [gpkgIsToppingUp, setGpkgIsToppingUp] = useState(false);

  const { data, loading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { groups: getGroups, students: getStudents, sessions: getSessions, invoices: getInvoices, settings: getSettings, receipts: getReceipts } });
  const groups = data.groups || [];
  const students = data.students || [];
  const sessions = data.sessions || [];
  const invoices = data.invoices || [];
  const settingsRow = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
  const lineOAEnabled = isLineOAEnabled(settingsRow);

  const getStudentName = (id) => (students.find(s => s[STUDENT.ID] === id) || [])[STUDENT.NAME] || id;
  const getStudentColorIdx = (id) => { const idx = students.findIndex(s => s[STUDENT.ID] === id); return idx >= 0 ? idx % STUDENT_COLORS.length : 0; };

  const handleOpenGroupBilling = (group) => {
    const memberIds = groupStudentIds(group.data);
    const unbilledMap = {};
    const invoiceNums = {};
    const selectedMap = {};
    const prefix = settingsRow?.[SETTINGS.PREFIX] || 'ZW';
    const year = new Date().getFullYear();
    const counter = parseInt(settingsRow?.[SETTINGS.COUNTER] || '1', 10);
    memberIds.forEach((sid, i) => {
      const unbilled = sessions.map((s, ri) => ({ data: s, rowIndex: ri + 2 }))
        .filter(s => s.data[SESSION.STUDENT_ID] === sid && s.data[SESSION.INVOICED] === 'FALSE' && s.data[SESSION.DELETED] !== 'TRUE')
        .sort((a, b) => new Date(a.data[SESSION.DATE]) - new Date(b.data[SESSION.DATE]));
      unbilledMap[sid] = unbilled;
      invoiceNums[sid] = `${prefix}-${year}-${String(counter + i).padStart(4, '0')}`;
      selectedMap[sid] = unbilled.map(s => s.data[SESSION.ID]);
    });
    setGroupUnbilledMap(unbilledMap);
    setGroupInvoiceNumbers(invoiceNums);
    setGroupSelectedIds(selectedMap);
    setBillingGroup(group);
  };

  const handleCreateGroupInvoices = async (e) => {
    e.preventDefault();
    const memberIds = groupStudentIds(billingGroup.data);
    const hasAny = memberIds.some(sid => (groupSelectedIds[sid] || []).length > 0);
    if (!hasAny) return toast('กรุณาเลือกคาบเรียนอย่างน้อย 1 คาบครับ', 'error');
    setIsSubmitting(true);
    const dateNow = localDateStr();
    const vatRate = safeFloat(settingsRow?.[SETTINGS.TAX_RATE] || 0) / 100;
    const counter = parseInt(settingsRow?.[SETTINGS.COUNTER] || '1', 10);
    let billedCount = 0;
    const ok = await runWithFeedback(async () => {
      const invoicesWithItems = memberIds
        .filter(sid => (groupSelectedIds[sid] || []).length > 0)
        .map(sid => {
          const stu = students.find(s => s[STUDENT.ID] === sid);
          const rate = safeFloat(stu?.[STUDENT.RATE] || 0);
          const sessForBill = (groupUnbilledMap[sid] || []).filter(s => (groupSelectedIds[sid] || []).includes(s.data[SESSION.ID]));
          const totalHours = sessForBill.reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);
          const subtotal = Math.round(totalHours * rate * 100) / 100;
          const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
          const total = Math.round((subtotal + vatAmount) * 100) / 100;
          const invId = 'INV-ID-' + Date.now() + '-' + sid;
          const invNum = groupInvoiceNumbers[sid] || ('ZW-' + Date.now());
          const invoiceRow = [invId, invNum, sid, dateNow, '', 'TH', totalHours, rate, subtotal, vatRate, vatAmount, total, 'โอนเงิน', 'UNPAID', '', new Date().toLocaleString('th-TH'), '', ''];
          const itemsRows = sessForBill.map(s => ['ITEM-' + Date.now() + Math.random().toString(36).slice(2, 6), invId, s.data[SESSION.ID], s.data[SESSION.DATE], s.data[SESSION.SUBJECT], s.data[SESSION.HOURS], rate, safeFloat(s.data[SESSION.HOURS]) * rate]);
          const sessionsToMark = sessForBill.map(s => ({ rowIndex: s.rowIndex, invoiceId: invId }));
          return { invoiceRow, itemsRows, sessionsToMark, studentId: sid, totalHours, totalAmount: total, invNum, studentName: stu?.[STUDENT.NAME] || sid };
        });
      billedCount = invoicesWithItems.length;
      await addGroupInvoicesComplete(accessToken, dbId, invoicesWithItems);
      for (const inv of invoicesWithItems) {
        await markSessionsAsInvoiced(accessToken, dbId, inv.sessionsToMark);
      }
    }, toast, `ออกบิลกลุ่ม ${billingGroup.data[GROUP.NAME]} (${memberIds.length} คน) สำเร็จ!`);
    if (ok) {
      try { await updateInvoiceCounter(accessToken, dbId, counter + billedCount); } catch (e) { console.warn('[COUNTER]', e); }
      setBillingGroup(null); refresh({ force: true });
    }
    setIsSubmitting(false);
  };

  const handleGroupTopUp = async (e) => {
    e.preventDefault();
    if (!topUpGroup) return;
    const { studentId } = topUpGroup;
    const stu = students.find(s => s[STUDENT.ID] === studentId);
    const stuIdx = students.findIndex(s => s[STUDENT.ID] === studentId);
    const rate = safeFloat(stu?.[STUDENT.RATE] || 0);
    const hoursFromAmount = rate > 0 ? Math.round((safeFloat(topUpMoneyAmount) / rate) * 100) / 100 : 0;
    const effectiveHours = topUpMode === 'amount' ? hoursFromAmount : safeFloat(topUpAmount);
    if (effectiveHours <= 0) return toast('กรุณากรอกจำนวนที่ถูกต้องครับ', 'error');
    setIsToppingUp(true);
    const current = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
    const newHours = current + effectiveHours;
    const ok = await runWithFeedback(() => updateStudentPackageHours(accessToken, dbId, stuIdx + 2, newHours), toast, `เติมแพ็กเกจ ${stu?.[STUDENT.NAME]} สำเร็จ! (เหลือ ${newHours} ชม.)`);
    if (ok) { setTopUpGroup(null); setTopUpAmount(''); setTopUpMoneyAmount(''); setTopUpMode('hours'); refresh({ force: true }); }
    setIsToppingUp(false);
  };

  const handleGroupPkgTopUp = async (e) => {
    e.preventDefault();
    if (!groupPkgModal) return;
    const { group, grpIdx } = groupPkgModal;
    const hoursToAdd = safeFloat(gpkgHoursToAdd);
    if (hoursToAdd <= 0) return toast('กรุณากรอกจำนวนชั่วโมงที่ถูกต้องครับ', 'error');
    setGpkgIsToppingUp(true);
    const currentTotal = safeFloat(group.data[GROUP.PACKAGE_HOURS]);
    const currentRemaining = safeFloat(group.data[GROUP.PACKAGE_HOURS_REMAINING]);
    const newTotal = currentTotal + hoursToAdd;
    const newRemaining = currentRemaining + hoursToAdd;
    const ok = await runWithFeedback(
      () => updateGroupPackageBoth(accessToken, dbId, grpIdx, newTotal, newRemaining),
      toast, `เติมแพ็กเกจกลุ่ม "${group.data[GROUP.NAME]}" สำเร็จ! (เหลือ ${newRemaining} ชม.)`
    );
    if (ok) { setGroupPkgModal(null); setGpkgHoursToAdd(''); refresh({ force: true }); }
    setGpkgIsToppingUp(false);
  };

  const handleSendGroupReminder = async (group) => {
    if (!canSendLine(settingsRow)) return toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error');
    const lineToken = settingsRow[SETTINGS.LINE_TOKEN];
    const lineWorkerUrl = settingsRow[SETTINGS.LINE_WORKER_URL];
    const lineGroupId = group.data[GROUP.LINE_GROUP_ID] || '';
    const grpName = group.data[GROUP.NAME] || 'กลุ่ม';
    const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
    const portalBase = `${window.location.origin}/portal`;
    if (lineGroupId) {
      const groupPortalUrl = classCode ? `${portalBase}?class=${encodeURIComponent(classCode)}` : portalBase;
      const msg = buildGroupPortalMessage({ groupName: grpName, studentName: grpName, subject: group.data[GROUP.DEFAULT_SUBJECT] || '', timeStart: '', timeEnd: '', portalUrl: groupPortalUrl, stuCode: '', settingsRow });
      await runWithFeedback(() => sendLineMessage(lineWorkerUrl, lineToken, lineGroupId, msg), toast, `ส่งแจ้งเตือนเข้ากลุ่ม LINE "${grpName}" แล้วครับ`);
    } else {
      const memberIds = groupStudentIds(group.data);
      let sent = 0;
      for (const sid of memberIds) {
        const stu = students.find(s => s[STUDENT.ID] === sid);
        const target = stu?.[STUDENT_LINE_USER_ID] || '';
        if (!target) continue;
        const stuCode = buildStudentLoginCode(stu[STUDENT.NICKNAME], stu[STUDENT.NAME]);
        const portalUrl = classCode ? `${portalBase}?class=${encodeURIComponent(classCode)}&code=${stuCode}` : `${portalBase}?code=${stuCode}`;
        const msg = buildGroupPortalMessage({ groupName: grpName, studentName: stu[STUDENT.NAME], subject: group.data[GROUP.DEFAULT_SUBJECT] || '', timeStart: '', timeEnd: '', portalUrl, stuCode, settingsRow });
        try { await sendLineMessage(lineWorkerUrl, lineToken, target, msg); sent++; } catch (e) {}
      }
      toast(`ส่งแจ้งเตือน DM ${sent}/${memberIds.length} คนแล้วครับ`, sent > 0 ? 'success' : 'error');
    }
  };

  const resetForm = () => { setFormData({ name: '', studentIds: [], line_group_id: '', default_subject: '', zoom_link: '', schedule_day: '', schedule_time: '', package_hours: '', package_rate: '' }); setMemberSearch(''); };

  const activeGroups = groups.map((g, i) => ({ data: g, rowIndex: i + 2 })).filter(item => item.data[GROUP.DELETED] !== 'TRUE').sort((a, b) => (a.data[GROUP.NAME] || '').localeCompare(b.data[GROUP.NAME] || '', 'th'));
  const allActiveStudents = students.map((s, i) => ({ data: s, rowIndex: i + 2 })).filter(item => item.data[STUDENT.DELETED] !== 'TRUE').sort((a, b) => (a.data[STUDENT.NAME] || '').localeCompare(b.data[STUDENT.NAME] || '', 'th'));
  const pickerStudents = memberSearch ? allActiveStudents.filter(item => (item.data[STUDENT.NAME] || '').toLowerCase().includes(memberSearch.toLowerCase())) : allActiveStudents;
  const isValid = !!formData.name?.trim() && formData.studentIds.length > 0;
  const allPickerSelected = pickerStudents.length > 0 && pickerStudents.every(s => formData.studentIds.includes(s.data[STUDENT.ID]));

  const handleToggleStudent = (id) => setFormData(f => ({ ...f, studentIds: f.studentIds.includes(id) ? f.studentIds.filter(x => x !== id) : [...f.studentIds, id] }));
  const handleSelectAllStudents = () => {
    const idsInView = pickerStudents.map(s => s.data[STUDENT.ID]);
    setFormData(f => ({ ...f, studentIds: allPickerSelected ? f.studentIds.filter(id => !idsInView.includes(id)) : Array.from(new Set([...f.studentIds, ...idsInView])) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const dateNow = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      const pkgHours = safeFloat(formData.package_hours);
      const pkgRate = safeFloat(formData.package_rate);
      if (editingGroup) {
        const row = [...editingGroup.data];
        row[GROUP.NAME] = formData.name;
        row[GROUP.STUDENT_IDS] = formData.studentIds.join(',');
        row[GROUP.LINE_GROUP_ID] = formData.line_group_id || '';
        row[GROUP.DEFAULT_SUBJECT] = formData.default_subject || '';
        row[GROUP.ZOOM_LINK] = formData.zoom_link || '';
        row[GROUP.SCHEDULE_DAY] = formData.schedule_day || '';
        row[GROUP.SCHEDULE_TIME] = formData.schedule_time || '';
        // preserve existing package remaining when editing; update total and rate
        if (pkgHours > 0) {
          row[GROUP.PACKAGE_HOURS] = pkgHours;
          if (!row[GROUP.PACKAGE_HOURS_REMAINING]) row[GROUP.PACKAGE_HOURS_REMAINING] = pkgHours;
          row[GROUP.PACKAGE_RATE] = pkgRate || '';
        }
        while (row.length < 14) row.push('');
        await updateGroup(accessToken, dbId, editingGroup.rowIndex, row);
      } else {
        const code = generateGroupCode(data.groups || []);
        await addGroup(accessToken, dbId, ['GRP-' + Date.now(), formData.name, formData.studentIds.join(','), formData.line_group_id || '', formData.default_subject || '', 'FALSE', dateNow, code, formData.zoom_link || '', formData.schedule_day || '', formData.schedule_time || '', pkgHours || '', pkgHours || '', pkgRate || '']);
      }
    }, toast, editingGroup ? 'อัปเดตกลุ่มเรียบร้อย!' : 'สร้างกลุ่มสำเร็จ!');
    if (ok) { setShowForm(false); setEditingGroup(null); resetForm(); refresh({ force: true }); }
    setIsSubmitting(false);
  };

  const handleEditClick = (group) => {
    setEditingGroup(group);
    setFormData({ name: group.data[GROUP.NAME] || '', studentIds: groupStudentIds(group.data), line_group_id: group.data[GROUP.LINE_GROUP_ID] || '', default_subject: group.data[GROUP.DEFAULT_SUBJECT] || '', zoom_link: group.data[GROUP.ZOOM_LINK] || '', schedule_day: group.data[GROUP.SCHEDULE_DAY] || '', schedule_time: group.data[GROUP.SCHEDULE_TIME] || '', package_hours: group.data[GROUP.PACKAGE_HOURS] || '', package_rate: group.data[GROUP.PACKAGE_RATE] || '' });
    setMemberSearch('');
    setShowForm(true);
    setTimeout(() => document.getElementById('group-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleDeleteClick = async (group) => {
    const memberCount = groupStudentIds(group.data).length;
    const pkgRemaining = safeFloat(group.data[GROUP.PACKAGE_HOURS_REMAINING]);
    const ok = await confirm(
      `ลบกลุ่ม "${group.data[GROUP.NAME]}" (${memberCount} คน) ใช่ไหมครับ? ตารางสอน/ประวัติของสมาชิกแต่ละคนจะไม่หายไปเลย — แค่ยกเลิกการจัดกลุ่มเฉยๆ ครับ`
      + (pkgRemaining > 0 ? ` ⚠️ กลุ่มนี้ยังมีแพ็กเกจคงเหลือ ${pkgRemaining} ชม. — ลบแล้วจะเรียกดูไม่ได้อีก` : ''),
      true
    );
    if (!ok) return;
    const success = await runWithFeedback(() => softDeleteGroup(accessToken, dbId, group.rowIndex), toast, `ลบกลุ่ม "${group.data[GROUP.NAME]}" สำเร็จ!`);
    if (success) refresh({ force: true });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto relative">
      <Dialog />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-[24px] font-bold text-gray-900">จัดการกลุ่ม</h2>
          <p className="text-[14px] text-gray-500 mt-1">รวมนักเรียนหลายคนไว้ลงตาราง/log/ออกบิลทีเดียว — เรท/ชั่วโมง/VAT ยังคิดแยกรายคน 100% เหมือนเดิมทุกประการ</p>
        </div>
        <button onClick={() => { if (showForm) { setEditingGroup(null); resetForm(); } setShowForm(!showForm); }} className={showForm ? btnSecondary : btnPrimary}>{showForm ? 'ยกเลิก' : '+ สร้างกลุ่มใหม่'}</button>
      </div>

      <div id="group-form-anchor" />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 p-6 bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] animate-[slideIn_150ms_ease-out]">
          <h3 className="font-semibold text-gray-900 mb-5 text-[16px]">{editingGroup ? 'แก้ไขกลุ่ม' : 'สร้างกลุ่มนักเรียนใหม่'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div><label className={labelClasses}>ชื่อกลุ่ม <span className="text-red-500">*</span></label><input type="text" required autoFocus value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputClasses} placeholder="เช่น กลุ่มเช้าวันเสาร์" /></div>
            <div><label className={labelClasses}>วิชา default</label><SubjectComboInput value={formData.default_subject} onChange={v => setFormData({ ...formData, default_subject: v })} /></div>
            <div className="md:col-span-2">
              <label className={labelClasses}>LINE Group ID <span className="text-gray-400 font-normal">(ถ้ามี)</span></label>
              <input type="text" value={formData.line_group_id} onChange={e => setFormData({ ...formData, line_group_id: e.target.value })} className={`${inputClasses} font-mono text-[13px]`} placeholder="C1a2b3c4d5e6f..." />
              <p className="text-[11px] text-gray-400 mt-1">กรอกเอง หรือเว้นว่างไว้ให้ระบบบันทึกอัตโนมัติเมื่อมีคนส่งรหัสนักเรียนในกรุ๊ปแชท LINE</p>
            </div>
            <div className="md:col-span-2">
              <label className={labelClasses}>ลิงก์ Zoom กลุ่มนี้ <span className="text-gray-400 font-normal">(ถ้ามี — ทับค่าตั้งค่าทั่วไป)</span></label>
              <input type="url" value={formData.zoom_link} onChange={e => setFormData({ ...formData, zoom_link: e.target.value })} className={inputClasses} placeholder="https://zoom.us/j/..." />
            </div>
            <div>
              <label className={labelClasses}>วันเรียนปกติ <span className="text-gray-400 font-normal">(ไว้แสดงใน portal)</span></label>
              <input type="text" value={formData.schedule_day} onChange={e => setFormData({ ...formData, schedule_day: e.target.value })} className={inputClasses} placeholder="เช่น จันทร์-พุธ, เสาร์" />
            </div>
            <div>
              <label className={labelClasses}>เวลาเรียนปกติ <span className="text-gray-400 font-normal">(ไว้แสดงใน portal)</span></label>
              <input type="text" value={formData.schedule_time} onChange={e => setFormData({ ...formData, schedule_time: e.target.value })} className={inputClasses} placeholder="เช่น 10:00-11:00" />
            </div>
            <div>
              <label className={labelClasses}>แพ็กเกจกลุ่ม (ชม.) <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
              <input type="number" step="0.5" min="0" value={formData.package_hours} onChange={e => setFormData({ ...formData, package_hours: e.target.value })} className={inputClasses} placeholder="เช่น 20" />
            </div>
            <div>
              <label className={labelClasses}>เรทแพ็กเกจกลุ่ม (฿/ชม.) <span className="text-gray-400 font-normal">(ถ้าต่างจากเรทปกติ)</span></label>
              <input type="number" step="1" min="0" value={formData.package_rate} onChange={e => setFormData({ ...formData, package_rate: e.target.value })} className={inputClasses} placeholder="เช่น 500" />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className={`${labelClasses} mb-0`}>สมาชิกในกลุ่ม <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">({formData.studentIds.length} คน)</span></label>
              <button type="button" onClick={handleSelectAllStudents} className="text-[12px] font-semibold text-blue-600 hover:text-blue-800">{allPickerSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}</button>
            </div>
            <input type="text" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className={`${inputClasses} mb-2`} placeholder="ค้นหาชื่อนักเรียน..." />
            <div className="border border-gray-200 rounded-[12px] overflow-hidden">
              <div className="max-h-60 overflow-y-auto bg-white p-2">
                {pickerStudents.length === 0 ? <p className="text-center text-gray-500 py-4 text-[14px]">ไม่พบนักเรียน</p>
                  : pickerStudents.map((s, i) => (
                    <label key={i} className="flex items-center p-2.5 hover:bg-gray-50 rounded-[8px] cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 text-blue-600 rounded mr-3" checked={formData.studentIds.includes(s.data[STUDENT.ID])} onChange={() => handleToggleStudent(s.data[STUDENT.ID])} />
                      <span className="text-[14px] text-gray-900">{s.data[STUDENT.NAME]}</span>
                      {s.data[STUDENT.SUBJECT] && <span className="ml-2 text-[12px] text-gray-400">({s.data[STUDENT.SUBJECT]})</span>}
                    </label>
                  ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button type="submit" disabled={!isValid || isSubmitting} className={btnPrimary}>{isSubmitting ? 'กำลังบันทึก...' : `${editingGroup ? 'อัปเดตกลุ่ม' : 'สร้างกลุ่ม'}`}</button>
          </div>
        </form>
      )}

      <StateDisplay
        loading={loading}
        error={error}
        empty={activeGroups.length === 0}
        emptyMessage='ยังไม่มีกลุ่มนักเรียนครับ — กดปุ่ม "+ สร้างกลุ่มใหม่" ด้านบนเพื่อเริ่มจัดกลุ่มได้เลย'
        onRetry={refresh}
      >
        <div className="bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500 uppercase tracking-wide">
                <th className="p-4 font-semibold">ชื่อกลุ่ม</th>
                <th className="p-4 font-semibold">รหัสกลุ่ม</th>
                <th className="p-4 font-semibold">สมาชิก</th>
                <th className="p-4 font-semibold">วิชา default</th>
                <th className="p-4 font-semibold">คาบค้างบิล</th>
                <th className="p-4 font-semibold">แพ็กเกจกลุ่ม</th>
                <th className="p-4 font-semibold">LINE Group</th>
                <th className="p-4 font-semibold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {activeGroups.map((group, index) => {
                const memberIds = groupStudentIds(group.data);
                return (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900 text-[14px] align-top">{group.data[GROUP.NAME]}</td>
                    <td className="p-4 align-top">
                      {group.data[GROUP.CODE] ? (
                        <button onClick={() => { copyText(group.data[GROUP.CODE]); toast(`คัดลอกรหัสกลุ่ม ${group.data[GROUP.CODE]} แล้ว`, 'success'); }} className="font-mono text-[13px] font-bold tracking-widest bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-[8px] hover:bg-indigo-100 transition-all active:scale-95 inline-flex items-center gap-1.5" title="คลิกเพื่อคัดลอก"><Copy className="w-3 h-3" strokeWidth={2} />{group.data[GROUP.CODE]}</button>
                      ) : <span className="text-gray-300 text-[12px]">—</span>}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {memberIds.length === 0 ? <span className="text-gray-400 text-[12px]">ไม่มีสมาชิก</span>
                          : memberIds.map((sid, mi) => {
                            const ci = getStudentColorIdx(sid);
                            const stu = students.find(s => s[STUDENT.ID] === sid);
                            const hasLine = !!stu?.[STUDENT_LINE_USER_ID];
                            return (
                              <span key={mi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium" style={{ background: STUDENT_COLORS[ci], color: STUDENT_TEXT_COLORS[ci] }}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasLine ? 'bg-emerald-500' : 'bg-black/20'}`} title={hasLine ? 'เชื่อมต่อ LINE แล้ว' : 'ยังไม่เชื่อมต่อ LINE'} />
                                {getStudentName(sid)}
                              </span>
                            );
                          })}
                      </div>
                      {memberIds.length > 0 && (() => {
                        const lineCount = memberIds.filter(sid => {
                          const stu = students.find(s => s[STUDENT.ID] === sid);
                          return !!stu?.[STUDENT_LINE_USER_ID];
                        }).length;
                        return (
                          <div className="mt-1.5 text-[10px] text-gray-400">
                            LINE {lineCount}/{memberIds.length} คน
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 align-top">
                      {group.data[GROUP.DEFAULT_SUBJECT] ? <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-[6px] text-[12px] font-medium border border-blue-100">{group.data[GROUP.DEFAULT_SUBJECT]}</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="p-4 align-top">
                      {(() => {
                        const total = groupStudentIds(group.data).reduce((sum, sid) => sum + sessions.filter(s => s[SESSION.STUDENT_ID] === sid && s[SESSION.INVOICED] === 'FALSE' && s[SESSION.DELETED] !== 'TRUE').length, 0);
                        return total > 0 ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-[6px] text-[12px] font-medium border border-amber-100">{total} คาบ</span> : <span className="text-gray-300 text-[12px]">—</span>;
                      })()}
                    </td>
                    <td className="p-4 align-top">
                      {(() => {
                        const pkgTotal = safeFloat(group.data[GROUP.PACKAGE_HOURS]);
                        const pkgRemaining = safeFloat(group.data[GROUP.PACKAGE_HOURS_REMAINING]);
                        if (!pkgTotal) return <span className="text-gray-300 text-[12px]">—</span>;
                        const pct = Math.min(100, Math.round((pkgRemaining / pkgTotal) * 100));
                        const isLow = pkgRemaining > 0 && pkgRemaining < 2;
                        return (
                          <div className="min-w-[100px]">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[12px] font-semibold ${isLow ? 'text-red-600' : pkgRemaining === 0 ? 'text-gray-400' : 'text-violet-700'}`}>{pkgRemaining}/{pkgTotal} ชม.</span>
                              {isLow && <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full ml-1">ใกล้หมด</span>}
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : pct > 30 ? 'bg-violet-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 align-top">
                      {(() => {
                        const mids = groupStudentIds(group.data);
                        const oaName = settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'LINE OA';
                        const firstStu = students.find(s => s[STUDENT.ID] === mids[0]);
                        const linkUrl = firstStu ? `${window.location.origin}/line-connect?sid=${firstStu[STUDENT.ID]}&db=${dbId}&name=${encodeURIComponent(firstStu[STUDENT.NAME])}&oa=${encodeURIComponent(oaName)}` : '';
                        const copyMsg = firstStu ? `📲 สวัสดีครับ 😊\n\nกดลิงก์แล้วส่งรหัสในกลุ่มนี้ เพื่อเชื่อมต่อกลุ่มกับระบบของ${TEACHER_ROLE_LABEL}นะครับ\n\n${linkUrl}\n\n💡 กดลิงก์ → copy รหัส → ส่งในกลุ่มนี้เลยครับ` : '';
                        if (group.data[GROUP.LINE_GROUP_ID]) {
                          return (
                            <div className="flex flex-col gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> เชื่อมต่อแล้ว</span>
                              {linkUrl && <button onClick={() => { copyText(linkUrl); toast('คัดลอกลิงก์แล้ว — ส่งเข้ากลุ่ม LINE ได้เลยครับ', 'success'); }} className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 underline text-left"><Copy className="w-2.5 h-2.5" strokeWidth={2} />เชื่อมต่อใหม่</button>}
                            </div>
                          );
                        }
                        return (
                          <div className="flex flex-col gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium"><AlertTriangle className="w-3 h-3" /> ยังไม่เชื่อมต่อ</span>
                            {linkUrl && <CopyButton variant="button" size="sm" text={copyMsg} label="คัดลอกลิงก์เชื่อมต่อ" onCopy={() => toast(`คัดลอกลิงก์กลุ่ม ${group.data[GROUP.NAME]} แล้ว — วางส่งเข้ากลุ่ม LINE ได้เลยครับ 🔗`, 'success')} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold rounded-[6px] transition-all active:scale-95 whitespace-nowrap" />}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex justify-center items-center gap-2">
                        <RowActionsMenu items={[
                          { label: 'ออกบิลกลุ่ม', icon: <Receipt className="w-3.5 h-3.5" />, colorClass: 'text-blue-700', hidden: groupStudentIds(group.data).every(sid => !sessions.some(s => s[SESSION.STUDENT_ID] === sid && s[SESSION.INVOICED] === 'FALSE' && s[SESSION.DELETED] !== 'TRUE')), onClick: () => handleOpenGroupBilling(group) },
                          { label: 'ส่ง LINE กลุ่ม', icon: <MessageCircle className="w-3.5 h-3.5" />, colorClass: 'text-green-700', onClick: () => setSendTemplateTarget({ group }) },
                          { label: 'คัดลอกข้อความ Portal', icon: <Copy className="w-3.5 h-3.5" />, colorClass: 'text-blue-700', onClick: () => { const gc = settingsRow?.[SETTINGS.CLASS_CODE] || ''; const gPortalUrl = gc ? `${window.location.origin}/portal?class=${encodeURIComponent(gc)}` : `${window.location.origin}/portal`; const memberIds = groupStudentIds(group.data); const groupMembers = memberIds.map(sid => students.find(s => s[STUDENT.ID] === sid)).filter(Boolean); const msg = buildGroupPortalIntroMessage({ groupName: group.data[GROUP.NAME], groupCode: group.data[GROUP.CODE], groupMembers, portalUrl: gPortalUrl, settingsRow }); copyText(msg); toast(`คัดลอกข้อความ Portal ของกลุ่ม ${group.data[GROUP.NAME]} แล้ว`, 'success'); } },
                          { label: 'แชร์ข้อความ Portal', icon: <Share2 className="w-3.5 h-3.5" />, colorClass: 'text-indigo-700', onClick: async () => { const gc = settingsRow?.[SETTINGS.CLASS_CODE] || ''; const gPortalUrl = gc ? `${window.location.origin}/portal?class=${encodeURIComponent(gc)}` : `${window.location.origin}/portal`; const memberIds = groupStudentIds(group.data); const groupMembers = memberIds.map(sid => students.find(s => s[STUDENT.ID] === sid)).filter(Boolean); const msg = buildGroupPortalIntroMessage({ groupName: group.data[GROUP.NAME], groupCode: group.data[GROUP.CODE], groupMembers, portalUrl: gPortalUrl, settingsRow }); if (navigator.share) { try { await navigator.share({ text: msg }); return; } catch (e) { if (e.name === 'AbortError') return; } } copyText(msg); toast('คัดลอกข้อความแล้ว', 'success'); } },
                          { label: 'ส่ง LINE Portal (รายคน)', icon: <Send className="w-3.5 h-3.5" />, colorClass: 'text-green-700', onClick: async () => { if (!canSendLine(settingsRow)) { toast('LINE OA ยังไม่ได้ตั้งค่าครับ', 'error'); return; } const memberIds = groupStudentIds(group.data); let sent = 0; for (const sid of memberIds) { const stu = students.find(s => s[STUDENT.ID] === sid); const lineUserId = stu?.[STUDENT_LINE_USER_ID]; if (!lineUserId) continue; const stuCode = buildStudentLoginCode(stu[STUDENT.NICKNAME], stu[STUDENT.NAME]); const cc = settingsRow?.[SETTINGS.CLASS_CODE] || ''; const portalUrl = stuCode ? (cc ? `${window.location.origin}/portal?class=${encodeURIComponent(cc)}&code=${stuCode}` : `${window.location.origin}/portal?code=${stuCode}`) : `${window.location.origin}/portal`; const msg = buildPortalIntroMessage({ studentName: stu[STUDENT.NAME], portalUrl, stuCode, settingsRow }); try { await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, msg); sent++; } catch (err) { toastLineError(toast, err); } } if (sent > 0) toast(`ส่ง LINE Portal ให้ ${sent} คนแล้วครับ`, 'success'); else toast('ไม่พบนักเรียนที่เชื่อมต่อ LINE ครับ', 'error'); } },
                          { label: 'ส่งแจ้งเตือนก่อนเรียน', icon: <Video className="w-3.5 h-3.5" />, colorClass: 'text-blue-600', onClick: () => handleSendGroupReminder(group) },
                          { label: 'แพ็กเกจกลุ่ม (เติม)', icon: <Package className="w-3.5 h-3.5" />, colorClass: 'text-violet-700', onClick: () => { setGroupPkgModal({ group, grpIdx: group.rowIndex }); setGpkgHoursToAdd(''); } },
                          { label: 'เติมแพ็กเกจ (รายคน)', icon: <Package className="w-3.5 h-3.5" />, colorClass: 'text-purple-700', onClick: () => setSendTemplateTarget({ group, mode: 'topup' }) },
                          { label: 'แก้ไข', icon: <Pencil className="w-3.5 h-3.5" />, onClick: () => handleEditClick(group) },
                          { label: 'ลบกลุ่ม', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: () => handleDeleteClick(group) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </StateDisplay>

      {billingGroup && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-[20px]">ออกบิลกลุ่ม {billingGroup.data[GROUP.NAME]}</h3>
                <p className="text-[13px] text-gray-400 mt-0.5">ออกบิลแยกรายคน — เรทคำนวณตามของแต่ละคน</p>
              </div>
              <button onClick={() => setBillingGroup(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateGroupInvoices} className="flex-1 overflow-y-auto space-y-4">
              {groupStudentIds(billingGroup.data).map(sid => {
                const stu = students.find(s => s[STUDENT.ID] === sid);
                const stuName = stu?.[STUDENT.NAME] || sid;
                const rate = safeFloat(stu?.[STUDENT.RATE] || 0);
                const unbilled = (groupUnbilledMap[sid] || []);
                const selIds = groupSelectedIds[sid] || [];
                const totalHours = unbilled.filter(s => selIds.includes(s.data[SESSION.ID])).reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);
                return (
                  <div key={sid} className="border border-gray-200 rounded-[12px] overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-900 text-[14px]">{stuName}</p>
                        <p className="text-[12px] text-gray-400">{rate.toLocaleString()} ฿/ชม.</p>
                      </div>
                      {totalHours > 0 && <div className="text-right"><p className="text-[13px] font-bold text-gray-900">{totalHours} ชม.</p><p className="text-[12px] text-green-600 font-semibold">{(totalHours * rate).toLocaleString()} ฿</p></div>}
                    </div>
                    <div className="p-3 max-h-40 overflow-y-auto">
                      {unbilled.length === 0 ? <p className="text-[13px] text-gray-400 text-center py-2">ไม่มีคาบที่ค้างชำระ</p>
                        : unbilled.map((sess, si) => (
                          <label key={si} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-[6px] cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={selIds.includes(sess.data[SESSION.ID])} onChange={() => setGroupSelectedIds(prev => { const cur = prev[sid] || []; return { ...prev, [sid]: cur.includes(sess.data[SESSION.ID]) ? cur.filter(id => id !== sess.data[SESSION.ID]) : [...cur, sess.data[SESSION.ID]] }; })} />
                            <span className="text-[13px] text-gray-700 flex-1">{sess.data[SESSION.DATE]} · {sess.data[SESSION.SUBJECT]}</span>
                            <span className="text-[12px] font-semibold text-gray-900">{sess.data[SESSION.HOURS]} ชม.</span>
                          </label>
                        ))}
                    </div>
                  </div>
                );
              })}
              <button type="submit" disabled={isSubmitting} className={`w-full py-3 ${isSubmitting ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold rounded-[12px] transition-all`}>{isSubmitting ? 'กำลังออกบิล...' : `ยืนยันออกบิลกลุ่ม ${billingGroup.data[GROUP.NAME]}`}</button>
            </form>
          </div>
        </div>
      )}

      {groupPkgModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold text-gray-900 text-[18px]">แพ็กเกจกลุ่ม</h3>
              <button onClick={() => setGroupPkgModal(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-violet-50 border border-violet-100 p-4 rounded-[12px] text-[14px] mb-4">
              <p><span className="font-semibold text-violet-900">กลุ่ม:</span> {groupPkgModal.group.data[GROUP.NAME]}</p>
              <p className="mt-1"><span className="font-semibold text-violet-900">คงเหลือ:</span> {safeFloat(groupPkgModal.group.data[GROUP.PACKAGE_HOURS_REMAINING])} / {safeFloat(groupPkgModal.group.data[GROUP.PACKAGE_HOURS])} ชม.</p>
            </div>
            <form onSubmit={handleGroupPkgTopUp} className="space-y-4">
              <div>
                <label className={labelClasses}>เติมชั่วโมง</label>
                <input type="number" step="0.5" min="0.5" required autoFocus value={gpkgHoursToAdd} onChange={e => setGpkgHoursToAdd(e.target.value)} className={inputClasses} placeholder="เช่น 10" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setGroupPkgModal(null)} className={btnSecondary}>ยกเลิก</button>
                <button type="submit" disabled={gpkgIsToppingUp} className={`${btnPrimary} flex-1`}>{gpkgIsToppingUp ? 'กำลังเติม...' : 'ยืนยันเติมแพ็กเกจกลุ่ม'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sendTemplateTarget?.mode === 'topup' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 text-[18px]">เติมแพ็กเกจ — {sendTemplateTarget.group.data[GROUP.NAME]}</h3>
              <button onClick={() => setSendTemplateTarget(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[13px] text-gray-500 mb-4">เลือกนักเรียนที่ต้องการเติมแพ็กเกจ</p>
            <div className="space-y-2">
              {groupStudentIds(sendTemplateTarget.group.data).map(sid => {
                const stu = students.find(s => s[STUDENT.ID] === sid);
                const pkg = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
                return (
                  <button key={sid} type="button" onClick={() => { setTopUpGroup({ group: sendTemplateTarget.group, studentId: sid }); setSendTemplateTarget(null); setTopUpAmount(''); setTopUpMoneyAmount(''); setTopUpMode('hours'); }}
                    className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-[10px] hover:border-purple-300 hover:bg-purple-50 transition-all text-left">
                    <span className="font-medium text-gray-900 text-[14px]">{stu?.[STUDENT.NAME] || sid}</span>
                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${pkg > 0 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>{pkg > 0 ? `${pkg} ชม.` : 'ไม่มีแพ็กเกจ'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {topUpGroup && !sendTemplateTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold text-gray-900 text-[18px]">เติมแพ็กเกจ</h3>
              <button onClick={() => setTopUpGroup(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {(() => {
              const stu = students.find(s => s[STUDENT.ID] === topUpGroup.studentId);
              const rate = safeFloat(stu?.[STUDENT.RATE] || 0);
              const current = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
              const hoursFromAmt = rate > 0 ? Math.round((safeFloat(topUpMoneyAmount) / rate) * 100) / 100 : 0;
              return (
                <form onSubmit={handleGroupTopUp} className="space-y-4">
                  <div className="bg-purple-50 border border-purple-100 p-4 rounded-[12px] text-[14px]">
                    <p><span className="font-semibold text-purple-900">นักเรียน:</span> {stu?.[STUDENT.NAME]}</p>
                    <p className="mt-1"><span className="font-semibold text-purple-900">คงเหลือ:</span> {current} ชม.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-[10px]">
                    <button type="button" onClick={() => setTopUpMode('hours')} className={`py-2 rounded-[8px] text-[13px] font-medium transition-all ${topUpMode === 'hours' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>กรอกชั่วโมง</button>
                    <button type="button" onClick={() => setTopUpMode('amount')} className={`py-2 rounded-[8px] text-[13px] font-medium transition-all ${topUpMode === 'amount' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>กรอกยอดเงิน</button>
                  </div>
                  {topUpMode === 'hours' ? (
                    <div><label className={labelClasses}>จำนวนชั่วโมง</label><input type="number" step="0.5" min="0.5" required autoFocus value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} className={inputClasses} /></div>
                  ) : (
                    <div><label className={labelClasses}>ยอดเงิน (฿)</label><input type="number" required autoFocus value={topUpMoneyAmount} onChange={e => setTopUpMoneyAmount(e.target.value)} className={inputClasses} /><p className="text-[12px] text-gray-500 mt-1">{rate > 0 ? `= ${hoursFromAmt} ชม.` : 'ยังไม่ได้ตั้งเรท'}</p></div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setTopUpGroup(null)} className={btnSecondary}>ยกเลิก</button>
                    <button type="submit" disabled={isToppingUp} className={`${btnPrimary} flex-1`}>{isToppingUp ? 'กำลังเติม...' : 'ยืนยันเติมแพ็กเกจ'}</button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {sendTemplateTarget && !sendTemplateTarget.mode && (
        <SendTemplateModal
          student={{ data: (() => {
            const mids = groupStudentIds(sendTemplateTarget.group.data);
            const arr = [];
            arr[STUDENT.NAME] = sendTemplateTarget.group.data[GROUP.NAME];
            arr[STUDENT.SUBJECT] = sendTemplateTarget.group.data[GROUP.DEFAULT_SUBJECT] || '';
            arr[STUDENT_LINE_USER_ID] = sendTemplateTarget.group.data[GROUP.LINE_GROUP_ID] || (mids.length === 1 ? (students.find(s => s[STUDENT.ID] === mids[0])?.[STUDENT_LINE_USER_ID] || '') : '');
            arr[STUDENT.ID] = sendTemplateTarget.group.data[GROUP.ID];
            return arr;
          })() }}
          settingsRow={settingsRow}
          lineOAEnabled={lineOAEnabled}
          invoices={invoices}
          sessions={sessions}
          onClose={() => setSendTemplateTarget(null)}
          toast={toast}
        />
      )}
    </div>
  );
}
