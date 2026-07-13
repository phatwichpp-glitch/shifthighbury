// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { STUDENT, SCHEDULE, SETTINGS, isVideoCallEnabled } from '../lib/constants';
import { scheduleOccursOnDate, runWithFeedback, resizeToBase64, localDateStr } from '../lib/business';
import { useSheetData } from '../hooks/useSheetData';
import { inputClasses, labelClasses, btnPrimary } from '../components/ui/styles';
import { X, Zap, Lightbulb, Check, AlertTriangle, Smartphone, Video, BarChart2, RefreshCw, Building2, FileText, Plus, Trash2 } from 'lucide-react';
import { StateDisplay } from '../components/ui/StateDisplay';
import { getSettings, getSchedules, getStudents, updateSettings } from '../services/googleSheets';

function LineQuotaPanel({ schedules, students, masterEnabled, toast, toggles, onToggle, notifyMins, onNotifyMinsChange }) {
  const QUOTA = 300;

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let totalSessions = 0;
    const studentSet = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = localDateStr(date);
      for (const s of (schedules || [])) {
        if (s[SCHEDULE.DELETED] === 'TRUE') continue;
        if (scheduleOccursOnDate(s, dateStr)) {
          totalSessions++;
          studentSet.add(s[SCHEDULE.STUDENT_ID]);
        }
      }
    }
    return { totalSessions, uniqueStudents: studentSet.size };
  }, [schedules]);

  const { totalSessions: sess, uniqueStudents: studs } = monthlyStats;
  const totalStudents = (students || []).filter(s => s[STUDENT.DELETED] !== 'TRUE').length || studs;

  const rows = [
    { key: 't1', label: 'แจ้งก่อนเรียน + ลิงก์ Portal', sub: `ส่ง LINE พร้อมลิงก์เข้าเรียนล่วงหน้า ${notifyMins || 30} นาที`, count: sess, type: 'auto' },
    { key: 't2', label: 'ส่งบิล + ใบเสร็จ', sub: 'รูปภาพใบบิลและใบเสร็จ/เดือน', count: totalStudents * 2, type: 'manual' },
    { key: 't3', label: 'Template / แจ้งต่างๆ', sub: 'เลื่อนเวลา, ยกเลิก, กำลังใจ ฯลฯ', count: 15, type: 'manual' },
  ];

  const total = rows.reduce((sum, r) => sum + (masterEnabled && toggles[r.key] ? r.count : 0), 0);
  const pct = Math.min((total / QUOTA) * 100, 100);
  const remaining = Math.max(0, QUOTA - total);
  const over = total - QUOTA;
  const isOver = total > QUOTA;
  const isWarning = !isOver && total > 240;
  const isSafe = !isOver && !isWarning;
  const barColor = isOver ? '#DC2626' : isWarning ? '#D97706' : '#059669';
  const statusLabel = isOver ? 'เกินโควตา' : isWarning ? 'ใกล้เต็ม' : 'ปลอดภัย';
  const statusBg = isOver ? 'bg-red-50 border-red-200' : isWarning ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';
  const statusTextColor = isOver ? 'text-red-700' : isWarning ? 'text-amber-700' : 'text-emerald-700';
  const statusDotColor = isOver ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981';
  const statusDotGlow = isOver ? '#fca5a5' : isWarning ? '#fcd34d' : '#6ee7b7';
  const marker80Pct = (240 / QUOTA) * 100;

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-[12px] border ${statusBg}`}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: statusDotColor, boxShadow: `0 0 0 3px ${statusDotGlow}` }} />
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${statusTextColor}`}>สถานะ: {statusLabel} — {total} / {QUOTA} ข้อความ ({Math.round(pct)}%)</p>
          {isOver && <p className={`text-[12px] mt-0.5 ${statusTextColor}`}>เกินโควตา {over} ข้อความ — ปิดบางระบบด้านล่าง หรืออัปเกรด LINE OA (800 ฿/เดือน → 3,000 ข้อความ)</p>}
          {isWarning && <p className={`text-[12px] mt-0.5 ${statusTextColor}`}>บัฟเฟอร์เหลือ {remaining} ข้อความ — แนะนำส่งบิลเป็น<a href="#" className="underline font-semibold hover:opacity-75" onClick={e => { e.preventDefault(); toast?.('คัดลอกลิงก์บิลแล้ว — ไปวางใน LINE ด้วยตนเองได้เลยครับ', 'info'); }}>ลิงก์แทนการส่งอัตโนมัติ</a></p>}
          {isSafe && <p className={`text-[12px] mt-0.5 ${statusTextColor}`}>เหลือโควตา {remaining} ข้อความ — ใช้ได้ตลอดเดือนสบายๆ</p>}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">พลังงานโควตา LINE Free</span>
          <span className="text-[12px] font-bold" style={{ color: barColor }}>{total} / {QUOTA}</span>
        </div>
        <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
          <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: isOver ? 'linear-gradient(90deg,#059669 0%,#D97706 80%,#DC2626 100%)' : isWarning ? 'linear-gradient(90deg,#059669 0%,#D97706 100%)' : 'linear-gradient(90deg,#059669 0%,#34d399 100%)' }} />
          <div className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: `${marker80Pct}%` }} />
          {(isWarning || isOver) && <div className="absolute inset-0 rounded-full animate-pulse" style={{ background: `${barColor}18`, pointerEvents: 'none' }} />}
        </div>
        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[10px] text-gray-400">0</span>
          <span className="text-[10px] text-amber-500 font-semibold flex items-center gap-0.5" style={{ marginLeft: `${marker80Pct - 6}%` }}><Zap className="w-2.5 h-2.5 inline" />240</span>
          <span className="text-[10px] text-red-500 font-semibold">300</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'คาบ/เดือนนี้', value: sess, sub: 'จากตารางจริง', highlight: false },
          { label: 'นักเรียน active', value: totalStudents, sub: 'คน', highlight: false },
          { label: 'ใช้ต่อเดือน', value: total, sub: 'ข้อความ', highlight: true },
          { label: 'โควตาคงเหลือ', value: remaining, sub: `จาก ${QUOTA}`, highlight: false },
        ].map((m, i) => (
          <div key={i} className={`rounded-[10px] p-3 text-center border transition-colors ${m.highlight ? (isOver ? 'bg-red-50 border-red-200' : isWarning ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200') : 'bg-gray-50 border-gray-100'}`}>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 leading-tight">{m.label}</p>
            <p className="text-[22px] font-bold leading-none" style={{ color: m.highlight ? barColor : '#111827' }}>{m.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className={`border border-gray-200 rounded-[12px] overflow-hidden divide-y divide-gray-100 transition-opacity ${!masterEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {rows.map((r) => {
          const on = masterEnabled && toggles[r.key];
          return (
            <div key={r.key} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
              <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={r.type === 'auto' ? { background: '#E6F1FB', color: '#185FA5' } : { background: '#F0FDF4', color: '#166534' }}>{r.type === 'auto' ? 'AUTO' : 'MANUAL'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-gray-900 leading-snug">{r.label}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: on ? (r.type === 'auto' ? '#E6F1FB' : '#F0FDF4') : '#F3F4F6', color: on ? (r.type === 'auto' ? '#185FA5' : '#166534') : '#9CA3AF' }}>{on ? `+${r.count}` : '—'}</span>
                  {r.key === 't1' && on && (
                    <select
                      value={notifyMins || 30}
                      onChange={e => onNotifyMinsChange?.(Number(e.target.value))}
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] border border-gray-200 rounded-[6px] px-1.5 py-0.5 bg-white text-gray-700 cursor-pointer"
                    >
                      {[10, 15, 20, 30, 45, 60].map(m => <option key={m} value={m}>ก่อน {m} นาที</option>)}
                    </select>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{r.sub}</p>
              </div>
              <button type="button" onClick={() => masterEnabled && onToggle(r.key)} disabled={!masterEnabled} aria-pressed={on} className="relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 disabled:cursor-not-allowed" style={{ background: on ? (r.type === 'auto' ? '#378ADD' : '#1D9E75') : '#D1D5DB' }}>
                <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200" style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }} />
              </button>
            </div>
          );
        })}
      </div>

      {(isWarning || isOver) && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-[12px]">
          <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-blue-800 mb-1">ประหยัดโควตา: ส่งบิลเป็นลิงก์แทน</p>
            <p className="text-[12px] text-blue-700 leading-relaxed">กดปุ่ม <strong>"คัดลอกลิงก์บิล"</strong> แล้ววางใน LINE ด้วยตนเอง — ไม่นับโควตา LINE OA เลยสักข้อความ ประหยัดได้สูงสุด <strong>{totalStudents * 2} ข้อความ/เดือน</strong></p>
          </div>
        </div>
      )}
      <p className="text-[11px] text-gray-400 text-center">คาบ/เดือนคำนวณจากตารางสอนของเดือนนี้จริง รวม recurring weekly/biweekly</p>
    </div>
  );
}

export function Settings({ accessToken, dbId, toast }) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [lineConfigFromKV, setLineConfigFromKV] = useState({ lineToken: '', lineWorkerUrl: '' });
  const [formData, setFormData] = useState({
    institute_name: '', address: '', phone: '', tax_id: '', default_rate: '',
    payment_methods: '', promptpay_id: '', accent_color: '#1d4ed8',
    font_family: 'sans', footer_note: '', logo_url: '', signature_url: '',
    line_channel_token: '', line_worker_url: '', line_oa_enabled: true,
    zoom_link: '', teacher_line_user_id: '', zoom_auto_reminder: false,
    notify_teacher_40min: true, notify_student_mins: 30,
    send_zoom_link: true, send_invoice_receipt: true, send_templates: true,
    zoom_links_pool: '[]', video_call_enabled: true,
    class_code: '',
    msg_portal_reminder: '',
    msg_group_portal_reminder: '',
    msg_portal_intro: '',
    msg_group_portal_intro: '',
    msg_zoom: '',
  });

  const sigUrl        = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
  const teacherSecret = import.meta.env.VITE_TEACHER_SECRET;

  const { data, loading, error, refresh } = useSheetData({
    accessToken, dbId, fetchers: { settings: getSettings, schedules: getSchedules, students: getStudents },
  });

  // Load LINE config from KV (never stored in the public Google Sheet).
  // Runs once when settings data arrives — fills in the token fields if KV has values.
  useEffect(() => {
    if (!sigUrl || !teacherSecret) return;
    fetch(`${sigUrl}/admin/line-config`, {
      headers: { 'X-Teacher-Token': teacherSecret },
    })
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (!cfg) return;
        setLineConfigFromKV(cfg);
        setFormData(f => ({
          ...f,
          line_channel_token: cfg.lineToken     || f.line_channel_token,
          line_worker_url:    cfg.lineWorkerUrl || f.line_worker_url,
        }));
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
    if (s) {
      setFormData({
        institute_name: s[SETTINGS.INSTITUTE_NAME] || '', address: s[SETTINGS.ADDRESS] || '',
        phone: s[SETTINGS.PHONE] || '', tax_id: s[SETTINGS.TAX_ID] || '',
        default_rate: s[SETTINGS.DEFAULT_RATE] || '', payment_methods: s[SETTINGS.PAYMENT_METHODS] || '',
        promptpay_id: s[SETTINGS.PROMPTPAY_ID] || '', accent_color: s[SETTINGS.ACCENT_COLOR] || '#1d4ed8',
        font_family: s[SETTINGS.FONT_FAMILY] || 'sans', footer_note: s[SETTINGS.FOOTER_NOTE] || '',
        logo_url: s[SETTINGS.LOGO_URL] || '', signature_url: s[SETTINGS.SIGNATURE_URL] || '',
        line_channel_token: s[SETTINGS.LINE_TOKEN] === '[kv]' ? (lineConfigFromKV.lineToken || '') : (s[SETTINGS.LINE_TOKEN] || ''),
        line_worker_url:    s[SETTINGS.LINE_WORKER_URL] === '[kv]' ? (lineConfigFromKV.lineWorkerUrl || '') : (s[SETTINGS.LINE_WORKER_URL] || ''),
        line_oa_enabled: s[SETTINGS.UNUSED_1] !== 'FALSE',
        zoom_link: s[SETTINGS.ZOOM_LINK] || '', teacher_line_user_id: s[SETTINGS.TEACHER_LINE_USER_ID] || '',
        zoom_auto_reminder: s[SETTINGS.ZOOM_AUTO_REMINDER] === 'TRUE',
        notify_teacher_40min: s[SETTINGS.NOTIFY_TEACHER_40MIN] !== 'FALSE',
        notify_student_mins: s[SETTINGS.NOTIFY_STUDENT_30MIN] === 'FALSE' ? 0 : (parseInt(s[SETTINGS.NOTIFY_STUDENT_30MIN]) || 30),
        send_zoom_link: s[SETTINGS.SEND_ZOOM_LINK] !== 'FALSE',
        send_invoice_receipt: s[SETTINGS.SEND_INVOICE_RECEIPT] !== 'FALSE',
        send_templates: s[SETTINGS.SEND_TEMPLATES] !== 'FALSE',
        zoom_links_pool: s[SETTINGS.ZOOM_LINKS_POOL] || '[]',
        video_call_enabled: isVideoCallEnabled(s),
        class_code: s[SETTINGS.CLASS_CODE] || '',
        msg_portal_reminder: s[SETTINGS.MSG_PORTAL_REMINDER] || '',
        msg_group_portal_reminder: s[SETTINGS.MSG_GROUP_PORTAL_REMINDER] || '',
        msg_portal_intro: s[SETTINGS.MSG_PORTAL_INTRO] || '',
        msg_group_portal_intro: s[SETTINGS.MSG_GROUP_PORTAL_INTRO] || '',
        msg_zoom: s[SETTINGS.MSG_ZOOM] || '',
      });
    }
  }, [data.settings]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const promptpayDigits = (formData.promptpay_id || '').replace(/\D/g, '');
    if (promptpayDigits && promptpayDigits.length !== 10 && promptpayDigits.length !== 13) {
      toast('PromptPay ID ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน/ผู้เสียภาษี 13 หลักเท่านั้น', 'error');
      return;
    }

    setIsSaving(true);
    const s = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
    let workerSyncFailed = false;

    // Save LINE token + worker URL to Cloudflare KV so they never sit in the
    // public Google Sheet. Only do this when the user has entered real values
    // (not the '[kv]' placeholder that we write below).
    const lineTokenToSave     = formData.line_channel_token && formData.line_channel_token !== '[kv]' ? formData.line_channel_token : lineConfigFromKV.lineToken;
    const lineWorkerUrlToSave = formData.line_worker_url    && formData.line_worker_url    !== '[kv]' ? formData.line_worker_url    : lineConfigFromKV.lineWorkerUrl;
    if (sigUrl && teacherSecret && (lineTokenToSave || lineWorkerUrlToSave)) {
      try {
        const r = await fetch(`${sigUrl}/admin/line-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Teacher-Token': teacherSecret },
          body: JSON.stringify({ lineToken: lineTokenToSave, lineWorkerUrl: lineWorkerUrlToSave }),
        });
        if (r.ok) setLineConfigFromKV({ lineToken: lineTokenToSave, lineWorkerUrl: lineWorkerUrlToSave });
        else workerSyncFailed = true;
      } catch { workerSyncFailed = true; }
    }

    // Write '[kv]' to the Google Sheet as a placeholder — the real token is
    // in Cloudflare KV and is loaded by getSettings automatically on every read.
    const sheetLineToken     = lineTokenToSave     ? '[kv]' : '';
    const sheetLineWorkerUrl = lineWorkerUrlToSave ? '[kv]' : '';

    const ok = await runWithFeedback(
      () => updateSettings(accessToken, dbId, [
        formData.institute_name, formData.line_oa_enabled ? 'TRUE' : 'FALSE', formData.address, formData.phone,
        formData.tax_id, formData.default_rate,
        'FALSE',
        s?.[SETTINGS.TAX_RATE] || '0.07',
        s?.[SETTINGS.PREFIX] || 'ZW',
        s?.[SETTINGS.COUNTER] || '1',
        formData.payment_methods,
        s?.[SETTINGS.CURRENCY] || 'TH',
        dbId, formData.promptpay_id,
        formData.accent_color, formData.font_family, formData.footer_note,
        formData.logo_url, formData.signature_url,
        sheetLineToken, sheetLineWorkerUrl,
        formData.zoom_link, formData.teacher_line_user_id, formData.zoom_auto_reminder ? 'TRUE' : 'FALSE',
        formData.notify_teacher_40min ? 'TRUE' : 'FALSE',
        formData.notify_student_mins > 0 ? String(formData.notify_student_mins) : 'FALSE',
        formData.send_zoom_link ? 'TRUE' : 'FALSE',
        formData.send_invoice_receipt ? 'TRUE' : 'FALSE',
        formData.send_templates ? 'TRUE' : 'FALSE',
        formData.zoom_links_pool,
        formData.video_call_enabled ? 'TRUE' : 'FALSE',
        formData.msg_portal_reminder,
        formData.msg_group_portal_reminder,
        formData.msg_portal_intro,
        formData.msg_group_portal_intro,
        formData.msg_zoom,
        (formData.class_code || '').toUpperCase().slice(0, 4),
      ]),
      toast, 'บันทึกการตั้งค่าแล้ว'
    );
    if (ok) {
      const code = (formData.class_code || '').toUpperCase().slice(0, 4);
      if (sigUrl) {
        if (code) {
          try {
            const r = await fetch(`${sigUrl}/class-code`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(teacherSecret ? { 'X-Teacher-Token': teacherSecret } : {}) },
              body: JSON.stringify({ code, sheetId: dbId, videoCallEnabled: formData.video_call_enabled }),
            });
            if (!r.ok) workerSyncFailed = true;
          } catch { workerSyncFailed = true; }
        }
        try {
          const r2 = await fetch(`${sigUrl}/config/features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(teacherSecret ? { 'X-Teacher-Token': teacherSecret } : {}) },
            body: JSON.stringify({ videoCallEnabled: formData.video_call_enabled }),
          });
          if (!r2.ok) workerSyncFailed = true;
        } catch { workerSyncFailed = true; }
      }
      // Switching to built-in Classroom mode — drop any stale Zoom timer session
      // from before the switch so it can't resurrect the 40-min banner later.
      if (formData.video_call_enabled) {
        try { localStorage.removeItem('zw_zoom_session'); } catch {}
      }
      if (workerSyncFailed) {
        toast('บันทึกลง Google Sheet สำเร็จ แต่ซิงก์ค่า LINE/รหัสห้องเรียน/ฟีเจอร์ไปยัง Cloudflare Worker ไม่สำเร็จ — เช็คว่า Worker (VITE_WEBRTC_SIGNALING_URL) ทำงานอยู่แล้วกดบันทึกอีกครั้งครับ', 'error');
      }
      refresh({ force: true });
    }
    setIsSaving(false);
  };

  const handleFileUpload = async (file, maxW, maxH, field, setUploading) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('รูปใหญ่เกิน 2MB ครับ', 'error'); return; }
    setUploading(true);
    try { const url = await resizeToBase64(file, maxW, maxH); setFormData(f => ({ ...f, [field]: url })); }
    catch (err) { toast('อัปโหลดไม่สำเร็จ: ' + err.message, 'error'); }
    finally { setUploading(false); }
  };

  const field = (label, key, inputProps = {}) => (
    <div>
      <label className={labelClasses}>{label}</label>
      <input value={formData[key]} onChange={e => setFormData(f => ({ ...f, [key]: e.target.value }))} className={inputClasses} {...inputProps} />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h2 className="text-[22px] sm:text-[24px] font-bold text-gray-900 mb-5">ตั้งค่าสถาบัน</h2>
      <StateDisplay loading={loading} error={error} onRetry={refresh} loadingMessage="กำลังโหลดการตั้งค่า...">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ─── ข้อมูลสถาบัน ─── */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="text-[15px] font-bold text-gray-900">ข้อมูลสถาบัน</h3>
            <span className="text-[11px] text-gray-400 ml-1 hidden sm:inline">แสดงบนใบเสร็จทุกฉบับ</span>
          </div>
          <div className="p-5 space-y-4">
            {field('ชื่อสถาบัน (แสดงบนใบเสร็จ) *', 'institute_name', { required: true })}
            <div><label className={labelClasses}>ที่อยู่สถาบัน</label><textarea value={formData.address} onChange={e => setFormData(f => ({ ...f, address: e.target.value }))} className={inputClasses} rows="2" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('เบอร์โทรศัพท์', 'phone', { type: 'text' })}
              {field('เลขประจำตัวผู้เสียภาษี', 'tax_id', { type: 'text' })}
            </div>
          </div>
        </div>

        {/* ─── การออกใบเสร็จ ─── */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="text-[15px] font-bold text-gray-900">การออกใบเสร็จ</h3>
            <span className="text-[11px] text-gray-400 ml-1 hidden sm:inline">เรท ช่องทางชำระเงิน และหน้าตาเอกสาร</span>
          </div>
          <div className="p-5 space-y-4">
            {field('เรทค่าสอนเริ่มต้น (฿/ชม.) *', 'default_rate', { required: true, type: 'number' })}
            <div><label className={labelClasses}>ช่องทางการชำระเงิน *</label><textarea required value={formData.payment_methods} onChange={e => setFormData(f => ({ ...f, payment_methods: e.target.value }))} className={inputClasses} rows="3" placeholder="เช่น ธนาคารกสิกรไทย เลขบัญชี 123-456-7890 ชื่อบัญชี นาย..." /></div>
            <div>
              <label className={labelClasses}>PromptPay ID</label>
              <input type="text" value={formData.promptpay_id} onChange={e => setFormData(f => ({ ...f, promptpay_id: e.target.value }))} className={inputClasses} placeholder="เช่น 0812345678 หรือเลขบัตรประชาชน 13 หลัก" />
              <p className="text-[12px] text-gray-500 mt-1.5">ถ้ากรอกไว้ ใบเสร็จทุกใบจะมี QR Code พร้อมเพย์ให้ลูกค้าสแกนจ่ายได้ทันที</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>สีหลักของใบเสร็จ</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={formData.accent_color} onChange={e => setFormData(f => ({ ...f, accent_color: e.target.value }))} className="h-[42px] w-14 border border-gray-300 rounded-[8px] cursor-pointer" />
                  <input type="text" value={formData.accent_color} onChange={e => setFormData(f => ({ ...f, accent_color: e.target.value }))} className={`${inputClasses} font-mono uppercase`} />
                </div>
              </div>
              <div>
                <label className={labelClasses}>รูปแบบตัวอักษร</label>
                <select value={formData.font_family} onChange={e => setFormData(f => ({ ...f, font_family: e.target.value }))} className={inputClasses}>
                  <option value="sans">Sans-serif (ทันสมัย)</option><option value="serif">Serif (คลาสสิก)</option><option value="mono">Monospace (เรียบ)</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClasses}>โลโก้สถาบัน</label>
              <div className="flex items-start gap-4">
                {formData.logo_url && <div className="border border-gray-200 rounded-[8px] p-2 bg-gray-50 flex-shrink-0 shadow-sm"><img src={formData.logo_url} alt="logo" style={{ maxHeight: '64px', maxWidth: '160px', objectFit: 'contain' }} referrerPolicy="no-referrer" /></div>}
                <div className="flex-1 min-w-0">
                  <input type="file" accept="image/*" disabled={isUploadingLogo} onChange={e => handleFileUpload(e.target.files[0], 1200, 400, 'logo_url', setIsUploadingLogo)} className={`${inputClasses} cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`} />
                  {isUploadingLogo && <p className="text-[12px] text-blue-600 mt-1.5 font-medium">กำลังประมวลผล...</p>}
                  <p className="text-[12px] text-gray-500 mt-1.5">PNG/JPG · ไม่เกิน 2MB · ถ้าไม่ใส่จะแสดงชื่อสถาบันแทน</p>
                  {formData.logo_url && !isUploadingLogo && <button type="button" onClick={() => setFormData(f => ({ ...f, logo_url: '' }))} className="text-[12px] text-red-500 hover:text-red-700 mt-2 font-medium flex items-center gap-1"><X className="w-3.5 h-3.5" />ลบโลโก้</button>}
                </div>
              </div>
            </div>
            <div><label className={labelClasses}>ข้อความท้ายใบเสร็จ</label><textarea value={formData.footer_note} onChange={e => setFormData(f => ({ ...f, footer_note: e.target.value }))} className={inputClasses} rows="2" placeholder="เช่น ขอบคุณที่ใช้บริการครับ" /></div>
            <div>
              <label className={labelClasses}>รูปลายเซ็น (แสดงในใบเสร็จรับเงิน)</label>
              <div className="flex items-start gap-4">
                {formData.signature_url && <div className="border border-gray-200 rounded-[8px] p-2 bg-gray-50 flex-shrink-0 shadow-sm"><img src={formData.signature_url} alt="ลายเซ็น" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain' }} referrerPolicy="no-referrer" crossOrigin="anonymous" /></div>}
                <div className="flex-1 min-w-0">
                  <input type="file" accept="image/*" disabled={isUploadingSignature} onChange={e => handleFileUpload(e.target.files[0], 800, 300, 'signature_url', setIsUploadingSignature)} className={`${inputClasses} cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`} />
                  {isUploadingSignature && <p className="text-[12px] text-blue-600 mt-1.5 font-medium">กำลังประมวลผล...</p>}
                  <p className="text-[12px] text-gray-500 mt-1.5">PNG/JPG พื้นหลังโปร่งใสได้ · ไม่เกิน 2MB</p>
                  {formData.signature_url && !isUploadingSignature && <button type="button" onClick={() => setFormData(f => ({ ...f, signature_url: '' }))} className="text-[12px] text-red-500 hover:text-red-700 mt-2 font-medium flex items-center gap-1"><X className="w-3.5 h-3.5" />ลบลายเซ็น</button>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── การแจ้งเตือน LINE ─── */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="text-[15px] font-bold text-gray-900">การแจ้งเตือน LINE</h3>
            <span className="text-[11px] text-gray-400 ml-1 hidden sm:inline">LINE Messaging API</span>
          </div>
          <div className="p-5 space-y-4">
            <div className={`flex items-center gap-4 p-4 rounded-[12px] border-2 transition-colors ${formData.line_oa_enabled ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-gray-900">เปิดใช้งาน LINE OA</p>
                <p className={`text-[12px] mt-0.5 leading-relaxed ${formData.line_oa_enabled ? 'text-green-700' : 'text-red-700'}`}>
                  {formData.line_oa_enabled
                    ? 'เปิดอยู่ — ระบบส่ง LINE ทำงานตามสวิตช์ด้านล่างแต่ละตัว'
                    : 'ปิดอยู่ — หยุดส่ง LINE ทุกชนิดทั้งระบบทันที (Zoom, บิล, ใบเสร็จ, Template) ไม่ว่าสวิตช์ด้านล่างจะเปิดหรือปิด'}
                </p>
              </div>
              <button type="button" onClick={() => setFormData(f => ({ ...f, line_oa_enabled: !f.line_oa_enabled }))} aria-pressed={formData.line_oa_enabled} className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 ${formData.line_oa_enabled ? 'bg-green-500 focus:ring-green-400' : 'bg-gray-300 focus:ring-gray-400'}`}>
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.line_oa_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <div>
              <label className={labelClasses}>Channel Access Token</label>
              <input type="password" value={formData.line_channel_token} onChange={e => setFormData(f => ({ ...f, line_channel_token: e.target.value }))} className={`${inputClasses} font-mono`} placeholder="วาง Channel Access Token จาก LINE Developers Console" />
              <p className="text-[12px] text-gray-400 mt-1">LINE Developers Console → Channel → Messaging API → Channel access token → Issue</p>
            </div>
            <div>
              <label className={labelClasses}>Cloudflare Worker URL</label>
              <input type="text" value={formData.line_worker_url} onChange={e => setFormData(f => ({ ...f, line_worker_url: e.target.value }))} className={inputClasses} placeholder="https://shifthighbury-signaling.YOUR_NAME.workers.dev" />
              <p className="text-[12px] text-gray-400 mt-1">URL ของ Worker ที่ deploy บน Cloudflare (ดูไฟล์ worker.js)</p>
            </div>
            {formData.line_channel_token && formData.line_worker_url && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-[10px]">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-[13px] text-green-700 font-medium">LINE ตั้งค่าครบแล้ว — บันทึกเพื่อเปิดใช้งาน</p>
              </div>
            )}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-gray-400" />
                <p className="text-[14px] font-bold text-gray-900">โควตา & สวิตช์แต่ละฟีเจอร์</p>
                <span className="text-[11px] text-gray-400 hidden sm:inline">— คำนวณจากตารางสอนจริงเดือนนี้</span>
              </div>
              <LineQuotaPanel
                schedules={data.schedules || []}
                students={data.students || []}
                masterEnabled={formData.line_oa_enabled}
                toast={toast}
                toggles={{ t1: formData.notify_student_mins > 0, t2: formData.send_invoice_receipt, t3: formData.send_templates }}
                onToggle={(key) => {
                  if (key === 't1') { setFormData(f => ({ ...f, notify_student_mins: f.notify_student_mins > 0 ? 0 : 30 })); return; }
                  const map = { t2: 'send_invoice_receipt', t3: 'send_templates' };
                  setFormData(f => ({ ...f, [map[key]]: !f[map[key]] }));
                }}
                notifyMins={formData.notify_student_mins}
                onNotifyMinsChange={(mins) => setFormData(f => ({ ...f, notify_student_mins: mins }))}
              />
            </div>
          </div>
        </div>

        {/* ─── Portal นักเรียน ─── */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="text-[15px] font-bold text-gray-900">Portal นักเรียน</h3>
            <span className="text-[11px] text-gray-400 ml-1 hidden sm:inline">รหัสสำหรับให้นักเรียนเข้าระบบ</span>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className={labelClasses}>รหัสห้องเรียน (สูงสุด 4 ตัวอักษร)</label>
              <input
                type="text"
                value={formData.class_code}
                onChange={e => setFormData(f => ({ ...f, class_code: e.target.value.toUpperCase().slice(0, 4) }))}
                className={`${inputClasses} font-mono uppercase tracking-widest text-lg`}
                placeholder="เช่น ZWEN"
                maxLength={4}
              />
              <p className="text-[12px] text-gray-500 mt-1.5">
                นักเรียนกรอกรหัสนี้พร้อมรหัสนักเรียนเพื่อเข้า Portal — ตั้งได้สูงสุด 4 ตัว (A–Z, 0–9) ระบบจะแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ
              </p>
            </div>
          </div>
        </div>

        {/* ─── Zoom ─── */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Video className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="text-[15px] font-bold text-gray-900">Zoom</h3>
            <span className="text-[11px] text-gray-400 ml-1 hidden sm:inline">ลิงก์ & แจ้งเตือนครู</span>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className={labelClasses}>Zoom Personal Meeting Link (ลิงก์หลัก)</label>
              <input type="text" value={formData.zoom_link} onChange={e => setFormData(f => ({ ...f, zoom_link: e.target.value }))} className={inputClasses} placeholder="https://zoom.us/j/1234567890?pwd=xxxxxx" />
              <p className="text-[12px] text-gray-400 mt-1">ใช้ห้อง Zoom เดิม (Personal Meeting Room) ส่งให้นักเรียนได้ทุกคาบ ไม่ต้องสร้างห้องใหม่</p>
            </div>

            {/* Zoom Links Pool */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClasses + ' mb-0'}>คลังลิงก์ Zoom (สำหรับสลับห้องเมื่อครบ 40 นาที)</label>
                <button type="button"
                  onClick={() => {
                    const pool = (() => { try { return JSON.parse(formData.zoom_links_pool || '[]'); } catch { return []; } })();
                    setFormData(f => ({ ...f, zoom_links_pool: JSON.stringify([...pool, { label: `ห้อง ${pool.length + 1}`, url: '' }]) }));
                  }}
                  className="flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-800 font-semibold flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />เพิ่มลิงก์
                </button>
              </div>
              {(() => {
                const pool = (() => { try { return JSON.parse(formData.zoom_links_pool || '[]'); } catch { return []; } })();
                if (pool.length === 0) return (
                  <p className="text-[12px] text-gray-400 py-2">ยังไม่มีลิงก์ในคลัง — กด "เพิ่มลิงก์" เพื่อเพิ่มห้อง Zoom สำรอง ระบบจะสลับไปตามลำดับเมื่อกด "สลับห้อง" ในตัวนับเวลา</p>
                );
                return (
                  <div className="space-y-2">
                    {pool.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-[10px]">
                        <span className="text-[11px] font-bold text-gray-400 w-5 flex-shrink-0 text-center">{i + 1}</span>
                        <input
                          type="text" value={entry.label}
                          onChange={e => { const p = [...pool]; p[i] = { ...p[i], label: e.target.value }; setFormData(f => ({ ...f, zoom_links_pool: JSON.stringify(p) })); }}
                          className="w-24 flex-shrink-0 text-[12px] border border-gray-200 rounded-[6px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="ชื่อห้อง"
                        />
                        <input
                          type="text" value={entry.url}
                          onChange={e => { const p = [...pool]; p[i] = { ...p[i], url: e.target.value }; setFormData(f => ({ ...f, zoom_links_pool: JSON.stringify(p) })); }}
                          className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded-[6px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                          placeholder="https://zoom.us/j/..."
                        />
                        <button type="button"
                          onClick={() => { const p = pool.filter((_, j) => j !== i); setFormData(f => ({ ...f, zoom_links_pool: JSON.stringify(p) })); }}
                          className="text-red-400 hover:text-red-600 flex-shrink-0 p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Video Call Enabled */}
            <div className={`flex items-center gap-4 p-4 rounded-[12px] border-2 transition-colors ${formData.video_call_enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-gray-900">เปิดใช้งาน Classroom (Video Call ในระบบ)</p>
                <p className={`text-[12px] mt-0.5 leading-relaxed ${formData.video_call_enabled ? 'text-blue-700' : 'text-gray-500'}`}>
                  {formData.video_call_enabled
                    ? 'เปิดอยู่ — ปุ่ม "เปิด Classroom" จะปรากฏในตารางสอน'
                    : 'ปิดอยู่ — ปุ่ม Classroom ถูกซ่อนทั้งระบบ ใช้ Zoom เป็นหลัก'}
                </p>
              </div>
              <button type="button" onClick={() => setFormData(f => ({ ...f, video_call_enabled: !f.video_call_enabled }))} aria-pressed={formData.video_call_enabled}
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 ${formData.video_call_enabled ? 'bg-blue-500 focus:ring-blue-400' : 'bg-gray-300 focus:ring-gray-400'}`}>
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.video_call_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div>
              <label className={labelClasses}>LINE User ID ของครู (สำหรับรับการแจ้งเตือน)</label>
              <input type="text" value={formData.teacher_line_user_id} onChange={e => setFormData(f => ({ ...f, teacher_line_user_id: e.target.value }))} className={`${inputClasses} font-mono`} placeholder="U1234567890abcdef..." />
              <p className="text-[12px] text-gray-400 mt-1">ระบบจะส่งแจ้งเตือน Zoom ให้ครูที่ LINE นี้โดยตรง — เปิด/ปิดแจ้งเตือนได้ที่ส่วน "การแจ้งเตือน LINE" ด้านบน</p>
            </div>
            {formData.zoom_auto_reminder && (!formData.teacher_line_user_id || !formData.zoom_link) && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-[10px]">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-[13px] text-amber-700 font-medium">เปิดแจ้งเตือนครูไว้ แต่ยังกรอกลิงก์ Zoom หรือ LINE User ID ของครูไม่ครบ — ระบบจะยังไม่ส่งจนกว่าจะกรอกครบครับ</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Save ─── */}
        <div className="flex justify-end pb-4">
          <button type="submit" disabled={isSaving} className={`${btnPrimary} min-w-[160px] flex items-center justify-center gap-2`}>
            {isSaving
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />กำลังบันทึก...</>
              : 'บันทึกการตั้งค่า'}
          </button>
        </div>

      </form>
      </StateDisplay>
    </div>
  );
}
