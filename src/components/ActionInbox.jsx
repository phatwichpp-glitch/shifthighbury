// @ts-nocheck
import { useState } from 'react';
import { SCHEDULE, GROUP, SETTINGS, STUDENT, STUDENT_LINE_USER_ID, canSendLine, isVideoCallEnabled } from '../lib/constants';
import { buildZoomMessage, buildPortalMessage, buildGroupPortalMessage, buildStudentLoginCode, toastLineError, formatMins } from '../lib/business';
import { ShareButton } from './ui/ShareButton';
import { Pencil, Ban, Zap, Users, Send, Video, Check, X, CalendarCheck } from 'lucide-react';
import { CopyButton } from './ui/CopyButton';
import { sendLineMessage } from '../services/googleSheets';

function _BookingRequestItem({ booking, schedules, getStudentName, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [approving, setApproving] = useState(false);

  const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
  const hasConflict = (schedules || []).some(s => {
    if (s[SCHEDULE.DELETED] === 'TRUE' || s[SCHEDULE.DATE] !== booking.requestedDate) return false;
    if (!booking.timeStart || !s[SCHEDULE.TIME_START]) return false;
    const reqStart = toMins(booking.timeStart);
    const reqEnd = booking.timeEnd ? toMins(booking.timeEnd) : reqStart + 60;
    const schStart = toMins(s[SCHEDULE.TIME_START]);
    const schEnd = toMins(s[SCHEDULE.TIME_END] || s[SCHEDULE.TIME_START]);
    return reqStart < schEnd && reqEnd > schStart;
  });

  const dateLabel = new Date(booking.requestedDate + 'T12:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <div className="rounded-[14px] border border-indigo-200 bg-indigo-50/30 px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-start gap-3 mb-2.5">
        <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border leading-none bg-indigo-100 text-indigo-700 border-indigo-200">จอง</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-gray-900 text-[14px] leading-tight truncate">{booking.studentName || getStudentName?.(booking.studentId) || booking.studentId}</p>
            {hasConflict && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded-full">⚠ ชนกับตาราง</span>}
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5">
            {dateLabel}
            {booking.timeStart && ` · ${booking.timeStart}${booking.timeEnd ? `–${booking.timeEnd}` : ''}`}
            {booking.subject && ` · ${booking.subject}`}
          </p>
          {booking.note && <p className="text-[11px] text-gray-400 mt-0.5 italic">"{booking.note}"</p>}
        </div>
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <input
            type="text"
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            placeholder="เหตุผล (ถ้ามี)"
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-[9px] focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <div className="flex gap-2">
            <button
              onClick={async () => { await onReject?.(booking, rejectNote); }}
              className="flex-1 h-[38px] flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-[12px] font-semibold rounded-[10px] transition-all active:scale-95"
            >
              <X className="w-3.5 h-3.5" /> ยืนยันปฏิเสธ
            </button>
            <button onClick={() => { setRejecting(false); setRejectNote(''); }} className="px-4 h-[38px] bg-gray-100 hover:bg-gray-200 text-gray-600 text-[12px] font-semibold rounded-[10px] transition-all">
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={async () => { setApproving(true); await onApprove?.(booking); setApproving(false); }}
            disabled={approving}
            className="h-[40px] px-4 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[12px] font-semibold rounded-[10px] transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            <Check className="w-3.5 h-3.5" /> {approving ? 'กำลังอนุมัติ…' : 'อนุมัติ'}
          </button>
          <button
            onClick={() => setRejecting(true)}
            className="h-[40px] px-4 flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-[12px] font-semibold rounded-[10px] transition-all active:scale-95 whitespace-nowrap border border-red-200 shadow-sm"
          >
            <X className="w-3.5 h-3.5" /> ปฏิเสธ
          </button>
        </div>
      )}
    </div>
  );
}

function _OverdueItem({ item, getStudentName, onLogSession, onCancelClass }) {
  const s = item.data;
  const dateLabel = item.isToday
    ? <><span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1" />วันนี้</>
    : new Date(item.dateStr + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-[14px] border px-4 py-3.5 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${item.isToday ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border leading-none ${item.isToday ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
          {item.isToday ? 'วันนี้' : 'ค้าง'}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-[14px] leading-tight truncate">{getStudentName(s[SCHEDULE.STUDENT_ID])}</p>
          <p className="text-[12px] text-gray-500 mt-0.5">{dateLabel}{' · '}{s[SCHEDULE.TIME_START]}–{s[SCHEDULE.TIME_END]}{' · '}{s[SCHEDULE.HOURS]} ชม.</p>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0 sm:ml-auto">
        <button onClick={() => onLogSession(s, item.dateStr)} className="h-[48px] px-4 flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white text-[13px] font-semibold rounded-[11px] transition-all active:scale-95 whitespace-nowrap shadow-sm"><Pencil className="w-3.5 h-3.5" /> บันทึก</button>
        <button onClick={() => onCancelClass(s, item.rowIndex, item.dateStr)} className="h-[48px] px-4 flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[13px] font-semibold rounded-[11px] transition-all active:scale-95 whitespace-nowrap border border-orange-200 shadow-sm"><Ban className="w-3.5 h-3.5" /> ยกเลิก</button>
      </div>
    </div>
  );
}

function _OverdueGroupCard({ item, getStudentName, onLogSession, onCancelClass, groups }) {
  const grp = (groups || []).find(g => g[GROUP.ID] === item.groupId);
  const groupName = grp?.[GROUP.NAME] || 'กลุ่ม';
  const s = item.data;
  const dateLabel = item.isToday
    ? 'วันนี้'
    : new Date(item.dateStr + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return (
    <div className={`rounded-[14px] border px-4 py-3.5 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${item.isToday ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border leading-none ${item.isToday ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
          {item.isToday ? 'วันนี้' : 'ค้าง'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1"><Users className="w-3 h-3" /> กลุ่ม</span>
            <p className="font-semibold text-gray-900 text-[14px] leading-tight">{groupName}</p>
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5">{dateLabel} · {s[SCHEDULE.TIME_START]}–{s[SCHEDULE.TIME_END]} · {s[SCHEDULE.HOURS]} ชม.</p>
        </div>
        <button onClick={() => onCancelClass(s, item.rowIndex, item.dateStr)} className="flex-shrink-0 h-[36px] px-3 flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[12px] font-semibold rounded-[10px] transition-all active:scale-95 whitespace-nowrap border border-orange-200 shadow-sm"><Ban className="w-3.5 h-3.5" /> ยกเลิก</button>
      </div>
      <div className="mt-2.5 ml-8 border-l-2 border-amber-200/60 pl-3 space-y-1.5">
        {(item.groupMembers || []).map((m, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-gray-700 truncate">{getStudentName(m.data[SCHEDULE.STUDENT_ID])}</span>
            <button onClick={() => onLogSession(m.data, m.dateStr)} className="flex-shrink-0 h-[34px] px-3 flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white text-[12px] font-semibold rounded-[9px] transition-all active:scale-95 shadow-sm"><Pencil className="w-3 h-3" /> บันทึก</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function _UpcomingItem({ item, getStudentName, todayStr, nowMins, zoomLink, groups, settingsRow, students, onStartClass, onLaunchClassroom, waitingRoomStatusMap, toast }) {
  const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
  const s = item.data;
  const grp = item.isGroupCard ? (groups || []).find((g) => g[GROUP.ID] === item.groupId) : null;
  const displayName = item.isGroupCard ? (grp?.[GROUP.NAME] || 'กลุ่ม') : getStudentName(s[SCHEDULE.STUDENT_ID]);
  const diff = toMins(s[SCHEDULE.TIME_START]) - nowMins;
  const isOngoing = diff <= 0;
  const isImminent = diff > 0 && diff <= 10;
  const videoCallEnabled = isVideoCallEnabled(settingsRow);
  const effectiveZoomLink = item.isGroupCard ? (grp?.[GROUP.ZOOM_LINK] || zoomLink) : zoomLink;
  const studentWaiting = !item.isGroupCard && waitingRoomStatusMap?.[s[SCHEDULE.STUDENT_ID]] === 'waiting';

  const handleSendLine = async () => {
    if (!canSendLine(settingsRow)) {
      toast?.('LINE OA ถูกปิดหรือยังไม่ได้ตั้งค่า — ตรวจสอบที่หน้าตั้งค่าครับ', 'error');
      return;
    }
    if (item.isGroupCard) {
      let sent = 0;
      for (const m of (item.groupMembers || [])) {
        const mStudent = (students || []).find(st => st[STUDENT.ID] === m.data[SCHEDULE.STUDENT_ID]);
        const lineUserId = mStudent?.[STUDENT_LINE_USER_ID];
        if (!lineUserId) continue;
        const mStuCode = mStudent ? buildStudentLoginCode(mStudent[STUDENT.NICKNAME], mStudent[STUDENT.NAME]) : '';
        const mClassCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
        const mPortalUrl = mStuCode
          ? (mClassCode ? `${window.location.origin}/portal?class=${encodeURIComponent(mClassCode)}&code=${mStuCode}` : `${window.location.origin}/portal?code=${mStuCode}`)
          : `${window.location.origin}/portal`;
        const msg = buildGroupPortalMessage({
          groupName: grp?.[GROUP.NAME],
          studentName: mStudent?.[STUDENT.NICKNAME] || mStudent?.[STUDENT.NAME],
          subject: s[SCHEDULE.SUBJECT],
          timeStart: s[SCHEDULE.TIME_START],
          timeEnd: s[SCHEDULE.TIME_END],
          portalUrl: mPortalUrl,
          stuCode: mStuCode,
          settingsRow,
        });
        try {
          await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, msg);
          sent++;
        } catch (_) {}
      }
      if (sent > 0) toast?.(`ส่ง LINE สำเร็จ ${sent} คน`, 'success');
      else toast?.('ไม่พบนักเรียนที่เชื่อมต่อ LINE ครับ', 'error');
    } else {
      const student = (students || []).find(st => st[STUDENT.ID] === s[SCHEDULE.STUDENT_ID]);
      if (!student) { toast?.('ไม่พบข้อมูลนักเรียน', 'error'); return; }
      const lineUserId = student[STUDENT_LINE_USER_ID];
      if (!lineUserId) { toast?.(`${student[STUDENT.NAME] || ''} ยังไม่ได้เชื่อมต่อ LINE ครับ`, 'error'); return; }
      const stuCode = buildStudentLoginCode(student[STUDENT.NICKNAME], student[STUDENT.NAME]);
      const classCode = settingsRow?.[SETTINGS.CLASS_CODE] || '';
      const portalUrl = stuCode
        ? (classCode ? `${window.location.origin}/portal?class=${encodeURIComponent(classCode)}&code=${stuCode}` : `${window.location.origin}/portal?code=${stuCode}`)
        : `${window.location.origin}/portal`;
      const msg = buildPortalMessage({
        studentName: student[STUDENT.NICKNAME] || student[STUDENT.NAME],
        subject: s[SCHEDULE.SUBJECT],
        timeStart: s[SCHEDULE.TIME_START],
        timeEnd: s[SCHEDULE.TIME_END],
        portalUrl,
        stuCode,
        settingsRow,
      });
      try {
        await sendLineMessage(settingsRow[SETTINGS.LINE_WORKER_URL], settingsRow[SETTINGS.LINE_TOKEN], lineUserId, msg);
        toast?.('ส่ง LINE สำเร็จ', 'success');
      } catch (err) { toastLineError(toast, err); }
    }
  };

  const handleJoinClassroom = () => {
    if (item.isGroupCard) {
      onLaunchClassroom?.({ scheduleId: item.groupId, studentName: displayName });
    } else {
      onLaunchClassroom?.({ scheduleId: s[SCHEDULE.STUDENT_ID], studentName: displayName });
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-[14px] border px-4 py-3.5 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${item.isGroupCard ? 'border-purple-200 bg-purple-50/20' : 'border-blue-200 bg-blue-50/20'} ${isOngoing ? 'ring-2 ring-red-400/40' : ''}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border leading-none whitespace-nowrap ${isOngoing ? 'bg-red-100 text-red-700 border-red-200' : isImminent ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
          {isOngoing ? <><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> ถึงเวลา!</> : isImminent ? <><Zap className="w-3 h-3 inline" /> {formatMins(diff)}</> : `อีก ${formatMins(diff)}`}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.isGroupCard && <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1"><Users className="w-3 h-3" /> กลุ่ม</span>}
            <p className="font-semibold text-gray-900 text-[14px] leading-tight truncate">{displayName}</p>
            {studentWaiting && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">นักเรียนรออยู่</span>
            )}
          </div>
          {item.isGroupCard && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{(item.groupMembers || []).map((m) => getStudentName(m.data[SCHEDULE.STUDENT_ID])).join(', ')}</p>}
          <p className="text-[12px] text-gray-500 mt-0.5">{s[SCHEDULE.TIME_START]}–{s[SCHEDULE.TIME_END]}{s[SCHEDULE.SUBJECT] ? ` · ${s[SCHEDULE.SUBJECT]}` : ''}</p>
        </div>
      </div>
      <div className="flex-shrink-0 sm:ml-auto flex items-center gap-1.5 flex-wrap justify-end">
        {canSendLine(settingsRow) && (
          <button
            onClick={handleSendLine}
            className="h-[40px] px-3.5 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-[12px] font-semibold rounded-[10px] transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            <Send className="w-3.5 h-3.5" /> ส่ง LINE
          </button>
        )}
        {videoCallEnabled && onLaunchClassroom && (
          <button
            onClick={handleJoinClassroom}
            className="h-[40px] px-3.5 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold rounded-[10px] transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            <Video className="w-3.5 h-3.5" /> เข้าห้องเรียน
          </button>
        )}
        {!videoCallEnabled && effectiveZoomLink && onStartClass && (
          <button
            onClick={() => onStartClass(effectiveZoomLink)}
            className="h-[40px] px-3.5 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold rounded-[10px] transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            <Video className="w-3.5 h-3.5" /> Start Class
          </button>
        )}
      </div>
    </div>
  );
}

export function ActionInbox({ overdueSchedules, todaySchedules, getStudentName, todayStr, nowMins, zoomLink, onLogSession, onCancelClass, onSendZoomLink, sendingZoomFor, groups, students, settingsRow, onStartClass, onLaunchClassroom, waitingRoomStatusMap, toast, bookingRequests, schedules, onApproveBooking, onRejectBooking }) {
  const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };

  const rawOverdue = (overdueSchedules || []).map((item) => ({
    type: 'overdue', sortKey: item.dateStr + '_' + (item.data[SCHEDULE.TIME_START] || '00:00'),
    dateStr: item.dateStr, data: item.data, rowIndex: item.rowIndex, isToday: item.dateStr === todayStr,
  })).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const overdueItems = [];
  const seenOverdue = new Map();
  for (const item of rawOverdue) {
    const gid = item.data[SCHEDULE.GROUP_ID] || '';
    if (gid) {
      const key = `${gid}__${item.dateStr}__${item.data[SCHEDULE.TIME_START]}`;
      if (seenOverdue.has(key)) { overdueItems[seenOverdue.get(key)].groupMembers.push(item); }
      else { seenOverdue.set(key, overdueItems.length); overdueItems.push({ ...item, isGroupCard: true, groupId: gid, groupMembers: [item] }); }
    } else { overdueItems.push({ ...item, isGroupCard: false, groupMembers: [] }); }
  }

  const raw = (todaySchedules || []).filter((item) => toMins(item.data[SCHEDULE.TIME_END]) > nowMins).sort((a, b) => toMins(a.data[SCHEDULE.TIME_START]) - toMins(b.data[SCHEDULE.TIME_START]));
  const mergedUpcoming = [];
  const seen = new Map();
  for (const item of raw) {
    const gid = item.data[SCHEDULE.GROUP_ID] || '';
    if (gid) {
      const key = `${gid}__${item.data[SCHEDULE.TIME_START]}`;
      if (seen.has(key)) { mergedUpcoming[seen.get(key)].groupMembers.push(item); }
      else { seen.set(key, mergedUpcoming.length); mergedUpcoming.push({ ...item, isGroupCard: true, groupId: gid, groupMembers: [item] }); }
    } else { mergedUpcoming.push({ ...item, isGroupCard: false, groupMembers: [] }); }
  }

  const upcomingItems = mergedUpcoming.map((item) => ({
    type: 'upcoming', sortKey: todayStr + '_' + (item.data[SCHEDULE.TIME_START] || '00:00'),
    dateStr: todayStr, data: item.data, isGroupCard: item.isGroupCard, groupId: item.groupId, groupMembers: item.groupMembers,
  }));

  const allItems = [...overdueItems, ...upcomingItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  if (allItems.length === 0) return null;

  const overdueCount = overdueItems.length;
  const upcomingCount = upcomingItems.length;

  const pendingBookings = (bookingRequests || []);

  return (
    <div className="mb-5">
      {/* Booking requests section */}
      {pendingBookings.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 px-0.5">
            <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-indigo-500" /> คำขอจองวันเรียน
            </h3>
            <span className="ml-auto text-[11px] bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded-full">{pendingBookings.length} รายการ</span>
          </div>
          <div className="flex flex-col gap-2">
            {pendingBookings.map((b, idx) => (
              <_BookingRequestItem key={idx} booking={b} schedules={schedules} getStudentName={getStudentName} onApprove={onApproveBooking} onReject={onRejectBooking} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5"> Action Inbox</h3>
        <div className="flex items-center gap-1.5 ml-auto">
          {overdueCount > 0 && <span className="text-[11px] bg-amber-100 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded-full">{overdueCount} ค้าง</span>}
          {upcomingCount > 0 && <span className="text-[11px] bg-blue-100 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full">{upcomingCount} วันนี้</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {allItems.slice(0, 8).map((item, idx) =>
          item.type === 'overdue' && item.isGroupCard
            ? <_OverdueGroupCard key={`og-${idx}`} item={item} getStudentName={getStudentName} onLogSession={onLogSession} onCancelClass={onCancelClass} groups={groups} />
            : item.type === 'overdue'
              ? <_OverdueItem key={`od-${idx}`} item={item} getStudentName={getStudentName} onLogSession={onLogSession} onCancelClass={onCancelClass} />
              : <_UpcomingItem key={`up-${idx}`} item={item} getStudentName={getStudentName} todayStr={todayStr} nowMins={nowMins} zoomLink={zoomLink} groups={groups} settingsRow={settingsRow} students={students} onStartClass={onStartClass} onLaunchClassroom={onLaunchClassroom} waitingRoomStatusMap={waitingRoomStatusMap} toast={toast} />
        )}
      </div>
      {allItems.length > 8 && <p className="text-center text-[12px] text-gray-400 font-medium mt-2">+ อีก {allItems.length - 8} รายการ — ดูได้ในปฏิทิน</p>}
    </div>
  );
}
