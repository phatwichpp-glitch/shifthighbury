// @ts-nocheck
import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { scheduleOccursOnDate } from '../../lib/business';

const fmtDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function StudentCalendarModal({ open, onClose, schedules, onSelectDay }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  if (!open) return null;

  const todayStr = fmtDate(now);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      d,
      dateStr,
      isToday: dateStr === todayStr,
      hasClass: (schedules || []).some(s => scheduleOccursOnDate(s, dateStr)),
    });
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-[20px] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3.5 border-b border-gray-100">
          <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-center text-[15px] font-bold text-gray-900">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="ml-1.5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center py-2 px-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <div key={i} className="text-[10px] font-bold text-gray-400 uppercase">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 px-2 pb-3">
          {cells.map((cell, i) =>
            cell ? (
              <button
                key={i}
                onClick={() => { onSelectDay?.(cell.dateStr); onClose(); }}
                className={`relative aspect-square flex items-center justify-center rounded-[10px] text-[13px] font-semibold transition-all ${
                  cell.isToday
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cell.d}
                {cell.hasClass && (
                  <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${cell.isToday ? 'bg-white/80' : 'bg-blue-500'}`} />
                )}
              </button>
            ) : (
              <div key={i} />
            )
          )}
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            className="w-full py-2 text-[12px] font-semibold text-gray-500 hover:bg-gray-100 rounded-[10px] transition-colors border border-gray-200"
          >
            Back to current month
          </button>
        </div>
      </div>
    </div>
  );
}
