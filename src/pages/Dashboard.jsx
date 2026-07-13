// @ts-nocheck
import { useState, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { STUDENT, SESSION, INVOICE } from '../lib/constants';
import { SKILL_LABELS } from '../lib/appConfig';
import { safeFloat } from '../lib/business';

const SKILL_SCORE_COLUMN = {
  listening: SESSION.LISTENING_SCORE,
  speaking: SESSION.SPEAKING_SCORE,
  reading: SESSION.READING_SCORE,
  writing: SESSION.WRITING_SCORE,
};
import { useSheetData } from '../hooks/useSheetData';
import { inputClasses } from '../components/ui/styles';
import { BarChart2, TrendingUp } from 'lucide-react';
import { StateDisplay } from '../components/ui/StateDisplay';
import { getStudents, getSessions, getInvoices } from '../services/googleSheets';

export function Dashboard({ accessToken, dbId, toast }) {
  const { data, loading, error, refresh } = useSheetData({ accessToken, dbId, fetchers: { students: getStudents, sessions: getSessions, invoices: getInvoices } });
  const students = (data.students || []).filter(s => s[STUDENT.DELETED] !== 'TRUE');
  const sessions = data.sessions || [];
  const invoices = data.invoices || [];
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
      const monthSessions = sessions.filter(s => s[SESSION.DELETED] !== 'TRUE' && (s[SESSION.DATE] || '').startsWith(key));
      const hours = monthSessions.reduce((sum, s) => sum + safeFloat(s[SESSION.HOURS]), 0);
      const revenue = invoices.filter(inv => inv[INVOICE.STATUS] === 'PAID' && (inv[INVOICE.DATE] || '').includes(key.slice(5))).reduce((sum, inv) => sum + safeFloat(inv[INVOICE.TOTAL]), 0);
      months.push({ label, hours, revenue });
    }
    return months;
  }, [sessions, invoices]);

  const studentSessions = useMemo(() => {
    if (!selectedStudentId) return [];
    return sessions.filter(s => s[SESSION.STUDENT_ID] === selectedStudentId && s[SESSION.DELETED] !== 'TRUE').sort((a, b) => (a[SESSION.DATE] || '').localeCompare(b[SESSION.DATE] || ''));
  }, [sessions, selectedStudentId]);

  const skillData = useMemo(() => {
    if (!studentSessions.length) return [];
    const avg = (idx) => { const v = studentSessions.map(s => safeFloat(s[idx])).filter(n => n > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    return SKILL_LABELS.map(s => ({ skill: s.label, score: avg(SKILL_SCORE_COLUMN[s.key]) }));
  }, [studentSessions]);

  const hoursPerMonth = useMemo(() => {
    const map = {};
    studentSessions.forEach(s => {
      const key = (s[SESSION.DATE] || '').slice(0, 7);
      if (!key) return;
      map[key] = (map[key] || 0) + safeFloat(s[SESSION.HOURS]);
    });
    return Object.entries(map).slice(-6).map(([k, v]) => ({
      label: new Date(k + '-01T12:00:00').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
      hours: v,
    }));
  }, [studentSessions]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h2 className="text-[24px] font-bold text-gray-900 flex items-center gap-2"><BarChart2 className="w-6 h-6 text-gray-600" />Dashboard</h2>

      <StateDisplay loading={loading} error={error} onRetry={refresh} empty={!loading && !error && students.length === 0 && sessions.length === 0} emptyMessage="ยังไม่มีข้อมูลครับ — กรุณาเพิ่มนักเรียนและบันทึกการสอนก่อนครับ">
      <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4 text-[16px]">ภาพรวมรายเดือน (6 เดือนล่าสุด)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[12px] text-gray-500 font-semibold uppercase tracking-wide mb-2">ชั่วโมงสอน</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v} ชม.`, 'ชั่วโมง']} />
                <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-[12px] text-gray-500 font-semibold uppercase tracking-wide mb-2">รายได้ (฿)</p>
            <p className="text-[11px] text-gray-400 mb-2 -mt-1">นับเฉพาะบิลที่ "จ่ายแล้ว" เท่านั้น</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v.toLocaleString()} ฿`, 'รายได้']} />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[16px] border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-[16px] flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gray-500" />ติดตามรายนักเรียน</h3>
          <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} className={`${inputClasses} w-48`}>
            <option value="">— เลือกนักเรียน —</option>
            {students.map((s, i) => <option key={i} value={s[STUDENT.ID]}>{s[STUDENT.NAME]}</option>)}
          </select>
        </div>

        {!selectedStudentId ? (
          <p className="text-gray-400 text-center py-8 text-[14px]">เลือกนักเรียนเพื่อดูกราฟครับ</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[12px] text-gray-500 font-semibold uppercase tracking-wide mb-2">ชั่วโมงสะสมรายเดือน</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hoursPerMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} ชม.`, 'ชั่วโมง']} />
                  <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[12px] text-gray-500 font-semibold uppercase tracking-wide mb-2">คะแนนเฉลี่ยรายทักษะ</p>
              {skillData.some(s => s.score > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={skillData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
                    <Radar dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                    <Tooltip formatter={(v) => [v.toFixed(1), 'คะแนน']} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-center py-8 text-[13px]">ยังไม่มีข้อมูลคะแนนครับ</p>
              )}
            </div>
          </div>
        )}
      </div>
      </StateDisplay>
    </div>
  );
}
