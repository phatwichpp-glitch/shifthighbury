// @ts-nocheck
// ============================================================
// CalendarGrid.jsx — Refactored
// Visual improvements: cleaner day cells, better density indicators,
// hover tooltip polish. Logic unchanged.
// ============================================================

import { useState, useMemo } from 'react';
import { STUDENT, SCHEDULE, SESSION, GROUP, STUDENT_COLORS, STUDENT_TEXT_COLORS } from '../lib/constants';
import { scheduleOccursOnDate } from '../lib/business';
import { Calendar, AlertTriangle, Check } from 'lucide-react';

export default function CalendarGrid({
  year,
  month,
  todayStr,
  selectedDate,
  students,
  schedules,
  sessions,
  groups = [],
  onDayClick,
  onGoToday,
}) {
  const [hoveredDate, setHoveredDate] = useState(null);

  const firstDay      = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells    = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const monthLabel    = new Date(year, month, 1).toLocaleDateString('th-TH', {
    month: 'long', year: 'numeric',
  });

  const getDateStr = (y, m, d) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const getStudentColorIndex = (id) =>
    students.findIndex((s) => s[STUDENT.ID] === id);

  const getSchedulesForDate = (dateStr) =>
    schedules.filter(
      (s) => s[SCHEDULE.DELETED] !== 'TRUE' && scheduleOccursOnDate(s, dateStr),
    );

  const getSessionsForDate = (dateStr) =>
    sessions.filter(
      (s) => s[SESSION.DATE] === dateStr && s[SESSION.DELETED] !== 'TRUE',
    );

  // ── Monthly summary ────────────────────────────────────────────────────
  const monthlySummary = useMemo(() => {
    let totalClasses = 0, unlogged = 0;
    const studentSet = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = getDateStr(year, month, d);
      const sc = getSchedulesForDate(ds);
      const se = getSessionsForDate(ds);
      totalClasses += sc.length;
      sc.forEach((s) => studentSet.add(s[SCHEDULE.STUDENT_ID]));
      if (ds <= todayStr) {
        unlogged += sc.filter(
          (s) => !se.some((se2) => se2[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]),
        ).length;
      }
    }
    return { totalClasses, students: studentSet.size, unlogged };
  }, [year, month, schedules, sessions]);

  // ── Build cells array ──────────────────────────────────────────────────
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    if (i < firstDay) {
      const d = daysInPrevMonth - firstDay + i + 1;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear  = month === 0 ? year - 1 : year;
      cells.push({ day: d, year: prevYear, month: prevMonth, overflow: 'prev' });
    } else if (i < firstDay + daysInMonth) {
      cells.push({ day: i - firstDay + 1, year, month, overflow: null });
    } else {
      const d = i - firstDay - daysInMonth + 1;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear  = month === 11 ? year + 1 : year;
      cells.push({ day: d, year: nextYear, month: nextMonth, overflow: 'next' });
    }
  }

  const isCurrentMonth =
    new Date().getFullYear() === year && new Date().getMonth() === month;

  return (
    <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] mb-6 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="text-[18px] font-bold text-gray-900 flex items-center gap-2"><Calendar className="w-5 h-5 text-gray-500" /> ปฏิทินตารางสอน</h2>
          {!isCurrentMonth && (
            <button
              onClick={onGoToday}
              className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-all"
            >
              กลับวันนี้
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDayClick(null, -1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all text-gray-600 font-bold text-[16px]"
          >‹</button>
          <span className="font-semibold text-gray-800 min-w-[130px] text-center text-[14px]">
            {monthLabel}
          </span>
          <button
            onClick={() => onDayClick(null, 1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all text-gray-600 font-bold text-[16px]"
          >›</button>
        </div>
      </div>

      {/* ── Monthly summary bar ─────────────────────────────────────────── */}
      <div className="px-5 py-2 bg-gray-50/80 border-b border-gray-100 flex gap-4 text-[11px] font-medium flex-wrap items-center">
        <span className="text-gray-400 font-semibold uppercase tracking-wide">เดือนนี้</span>
        <span className="text-blue-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
          {monthlySummary.totalClasses} คาบ
        </span>
        <span className="text-purple-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
          {monthlySummary.students} นักเรียน
        </span>
        {monthlySummary.unlogged > 0 && (
          <span className="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {monthlySummary.unlogged} ยังไม่บันทึก
          </span>
        )}
        {monthlySummary.unlogged === 0 && monthlySummary.totalClasses > 0 && (
          <span className="text-green-600 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> บันทึกครบทุกคาบ
          </span>
        )}
      </div>

      {/* ── Day name headers ────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/40">
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (
          <div
            key={d}
            className={`text-center py-2 text-[12px] font-bold tracking-wide
              ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar days ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dateStr     = getDateStr(cell.year, cell.month, cell.day);
          const isOverflow  = !!cell.overflow;
          const daySchedules = getSchedulesForDate(dateStr);
          const daySessions  = getSessionsForDate(dateStr);
          const isToday     = dateStr === todayStr;
          const isSelected  = dateStr === selectedDate;
          const isPast      = dateStr < todayStr;
          const dayOfWeek   = new Date(cell.year, cell.month, cell.day).getDay();
          const isWeekend   = dayOfWeek === 0 || dayOfWeek === 6;
          const hasUnlogged = daySchedules.length > 0
            && daySessions.length < daySchedules.length
            && dateStr <= todayStr;
          const isHovered   = hoveredDate === dateStr;
          const totalRows   = Math.ceil(cells.length / 7);
          const rowIndex    = Math.floor(i / 7);
          const isBottomRow = rowIndex >= totalRows - 2;

          // Completion ratio for the day's mini-progress indicator
          const loggedCount  = daySchedules.filter(s =>
            daySessions.some(se => se[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]),
          ).length;
          const totalCount   = daySchedules.length;
          const allLogged    = totalCount > 0 && loggedCount === totalCount;

          const handleClick = () => {
            if (cell.overflow === 'prev')      onDayClick(dateStr, -1);
            else if (cell.overflow === 'next') onDayClick(dateStr, 1);
            else                               onDayClick(dateStr, 0);
          };

          return (
            <div
              key={i}
              onClick={handleClick}
              onMouseEnter={() => setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
              className={`relative min-h-[80px] sm:min-h-[90px] p-1.5 sm:p-2 cursor-pointer border-b border-r border-gray-100 transition-all select-none group
                ${isOverflow ? 'bg-gray-50/60' : ''}
                ${isSelected && !isOverflow ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset z-10' : ''}
                ${isToday && !isSelected ? 'bg-amber-50/50' : ''}
                ${!isOverflow && !isSelected && !isToday
                  ? isPast
                    ? 'bg-white hover:bg-blue-50/20'
                    : 'bg-white hover:bg-blue-50/30'
                  : ''
                }
              `}
            >
              {/* Day number */}
              <div className={`
                text-[11px] sm:text-[12px] font-bold w-6 h-6 flex items-center justify-center rounded-full mb-0.5
                ${isOverflow ? 'text-gray-300' : ''}
                ${!isOverflow && isToday ? 'bg-blue-600 text-white shadow-sm' : ''}
                ${!isOverflow && !isToday && isWeekend
                  ? dayOfWeek === 0 ? 'text-red-400' : 'text-blue-400'
                  : ''}
                ${!isOverflow && !isToday && !isWeekend ? 'text-gray-700' : ''}
              `}>
                {cell.day}
              </div>

              {/* ── Unlogged dot (top-right) ── */}
              {hasUnlogged && !isSelected && !isOverflow && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}

              {/* ── Schedule pills ── */}
              {!isOverflow && (
                <div className="space-y-0.5">
                  {(() => {
                    const sorted = [...daySchedules].sort((a, b) => (a[SCHEDULE.TIME_START] || '').localeCompare(b[SCHEDULE.TIME_START] || ''));
                    const seenPillGroups = new Set();
                    const deduped = sorted.filter(s => {
                      const gid = s[SCHEDULE.GROUP_ID];
                      if (!gid) return true;
                      const k = `${gid}__${s[SCHEDULE.TIME_START]}`;
                      if (seenPillGroups.has(k)) return false;
                      seenPillGroups.add(k);
                      return true;
                    });
                    return (
                      <>
                        {deduped.slice(0, 2).map((s, idx) => {
                          const gid = s[SCHEDULE.GROUP_ID];
                          const grp = gid ? groups.find(g => g[GROUP.ID] === gid) : null;
                          const displayLabel = grp
                            ? (grp[GROUP.NAME] || 'กลุ่ม')
                            : ((students.find(st => st[STUDENT.ID] === s[SCHEDULE.STUDENT_ID]) || [])[STUDENT.NAME]?.split(' ')[0] || '?');
                          const logged = grp
                            ? daySchedules.filter(s2 => s2[SCHEDULE.GROUP_ID] === gid && s2[SCHEDULE.TIME_START] === s[SCHEDULE.TIME_START]).every(s2 => daySessions.some(se => se[SESSION.STUDENT_ID] === s2[SCHEDULE.STUDENT_ID]))
                            : daySessions.some(se => se[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]);
                          const ci = grp ? -1 : getStudentColorIndex(s[SCHEDULE.STUDENT_ID]);
                          return (
                            <div
                              key={idx}
                              style={{
                                background: logged ? '#dcfce7' : grp ? '#f3e8ff' : (STUDENT_COLORS[ci % STUDENT_COLORS.length] || '#D3D1C7'),
                                color: logged ? '#166534' : grp ? '#7c3aed' : (STUDENT_TEXT_COLORS[ci % STUDENT_TEXT_COLORS.length] || '#444'),
                                opacity: isPast && !logged ? 0.6 : 1,
                              }}
                              className="text-[9px] sm:text-[10px] rounded-[3px] px-1 py-0.5 truncate font-semibold leading-tight flex items-center gap-0.5"
                            >
                              {logged && <Check className="w-2 h-2 flex-shrink-0" />}
                              <span className="hidden sm:inline">
                                {s[SCHEDULE.TIME_START]?.slice(0, 5) ? s[SCHEDULE.TIME_START].slice(0, 5) + ' ' : ''}
                              </span>
                              {displayLabel}
                            </div>
                          );
                        })}
                        {deduped.length > 2 && (
                          <div className="text-[9px] text-gray-400 font-bold text-center">+{deduped.length - 2}</div>
                        )}
                      </>
                    );
                  })()}

                  {/* Sessions with no schedule */}
                  {daySessions.length > 0 && daySchedules.length === 0 && (
                    <div className="text-[9px] sm:text-[10px] rounded-[3px] px-1 py-0.5 bg-green-100 text-green-700 font-bold truncate">
                      <Check className="w-2.5 h-2.5 inline mr-0.5" />{daySessions.length} คาบ
                    </div>
                  )}

                  {/* ── NEW: Mini progress bar at cell bottom ── */}
                  {totalCount > 1 && (
                    <div className="mt-0.5 h-[3px] rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${allLogged ? 'bg-green-400' : 'bg-amber-400'}`}
                        style={{ width: `${(loggedCount / totalCount) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Overflow month — dots */}
              {isOverflow && daySchedules.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap">
                  {daySchedules.slice(0, 3).map((_, idx) => (
                    <span key={idx} className="w-1 h-1 rounded-full bg-gray-300 inline-block" />
                  ))}
                </div>
              )}

              {/* ── Hover tooltip ── */}
              {isHovered && daySchedules.length > 0 && (
                <div
                  className={`absolute z-50 left-1/2 -translate-x-1/2 w-52 bg-gray-900 text-white rounded-[12px] p-3 shadow-xl pointer-events-none text-left
                    ${isBottomRow ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                  style={{ minWidth: '196px' }}
                >
                  {/* Tooltip date header */}
                  <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
                    {new Date(dateStr + 'T12:00:00').toLocaleDateString('th-TH', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })}
                  </p>

                  {(() => {
                    const seenTipGroups = new Set();
                    const dedupedTip = [...daySchedules]
                      .sort((a, b) => (a[SCHEDULE.TIME_START] || '').localeCompare(b[SCHEDULE.TIME_START] || ''))
                      .filter(s => {
                        const gid = s[SCHEDULE.GROUP_ID];
                        if (!gid) return true;
                        const k = `${gid}__${s[SCHEDULE.TIME_START]}`;
                        if (seenTipGroups.has(k)) return false;
                        seenTipGroups.add(k);
                        return true;
                      });
                    return dedupedTip.map((s, idx) => {
                      const gid = s[SCHEDULE.GROUP_ID];
                      const grp = gid ? groups.find(g => g[GROUP.ID] === gid) : null;
                      const displayLabel = grp
                        ? (grp[GROUP.NAME] || 'กลุ่ม')
                        : ((students.find(st => st[STUDENT.ID] === s[SCHEDULE.STUDENT_ID]) || [])[STUDENT.NAME]?.split(' ')[0] || '?');
                      const logged = grp
                        ? daySchedules.filter(s2 => s2[SCHEDULE.GROUP_ID] === gid && s2[SCHEDULE.TIME_START] === s[SCHEDULE.TIME_START]).every(s2 => daySessions.some(se => se[SESSION.STUDENT_ID] === s2[SCHEDULE.STUDENT_ID]))
                        : daySessions.some(se => se[SESSION.STUDENT_ID] === s[SCHEDULE.STUDENT_ID]);
                      return (
                        <div key={idx} className="flex items-center gap-2 mb-1.5 last:mb-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${logged ? 'bg-green-400' : 'bg-amber-400'}`} />
                          <span className="text-[12px] font-medium truncate flex-1">
                            {s[SCHEDULE.TIME_START]}{' '}
                            {grp && <span className="text-purple-300 text-[10px] font-normal">กลุ่ม </span>}
                            {displayLabel}
                          </span>
                          {logged
                            ? <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                            : dateStr <= todayStr
                              ? <span className="text-[9px] text-amber-400 flex-shrink-0">ค้างบันทึก</span>
                              : null
                          }
                        </div>
                      );
                    });
                  })()}

                  {/* ── Gap highlights inside tooltip ── */}
                  {(() => {
                    const toMins = (t) => {
                      const [h, m] = (t || '00:00').split(':').map(Number);
                      return h * 60 + m;
                    };
                    const sorted = [...daySchedules].sort(
                      (a, b) => toMins(a[SCHEDULE.TIME_START]) - toMins(b[SCHEDULE.TIME_START]),
                    );
                    const gaps = [];
                    for (let gi = 0; gi < sorted.length - 1; gi++) {
                      const gapStart = toMins(sorted[gi][SCHEDULE.TIME_END]);
                      const gapEnd   = toMins(sorted[gi + 1][SCHEDULE.TIME_START]);
                      const gapMins  = gapEnd - gapStart;
                      if (gapMins >= 15) {
                        gaps.push({
                          from: sorted[gi][SCHEDULE.TIME_END],
                          to:   sorted[gi + 1][SCHEDULE.TIME_START],
                          mins: gapMins,
                        });
                      }
                    }
                    if (gaps.length === 0) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        {gaps.map((g, gi) => (
                          <div key={gi} className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                            <span>⬜</span>
                            <span>ว่าง {g.mins} น. ({g.from}–{g.to})</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-gray-500 font-medium">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-200 border border-blue-300 inline-block" />
          นัดสอนไว้
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-200 border border-green-300 inline-block" />
          บันทึกแล้ว
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300 inline-block" />
          ยังไม่บันทึก
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 inline-block" />
          ⬜ ช่วงว่างกดจองได้
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" />
          เดือนอื่น
        </span>
      </div>
    </div>
  );
}
