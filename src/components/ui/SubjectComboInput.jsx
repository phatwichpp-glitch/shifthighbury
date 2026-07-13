// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { SUBJECT_PRESETS } from '../../lib/constants';
import { inputClasses } from './styles';

export function SubjectComboInput({ value, onChange, required }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const filtered = SUBJECT_PRESETS.filter(s => s.toLowerCase().includes(value.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <input type="text" required={required} value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} className={inputClasses} placeholder="เช่น แคลคูลัส 1" />
      {open && filtered.length > 0 && (
        <div className="absolute top-[105%] left-0 right-0 z-50 bg-white border border-gray-200 rounded-[8px] shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <div key={i} onClick={() => { onChange(s); setOpen(false); }} className="px-3 py-2 text-[14px] cursor-pointer hover:bg-gray-50">{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
