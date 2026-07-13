// @ts-nocheck
import { useState } from 'react';
import { STUDENT, SESSION, INVOICE, RECEIPT } from '../lib/constants';
import { AppError, runWithFeedback, safeFloat, localDateStr } from '../lib/business';
import { X, Info, AlertTriangle, FileText, Check } from 'lucide-react';
import { StateDisplay } from '../components/ui/StateDisplay';
import { useSheetData } from '../hooks/useSheetData';
import { useConfirm } from '../hooks/useConfirm';
import { inputClasses, labelClasses, btnPrimary, btnSecondary, btnDanger } from '../components/ui/styles';
import { SubjectComboInput } from '../components/ui/SubjectComboInput';
import { getStudents, getSessions, getInvoices, getReceipts, softDeleteSession, updateSession, updateStudentPackageHours, addSessionsBatch } from '../services/googleSheets';

const round2 = (n) => Math.round(n * 100) / 100;

export function Sessions({ accessToken, dbId, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ studentIds: [], date: localDateStr(), subject: '', hours: '', note: '' });
  const [usePackage, setUsePackage] = useState(false);
  const { confirm, Dialog } = useConfirm();

  const { data, loading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { students: getStudents, sessions: getSessions, invoices: getInvoices, receipts: getReceipts } });
  const students = data.students || [];
  const sessions = data.sessions || [];
  const invoices = data.invoices || [];
  const receipts = data.receipts || [];

  const getInvoiceForSession = (sessionData) => invoices.find(inv => inv[INVOICE.ID] === sessionData[SESSION.INVOICE_ID]);
  const getReceiptForInvoice = (invoiceId) => receipts.find(r => r[RECEIPT.INVOICE_ID] === invoiceId);
  const activeStudentsForDropdown = students.filter(s => s[STUDENT.DELETED] !== 'TRUE');

  const handleCheckboxChange = (id) => {
    if (editingSession) {
      // แก้ไขคาบเรียนเป็นแบบเลือกได้ทีละคน (ไม่ใช่ multi-select) เปลี่ยนนักเรียนได้เฉพาะคาบที่ไม่ได้หักแพ็กเกจ
      if (editingSession.data[SESSION.INVOICED] === 'PREPAID') return;
      setFormData(prev => ({ ...prev, studentIds: [id] }));
      return;
    }
    setFormData(prev => {
      const studentIds = prev.studentIds.includes(id) ? prev.studentIds.filter(sId => sId !== id) : [...prev.studentIds, id];
      let subject = prev.subject;
      if (studentIds.length === 1 && !prev.subject) { const stu = students.find(s => s[STUDENT.ID] === studentIds[0]); if (stu?.[STUDENT.SUBJECT]) subject = stu[STUDENT.SUBJECT]; }
      return { ...prev, studentIds, subject };
    });
  };

  const handleSelectAll = () => {
    const allIds = activeStudentsForDropdown.map(s => s[STUDENT.ID]);
    setFormData(prev => ({ ...prev, studentIds: prev.studentIds.length === allIds.length ? [] : allIds }));
  };

  const handleEditClick = (session, rowIndex) => {
    setEditingSession({ data: session, rowIndex });
    setFormData({ studentIds: [session[SESSION.STUDENT_ID]], date: session[SESSION.DATE], subject: session[SESSION.SUBJECT], hours: session[SESSION.HOURS], note: session[SESSION.NOTE] || '' });
    setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => { setEditingSession(null); setShowForm(false); setFormData({ studentIds: [], date: localDateStr(), subject: '', hours: '', note: '' }); };

  const handleDeleteClick = async (session, rowIndex) => {
    if (session[SESSION.INVOICED] === 'TRUE') return toast('ไม่สามารถลบคาบที่ออกบิลแล้วได้ กรุณายกเลิกบิลก่อนครับ', 'error');
    const isPrepaid = session[SESSION.INVOICED] === 'PREPAID';
    const ok = await confirm(
      isPrepaid
        ? `ลบคาบเรียนวันที่ ${session[SESSION.DATE]} (${session[SESSION.SUBJECT]}) ใช่ไหมครับ? — ระบบจะคืนชั่วโมงแพ็กเกจ ${session[SESSION.HOURS]} ชม. ให้นักเรียนอัตโนมัติ`
        : `ลบคาบเรียนวันที่ ${session[SESSION.DATE]} (${session[SESSION.SUBJECT]}) ใช่ไหมครับ?`,
      true
    );
    if (!ok) return;
    const success = await runWithFeedback(async () => {
      if (isPrepaid) {
        const stuIdx = students.findIndex(s => s[STUDENT.ID] === session[SESSION.STUDENT_ID]);
        if (stuIdx >= 0) {
          const refunded = safeFloat(students[stuIdx][STUDENT.PACKAGE_HOURS]) + safeFloat(session[SESSION.HOURS]);
          await updateStudentPackageHours(accessToken, dbId, stuIdx + 2, round2(refunded));
        }
      }
      await softDeleteSession(accessToken, dbId, rowIndex);
    }, toast, isPrepaid ? 'ลบคาบเรียนสำเร็จ! คืนชั่วโมงแพ็กเกจให้นักเรียนแล้ว' : 'ลบคาบเรียนสำเร็จ!');
    if (success) refresh({ force: true });
  };

  const editingIsPrepaid = editingSession?.data[SESSION.INVOICED] === 'PREPAID';

  const previewTotal = !editingSession && formData.studentIds.length > 0 && formData.hours
    ? formData.studentIds.map(id => {
        const stu = students.find(s => s[STUDENT.ID] === id);
        const rate = safeFloat(stu?.[STUDENT.RATE] || 0);
        const pkgRemaining = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
        const willUsePackage = formData.studentIds.length === 1 && usePackage && pkgRemaining > 0;
        return { name: stu ? stu[STUDENT.NAME] : id, amount: rate * safeFloat(formData.hours), free: willUsePackage };
      })
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingSession && isFutureDate) {
      const ok = await confirm(`วันที่ ${formData.date} อยู่ในอนาคต ยืนยันบันทึกคาบเรียนล่วงหน้าใช่ไหมครับ?`);
      if (!ok) return;
    }
    setIsSubmitting(true); const dateNow = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      if (editingSession) {
        const row = [...editingSession.data]; while (row.length < 14) row.push('');
        const oldHours = safeFloat(editingSession.data[SESSION.HOURS]);
        const newHours = safeFloat(formData.hours);
        row[SESSION.DATE] = formData.date; row[SESSION.SUBJECT] = formData.subject; row[SESSION.HOURS] = formData.hours; row[SESSION.NOTE] = formData.note;
        if (!editingIsPrepaid) row[SESSION.STUDENT_ID] = formData.studentIds[0];
        await updateSession(accessToken, dbId, editingSession.rowIndex, row);
        if (editingIsPrepaid && oldHours !== newHours) {
          const stuIdx = students.findIndex(s => s[STUDENT.ID] === editingSession.data[SESSION.STUDENT_ID]);
          if (stuIdx >= 0) {
            const adjusted = Math.max(0, safeFloat(students[stuIdx][STUDENT.PACKAGE_HOURS]) + (oldHours - newHours));
            await updateStudentPackageHours(accessToken, dbId, stuIdx + 2, round2(adjusted));
          }
        }
      } else {
        if (formData.studentIds.length === 0) throw new AppError('กรุณาเลือกนักเรียนอย่างน้อย 1 คนครับ');
        const newRows = await Promise.all(formData.studentIds.map(async (studentId, index) => {
          const stu = students.find(s => s[STUDENT.ID] === studentId);
          const pkgRemaining = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
          const shouldUsePackage = usePackage && pkgRemaining > 0;
          const invoicedFlag = shouldUsePackage ? 'PREPAID' : 'FALSE';
          if (shouldUsePackage) {
            const stuIdx = students.findIndex(s => s[STUDENT.ID] === studentId);
            if (stuIdx >= 0) {
              const newRemaining = Math.max(0, pkgRemaining - safeFloat(formData.hours));
              await updateStudentPackageHours(accessToken, dbId, stuIdx + 2, newRemaining);
            }
          }
          return ['SES-' + Date.now() + '-' + index, studentId, formData.date, formData.subject, formData.hours, formData.note, invoicedFlag, '', 'FALSE', dateNow, '', '', '', ''];
        }));
        await addSessionsBatch(accessToken, dbId, newRows);
      }
    }, toast, editingSession ? 'แก้ไขคาบเรียนสำเร็จ!' : formData.studentIds.length > 1 ? 'บันทึกคาบเรียนกลุ่มสำเร็จ!' : 'บันทึกคาบเรียนสำเร็จ!');

    if (ok) { if (editingSession) handleCancelEdit(); else { setShowForm(false); setFormData({ ...formData, studentIds: [], subject: '', hours: '', note: '' }); } refresh({ force: true }); }
    setIsSubmitting(false);
  };

  const getStudentName = (id) => { const s = students.find(s => s[STUDENT.ID] === id); return s ? s[STUDENT.NAME] : 'ไม่พบข้อมูล'; };
  const validSessions = sessions.map((s, i) => ({ data: s, rowIndex: i + 2 })).filter(s => s.data[SESSION.DELETED] !== 'TRUE');
  const isFutureDate = formData.date > localDateStr();

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-6xl mx-auto">
      <Dialog />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-[24px] font-bold text-gray-900">ประวัติการสอน</h2>
          <p className="text-[14px] text-gray-500 mt-1">ดูประวัติย้อนหลังหรือเพิ่มคาบเรียนแบบแมนวล</p>
        </div>
        {!editingSession && <button onClick={() => setShowForm(f => !f)} className={showForm ? btnSecondary : btnPrimary}>{showForm ? <><X className="w-4 h-4 inline mr-1" />ยกเลิก</> : '+ บันทึกการสอนย้อนหลัง'}</button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={`mb-8 p-6 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border animate-[slideIn_150ms_ease-out] ${editingSession ? 'bg-yellow-50/50 border-yellow-200' : 'bg-white border-gray-200'}`}>
          <div className="flex justify-between items-center mb-5 border-b border-gray-100 pb-4">
            <h3 className="font-semibold text-gray-900 text-[16px]">{editingSession ? 'แก้ไขคาบเรียน' : 'บันทึกการสอนย้อนหลัง'}</h3>
            {editingSession && <button type="button" onClick={handleCancelEdit} className="text-[12px] text-gray-500 hover:text-red-600 font-semibold flex items-center gap-1"><X className="w-3.5 h-3.5" />ยกเลิกการแก้ไข</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
            <div className="lg:row-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className={labelClasses}>นักเรียน {editingSession ? '' : '(เลือกได้มากกว่า 1 คน)'} <span className="text-red-500">*</span></label>
                {!editingSession && <button type="button" onClick={handleSelectAll} className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold">{formData.studentIds.length === activeStudentsForDropdown.length && activeStudentsForDropdown.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}</button>}
              </div>
              {editingSession && editingIsPrepaid ? (
                <div className="w-full p-3 border border-gray-200 rounded-[8px] bg-gray-100 text-[14px] text-gray-700 font-medium">{getStudentName(formData.studentIds[0])} <span className="ml-2 text-[11px] text-gray-500 font-normal">(แก้ไขไม่ได้ — คาบนี้หักแพ็กเกจไปแล้ว)</span></div>
              ) : (
                <div className="w-full p-2 border border-gray-300 rounded-[8px] bg-white max-h-48 overflow-y-auto shadow-inner">
                  {activeStudentsForDropdown.length === 0 ? <p className="text-gray-500 text-[14px] p-2 text-center">ไม่มีข้อมูลนักเรียน</p>
                    : activeStudentsForDropdown.map((stu, idx) => (
                      <label key={idx} className="flex items-center mb-1 cursor-pointer hover:bg-gray-50 p-2 rounded-[6px] transition-colors">
                        <input type={editingSession ? 'radio' : 'checkbox'} className="w-4 h-4 text-blue-600 rounded mr-3 border-gray-300" checked={formData.studentIds.includes(stu[STUDENT.ID])} onChange={() => handleCheckboxChange(stu[STUDENT.ID])} />
                        <span className="text-[14px] font-medium text-gray-900">{stu[STUDENT.NAME]} {stu[STUDENT.SUBJECT] && <span className="ml-2 inline-block bg-blue-50 border border-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-[4px]">{stu[STUDENT.SUBJECT]}</span>}</span>
                      </label>
                    ))}
                </div>
              )}
              {!editingSession && <p className="text-[11px] text-blue-600 mt-2 font-medium flex items-center gap-1"><Info className="w-3.5 h-3.5 flex-shrink-0" />เลือกหลายคน ระบบจะสร้างคาบแยกรายบุคคลให้อัตโนมัติ</p>}
            </div>
            <div><label className={labelClasses}>วันที่สอน <span className="text-red-500">*</span></label><input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className={inputClasses} />{isFutureDate && <p className="text-[11px] text-amber-600 mt-1.5 font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />วันที่เลือกอยู่ในอนาคต</p>}</div>
            <div><label className={labelClasses}>วิชา/เนื้อหาที่สอน <span className="text-red-500">*</span></label><SubjectComboInput value={formData.subject} onChange={v => setFormData({ ...formData, subject: v })} required /></div>
            <div><label className={labelClasses}>จำนวนชั่วโมง <span className="text-red-500">*</span></label><input type="number" step="0.5" min="0.5" required value={formData.hours} onChange={e => setFormData({ ...formData, hours: e.target.value })} className={inputClasses} placeholder="เช่น 1.5" /></div>
            <div><label className={labelClasses}>หมายเหตุ (ถ้ามี)</label><input type="text" value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} className={inputClasses} placeholder="เช่น การบ้านบทที่ 4" /></div>
          </div>

          {!editingSession && formData.studentIds.length === 1 && (() => {
            const stu = students.find(s => s[STUDENT.ID] === formData.studentIds[0]);
            const pkg = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
            if (pkg <= 0) return null;
            return (
              <div className="flex items-center justify-between p-3 mb-2 bg-purple-50 border border-purple-100 rounded-[10px]">
                <div>
                  <p className="text-[13px] font-semibold text-purple-900">หักจากแพ็กเกจ</p>
                  <p className="text-[11px] text-purple-600">คงเหลือ {pkg} ชม. — ไม่ต้องออกบิลแยก</p>
                </div>
                <button type="button" onClick={() => setUsePackage(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${usePackage ? 'bg-purple-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${usePackage ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            );
          })()}

          {previewTotal.length > 0 && formData.hours && (
            <div className={`mb-5 p-4 rounded-[12px] border ${previewTotal.every(i => i.free) ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-[12px] font-semibold mb-3 uppercase tracking-wider ${previewTotal.every(i => i.free) ? 'text-purple-800' : 'text-blue-800'}`}>ยอดที่จะเกิดขึ้นจากคาบนี้</p>
              {previewTotal.map((item, i) => (
                <div key={i} className={`flex justify-between text-[14px] py-1 border-b last:border-0 ${item.free ? 'text-purple-900 border-purple-100/50' : 'text-blue-900 border-blue-100/50'}`}>
                  <span>{item.name}</span>
                  <span className="font-semibold">{item.free ? 'หักจากแพ็กเกจ (ไม่มีค่าใช้จ่าย)' : `${item.amount.toLocaleString()} ฿`}</span>
                </div>
              ))}
              {previewTotal.length > 1 && (
                <div className="flex justify-between text-[14px] font-bold text-blue-900 border-t border-blue-200 pt-3 mt-2">
                  <span>รวมทั้งหมด</span>
                  <span>{previewTotal.filter(i => !i.free).reduce((s, i) => s + i.amount, 0).toLocaleString()} ฿</span>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSubmitting} className={isSubmitting ? btnSecondary : (editingSession ? "px-6 py-2 bg-yellow-500 text-white font-medium rounded-[8px] hover:bg-yellow-600 active:scale-95 transition-all text-[14px] shadow-sm" : btnPrimary)}>{isSubmitting ? 'กำลังบันทึก...' : editingSession ? 'บันทึกการแก้ไข' : 'บันทึกคาบเรียน'}</button>
          </div>
        </form>
      )}

      <StateDisplay
        loading={loading}
        error={error}
        empty={validSessions.length === 0}
        emptyMessage="ยังไม่มีประวัติการสอนครับ"
        emptyIcon={<FileText className="w-6 h-6 text-gray-400" strokeWidth={1.5} />}
        onRetry={refresh}
      >
        <div className="overflow-x-auto rounded-[12px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">วันที่</th>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">นักเรียน</th>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">วิชา/เนื้อหา</th>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">ชั่วโมง</th>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider">หมายเหตุ</th>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider text-center">สถานะ</th>
                <th className="p-4 text-[12px] font-semibold text-gray-600 uppercase tracking-wider text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {[...validSessions].reverse().map((session, index) => (
                <tr key={index} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${editingSession?.rowIndex === session.rowIndex ? 'bg-yellow-50/30' : ''}`}>
                  <td className="p-4 text-[14px] text-gray-600">{session.data[SESSION.DATE]}</td>
                  <td className="p-4 text-[14px] font-medium text-gray-900">{getStudentName(session.data[SESSION.STUDENT_ID])}</td>
                  <td className="p-4 text-[14px] text-gray-900">{session.data[SESSION.SUBJECT]}</td>
                  <td className="p-4 text-[14px] font-semibold text-gray-900">{session.data[SESSION.HOURS]}</td>
                  <td className="p-4 text-[13px] text-gray-500 max-w-[200px] truncate" title={session.data[SESSION.NOTE]}>{session.data[SESSION.NOTE] || '-'}</td>
                  <td className="p-4 text-center">
                    {(() => {
                      const inv = session.data[SESSION.INVOICED];
                      if (inv === 'PREPAID') return <span className="bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-1 rounded-[6px] text-[12px] font-medium">แพ็กเกจ</span>;
                      if (inv !== 'TRUE') return (
                        <div className="group relative inline-block">
                          <span className="group-hover:opacity-0 group-hover:pointer-events-none transition-opacity bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-[6px] text-[12px] font-medium">รอออกบิล</span>
                          <a href="/students" className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-[6px] text-[12px] font-semibold flex items-center justify-center whitespace-nowrap" title="ไปหน้านักเรียนเพื่อออกบิล">ออกบิล →</a>
                        </div>
                      );
                      const invoice = getInvoiceForSession(session.data);
                      const receipt = invoice ? getReceiptForInvoice(invoice[INVOICE.ID]) : null;
                      if (receipt) return <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-[6px] text-[12px] font-medium flex items-center gap-1"><Check className="w-3 h-3" />เสร็จสิ้น</span>;
                      return (
                        <div className="group relative inline-block">
                          <span className="group-hover:opacity-0 group-hover:pointer-events-none transition-opacity bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded-[6px] text-[12px] font-medium">ออกบิลแล้ว</span>
                          <a href="/invoices" className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-[6px] text-[12px] font-semibold flex items-center justify-center whitespace-nowrap" title="ไปหน้าบิลเพื่อออกใบเสร็จ">ออกใบเสร็จ →</a>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEditClick(session.data, session.rowIndex)} className={btnSecondary}>แก้ไข</button>
                      <button onClick={() => handleDeleteClick(session.data, session.rowIndex)} disabled={session.data[SESSION.INVOICED] === 'TRUE'} className={session.data[SESSION.INVOICED] === 'TRUE' ? "px-4 py-2 bg-gray-100 text-gray-400 font-medium rounded-[8px] text-[14px] cursor-not-allowed" : btnDanger}>ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateDisplay>
    </div>
  );
}
