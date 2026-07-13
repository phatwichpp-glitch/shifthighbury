// @ts-nocheck
import { Link } from 'react-router-dom';
import { Hourglass, CheckCircle2, GraduationCap, Timer } from 'lucide-react';

export function StatsPanel({ stats, loading }) {
  const safe = {
    pending: Number.isFinite(stats?.pendingRevenue) ? stats.pendingRevenue : 0,
    collected: Number.isFinite(stats?.collectedRevenue) ? stats.collectedRevenue : 0,
    students: stats?.totalStudents || 0,
    hours: stats?.totalHours || 0,
  };
  const primary = [
    { label: 'ยอดรอเรียกเก็บ', val: safe.pending.toLocaleString('th-TH') + ' ฿', icon: <Hourglass className="w-5 h-5" />, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ring: 'focus-visible:ring-amber-300', to: '/invoices' },
    { label: 'รับชำระแล้ว', val: safe.collected.toLocaleString('th-TH') + ' ฿', icon: <CheckCircle2 className="w-5 h-5" />, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ring: 'focus-visible:ring-emerald-300', to: '/invoices' },
    { label: 'นักเรียนแอคทีฟ', val: safe.students.toLocaleString() + ' คน', icon: <GraduationCap className="w-5 h-5" />, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', ring: 'focus-visible:ring-indigo-300', to: '/students' },
  ];
  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        {primary.map((it, i) => (
          <Link key={i} to={it.to}
            className={`${it.bg} border ${it.border} rounded-[16px] p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-150 group focus-visible:outline-none focus-visible:ring-2 ${it.ring} focus-visible:ring-offset-1 ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 leading-none">{it.label}</span>
              <span className="opacity-70">{it.icon}</span>
            </div>
            <p className={`text-[24px] sm:text-[28px] font-extrabold ${it.text} leading-none tracking-tight`}>
              {loading ? <span className="block w-24 h-7 bg-current opacity-10 rounded-lg animate-pulse" /> : it.val}
            </p>
            <p className="mt-2 text-[11px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">ดูรายละเอียด →</p>
          </Link>
        ))}
      </div>
      <Link to="/sessions"
        className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-[12px] hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1">
        <Timer className="w-5 h-5" />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">สอนไปแล้วทั้งหมด</span>
          <span className="ml-3 text-[18px] font-extrabold text-purple-700">
            {loading ? <span className="inline-block w-16 h-5 bg-purple-200 rounded animate-pulse align-middle" /> : safe.hours.toLocaleString() + ' ชม.'}
          </span>
        </div>
        <span className="text-[12px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">ดูประวัติ →</span>
      </Link>
    </div>
  );
}
