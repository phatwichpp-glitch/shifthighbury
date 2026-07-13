// @ts-nocheck
import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export function EmergencyZoomLinkModal({ open, onClose, schedule, studentName, onSend, isSending }) {
  const [link, setLink] = useState('');

  useEffect(() => { if (open) setLink(''); }, [open]);

  if (!open || !schedule) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[16px] max-w-[420px] w-full p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-gray-900 text-[16px] leading-tight">เปลี่ยนลิงก์ Zoom ฉุกเฉิน</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">สำหรับ {studentName} เท่านั้น — ใช้ครั้งนี้ครั้งเดียว ไม่กระทบลิงก์หลัก</p>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">ลิงก์ Zoom ห้องใหม่</label>
          <input
            type="text" value={link} onChange={e => setLink(e.target.value)} autoFocus
            placeholder="https://zoom.us/j/..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          <p className="text-[12px] text-gray-400 mt-1.5">ก๊อปลิงก์จากห้อง Zoom ที่เปิดใหม่มาวางตรงนี้ ระบบจะส่ง LINE แจ้งนักเรียนพร้อมอธิบายว่าห้องเปลี่ยนทันที</p>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-[10px] transition-all text-[14px]">ยกเลิก</button>
          <button
            onClick={() => onSend(link)}
            disabled={!link.trim() || isSending}
            className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-semibold rounded-[10px] transition-all text-[14px]"
          >
            {isSending ? 'กำลังส่ง...' : 'ส่งลิงก์ใหม่'}
          </button>
        </div>
      </div>
    </div>
  );
}
