// @ts-nocheck
import { useEffect } from 'react';

const btnPrimary = "px-4 py-2 bg-blue-600 text-white font-medium rounded-[8px] hover:bg-blue-700 active:scale-95 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed text-[14px] shadow-sm whitespace-nowrap flex items-center justify-center gap-1";
const btnSecondary = "px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-[8px] hover:bg-gray-50 active:scale-95 transition-all text-[14px] shadow-sm whitespace-nowrap flex items-center justify-center gap-1";

export function ConfirmDialog({ open, message, onConfirm, onCancel, danger }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onConfirm, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] p-6 max-w-md w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)] animate-[slideIn_200ms_ease-out]">
        <h3 className="text-[20px] font-semibold text-gray-900 mb-2">ยืนยันการทำรายการ</h3>
        <p className="text-[14px] text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className={btnSecondary}>ยกเลิก</button>
          <button onClick={onConfirm} className={danger ? "px-4 py-2 bg-red-600 text-white font-medium rounded-[8px] hover:bg-red-700 active:scale-95 transition-all text-[14px] shadow-sm" : btnPrimary}>ยืนยัน</button>
        </div>
      </div>
    </div>
  );
}
