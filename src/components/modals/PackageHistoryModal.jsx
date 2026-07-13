// @ts-nocheck
import { useMemo } from 'react';
import { STUDENT, SESSION, RECEIPT } from '../../lib/constants';
import { safeFloat } from '../../lib/business';
import { Package, X, AlertTriangle } from 'lucide-react';

export function PackageHistoryModal({ student, sessions, receipts, onClose }) {
  const studentId = student?.data?.[STUDENT.ID];
  const studentName = student?.data?.[STUDENT.NAME] || '';
  const currentHours = safeFloat(student?.data?.[STUDENT.PACKAGE_HOURS]);

  const usageHistory = useMemo(() => (sessions || [])
    .filter(s => s[SESSION.STUDENT_ID] === studentId && s[SESSION.INVOICED] === 'PREPAID' && s[SESSION.DELETED] !== 'TRUE')
    .sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || '')),
    [sessions, studentId]
  );

  const topUpHistory = useMemo(() => (receipts || [])
    .filter(r => r[RECEIPT.STUDENT_ID] === studentId && (r[RECEIPT.NUMBER] || '').startsWith('PKG'))
    .sort((a, b) => (b[RECEIPT.DATE] || '').localeCompare(a[RECEIPT.DATE] || '')),
    [receipts, studentId]
  );

  const totalUsed = useMemo(() => usageHistory.reduce((sum, s) => sum + safeFloat(s[SESSION.HOURS]), 0), [usageHistory]);
  const totalTopUp = useMemo(() => topUpHistory.reduce((sum, r) => sum + safeFloat((r[RECEIPT.NOTE] || '').match(/(\d+(?:\.\d+)?) ชม/)?.[1] || 0), 0), [topUpHistory]);

  if (!student) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] shadow-[0_20px_40px_rgba(0,0,0,0.18)] max-w-lg w-full max-h-[85vh] flex flex-col animate-[slideIn_200ms_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px] flex items-center gap-2"><Package className="w-5 h-5 text-purple-500" /> แพ็กเกจของ {studentName}</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">ประวัติการเติมและใช้ชั่วโมง</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 p-1 rounded-[6px] hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
          <div className="text-center">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">เติมรวม</p>
            <p className="text-[20px] font-extrabold text-blue-600">{totalTopUp} <span className="text-[12px] font-medium text-gray-500">ชม.</span></p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">ใช้ไปแล้ว</p>
            <p className="text-[20px] font-extrabold text-orange-500">{totalUsed} <span className="text-[12px] font-medium text-gray-500">ชม.</span></p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">คงเหลือ</p>
            <p className={`text-[20px] font-extrabold ${currentHours <= 2 ? 'text-red-500' : 'text-green-600'}`}>{currentHours} <span className="text-[12px] font-medium text-gray-500">ชม.</span></p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div>
            <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ประวัติการเติมแพ็กเกจ</p>
            {topUpHistory.length === 0 ? (
              <p className="text-[13px] text-gray-400 py-3 text-center">ยังไม่มีประวัติการเติมครับ</p>
            ) : (
              <div className="space-y-1.5">
                {topUpHistory.map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-[10px] px-3 py-2.5">
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900">{r[RECEIPT.NUMBER]}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{r[RECEIPT.DATE]} · {r[RECEIPT.NOTE] || '-'}</p>
                    </div>
                    <span className="text-[13px] font-bold text-green-700">+{(r[RECEIPT.NOTE] || '').match(/(\d+(?:\.\d+)?) ชม/)?.[1] || '?'} ชม.</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> ประวัติการใช้ชั่วโมง</p>
            {usageHistory.length === 0 ? (
              <p className="text-[13px] text-gray-400 py-3 text-center">ยังไม่มีคาบที่ใช้แพ็กเกจครับ</p>
            ) : (
              <div className="space-y-1.5">
                {usageHistory.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-[10px] px-3 py-2.5">
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900">{s[SESSION.DATE]}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{s[SESSION.SUBJECT] || '-'}{s[SESSION.NOTE] ? ` · ${s[SESSION.NOTE]}` : ''}</p>
                    </div>
                    <span className="text-[13px] font-bold text-orange-600">-{s[SESSION.HOURS]} ชม.</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {currentHours <= 2 && currentHours > 0 && (
          <div className="px-5 py-3 bg-red-50 border-t border-red-100">
            <p className="text-[13px] text-red-700 font-semibold text-center flex items-center justify-center gap-1.5"><AlertTriangle className="w-4 h-4" /> แพ็กเกจใกล้หมดแล้ว — เหลือ {currentHours} ชม. ควรเติมเพิ่มครับ</p>
          </div>
        )}
        {currentHours === 0 && (
          <div className="px-5 py-3 bg-red-50 border-t border-red-100">
            <p className="text-[13px] text-red-700 font-semibold text-center flex items-center justify-center gap-1.5"><AlertTriangle className="w-4 h-4" /> แพ็กเกจหมดแล้ว — กรุณาเติมก่อนสอนครั้งถัดไปครับ</p>
          </div>
        )}
      </div>
    </div>
  );
}
