// @ts-nocheck
// กล่องข้อเสนอแนะระบบ — ครูจดสิ่งที่อยากให้ปรับปรุง แล้ว AI ผู้ช่วย (Claude)
// อ่านรายการสถานะ NEW ผ่าน GViz CSV ในรอบพัฒนาถัดไป (ดู CLAUDE.md "Teacher Feedback Inbox")
import { useState } from 'react';
import { FEEDBACK } from '../lib/constants';
import { runWithFeedback, localDateStr } from '../lib/business';
import { Lightbulb, Check, RotateCcw, Sparkles } from 'lucide-react';
import { StateDisplay } from '../components/ui/StateDisplay';
import { useSheetData } from '../hooks/useSheetData';
import { inputClasses, labelClasses, btnPrimary } from '../components/ui/styles';
import { getFeedback, addFeedback, updateFeedbackStatus } from '../services/googleSheets';

const CATEGORIES = [
  { value: 'bug', label: '🐞 เจอบั๊ก / ใช้แล้วพัง' },
  { value: 'feature', label: '✨ อยากได้ฟีเจอร์ใหม่' },
  { value: 'ux', label: '🎨 ใช้ยาก / อยากให้ปรับ UX' },
  { value: 'other', label: '💬 อื่นๆ' },
];

const categoryLabel = (v) => CATEGORIES.find(c => c.value === v)?.label || v;

export function Feedback({ accessToken, dbId, toast }) {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('feature');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, loading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { feedback: getFeedback } });
  const items = (data.feedback || [])
    .map((row, i) => ({ row, rowIndex: i + 2 }))
    .filter(it => (it.row[FEEDBACK.MESSAGE] || '').trim() !== '')
    .sort((a, b) => (b.row[FEEDBACK.DATE] || '').localeCompare(a.row[FEEDBACK.DATE] || ''));
  const newCount = items.filter(it => it.row[FEEDBACK.STATUS] !== 'DONE').length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const msg = message.trim();
    if (!msg) return;
    setIsSubmitting(true);
    const ok = await runWithFeedback(
      () => addFeedback(accessToken, dbId, [
        'FB-' + Date.now(), localDateStr(), category, msg, 'NEW', new Date().toLocaleString('th-TH'),
      ]),
      toast, 'บันทึกข้อเสนอแนะแล้ว — AI จะอ่านในรอบพัฒนาถัดไปค่ะ'
    );
    if (ok) { setMessage(''); refresh({ force: true }); }
    setIsSubmitting(false);
  };

  const handleToggleStatus = async (item) => {
    const next = item.row[FEEDBACK.STATUS] === 'DONE' ? 'NEW' : 'DONE';
    const ok = await runWithFeedback(
      () => updateFeedbackStatus(accessToken, dbId, item.rowIndex, next),
      toast, next === 'DONE' ? 'ปิดเรื่องแล้ว' : 'เปิดเรื่องใหม่อีกครั้ง'
    );
    if (ok) refresh({ force: true });
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[24px] font-bold text-gray-900 flex items-center gap-2"><Lightbulb className="w-6 h-6 text-amber-500" />ข้อเสนอแนะระบบ</h2>
        <p className="text-[14px] text-gray-500 mt-1">จดสิ่งที่อยากให้ปรับปรุงไว้ตรงนี้ — AI ผู้ช่วยจะเปิดอ่านรายการที่ยังไม่ปิดในรอบพัฒนาถัดไป</p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 p-6 bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelClasses}>ประเภท</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputClasses}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClasses}>รายละเอียด <span className="text-red-500">*</span></label>
            <textarea
              required rows={3} value={message} onChange={e => setMessage(e.target.value)}
              className={`${inputClasses} resize-none`}
              placeholder="เช่น อยากให้หน้าบิลมีปุ่มส่งซ้ำทุกคนที่ยังไม่จ่าย / ปุ่มเริ่มสอนบนมือถือกดยาก ฯลฯ — เขียนละเอียดเท่าที่นึกออก ยิ่งละเอียด AI ยิ่งทำถูก"
            />
          </div>
        </div>
        <button type="submit" disabled={isSubmitting || !message.trim()} className={`${btnPrimary} disabled:opacity-60`}>
          {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อเสนอแนะ'}
        </button>
      </form>

      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-indigo-500" />
        <p className="text-[13px] text-gray-600">รอ AI อ่าน <span className="font-bold text-indigo-600">{newCount}</span> เรื่อง · ทั้งหมด {items.length} เรื่อง</p>
      </div>

      <StateDisplay loading={loading} error={error} onRetry={() => refresh({ force: true })} empty={items.length === 0}
        emptyMessage={'ยังไม่มีข้อเสนอแนะค่ะ — นึกอะไรออกระหว่างใช้งาน จดไว้ได้เลย'}>
        <div className="space-y-3">
          {items.map(item => {
            const done = item.row[FEEDBACK.STATUS] === 'DONE';
            return (
              <div key={item.row[FEEDBACK.ID]} className={`p-4 bg-white border rounded-[12px] flex items-start justify-between gap-3 ${done ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-semibold text-gray-500">{categoryLabel(item.row[FEEDBACK.CATEGORY])}</span>
                    <span className="text-[11px] text-gray-400">{item.row[FEEDBACK.DATE]}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${done ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-600'}`}>{done ? 'ปิดเรื่องแล้ว' : 'รอ AI อ่าน'}</span>
                  </div>
                  <p className={`text-[14px] whitespace-pre-wrap ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.row[FEEDBACK.MESSAGE]}</p>
                </div>
                <button onClick={() => handleToggleStatus(item)} title={done ? 'เปิดเรื่องใหม่' : 'ปิดเรื่อง (ทำแล้ว/ไม่เอาแล้ว)'}
                  className="flex-shrink-0 p-2 rounded-[8px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  {done ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </StateDisplay>
    </div>
  );
}
