// @ts-nocheck
import { useState, useMemo } from 'react';
import { STUDENT, INVOICE, SETTINGS, canSendLine } from '../../lib/constants';
import { STUDENT_LINE_USER_ID } from '../../lib/constants';
import { safeFloat } from '../../lib/business';
import { inputClasses, labelClasses, btnSecondary } from '../ui/styles';
import { ShareButton } from '../ui/ShareButton';
import { CopyButton } from '../ui/CopyButton';
import { X, Check } from 'lucide-react';
import { getTemplates, fillTemplate } from '../../pages/Templates';
import { sendLineMessage } from '../../services/googleSheets';

export function SendTemplateModal({ student, settingsRow, lineOAEnabled, invoices, sessions, onClose, toast }) {
  const templates = useMemo(() => getTemplates(), []);
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');
  const [extraVars, setExtraVars] = useState({ note: '', homework: '', reason: '', skill: '', amount: '', due: '' });
  const [isSending, setIsSending] = useState(false);

  const studentName = student?.data?.[STUDENT.NAME] || '';
  const studentSubject = student?.data?.[STUDENT.SUBJECT] || '';
  const todayStr = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const lineUserId = student?.data?.[STUDENT_LINE_USER_ID] || '';
  const hasLINE = !!lineUserId;

  const selected = templates.find(t => t.id === selectedId) || templates[0];

  const unpaidInvoices = useMemo(() => {
    if (!invoices || !student) return [];
    const sid = student.data?.[STUDENT.ID];
    return (invoices || [])
      .filter(inv => inv[INVOICE.STUDENT_ID] === sid && (inv[INVOICE.STATUS] === 'UNPAID' || inv[INVOICE.STATUS] === 'SENT') && inv[INVOICE.STATUS] !== 'VOID')
      .sort((a, b) => (b[INVOICE.DATE] || '').localeCompare(a[INVOICE.DATE] || ''));
  }, [invoices, student]);

  const vars = { name: studentName, subject: studentSubject, date: todayStr, ...extraVars };
  const filledText = selected ? fillTemplate(selected.text, vars) : '';

  const needsExtra = selected ? {
    note: selected.text.includes('{note}'),
    homework: selected.text.includes('{homework}'),
    reason: selected.text.includes('{reason}'),
    skill: selected.text.includes('{skill}'),
    amount: selected.text.includes('{amount}'),
    due: selected.text.includes('{due}'),
  } : {};
  const hasExtra = Object.values(needsExtra).some(Boolean);

  const handleSendLine = async () => {
    if (!hasLINE) { toast(`${studentName} ยังไม่มี LINE User ID ค่ะ`, 'error'); return; }
    if (!canSendLine(settingsRow)) { toast('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าค่ะ', 'error'); return; }
    if (settingsRow?.[SETTINGS.SEND_TEMPLATES] === 'FALSE') { toast('การส่ง Template ทาง LINE ถูกปิดอยู่ — เปิดได้ที่หน้าตั้งค่า LINE OA ค่ะ', 'error'); return; }
    const lineToken = settingsRow[SETTINGS.LINE_TOKEN];
    const lineWorkerUrl = settingsRow[SETTINGS.LINE_WORKER_URL];
    setIsSending(true);
    try {
      await sendLineMessage(lineWorkerUrl, lineToken, lineUserId, filledText);
      toast(`ส่ง LINE ให้ ${studentName} แล้วค่ะ`, 'success');
      onClose();
    } catch (err) {
      toast(`ส่งไม่สำเร็จ: ${err.message}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  if (!student) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] shadow-[0_20px_40px_rgba(0,0,0,0.18)] max-w-lg w-full max-h-[90vh] flex flex-col animate-[slideIn_200ms_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px]">ส่งข้อความหา {studentName}</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">{studentSubject || 'ยังไม่มีวิชา'} · <span className={`inline-flex items-center gap-1 ${hasLINE ? 'text-green-600' : 'text-gray-400'}`}><span className={`w-1.5 h-1.5 rounded-full inline-block ${hasLINE ? 'bg-green-500' : 'bg-gray-400'}`} />{hasLINE ? 'มี LINE' : 'ยังไม่มี LINE'}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className={labelClasses}>เลือก Template</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {templates.map(t => (
                <button key={t.id} type="button"
                  onClick={() => { setSelectedId(t.id); setExtraVars({ note: '', homework: '', reason: '', skill: '', amount: '', due: '' }); }}
                  className={`px-3 py-2.5 rounded-[10px] text-[13px] font-medium border text-left transition-all ${selectedId === t.id ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}
                >{t.name}</button>
              ))}
            </div>
          </div>

          {hasExtra && (
            <div className="bg-amber-50 border border-amber-100 rounded-[12px] p-3.5 space-y-3">
              <p className="text-[12px] font-semibold text-amber-800">กรอกข้อมูลเพิ่มเติม</p>
              {needsExtra.note && <div><label className={labelClasses}>หมายเหตุ / สรุปบทเรียน</label><input value={extraVars.note} onChange={e => setExtraVars(v => ({ ...v, note: e.target.value }))} className={inputClasses} placeholder="เช่น ทบทวนบทที่ 3 แล้ว" /></div>}
              {needsExtra.homework && <div><label className={labelClasses}>การบ้าน</label><input value={extraVars.homework} onChange={e => setExtraVars(v => ({ ...v, homework: e.target.value }))} className={inputClasses} placeholder="เช่น หน้า 25-28" /></div>}
              {needsExtra.reason && (
                <div>
                  <label className={labelClasses}>เหตุผล</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['ติดธุระกะทันหัน', 'ป่วย', 'วันหยุดนักขัตฤกษ์', 'ติดงาน', 'ครอบครัวมีธุระ', 'เดินทาง'].map(r => (
                      <button key={r} type="button" onClick={() => setExtraVars(v => ({ ...v, reason: r }))} className={`px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all ${extraVars.reason === r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:bg-amber-50'}`}>{r}</button>
                    ))}
                  </div>
                  <input value={extraVars.reason} onChange={e => setExtraVars(v => ({ ...v, reason: e.target.value }))} className={inputClasses} placeholder="หรือพิมพ์เหตุผลเองได้ค่ะ" />
                </div>
              )}
              {needsExtra.skill && (
                <div>
                  <label className={labelClasses}>ทักษะที่พัฒนาขึ้น</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['การฟัง', 'การพูด', 'การอ่าน', 'การเขียน', 'การออกเสียง', 'คำศัพท์', 'ไวยากรณ์', 'โทนเสียง'].map(sk => (
                      <button key={sk} type="button" onClick={() => setExtraVars(v => ({ ...v, skill: sk }))} className={`px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all ${extraVars.skill === sk ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>{sk}</button>
                    ))}
                  </div>
                  <input value={extraVars.skill} onChange={e => setExtraVars(v => ({ ...v, skill: e.target.value }))} className={inputClasses} placeholder="หรือพิมพ์ทักษะเองได้ค่ะ" />
                </div>
              )}
              {needsExtra.amount && (
                <div>
                  <label className={labelClasses}>ยอดเงิน (฿)</label>
                  {unpaidInvoices.length > 0 ? (
                    <>
                      <p className="text-[11px] text-amber-700 font-semibold mb-1.5">บิลค้างชำระของนักเรียนคนนี้ — กดเลือกได้เลย</p>
                      <div className="space-y-1.5 mb-2">
                        {unpaidInvoices.map(inv => {
                          const chip = safeFloat(inv[INVOICE.TOTAL]).toLocaleString();
                          return (
                            <button key={inv[INVOICE.ID]} type="button" onClick={() => setExtraVars(v => ({ ...v, amount: chip }))}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] border text-left transition-all ${extraVars.amount === chip ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50'}`}>
                              <div>
                                <p className="text-[13px] font-semibold">{inv[INVOICE.NUMBER]}</p>
                                <p className={`text-[11px] ${extraVars.amount === chip ? 'text-amber-100' : 'text-gray-400'}`}>{inv[INVOICE.DATE]} · {inv[INVOICE.STATUS] === 'SENT' ? 'ส่งบิลแล้ว' : 'รอส่งบิล'}</p>
                              </div>
                              <span className="text-[15px] font-bold">{chip} ฿</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400 mb-1">หรือพิมพ์ยอดอื่น:</p>
                      <input type="text" value={extraVars.amount} onChange={e => setExtraVars(v => ({ ...v, amount: e.target.value }))} className={inputClasses} placeholder="เช่น 3,000" />
                    </>
                  ) : (
                    <div>
                      <p className="text-[11px] text-green-700 bg-green-50 border border-green-100 rounded-[8px] px-3 py-2 mb-2 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> ไม่มีบิลค้างชำระค่ะ</p>
                      <input type="text" value={extraVars.amount} onChange={e => setExtraVars(v => ({ ...v, amount: e.target.value }))} className={inputClasses} placeholder="พิมพ์ยอดเองได้ค่ะ" />
                    </div>
                  )}
                </div>
              )}
              {needsExtra.due && (
                <div>
                  <label className={labelClasses}>กำหนดชำระ</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(() => {
                      const now = new Date();
                      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      const opts = [{ label: 'สิ้นเดือนนี้', val: endOfMonth.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) }];
                      [3, 7, 14].forEach(d => { const dt = new Date(now); dt.setDate(dt.getDate() + d); opts.push({ label: `ใน ${d} วัน`, val: dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) }); });
                      return opts.map(o => (
                        <button key={o.label} type="button" onClick={() => setExtraVars(v => ({ ...v, due: o.val }))} className={`px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all ${extraVars.due === o.val ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:bg-green-50'}`}>{o.label} ({o.val})</button>
                      ));
                    })()}
                  </div>
                  <input value={extraVars.due} onChange={e => setExtraVars(v => ({ ...v, due: e.target.value }))} className={inputClasses} placeholder="หรือพิมพ์กำหนดเองได้ค่ะ" />
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelClasses}>ตัวอย่างข้อความ</label>
            <div className="bg-gray-50 border border-gray-200 rounded-[12px] px-4 py-3 text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed font-mono max-h-48 overflow-y-auto">{filledText}</div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-wrap">
          <CopyButton variant="button" text={filledText} label="คัดลอก" onCopy={() => toast('คัดลอกข้อความแล้วค่ะ')} className={`${btnSecondary} flex-1 min-w-[100px] flex items-center justify-center gap-1.5`} />
          <ShareButton text={filledText} className="flex-1 min-w-[100px] px-4 py-2 bg-violet-600 text-white font-medium rounded-[8px] hover:bg-violet-700 active:scale-95 transition-all text-[14px] shadow-sm flex items-center justify-center gap-1.5" />
          {lineOAEnabled && (
            <button onClick={handleSendLine} disabled={isSending || !hasLINE} title={!hasLINE ? `${studentName} ยังไม่มี LINE User ID` : ''}
              className={`flex-1 min-w-[100px] px-4 py-2 font-medium rounded-[8px] active:scale-95 transition-all text-[14px] shadow-sm flex items-center justify-center gap-1.5 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed ${hasLINE ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {isSending ? 'กำลังส่ง...' : hasLINE ? 'LINE OA' : 'ไม่มี LINE'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
