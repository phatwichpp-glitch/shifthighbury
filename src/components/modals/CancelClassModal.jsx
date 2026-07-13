// @ts-nocheck
import { useState, useEffect } from 'react';
import { SCHEDULE } from '../../lib/constants';
import { CANCEL_CLASS_REASONS } from '../../lib/appConfig';
import { calculateEndTime, calculateHours, localDateStr } from '../../lib/business';
import { inputClasses, labelClasses, btnSecondary } from '../ui/styles';
import { X, Calendar, AlertTriangle, Check, Ban } from 'lucide-react';

// ← แก้รายการเหตุผลในไฟล์ src/lib/appConfig.js
const CANCEL_REASONS = CANCEL_CLASS_REASONS;

export function CancelClassModal({ schedule, studentName, dateStr, schedulesOnRescheduleDate, onRescheduleDateChange, onConfirm, onClose, isSubmitting, getStudentName }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [wantReschedule, setWantReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTimeStart, setRescheduleTimeStart] = useState('');
  const [rescheduleTimeEnd, setRescheduleTimeEnd] = useState('');
  const [rescheduleHours, setRescheduleHours] = useState('');

  useEffect(() => {
    if (schedule) {
      setRescheduleTimeStart(schedule[SCHEDULE.TIME_START] || '18:00');
      setRescheduleTimeEnd(schedule[SCHEDULE.TIME_END] || '19:00');
      setRescheduleHours(schedule[SCHEDULE.HOURS] || '1');
    }
  }, [schedule]);

  if (!schedule) return null;

  const conflicts = wantReschedule && rescheduleDate && rescheduleTimeStart && rescheduleTimeEnd
    ? (schedulesOnRescheduleDate || []).filter(s => {
        const sStart = s[SCHEDULE.TIME_START];
        const sEnd = s[SCHEDULE.TIME_END];
        return sStart < rescheduleTimeEnd && sEnd > rescheduleTimeStart;
      })
    : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason) return;
    onConfirm({
      reason, note,
      rescheduleDate: wantReschedule ? rescheduleDate : '',
      rescheduleTimeStart: wantReschedule ? rescheduleTimeStart : '',
      rescheduleTimeEnd: wantReschedule ? rescheduleTimeEnd : '',
      rescheduleHours: wantReschedule ? rescheduleHours : '',
    });
  };

  const dateLabel = new Date(dateStr).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4 animate-[fadeIn_150ms_ease-out] overflow-y-auto">
      <div className="bg-white rounded-[20px] p-6 max-w-md w-full shadow-[0_20px_40px_rgba(0,0,0,0.18)] animate-[slideIn_200ms_ease-out] my-4">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 text-[18px]">ยกเลิกคลาส</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">{studentName} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 p-1 rounded-[6px] hover:bg-gray-100 transition-colors mt-0.5"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-red-50 border border-red-100 rounded-[12px] p-3.5 flex gap-3 items-center">
            <Ban className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-900 text-[14px]">{schedule[SCHEDULE.TIME_START]}–{schedule[SCHEDULE.TIME_END]} น.</p>
              <p className="text-[12px] text-red-600">{schedule[SCHEDULE.SUBJECT]} · {schedule[SCHEDULE.HOURS]} ชม.</p>
            </div>
          </div>

          <div>
            <label className={labelClasses}>เหตุผลการยกเลิก <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {CANCEL_REASONS.map(r => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={`px-3 py-2 rounded-[8px] text-[13px] font-medium border transition-all text-left
                    ${reason === r ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:bg-red-50'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClasses}>หมายเหตุเพิ่มเติม (ถ้ามี)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              className={`${inputClasses} resize-none`} rows="2" placeholder="เช่น แจ้งล่วงหน้า 2 ชั่วโมง" />
          </div>

          <div className="border border-gray-100 rounded-[12px] overflow-hidden">
            <button type="button" onClick={() => setWantReschedule(w => !w)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors
                ${wantReschedule ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className={`text-[13px] font-semibold ${wantReschedule ? 'text-blue-800' : 'text-gray-700'}`}>เลื่อนไปวันอื่น (Reschedule)</p>
                  <p className="text-[11px] text-gray-400">สร้างคลาสใหม่ในวันและเวลาที่เลือก</p>
                </div>
              </div>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0
                ${wantReschedule ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                {wantReschedule && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
            </button>

            {wantReschedule && (
              <div className="px-4 pb-4 pt-3 border-t border-blue-100 bg-blue-50/40 space-y-3">
                <div>
                  <label className={labelClasses}>วันที่เลื่อนไป <span className="text-red-500">*</span></label>
                  <input type="date" required={wantReschedule}
                    min={localDateStr()}
                    value={rescheduleDate} onChange={e => { setRescheduleDate(e.target.value); onRescheduleDateChange?.(e.target.value); }}
                    className={inputClasses} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelClasses}>เวลาเริ่ม</label>
                    <input type="time" value={rescheduleTimeStart}
                      onChange={e => { setRescheduleTimeStart(e.target.value); setRescheduleTimeEnd(calculateEndTime(e.target.value, rescheduleHours)); }}
                      className={inputClasses} />
                  </div>
                  <div>
                    <label className={labelClasses}>ชั่วโมง</label>
                    <input type="number" step="0.5" min="0.5" value={rescheduleHours}
                      onChange={e => { setRescheduleHours(e.target.value); setRescheduleTimeEnd(calculateEndTime(rescheduleTimeStart, e.target.value)); }}
                      className={inputClasses} />
                  </div>
                  <div>
                    <label className={labelClasses}>เวลาจบ</label>
                    <input type="time" value={rescheduleTimeEnd}
                      onChange={e => { setRescheduleTimeEnd(e.target.value); setRescheduleHours(calculateHours(rescheduleTimeStart, e.target.value)); }}
                      className={inputClasses} />
                  </div>
                </div>
                {conflicts.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-[8px] p-3">
                    <p className="text-[12px] font-bold text-red-700 mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> ชนกับตารางสอนที่มีอยู่</p>
                    {conflicts.map((c, i) => (
                      <p key={i} className="text-[11px] text-red-600">
                        • {c[SCHEDULE.TIME_START]}–{c[SCHEDULE.TIME_END]} · {getStudentName ? getStudentName(c[SCHEDULE.STUDENT_ID]) : c[SCHEDULE.STUDENT_ID]}
                      </p>
                    ))}
                    <p className="text-[11px] text-red-500 mt-1">ยังบันทึกได้ แต่ควรเปลี่ยนเวลาครับ</p>
                  </div>
                )}
                {rescheduleDate && conflicts.length === 0 && rescheduleTimeStart && (
                  <p className="text-[11px] text-green-600 font-medium flex items-center gap-1"><Check className="w-3.5 h-3.5" /> เวลาว่าง ไม่ชนตารางใคร</p>
                )}
                <p className="text-[11px] text-blue-600">ระบบจะสร้างตารางสอนใหม่ + sync Google Calendar ให้อัตโนมัติ</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>ยกเลิก</button>
            <button type="submit"
              disabled={isSubmitting || !reason || (wantReschedule && (!rescheduleDate || !rescheduleTimeStart))}
              className={`flex-1 px-4 py-2 font-semibold rounded-[8px] transition-all active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed text-[14px] shadow-sm text-white
                ${conflicts.length > 0 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'}`}>
              {isSubmitting ? 'กำลังดำเนินการ...' : wantReschedule ? 'ยกเลิก & เลื่อนวัน' : 'ยืนยันยกเลิกคลาส'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
