// @ts-nocheck
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { STUDENT, SESSION, INVOICE } from '../lib/constants';
import { safeFloat, localDateStr } from '../lib/business';
import { useSheetData } from '../hooks/useSheetData';
import { inputClasses, labelClasses } from '../components/ui/styles';
import { Upload, Banknote, GraduationCap, FileText, Receipt, Package, Download } from 'lucide-react';
import { getStudents, getSessions, getInvoices, getReceipts } from '../services/googleSheets';

export function ExportExcel({ accessToken, dbId, toast }) {
  const { data, loading } = useSheetData({ accessToken, dbId, fetchers: { students: getStudents, sessions: getSessions, invoices: getInvoices, receipts: getReceipts } });
  const students = data.students || [];
  const sessions = data.sessions || [];
  const invoices = data.invoices || [];

  const [monthFrom, setMonthFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 2); return localDateStr(d).slice(0, 7); });
  const [monthTo, setMonthTo] = useState(() => localDateStr().slice(0, 7));
  const [isExporting, setIsExporting] = useState(false);

  const getStudentName = (id) => (students.find(s => s[STUDENT.ID] === id) || [])[STUDENT.NAME] || id;

  // รองรับทั้งวันที่แบบ ISO (YYYY-MM-DD) และแบบ DD/MM/YYYY (ข้อมูลเก่า) — คืนค่าเป็น "YYYY-MM" เทียบกับ monthFrom/monthTo ได้ตรงกัน
  const monthKeyOf = (dateStr) => {
    const date = dateStr || '';
    const parts = date.split('/');
    return parts.length === 3 ? `${parts[2]?.slice(-4) || parts[2]}-${parts[1]}` : date.slice(0, 7);
  };
  const inRange = (dateStr) => { const key = monthKeyOf(dateStr); return key >= monthFrom && key <= monthTo; };

  const handleExport = (type) => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      if (type === 'revenue' || type === 'all') {
        const monthlyMap = {};
        invoices.filter(inv => inv[INVOICE.STATUS] !== 'VOID' && inRange(inv[INVOICE.DATE])).forEach(inv => {
          const key = monthKeyOf(inv[INVOICE.DATE]);
          if (!monthlyMap[key]) monthlyMap[key] = { month: key, total: 0, paid: 0, unpaid: 0, count: 0 };
          monthlyMap[key].total += safeFloat(inv[INVOICE.TOTAL]);
          monthlyMap[key].count++;
          if (inv[INVOICE.STATUS] === 'PAID') monthlyMap[key].paid += safeFloat(inv[INVOICE.TOTAL]);
          else monthlyMap[key].unpaid += safeFloat(inv[INVOICE.TOTAL]);
        });
        const revenueRows = [['เดือน', 'รายได้รวม (฿)', 'รับแล้ว (฿)', 'ค้างรับ (฿)', 'จำนวนบิล']];
        Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).forEach(r => {
          revenueRows.push([r.month, r.total, r.paid, r.unpaid, r.count]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revenueRows), 'รายได้รายเดือน');
      }

      if (type === 'student' || type === 'all') {
        const studentRows = [['ชื่อ', 'วิชา', 'ชั่วโมงสอนรวม', 'รายได้รวม (฿)', 'คาบที่ยังไม่ออกบิล']];
        students.filter(s => s[STUDENT.DELETED] !== 'TRUE').forEach(s => {
          const mySessions = sessions.filter(se => se[SESSION.STUDENT_ID] === s[STUDENT.ID] && se[SESSION.DELETED] !== 'TRUE');
          const totalHours = mySessions.reduce((sum, se) => sum + safeFloat(se[SESSION.HOURS]), 0);
          const totalRevenue = invoices.filter(inv => inv[INVOICE.STUDENT_ID] === s[STUDENT.ID] && inv[INVOICE.STATUS] !== 'VOID').reduce((sum, inv) => sum + safeFloat(inv[INVOICE.TOTAL]), 0);
          const unbilled = mySessions.filter(se => se[SESSION.INVOICED] === 'FALSE').length;
          studentRows.push([s[STUDENT.NAME], s[STUDENT.SUBJECT], totalHours, totalRevenue, unbilled]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(studentRows), 'สรุปรายนักเรียน');
      }

      if (type === 'sessions' || type === 'all') {
        const sessionRows = [['วันที่', 'นักเรียน', 'วิชา', 'ชั่วโมง', 'หมายเหตุ', 'สถานะ']];
        sessions.filter(s => s[SESSION.DELETED] !== 'TRUE' && inRange(s[SESSION.DATE])).sort((a, b) => (b[SESSION.DATE] || '').localeCompare(a[SESSION.DATE] || '')).forEach(s => {
          sessionRows.push([s[SESSION.DATE], getStudentName(s[SESSION.STUDENT_ID]), s[SESSION.SUBJECT], s[SESSION.HOURS], s[SESSION.NOTE] || '', s[SESSION.INVOICED] === 'TRUE' ? 'ออกบิลแล้ว' : 'รอออกบิล']);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sessionRows), 'ประวัติการสอน');
      }

      if (type === 'invoices' || type === 'all') {
        const invoiceRows = [['เลขที่บิล', 'วันที่', 'นักเรียน', 'ชั่วโมง', 'ยอด (฿)', 'สถานะ']];
        invoices.filter(inv => inRange(inv[INVOICE.DATE])).forEach(inv => {
          invoiceRows.push([inv[INVOICE.NUMBER], inv[INVOICE.DATE], getStudentName(inv[INVOICE.STUDENT_ID]), inv[INVOICE.TOTAL_HOURS], safeFloat(inv[INVOICE.TOTAL]), inv[INVOICE.STATUS]]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invoiceRows), 'ใบแจ้งหนี้');
      }

      const filename = `SHIFTHIGHBURY_${type}_${localDateStr()}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast(`ดาวน์โหลด ${filename} สำเร็จครับ`);
    } catch (err) {
      toast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const exportOptions = [
    { type: 'revenue', icon: <Banknote className="w-5 h-5 text-emerald-600" />, label: 'รายได้รายเดือน', desc: 'สรุปยอดรายรับแยกตามเดือน' },
    { type: 'student', icon: <GraduationCap className="w-5 h-5 text-indigo-600" />, label: 'สรุปรายนักเรียน', desc: 'ชั่วโมงสอน รายได้ คาบค้างบิล' },
    { type: 'sessions', icon: <FileText className="w-5 h-5 text-blue-600" />, label: 'ประวัติการสอน', desc: 'บันทึกทุกคาบเรียน' },
    { type: 'invoices', icon: <Receipt className="w-5 h-5 text-amber-600" />, label: 'ใบแจ้งหนี้ทั้งหมด', desc: 'รายการบิลและสถานะ' },
    { type: 'all', icon: <Package className="w-5 h-5 text-purple-600" />, label: 'Export ทั้งหมด', desc: 'รวมทุก sheet ในไฟล์เดียว' },
  ];

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-[24px] font-bold text-gray-900 flex items-center gap-2"><Upload className="w-6 h-6 text-gray-600" />Export Excel</h2>
        <p className="text-[14px] text-gray-500 mt-1">ส่งออกข้อมูลสำหรับทำบัญชีและติดตามผล</p>
      </div>

      <div className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-sm">
        <p className="text-[13px] font-semibold text-gray-700 mb-3">ช่วงเดือนสำหรับ export (ยกเว้น "สรุปรายนักเรียน" ซึ่งเป็นยอดสะสมทั้งหมดเสมอ)</p>
        <div className="flex gap-3 items-center">
          <div className="flex-1">
            <label className={labelClasses}>จาก</label>
            <input type="month" value={monthFrom} onChange={e => setMonthFrom(e.target.value)} className={inputClasses} />
          </div>
          <div className="flex-1">
            <label className={labelClasses}>ถึง</label>
            <input type="month" value={monthTo} onChange={e => setMonthTo(e.target.value)} className={inputClasses} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {exportOptions.map(opt => (
          <button
            key={opt.type}
            onClick={() => handleExport(opt.type)}
            disabled={isExporting || loading}
            className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left flex items-center justify-between group active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              {opt.icon}
              <div>
                <p className="font-semibold text-gray-900 text-[15px] group-hover:text-blue-700 transition-colors">{opt.label}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </div>
            <Download className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
