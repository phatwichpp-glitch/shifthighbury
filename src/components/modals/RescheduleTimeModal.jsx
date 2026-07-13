// @ts-nocheck
import { useState, useEffect } from 'react';
import { SCHEDULE } from '../../lib/constants';
import { calculateEndTime, calculateHours } from '../../lib/business';
import { X, Clock } from 'lucide-react';

export function RescheduleTimeModal({ open, onClose, schedule, studentName, dateStr, onConfirm, isSaving }) {
  const [newTimeStart, setNewTimeStart] = useState('');
  const [newTimeEnd, setNewTimeEnd] = useState('');
  const [newHours, setNewHours] = useState('');
  const [notifyLine, setNotifyLine] = useState(true);

  useEffect(() => {
    if (open && schedule) {
      setNewTimeStart(schedule[SCHEDULE.TIME_START] || '');
      setNewTimeEnd(schedule[SCHEDULE.TIME_END] || '');
      setNewHours(schedule[SCHEDULE.HOURS] || '1');
      setNotifyLine(true);
    }
  }, [open, schedule]);

  if (!open || !schedule) return null;

  const dateLabel = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.18)] animate-[slideIn_200ms_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px] flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /> เลื่อนเวลาคาบนี้</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">{studentName} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-[10px] px-4 py-2.5 mb-4 flex items-center gap-2">
          <span className="text-[12px] text-gray-400 font-medium">เดิม:</span>
          <span className="text-[13px] font-semibold text-gray-600 line-through">{schedule[SCHEDULE.TIME_START]}–{schedule[SCHEDULE.TIME_END]} น.</span>
          {schedule[SCHEDULE.REPEAT_TYPE] && schedule[SCHEDULE.REPEAT_TYPE] !== 'none' && (
            <span className="ml-auto text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium">ไม่กระทบ weekly</span>
          )}
        </div>

        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">เริ่มใหม่</label>
              <input type="time" value={newTimeStart}
                onChange={e => { setNewTimeStart(e.target.value); setNewTimeEnd(calculateEndTime(e.target.value, newHours)); }}
                className="w-full px-2 py-2 border border-gray-300 rounded-[8px] text-[13px] focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">ชั่วโมง</label>
              <input type="number" step="0.5" min="0.5" value={newHours}
                onChange={e => { setNewHours(e.target.value); setNewTimeEnd(calculateEndTime(newTimeStart, e.target.value)); }}
                className="w-full px-2 py-2 border border-gray-300 rounded-[8px] text-[13px] focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">จบใหม่</label>
              <input type="time" value={newTimeEnd}
                onChange={e => { setNewTimeEnd(e.target.value); setNewHours(calculateHours(newTimeStart, e.target.value)); }}
                className="w-full px-2 py-2 border border-gray-300 rounded-[8px] text-[13px] focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-[10px]">
            <div>
              <p className="text-[13px] font-semibold text-green-900">แจ้งนักเรียนทาง LINE</p>
              <p className="text-[11px] text-green-600">ส่งเวลาใหม่ให้ {studentName} อัตโนมัติ</p>
            </div>
            <button type="button"
              onClick={() => setNotifyLine(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${notifyLine ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyLine ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-[10px] transition-all text-[14px]">ยกเลิก</button>
          <button
            onClick={() => onConfirm({ newTimeStart, newTimeEnd, newHours, notifyLine })}
            disabled={isSaving || !newTimeStart || !newTimeEnd}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-[10px] transition-all text-[14px]"
          >
            {isSaving ? 'กำลังบันทึก...' : 'ยืนยันเลื่อนเวลา'}
          </button>
        </div>
      </div>
    </div>
  );
}
