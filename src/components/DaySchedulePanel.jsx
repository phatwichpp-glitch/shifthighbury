// @ts-nocheck
// ============================================================
// DaySchedulePanel.jsx — Refactored
// Improvements:
//   1. Visual Timeline — taller track, better gap highlight strips
//      with clickable "จองช่วงนี้" affordance
//   2. Smart Default auto-fill (unchanged logic, improved hint UI)
//   3. Schedule cards — cleaner header, clearer action buttons
// Logic: unchanged (no backend / Google Calendar modifications)
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SCHEDULE, SESSION, STUDENT, GROUP, STUDENT_COLORS, STUDENT_TEXT_COLORS, CANCELLATION, STUDENT_LINE_USER_ID, canSendLine, SETTINGS, isVideoCallEnabled } from '../lib/constants';
import { APP_TIMEZONE } from '../lib/appConfig';
import { calculateEndTime, calculateHours, buildZoomMessage, buildPortalMessage, buildGroupPortalMessage, copyText, buildStudentLoginCode, toastLineError, formatMins, teacherAuthHeaders } from '../lib/business';
import { btnPrimary, btnSecondary, btnSuccess, labelClasses, inputClasses } from '../components/ui/styles';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { SubjectComboInput } from '../components/ui/SubjectComboInput';
import {
  CalendarCheck, X, Zap, User, Users, AlertTriangle, Check, ChevronDown,
  Hourglass, Repeat, FileText, Pencil, Ban, Trash2, Clock, Send, Share2, Video, Calendar, Copy, Bell,
} from 'lucide-react';
import { sendLineMessage } from '../services/googleSheets';

const SIGNALING_URL = import.meta.env.VITE_WEBRTC_SIGNALING_URL;

async function sendPushToStudent(studentId, title, body) {
  if (!SIGNALING_URL) return { ok: false, error: 'no signaling URL' };
  try {
    const r = await fetch(`${SIGNALING_URL}/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teacherAuthHeaders() },
      body: JSON.stringify({ studentId, title, body }),
    });
    if (r.status === 404) return { ok: false, error: 'ยังไม่ได้เปิดการแจ้งเตือน' };
    if (r.status === 410) return { ok: false, error: 'subscription หมดอายุ' };
    return r.ok ? { ok: true } : { ok: false, error: `error ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Split-button: left = primary action, right arrow = share dropdown (smart positioning via portal)
function LinkShareDropdown({ label, icon, variant, items, onPrimaryAction }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const arrowRef = useRef(null);

  const handleArrow = () => {
    if (!open && arrowRef.current) {
      const rect = arrowRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(items.length * 44 + 16, 320);
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < estimatedHeight;
      setMenuStyle({
        position: 'fixed',
        right: window.innerWidth - rect.right,
        width: 224,
        zIndex: 99999,
        ...(dropUp ? { bottom: window.innerHeight - rect.top } : { top: rect.bottom + 4 }),
      });
    }
    setOpen(o => !o);
  };

  const isPrimary = variant === 'primary';
  const mainCls = isPrimary
    ? 'px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700 rounded-l-[8px] font-semibold shadow-sm'
    : 'px-2.5 py-1.5 bg-white text-violet-600 border border-violet-200 hover:bg-violet-50 rounded-l-[8px] font-medium';
  const arrowCls = isPrimary
    ? 'px-2 py-2 bg-emerald-600 text-white hover:bg-emerald-700 border border-l-emerald-500 border-emerald-700 rounded-r-[8px] shadow-sm'
    : 'px-1.5 py-1.5 bg-white text-violet-600 border border-l-violet-100 border-violet-200 hover:bg-violet-50 rounded-r-[8px]';

  return (
    <div className="relative inline-flex">
      {open && <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />}
      <button type="button" onClick={onPrimaryAction}
        className={`flex items-center gap-1.5 transition-all text-[12px] whitespace-nowrap active:scale-95 ${mainCls}`}>
        {icon}<span>{label}</span>
      </button>
      <button ref={arrowRef} type="button" onClick={handleArrow}
        className={`flex items-center transition-all active:scale-95 ${arrowCls}`}>
        <ChevronDown className={`w-3 h-3 opacity-70 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div style={menuStyle} className="bg-white border border-gray-200 rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.14)] py-1.5 overflow-hidden">
          {items.map((item, i) => (
            item.divider
              ? <div key={i} className="border-t border-gray-100 my-1" />
              : <button key={i} onClick={() => { item.action(); setOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors">
                  <span className="flex items-center justify-center w-4 h-4 flex-shrink-0">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function DaySchedulePanel({
  selectedDate,
  todayStr,
  selectedDateSchedules,
  selectedDateSessions,
  selectedDateCancellations,
  getStudentName,
  showForm,
  setShowForm,
  editingSchedule,
  setEditingSchedule,
  students,
  groups,
  isSubmitting,
  onSubmitSchedule,
  onDeleteSchedule,
  onLogSession,
  onCancelClass,
  zoomLink,
  onSendZoomLink,
  sendingZoomFor,
  onRescheduleTime,
  setActiveCall,
  setLauncherCall,
  onStartClass,
  waitingRoomStatusMap,
  settingsRow,
  toast,
}) {
  // ── Smart default: ต่อจากคลาสสุดท้ายในวันนี้ ──────────────────────────
  const smartDefault = useMemo(() => {
    if (selectedDateSchedules.length === 0) return { time_start: '09:00', time_end: '10:00' };
    const sorted = [...selectedDateSchedules].sort(
      (a, b) => a.data[SCHEDULE.TIME_END].localeCompare(b.data[SCHEDULE.TIME_END]),
    );
    const lastEnd = sorted[sorted.length - 1].data[SCHEDULE.TIME_END] || '18:00';
    return { time_start: lastEnd, time_end: calculateEndTime(lastEnd, '1') };
  }, [selectedDateSchedules]);

  const [formData, setFormData] = useState({
    student_id: '', group_id: '', subject: '', hours: '1', note: '',
    time_start: '09:00', time_end: '10:00', repeat_type: 'none', repeat_until: '',
  });

  // เมื่อเปิดฟอร์มแก้ไข — load ข้อมูลเดิมลงมา
  useEffect(() => {
    if (editingSchedule) {
      const s = editingSchedule.data;
      setFormData({
        student_id:   s[SCHEDULE.STUDENT_ID],
        subject:      s[SCHEDULE.SUBJECT],
        hours:        s[SCHEDULE.HOURS],
        note:         s[SCHEDULE.NOTE] || '',
        time_start:   s[SCHEDULE.TIME_START] || '09:00',
        time_end:     s[SCHEDULE.TIME_END] || '10:00',
        repeat_type:  s[SCHEDULE.REPEAT_TYPE] || 'none',
        repeat_until: s[SCHEDULE.REPEAT_UNTIL] || '',
      });
    }
  }, [editingSchedule]);

  // เมื่อเปิดฟอร์มใหม่ (ไม่ใช่แก้ไข) — auto-fill เวลาต่อจากคนสุดท้าย
  useEffect(() => {
    if (!editingSchedule && showForm) {
      setFormData((f) => ({
        ...f,
        student_id:   '',
        group_id:     '',
        subject:      '',
        note:         '',
        repeat_type:  'none',
        repeat_until: '',
        time_start:   smartDefault.time_start,
        time_end:     smartDefault.time_end,
        hours:        '1',
      }));
    }
  }, [showForm, editingSchedule]);

  // ── Conflict detection ─────────────────────────────────────────────────
  const conflicts = useMemo(() => {
    if (!formData.time_start || !formData.time_end) return [];
    return selectedDateSchedules.filter((item) => {
      const s = item.data;
      if (editingSchedule && s[SCHEDULE.ID] === editingSchedule.data[SCHEDULE.ID]) return false;
      return s[SCHEDULE.TIME_START] < formData.time_end && s[SCHEDULE.TIME_END] > formData.time_start;
    });
  }, [formData.time_start, formData.time_end, selectedDateSchedules, editingSchedule]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmitSchedule(formData, editingSchedule, selectedDate);
  };

  const dateLabel =
    selectedDate === todayStr
      ? 'ตารางสอนวันนี้'
      : `ตารางสอน ${new Date(selectedDate).toLocaleDateString('th-TH', {
          day: 'numeric', month: 'long', year: 'numeric',
        })}`;

  // ── Shared time helper ─────────────────────────────────────────────────
  const toMins = (t) => {
    const [h, m] = (t || '00:00').split(':').map(Number);
    return h * 60 + m;
  };

  const isToday = selectedDate === todayStr;
  const [bangkokNowMins, setBangkokNowMins] = useState(() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIMEZONE }));
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIMEZONE }));
      setBangkokNowMins(d.getHours() * 60 + d.getMinutes());
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [isToday]);

  // ── Started-class tracker (localStorage-backed) ───────────────────────
  const [startedClasses, setStartedClasses] = useState(() => {
    try {
      const s = new Set();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('zw_started_')) s.add(k);
      }
      return s;
    } catch { return new Set(); }
  });
  const markClassStarted = (key) => {
    try { localStorage.setItem(key, '1'); } catch {}
    setStartedClasses(prev => new Set([...prev, key]));
  };

  // ── Gap slots (for timeline + quick-book) ──────────────────────────────
  const gapSlots = useMemo(() => {
    if (selectedDateSchedules.length < 2) return [];
    const sorted = [...selectedDateSchedules].sort(
      (a, b) => toMins(a.data[SCHEDULE.TIME_START]) - toMins(b.data[SCHEDULE.TIME_START]),
    );
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapStart = toMins(sorted[i].data[SCHEDULE.TIME_END]);
      const gapEnd   = toMins(sorted[i + 1].data[SCHEDULE.TIME_START]);
      const gapMins  = gapEnd - gapStart;
      if (gapMins >= 15) {
        gaps.push({
          fromTime: sorted[i].data[SCHEDULE.TIME_END],
          toTime:   sorted[i + 1].data[SCHEDULE.TIME_START],
          mins:     gapMins,
        });
      }
    }
    return gaps;
  }, [selectedDateSchedules]);

  // Quick-book from a gap: open form pre-filled with gap time
  const handleBookGap = (gap) => {
    setEditingSchedule(null);
    setFormData((f) => ({
      ...f,
      student_id: '', group_id: '', subject: '', note: '',
      repeat_type: 'none', repeat_until: '',
      time_start: gap.fromTime,
      time_end:   gap.toTime,
      hours:      String(gap.mins / 60),
    }));
    setShowForm(true);
  };

  return (
    <div className="bg-white rounded-[16px] p-3 sm:p-4 lg:p-6 border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">

      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-[18px] font-bold text-gray-900">{dateLabel}</h3>
          <p className="text-gray-400 text-[12px] mt-0.5 flex items-center gap-1.5">
            <CalendarCheck className="w-3.5 h-3.5" /> Auto-sync กับ Google Calendar
            <span className="inline-flex items-center gap-0.5 text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
              ● เปิดอยู่
            </span>
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingSchedule(null); }}
          className={showForm ? btnSecondary : btnPrimary}
        >
          {showForm ? <><X className="w-4 h-4" />ยกเลิก</> : '+ นัดสอนเพิ่ม'}
        </button>
      </div>

      {/* ── Add / Edit form ────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-5 bg-gray-50 border border-gray-200 rounded-[12px] shadow-sm animate-[slideIn_150ms_ease-out]"
        >
          <h4 className="font-semibold text-gray-900 mb-1 text-[16px]">
            {editingSchedule ? 'แก้ไขตารางสอน' : 'เพิ่มตารางสอน'}
          </h4>

          {/* Smart default hint */}
          {!editingSchedule && selectedDateSchedules.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <Zap className="w-3 h-3" /> Auto-fill ต่อจากคลาสก่อนหน้า — เริ่ม {smartDefault.time_start} น.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* ── Student / Group selector ── */}
            <div>
              <label className={labelClasses}>ประเภทการเรียน</label>
              <div className="flex gap-1.5 mb-3 p-1 bg-gray-100 rounded-[10px]">
                <button
                  type="button"
                  onClick={() => setFormData((f) => ({ ...f, group_id: '', student_id: f.student_id }))}
                  className={`flex-1 py-2 rounded-[8px] text-[13px] font-semibold transition-all
                    ${!formData.group_id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <User className="w-3.5 h-3.5 inline mr-1" />เรียนเดี่ยว
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((f) => ({
                    ...f,
                    student_id: '',
                    group_id: f.group_id || (groups.filter((g) => g[GROUP.DELETED] !== 'TRUE')[0]?.[GROUP.ID] || ''),
                  }))}
                  className={`flex-1 py-2 rounded-[8px] text-[13px] font-semibold transition-all
                    ${formData.group_id ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Users className="w-3.5 h-3.5 inline mr-1" />เรียนกลุ่ม
                </button>
              </div>

              {/* Individual student */}
              {!formData.group_id && (
                <>
                  <label className={labelClasses}>นักเรียน <span className="text-red-500">*</span></label>
                  <select
                    required={!formData.group_id}
                    value={formData.student_id}
                    onChange={(e) => {
                      const stu = students.find((s) => s[STUDENT.ID] === e.target.value);
                      setFormData((f) => ({ ...f, student_id: e.target.value, subject: stu?.[STUDENT.SUBJECT] || f.subject }));
                    }}
                    className={inputClasses}
                  >
                    <option value="">-- เลือก --</option>
                    {students
                      .filter((s) => s[STUDENT.DELETED] !== 'TRUE')
                      .map((s, i) => (
                        <option key={i} value={s[STUDENT.ID]}>{s[STUDENT.NAME]}</option>
                      ))}
                  </select>
                </>
              )}

              {/* Group */}
              {formData.group_id !== '' && (
                <>
                  <label className={labelClasses}>กลุ่มเรียน <span className="text-red-500">*</span></label>
                  <select
                    required={!!formData.group_id}
                    value={formData.group_id}
                    onChange={(e) => {
                      const grp = groups.find((g) => g[GROUP.ID] === e.target.value);
                      setFormData((f) => ({
                        ...f, group_id: e.target.value, student_id: '',
                        subject: grp?.[GROUP.DEFAULT_SUBJECT] || f.subject,
                      }));
                    }}
                    className={inputClasses}
                  >
                    <option value="">-- เลือกกลุ่ม --</option>
                    {groups
                      .filter((g) => g[GROUP.DELETED] !== 'TRUE')
                      .map((g, i) => (
                        <option key={i} value={g[GROUP.ID]}>
                          {g[GROUP.NAME]} ({(g[GROUP.STUDENT_IDS] || '').split(',').filter(Boolean).length} คน)
                        </option>
                      ))}
                  </select>
                  {formData.group_id && (() => {
                    const grp = groups.find((g) => g[GROUP.ID] === formData.group_id);
                    const memberIds = (grp?.[GROUP.STUDENT_IDS] || '').split(',').filter(Boolean);
                    const memberNames = memberIds.map(
                      (id) => students.find((s) => s[STUDENT.ID] === id.trim())?.[STUDENT.NAME] || id,
                    );
                    return memberNames.length > 0 ? (
                      <p className="text-[11px] text-purple-700 mt-1 bg-purple-50 px-2 py-1 rounded-[6px] flex items-center gap-1">
                        <Users className="w-3 h-3 flex-shrink-0" /> {memberNames.join(', ')}
                      </p>
                    ) : null;
                  })()}
                </>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className={labelClasses}>วิชาที่สอน</label>
              <SubjectComboInput
                value={formData.subject}
                onChange={(v) => setFormData((f) => ({ ...f, subject: v }))}
              />
            </div>

            {/* Time fields */}
            <div className="col-span-1 lg:col-span-2 grid grid-cols-3 gap-3">
              <div>
                <label className={labelClasses}>เวลาเริ่ม</label>
                <input
                  type="time" required value={formData.time_start}
                  onChange={(e) => setFormData((f) => ({
                    ...f, time_start: e.target.value,
                    time_end: calculateEndTime(e.target.value, f.hours),
                  }))}
                  className={`${inputClasses} ${conflicts.length > 0 ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                />
              </div>
              <div>
                <label className={labelClasses}>ชั่วโมง</label>
                <input
                  type="number" step="0.5" min="0.5" required value={formData.hours}
                  onChange={(e) => setFormData((f) => ({
                    ...f, hours: e.target.value,
                    time_end: calculateEndTime(f.time_start, e.target.value),
                  }))}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>เวลาจบ</label>
                <input
                  type="time" required value={formData.time_end}
                  onChange={(e) => setFormData((f) => ({
                    ...f, time_end: e.target.value,
                    hours: calculateHours(f.time_start, e.target.value),
                  }))}
                  className={`${inputClasses} ${conflicts.length > 0 ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* Conflict warning */}
          {conflicts.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-[10px]">
              <p className="text-[12px] font-bold text-red-700 mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> เวลาชนกับตารางสอนที่มีอยู่</p>
              {conflicts.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-red-600">
                  <span>•</span>
                  <span className="font-semibold">{getStudentName(item.data[SCHEDULE.STUDENT_ID])}</span>
                  <span>{item.data[SCHEDULE.TIME_START]}–{item.data[SCHEDULE.TIME_END]} น.</span>
                </div>
              ))}
              <p className="text-[11px] text-red-400 mt-1.5">ยังบันทึกได้ แต่แนะนำให้ปรับเวลาครับ</p>
            </div>
          )}
          {conflicts.length === 0 && formData.time_start && formData.time_end && formData.time_start < formData.time_end && (
            <p className="text-[11px] text-green-600 mb-4 flex items-center gap-1 font-medium"><Check className="w-3.5 h-3.5" /> เวลาว่าง ไม่ชนตารางใคร</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelClasses}>ทำซ้ำ</label>
              <select
                value={formData.repeat_type}
                onChange={(e) => setFormData((f) => ({ ...f, repeat_type: e.target.value }))}
                className={inputClasses}
              >
                <option value="none">ไม่ทำซ้ำ</option>
                <option value="weekly">ทุกสัปดาห์</option>
                <option value="biweekly">ทุก 2 สัปดาห์</option>
              </select>
            </div>
            {formData.repeat_type !== 'none' && (
              <div>
                <label className={labelClasses}>ทำซ้ำถึงวันที่</label>
                <input
                  type="date" value={formData.repeat_until}
                  onChange={(e) => setFormData((f) => ({ ...f, repeat_until: e.target.value }))}
                  className={inputClasses}
                />
              </div>
            )}
            <div>
              <label className={labelClasses}>หมายเหตุ</label>
              <input
                type="text" value={formData.note}
                onChange={(e) => setFormData((f) => ({ ...f, note: e.target.value }))}
                className={inputClasses} placeholder="เช่น ทบทวนบทที่ 3"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {conflicts.length > 0 && (
              <span className="text-[12px] text-red-500 self-center flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> มีเวลาชนกัน</span>
            )}
            <button type="submit" disabled={isSubmitting} className={btnPrimary}>
              {isSubmitting
                ? 'กำลังบันทึก...'
                : editingSchedule ? 'บันทึกการแก้ไข' : 'เพิ่มตารางสอน'}
            </button>
          </div>
        </form>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {selectedDateSchedules.length === 0 && selectedDateSessions.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-gray-50 rounded-[12px] border border-dashed border-gray-300">
          <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-[14px] font-medium">วันนี้คิวว่าง</p>
          <p className="text-gray-400 text-[12px] mt-1">
            กด <strong>+ นัดสอนเพิ่ม</strong> เพื่อเพิ่มตารางสอนวันนี้
          </p>
        </div>
      ) : (
        <div className="space-y-3">

          {/* ================================================================
              VISUAL TIMELINE — improved track with gap strips
          ================================================================ */}
          {selectedDateSchedules.length > 0 && (() => {
            const allStarts = selectedDateSchedules.map((item) => toMins(item.data[SCHEDULE.TIME_START]));
            const allEnds   = selectedDateSchedules.map((item) => toMins(item.data[SCHEDULE.TIME_END]));
            const minTime   = Math.floor((Math.min(...allStarts) - 30) / 60) * 60;
            const maxTime   = Math.ceil((Math.max(...allEnds)   + 30) / 60) * 60;
            const totalSpan = maxTime - minTime;
            const pct       = (mins) => `${((mins - minTime) / totalSpan) * 100}%`;

            const firstHour = Math.ceil(minTime / 60);
            const lastHour  = Math.floor(maxTime / 60);
            const hourMarkers = [];
            for (let h = firstHour; h <= lastHour; h++) hourMarkers.push(h * 60);

            const sorted = [...selectedDateSchedules].sort(
              (a, b) => toMins(a.data[SCHEDULE.TIME_START]) - toMins(b.data[SCHEDULE.TIME_START]),
            );

            return (
              <div className="mb-5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Timeline วันนี้
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded-[12px] overflow-hidden py-4 px-4">

                  {/* ── Track ── */}
                  <div className="relative w-full" style={{ height: '44px' }}>

                    {/* Hour grid lines + labels */}
                    {hourMarkers.map((hm) => (
                      <div key={hm} className="absolute top-0 bottom-0 flex flex-col" style={{ left: pct(hm) }}>
                        <span className="text-[9px] text-gray-300 font-bold leading-none mb-1 -translate-x-1/2 select-none">
                          {String(Math.floor(hm / 60)).padStart(2, '0')}:00
                        </span>
                        <div className="w-px flex-1 bg-gray-200" />
                      </div>
                    ))}

                    {/* ── GAP highlight strips (behind schedule blocks) ── */}
                    {sorted.slice(0, -1).map((item, gi) => {
                      const gapStartMins = toMins(item.data[SCHEDULE.TIME_END]);
                      const gapEndMins   = toMins(sorted[gi + 1].data[SCHEDULE.TIME_START]);
                      const gapMins      = gapEndMins - gapStartMins;
                      if (gapMins < 15) return null;
                      return (
                        <div
                          key={`gap-${gi}`}
                          title={`ว่าง ${gapMins} นาที — กดเพื่อจองช่วงนี้`}
                          onClick={() => handleBookGap({
                            fromTime: item.data[SCHEDULE.TIME_END],
                            toTime:   sorted[gi + 1].data[SCHEDULE.TIME_START],
                            mins:     gapMins,
                          })}
                          style={{
                            position: 'absolute',
                            top: '14px',
                            height: '30px',
                            left:  pct(gapStartMins),
                            width: `calc(${pct(gapEndMins)} - ${pct(gapStartMins)})`,
                          }}
                          className="rounded-[4px] border border-dashed border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 cursor-pointer transition-colors flex items-center justify-center group/gap"
                        >
                          <span className="text-[8px] text-emerald-600 font-bold opacity-0 group-hover/gap:opacity-100 transition-opacity select-none whitespace-nowrap">
                            + {gapMins} น.
                          </span>
                        </div>
                      );
                    })}

                    {/* ── Schedule blocks ── */}
                    {selectedDateSchedules.map((item, idx) => {
                      const s          = item.data;
                      const startMins  = toMins(s[SCHEDULE.TIME_START]);
                      const endMins    = toMins(s[SCHEDULE.TIME_END]);
                      const logged     = item.isGroupCard
                        ? item.groupMembers.every((m) =>
                            selectedDateSessions.some((se) => se[SESSION.STUDENT_ID] === m.data[SCHEDULE.STUDENT_ID]),
                          )
                        : selectedDateSessions.some((se) => se[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]);
                      const partialLogged = item.isGroupCard && !logged &&
                        item.groupMembers.some((m) =>
                          selectedDateSessions.some((se) => se[SESSION.STUDENT_ID] === m.data[SCHEDULE.STUDENT_ID]),
                        );
                      const bg           = logged ? '#dcfce7' : partialLogged ? '#fef3c7' : STUDENT_COLORS[idx % STUDENT_COLORS.length];
                      const fg           = logged ? '#166534' : partialLogged ? '#92400e' : STUDENT_TEXT_COLORS[idx % STUDENT_TEXT_COLORS.length];
                      const grpInfo      = item.isGroupCard ? (groups || []).find((g) => g[GROUP.ID] === item.groupId) : null;
                      const displayName  = item.isGroupCard
                        ? (grpInfo?.[GROUP.NAME] || 'กลุ่ม')
                        : getStudentName(s[SCHEDULE.STUDENT_ID]);
                      return (
                        <div
                          key={idx}
                          title={`${displayName} · ${s[SCHEDULE.TIME_START]}–${s[SCHEDULE.TIME_END]}`}
                          style={{
                            position: 'absolute',
                            top: '14px',
                            height: '30px',
                            left:  pct(startMins),
                            width: `calc(${pct(endMins)} - ${pct(startMins)})`,
                            background: bg,
                            color: fg,
                          }}
                          className="rounded-[5px] px-2 flex items-center overflow-hidden shadow-sm border border-white/60 cursor-default z-10"
                        >
                          <span className="text-[10px] font-bold truncate leading-none flex items-center gap-0.5">
                            {logged ? <Check className="w-2.5 h-2.5 inline" /> : ''}{item.isGroupCard ? <Users className="w-2.5 h-2.5 inline mr-0.5" /> : ''}
                            {displayName.split(' ')[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Gap label row below track ── */}
                  {gapSlots.length > 0 && (
                    <div className="relative w-full mt-1.5" style={{ height: '16px' }}>
                      {sorted.slice(0, -1).map((item, gi) => {
                        const gapStartMins = toMins(item.data[SCHEDULE.TIME_END]);
                        const gapEndMins   = toMins(sorted[gi + 1].data[SCHEDULE.TIME_START]);
                        const gapMins      = gapEndMins - gapStartMins;
                        if (gapMins < 15) return null;
                        const midPct = (((gapStartMins + gapEndMins) / 2 - minTime) / totalSpan) * 100;
                        return (
                          <button
                            key={gi}
                            type="button"
                            onClick={() => handleBookGap({
                              fromTime: item.data[SCHEDULE.TIME_END],
                              toTime:   sorted[gi + 1].data[SCHEDULE.TIME_START],
                              mins:     gapMins,
                            })}
                            className="absolute text-[9px] text-emerald-600 font-semibold -translate-x-1/2 whitespace-nowrap hover:text-emerald-700 transition-colors cursor-pointer underline-offset-2 hover:underline"
                            style={{ left: `${midPct}%` }}
                          >
                            ว่าง {gapMins} น.
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Gap quick-book pills (below timeline) */}
                {gapSlots.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {gapSlots.map((gap, gi) => (
                      <button
                        key={gi}
                        type="button"
                        onClick={() => handleBookGap(gap)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full hover:bg-emerald-100 active:scale-95 transition-all"
                      >
                        <span className="w-2 h-2 rounded-sm border border-emerald-500 inline-block flex-shrink-0" />
                        ว่าง {gap.fromTime}–{gap.toTime} ({gap.mins} น.) — จองช่วงนี้
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ================================================================
              SCHEDULE CARDS
          ================================================================ */}
          {selectedDateSchedules.map((item, idx) => {
            const s = item.data;
            const startMins = toMins(s[SCHEDULE.TIME_START]);
            const endMins   = toMins(s[SCHEDULE.TIME_END]);
            const classKey  = `zw_started_${item.isGroupCard ? item.groupId : s[SCHEDULE.ID]}_${selectedDate}`;
            const hasStarted = isToday && startedClasses.has(classKey);
            const grpInfoCard = item.isGroupCard ? groups.find(g => g[GROUP.ID] === item.groupId) : null;
            const effectiveZoomLink = item.isGroupCard ? (grpInfoCard?.[GROUP.ZOOM_LINK] || zoomLink) : zoomLink;

            // Portal link data — individual cards only
            const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
            const schedStudent = !item.isGroupCard ? students.find(st => st[STUDENT.ID] === s[SCHEDULE.STUDENT_ID]) : null;
            const stuCode = schedStudent ? buildStudentLoginCode(schedStudent[STUDENT.NICKNAME], schedStudent[STUDENT.NAME]) : '';
            const portalUrl = stuCode
              ? classCode
                ? `${window.location.origin}/portal?class=${encodeURIComponent(classCode)}&code=${stuCode}`
                : `${window.location.origin}/portal?code=${stuCode}`
              : `${window.location.origin}/portal`;
            const portalShareMsg = schedStudent && stuCode
              ? buildPortalMessage({
                  studentName: schedStudent[STUDENT.NICKNAME] || schedStudent[STUDENT.NAME],
                  subject: s[SCHEDULE.SUBJECT],
                  timeStart: s[SCHEDULE.TIME_START],
                  timeEnd: s[SCHEDULE.TIME_END],
                  portalUrl,
                  stuCode,
                  settingsRow,
                })
              : '';
            const groupPortalUrl = classCode
              ? `${window.location.origin}/portal?class=${encodeURIComponent(classCode)}`
              : `${window.location.origin}/portal`;
            const groupPortalShareMsg = item.isGroupCard && grpInfoCard
              ? buildGroupPortalMessage({
                  groupName: grpInfoCard[GROUP.NAME] || '',
                  studentName: '',
                  subject: s[SCHEDULE.SUBJECT] || '',
                  timeStart: s[SCHEDULE.TIME_START] || '',
                  timeEnd: s[SCHEDULE.TIME_END] || '',
                  portalUrl: groupPortalUrl,
                  stuCode: '',
                  settingsRow,
                })
              : '';
            const zoomShareMsg = buildZoomMessage({
              studentName: item.isGroupCard
                ? (grpInfoCard?.[GROUP.NAME] || 'กลุ่ม')
                : getStudentName(s[SCHEDULE.STUDENT_ID]),
              subject: s[SCHEDULE.SUBJECT] || '',
              timeStart: s[SCHEDULE.TIME_START] || '',
              timeEnd: s[SCHEDULE.TIME_END] || '',
              zoomLink: effectiveZoomLink,
            });

            const shareOrCopy = async (text, successMsg) => {
              if (navigator.share) {
                try { await navigator.share({ text }); return; }
                catch (e) { if (e.name === 'AbortError') return; }
              }
              await copyText(text);
              toast?.(successMsg || 'คัดลอกแล้ว', 'success');
            };

            const handleSendPortalLine = async () => {
              if (!canSendLine(settingsRow)) { toast?.('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error'); return; }
              if (!schedStudent) { toast?.('ไม่พบข้อมูลนักเรียน', 'error'); return; }
              const lineUserId = schedStudent[STUDENT_LINE_USER_ID];
              if (!lineUserId) { toast?.(`${schedStudent[STUDENT.NAME] || ''} ยังไม่ได้เชื่อมต่อ LINE ครับ`, 'error'); return; }
              try {
                await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, portalShareMsg);
                toast?.('ส่ง LINE สำเร็จ', 'success');
              } catch (err) { toastLineError(toast, err); }
            };

            const handleSendGroupLine = async () => {
              if (!canSendLine(settingsRow)) { toast?.('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error'); return; }
              let sent = 0;
              for (const m of item.groupMembers) {
                const mStudent = students.find(st => st[STUDENT.ID] === m.data[SCHEDULE.STUDENT_ID]);
                const lineUserId = mStudent?.[STUDENT_LINE_USER_ID];
                if (!lineUserId) continue;
                const mStuCode = mStudent ? buildStudentLoginCode(mStudent[STUDENT.NICKNAME], mStudent[STUDENT.NAME]) : '';
                const mPortalUrl = mStuCode
                  ? `${window.location.origin}/portal?code=${mStuCode}`
                  : `${window.location.origin}/portal`;
                const msg = buildGroupPortalMessage({
                  groupName: grpInfoCard?.[GROUP.NAME],
                  studentName: mStudent?.[STUDENT.NICKNAME] || mStudent?.[STUDENT.NAME],
                  subject: s[SCHEDULE.SUBJECT],
                  timeStart: s[SCHEDULE.TIME_START],
                  timeEnd: s[SCHEDULE.TIME_END],
                  portalUrl: mPortalUrl,
                  stuCode: mStuCode,
                });
                try {
                  await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, msg);
                  sent++;
                } catch (_) {}
              }
              if (sent > 0) toast?.(`ส่ง LINE สำเร็จ ${sent} คน`, 'success');
              else toast?.('ไม่พบนักเรียนที่เชื่อมต่อ LINE ครับ', 'error');
            };

            // Rank-based: the Nth session for a student maps to the Nth schedule (by start time).
            // This prevents a session from class A making a newly-added class B appear as logged.
            const individualRank = !item.isGroupCard
              ? selectedDateSchedules
                  .filter((it) => !it.isGroupCard && it.data[SCHEDULE.STUDENT_ID] === s[SCHEDULE.STUDENT_ID])
                  .findIndex((it) => it.data[SCHEDULE.ID] === s[SCHEDULE.ID]) + 1  // 1-based
              : 0;
            const studentSessionsToday = !item.isGroupCard
              ? selectedDateSessions.filter((se) => se[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]).length
              : 0;

            const alreadyLogged = item.isGroupCard
              ? item.groupMembers.every((m) =>
                  selectedDateSessions.some((se) => se[SESSION.STUDENT_ID] === m.data[SCHEDULE.STUDENT_ID]),
                )
              : individualRank > 0 && individualRank <= studentSessionsToday;

            const partialLogged = item.isGroupCard && !alreadyLogged &&
              item.groupMembers.some((m) =>
                selectedDateSessions.some((se) => se[SESSION.STUDENT_ID] === m.data[SCHEDULE.STUDENT_ID]),
              );
            const grpInfo = grpInfoCard;

            return (
              <div
                key={idx}
                className={`flex flex-col bg-white rounded-[14px] border transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.07)]
                  ${alreadyLogged ? 'border-green-200' : partialLogged ? 'border-amber-200' : 'border-gray-200'}`}
              >
                {/* ── Card header ── */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-t-[13px] border-b
                    ${alreadyLogged
                      ? 'bg-green-50 border-green-100'
                      : partialLogged
                        ? 'bg-amber-50 border-amber-100'
                        : 'bg-gray-50/70 border-gray-100'}`}
                >
                  {/* Time block */}
                  <div className="flex-shrink-0 text-center min-w-[58px]">
                    <p className="font-extrabold text-gray-900 text-[18px] leading-tight tabular-nums">
                      {s[SCHEDULE.TIME_START] || '--:--'}
                    </p>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      ถึง {s[SCHEDULE.TIME_END] || '--:--'}
                    </p>
                  </div>

                  <div className="w-px h-8 bg-gray-200" />

                  {/* Name / group info */}
                  <div className="flex-1 min-w-0">
                    {item.isGroupCard ? (
                      <>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold border border-purple-200 whitespace-nowrap">
                            <Users className="w-3 h-3 inline mr-0.5" />{grpInfo?.[GROUP.NAME] || 'กลุ่ม'}
                          </span>
                          <span className="text-[12px] text-gray-500">{item.groupMembers.length} คน</span>
                        </div>
                        {s[SCHEDULE.SUBJECT] && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{s[SCHEDULE.SUBJECT]}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.groupMembers.map((m, mi) => {
                            const memberLogged = selectedDateSessions.some(
                              (se) => se[SESSION.STUDENT_ID] === m.data[SCHEDULE.STUDENT_ID],
                            );
                            return (
                              <span
                                key={mi}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                                  ${memberLogged ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                              >
                                {memberLogged && <Check className="w-2.5 h-2.5 inline mr-0.5" />}{getStudentName(m.data[SCHEDULE.STUDENT_ID])}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-gray-900 text-[15px] truncate">
                          {getStudentName(s[SCHEDULE.STUDENT_ID])}
                        </p>
                        {s[SCHEDULE.SUBJECT] && (
                          <span className="inline-block text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-[4px] font-medium mt-0.5">
                            {s[SCHEDULE.SUBJECT]}
                          </span>
                        )}
                        {!item.isGroupCard && waitingRoomStatusMap?.[s[SCHEDULE.STUDENT_ID]] === 'waiting' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            นักเรียนรออยู่
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {isToday && (() => {
                      const startM = toMins(s[SCHEDULE.TIME_START]);
                      const endM   = toMins(s[SCHEDULE.TIME_END]);
                      if (bangkokNowMins < startM) {
                        return (
                          <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 whitespace-nowrap">
                            เริ่มใน {formatMins(startM - bangkokNowMins)}
                          </span>
                        );
                      } else if (bangkokNowMins <= endM) {
                        if (!hasStarted) {
                          return (
                            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200 whitespace-nowrap">
                              รอเริ่ม · เหลือ {formatMins(endM - bangkokNowMins)}
                            </span>
                          );
                        }
                        return (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                            กำลังสอน · เหลือ {formatMins(endM - bangkokNowMins)}
                          </span>
                        );
                      } else {
                        return (
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                            จบแล้ว {formatMins(bangkokNowMins - endM)}ที่แล้ว
                          </span>
                        );
                      }
                    })()}
                    <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {s[SCHEDULE.HOURS]} ชม.
                    </span>
                    {s[SCHEDULE.GCAL_EVENT_ID] && (
                      <span title="Synced กับ Google Calendar" className="text-[11px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100 flex items-center">
                        <CalendarCheck className="w-3 h-3" />
                      </span>
                    )}
                    {alreadyLogged && (
                      <span className="text-[11px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> บันทึกแล้ว
                      </span>
                    )}
                    {partialLogged && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <Hourglass className="w-3 h-3" /> บางส่วน
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Card footer: actions ── */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    {s[SCHEDULE.REPEAT_TYPE] !== 'none' && s[SCHEDULE.REPEAT_TYPE] && (
                      <p className="text-[12px] text-blue-600 font-medium flex items-center gap-1">
                        <Repeat className="w-3.5 h-3.5" /> {s[SCHEDULE.REPEAT_TYPE] === 'weekly' ? 'ทุกสัปดาห์' : 'ทุก 2 สัปดาห์'}
                        {s[SCHEDULE.REPEAT_UNTIL] && (
                          <span className="text-gray-400">ถึง {s[SCHEDULE.REPEAT_UNTIL]}</span>
                        )}
                      </p>
                    )}
                    {s[SCHEDULE.NOTE] && (
                      <p className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-1"><FileText className="w-3 h-3 flex-shrink-0" /> {s[SCHEDULE.NOTE]}</p>
                    )}
                  </div>

                  <div className="flex gap-2 ml-auto items-center">
                    {/* บันทึกคาบ */}
                    {!alreadyLogged && selectedDate <= todayStr && (
                      item.isGroupCard ? (
                        (() => {
                          const unlogged = item.groupMembers.filter(
                            (m) => !selectedDateSessions.some(
                              (se) => se[SESSION.STUDENT_ID] === m.data[SCHEDULE.STUDENT_ID],
                            ),
                          );
                          if (unlogged.length === 0) return null;
                          if (unlogged.length === 1) return (
                            <button
                              onClick={() => onLogSession(unlogged[0].data, selectedDate)}
                              className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold rounded-[7px] transition-all active:scale-95 whitespace-nowrap"
                            >
                              <Pencil className="w-3 h-3 inline mr-1" />{getStudentName(unlogged[0].data[SCHEDULE.STUDENT_ID])}
                            </button>
                          );
                          return (
                            <div className="relative group/logmenu">
                              <button className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold rounded-[7px] transition-all active:scale-95 whitespace-nowrap flex items-center gap-1">
                                <Pencil className="w-3 h-3" /> บันทึก ({unlogged.length}) <span className="text-[9px]">▼</span>
                              </button>
                              <div className="absolute left-0 top-[110%] z-[9999] bg-white border border-gray-200 rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] py-1 min-w-[140px] hidden group-hover/logmenu:block">
                                {unlogged.map((m, mi) => (
                                  <button
                                    key={mi}
                                    onClick={() => onLogSession(m.data, selectedDate)}
                                    className="w-full text-left px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2 transition-colors"
                                  >
                                    <span className="text-[10px] w-4 h-4 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">
                                      {mi + 1}
                                    </span>
                                    {getStudentName(m.data[SCHEDULE.STUDENT_ID])}
                                  </button>
                                ))}
                                <div className="border-t border-gray-100 mt-1 pt-1">
                                  <button
                                    onClick={() => unlogged.forEach((m) => onLogSession(m.data, selectedDate))}
                                    className="w-full text-left px-3 py-2 text-[12px] font-semibold text-green-700 hover:bg-green-50 flex items-center gap-2 transition-colors"
                                  >
                                    <Pencil className="w-3 h-3" /> บันทึกทุกคน
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <button onClick={() => onLogSession(s, selectedDate)} className={btnSuccess}>
                          <Pencil className="w-3.5 h-3.5" /> บันทึกคาบ
                        </button>
                      )
                    )}

                    {/* Start Class — single primary split button (Zoom-first) */}
                    {(() => {
                      if (isToday && bangkokNowMins > endMins) return null;
                      const videoCallEnabled = isVideoCallEnabled(settingsRow);
                      const groupNames = item.isGroupCard
                        ? item.groupMembers.map(m => getStudentName(m.data[SCHEDULE.STUDENT_ID])).join(', ')
                        : '';
                      const classroomAction = item.isGroupCard
                        ? () => { markClassStarted(classKey); setLauncherCall?.({ scheduleId: item.groupId, studentName: groupNames, isGroup: true, groupId: item.groupId, groupMembers: item.groupMembers.map(m => ({ id: m.data[SCHEDULE.STUDENT_ID], name: getStudentName(m.data[SCHEDULE.STUDENT_ID]) })) }); }
                        : () => { markClassStarted(classKey); setLauncherCall?.({ scheduleId: s[SCHEDULE.STUDENT_ID], studentName: getStudentName(s[SCHEDULE.STUDENT_ID]) }); };
                      const sendLineAction = item.isGroupCard ? handleSendGroupLine : handleSendPortalLine;
                      const effectiveShareMsg = item.isGroupCard ? groupPortalShareMsg : portalShareMsg;
                      const effectiveCopyUrl = item.isGroupCard ? groupPortalUrl : portalUrl;
                      const dropdownItems = [
                        // Portal section — always shown
                        { icon: <Copy className="w-4 h-4" />, label: 'คัดลอกข้อความ', action: () => { copyText(effectiveShareMsg || effectiveCopyUrl); toast?.('คัดลอกข้อความแล้ว', 'success'); } },
                        { icon: <Send className="w-4 h-4" />, label: 'ส่ง LINE', action: sendLineAction },
                        ...(effectiveShareMsg ? [
                          { icon: <Share2 className="w-4 h-4" />, label: 'แชร์ข้อความ', action: () => shareOrCopy(effectiveShareMsg, 'คัดลอกข้อความแล้ว') },
                        ] : []),
                        // Zoom section vs Classroom section — mutually exclusive by mode,
                        // never both (a school in one mode shouldn't see the other's actions)
                        ...(videoCallEnabled ? [
                          { divider: true },
                          { icon: <Video className="w-4 h-4" />, label: 'เปิด Classroom', action: classroomAction },
                        ] : effectiveZoomLink ? [
                          { divider: true },
                          { icon: <Video className="w-4 h-4" />, label: 'เปิด Zoom', action: () => { markClassStarted(classKey); onStartClass?.(effectiveZoomLink); } },
                          { icon: <Copy className="w-4 h-4" />, label: 'คัดลอกลิงก์ Zoom', action: () => { copyText(effectiveZoomLink); toast?.('คัดลอกลิงก์ Zoom แล้ว', 'success'); } },
                        ] : []),
                      ];
                      if (dropdownItems.filter(i => !i.divider).length === 0) return null;
                      return (
                        <LinkShareDropdown
                          label="Start Class"
                          icon={<Video className="w-3.5 h-3.5" />}
                          variant="primary"
                          onPrimaryAction={() => {
                            markClassStarted(classKey);
                            if (videoCallEnabled) {
                              classroomAction();
                            } else {
                              onStartClass?.(effectiveZoomLink);
                            }
                          }}
                          items={dropdownItems}
                        />
                      );
                    })()}

                    {/* ⋯ Row actions menu */}
                    <RowActionsMenu items={[
                      {
                        label: 'แจ้งเตือน: เริ่มเรียนแล้ว',
                        icon: <Bell className="w-3.5 h-3.5" />,
                        hidden: item.isGroupCard,
                        onClick: async () => {
                          const name = getStudentName(s[SCHEDULE.STUDENT_ID]);
                          const result = await sendPushToStudent(
                            s[SCHEDULE.STUDENT_ID],
                            'เริ่มเรียนแล้ว!',
                            `${name} — คาบ ${s[SCHEDULE.TIME_START]}–${s[SCHEDULE.TIME_END]} น. เริ่มแล้ว`,
                          );
                          toast?.(result.ok ? `ส่งแจ้งเตือน ${name} แล้ว` : `แจ้งเตือนไม่สำเร็จ: ${result.error}`, result.ok ? 'success' : 'error');
                        },
                      },
                      {
                        label: 'ส่งแจ้งเตือนก่อนเรียน',
                        icon: <Send className="w-3.5 h-3.5" />,
                        onClick: () => onSendZoomLink(s, selectedDate, item.isGroupCard ? item.groupId : null),
                      },
                      {
                        label: 'เลื่อนเวลาคาบนี้', icon: <Clock className="w-3.5 h-3.5" />,
                        hidden: item.isGroupCard,
                        onClick: () => onRescheduleTime(s, selectedDate),
                      },
                      {
                        label: 'แก้ไขตารางสอน', icon: <Pencil className="w-3.5 h-3.5" />,
                        hidden: item.isGroupCard,
                        onClick: () => { setEditingSchedule(item); setShowForm(true); },
                      },
                      {
                        label: 'ยกเลิกทั้งกลุ่ม', icon: <Ban className="w-3.5 h-3.5" />, colorClass: 'text-orange-600',
                        hidden: !item.isGroupCard,
                        onClick: () => item.groupMembers.forEach((m) => onCancelClass(m.data, m.rowIndex, selectedDate)),
                      },
                      {
                        label: 'ยกเลิกคลาสนี้', icon: <Ban className="w-3.5 h-3.5" />, colorClass: 'text-orange-600',
                        hidden: item.isGroupCard,
                        onClick: () => onCancelClass(s, item.rowIndex, selectedDate),
                      },
                      {
                        label: 'ลบกลุ่มถาวร', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true,
                        hidden: !item.isGroupCard,
                        onClick: () => item.groupMembers.forEach((m) => onDeleteSchedule(m.data, m.rowIndex)),
                      },
                      {
                        label: 'ลบถาวร', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true,
                        hidden: item.isGroupCard,
                        onClick: () => onDeleteSchedule(s, item.rowIndex),
                      },
                    ]} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Sessions with no schedule ── */}
          {selectedDateSessions.length > 0 && selectedDateSchedules.length === 0 && (
            <div className="p-5 bg-green-50 border border-green-200 rounded-[12px]">
              <p className="text-[14px] font-semibold text-green-800 mb-3">คาบที่สอนและบันทึกแล้ว</p>
              {selectedDateSessions.map((s, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center bg-white p-4 rounded-[8px] mb-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-green-100"
                >
                  <div>
                    <p className="font-semibold text-gray-900 text-[14px]">{getStudentName(s[SESSION.STUDENT_ID])}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">{s[SESSION.SUBJECT]}</p>
                  </div>
                  <span className="font-bold text-gray-900 text-[14px]">{s[SESSION.HOURS]} ชม.</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Cancellations ── */}
          {selectedDateCancellations && selectedDateCancellations.length > 0 && (
            <div className="p-5 bg-orange-50 border border-orange-200 rounded-[12px]">
              <p className="text-[13px] font-bold text-orange-800 mb-3 flex items-center gap-1.5">
                <Ban className="w-4 h-4" /> คลาสที่ถูกยกเลิกในวันนี้
              </p>
              {selectedDateCancellations.map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 bg-white p-3.5 rounded-[8px] mb-2 border border-orange-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-[13px]">
                      {getStudentName(c[CANCELLATION.STUDENT_ID])}
                    </p>
                    <p className="text-[12px] text-orange-700 mt-0.5 font-medium">
                      เหตุผล: {c[CANCELLATION.REASON]}
                    </p>
                    {c[CANCELLATION.NOTE] && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{c[CANCELLATION.NOTE]}</p>
                    )}
                    {c[CANCELLATION.RESCHEDULED_TO] && (
                      <p className="text-[11px] text-blue-600 mt-1 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> เลื่อนไปวันที่{' '}
                        {new Date(c[CANCELLATION.RESCHEDULED_TO]).toLocaleDateString('th-TH', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-300 whitespace-nowrap pt-0.5">
                    {c[CANCELLATION.CANCELLED_AT]?.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
