// @ts-nocheck
import { SKILL_LABELS } from '../../lib/appConfig';

export function ProgressReportDocument({ id, reportData, accentColor, logoUrl, instituteName }) {
  const skills = SKILL_LABELS;
  const Stars = ({ score }) => (
    <span style={{ color: accentColor, letterSpacing: '0.1em' }}>
      {'★'.repeat(Math.round(score))}{'☆'.repeat(5 - Math.round(score))}
      <span style={{ color: '#6b7280', marginLeft: '0.5rem', fontSize: '0.85rem' }}>{score > 0 ? score.toFixed(1) : '—'}</span>
    </span>
  );
  return (
    <div id={id} style={{ background: 'white', padding: '3rem', margin: '0 auto', width: '210mm', minHeight: '297mm', fontFamily: 'Sarabun, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${accentColor}`, paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <div>
          {logoUrl ? <img src={logoUrl} alt={instituteName} style={{ maxHeight: '120px', maxWidth: '320px', objectFit: 'contain', display: 'block' }} />
                   : <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>{instituteName}</h1>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: accentColor, letterSpacing: '0.1em', marginBottom: '0.5rem' }}>PROGRESS REPORT</h2>
          <p style={{ color: '#4b5563' }}><strong>ประจำเดือน:</strong> {reportData.monthLabel}</p>
        </div>
      </div>
      <div style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <p style={{ color: '#6b7280', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>นักเรียน</p>
        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>{reportData.studentName}</p>
      </div>
      <table style={{ width: '100%', textAlign: 'left', marginBottom: '2.5rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #d1d5db', color: '#374151' }}>
            <th style={{ padding: '0.75rem 0', fontWeight: 600, width: '40%' }}>ทักษะ</th>
            <th style={{ padding: '0.75rem 0', fontWeight: 600 }}>คะแนนเฉลี่ย</th>
          </tr>
        </thead>
        <tbody>
          {skills.map(sk => (
            <tr key={sk.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '1rem 0', color: '#1f2937', fontWeight: 500 }}>{sk.label}</td>
              <td style={{ padding: '1rem 0' }}><Stars score={reportData.averages[sk.key]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginBottom: '2.5rem' }}>
        <p style={{ color: '#6b7280', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>สรุปการเรียนในเดือนนี้</p>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div><span style={{ fontSize: '1.5rem', fontWeight: 700, color: accentColor }}>{reportData.sessionCount}</span><span style={{ color: '#4b5563', marginLeft: '0.5rem' }}>คาบเรียน</span></div>
          <div><span style={{ fontSize: '1.5rem', fontWeight: 700, color: accentColor }}>{reportData.totalHours}</span><span style={{ color: '#4b5563', marginLeft: '0.5rem' }}>ชั่วโมง</span></div>
        </div>
      </div>
      <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
        <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>ออกรายงานโดย {instituteName} · {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
  );
}
