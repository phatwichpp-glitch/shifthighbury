// @ts-nocheck
import { SCHEDULE } from '../../lib/constants';
import { SKILL_LABELS } from '../../lib/appConfig';
import { inputClasses, labelClasses, btnSecondary, btnSuccess } from '../ui/styles';
import { SubjectComboInput } from '../ui/SubjectComboInput';
import { StarRatingInput } from '../ui/StarRatingInput';
import { X, Ticket, Brain, Calculator, BookOpen, Users } from 'lucide-react';

const SKILL_ICONS = { Brain, Calculator, BookOpen, Users };
const skillScoreKey = key => `${key}Score`;
const skillChangeKey = key => `onChange${key[0].toUpperCase()}${key.slice(1)}Score`;

export function LogSessionModal({ loggingSession, isSubmitting, getStudentName, onSubmit, onClose, packageHoursRemaining, groupPackageHoursRemaining }) {
  if (!loggingSession) return null;
  const s = loggingSession.scheduleData;

  const scoreValues = [
    loggingSession.listeningScore,
    loggingSession.speakingScore,
    loggingSession.readingScore,
    loggingSession.writingScore,
  ].map(v => parseInt(v, 10) || 0).filter(v => v > 0);
  const avgScore = scoreValues.length > 0
    ? (scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4 animate-[fadeIn_150ms_ease-out]">
      <div className="bg-white rounded-[16px] max-w-md w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)] animate-[slideIn_200ms_ease-out] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-6 pt-6 pb-4 flex-shrink-0">
          <h3 className="font-semibold text-gray-900 text-[18px]">บันทึกรายละเอียดการสอน</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors leading-none"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 space-y-5 flex-1">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-[12px] text-[14px] text-gray-800">
              <p className="mb-1"><span className="font-semibold text-blue-900">นักเรียน:</span> {getStudentName(s[SCHEDULE.STUDENT_ID])}</p>
              <p><span className="font-semibold text-blue-900">วันที่:</span> {new Date(loggingSession.dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ({s[SCHEDULE.TIME_START]}-{s[SCHEDULE.TIME_END]} น.)</p>
            </div>

            {groupPackageHoursRemaining > 0 && (
              <div className="bg-violet-50 border border-violet-200 p-3 rounded-[10px] text-[13px] text-violet-800 flex items-start gap-2">
                <Ticket className="w-4 h-4 flex-shrink-0" />
                <span>แพ็กเกจกลุ่มคงเหลือ <strong>{groupPackageHoursRemaining} ชม.</strong> — คาบนี้จะหักจากแพ็กเกจกลุ่ม (ไม่เข้าบิลรายครั้ง)</span>
              </div>
            )}
            {!groupPackageHoursRemaining && packageHoursRemaining > 0 && (
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-[10px] text-[13px] text-purple-800 flex items-start gap-2">
                <Ticket className="w-4 h-4 flex-shrink-0" />
                <span>นักเรียนมีแพ็กเกจเหมาจ่ายคงเหลือ <strong>{packageHoursRemaining} ชม.</strong> — คาบนี้จะถูกหักจากแพ็กเกจอัตโนมัติ (ไม่เข้าบิลรายครั้ง)</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>วิชา/เนื้อหา <span className="text-red-500">*</span></label>
                <SubjectComboInput value={loggingSession.subject} onChange={v => loggingSession.onChangeSubject(v)} required />
              </div>
              <div>
                <label className={labelClasses}>เวลาสอนจริง <span className="text-red-500">*</span></label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <input
                      type="number" min="0" max="10" step="1"
                      value={loggingSession.hours}
                      onChange={e => loggingSession.onChangeHours(e.target.value)}
                      className={`${inputClasses} pr-10`}
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">ชม.</span>
                  </div>
                  <div className="flex-1 relative">
                    <input
                      type="number" min="0" max="59" step="1"
                      value={loggingSession.minutes}
                      onChange={e => loggingSession.onChangeMinutes(e.target.value)}
                      className={`${inputClasses} pr-12`}
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">นาที</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClasses}>หมายเหตุ / สั่งการบ้าน (ถ้ามี)</label>
              <textarea value={loggingSession.note} onChange={e => loggingSession.onChangeNote(e.target.value)} className={`${inputClasses} resize-none`} rows="2" placeholder="เช่น สั่งการบ้านหน้า 25..." />
            </div>

            <div className="border-t border-gray-100 pt-4 -mx-6 px-6 bg-gray-50/60 pb-1">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-gray-700">ประเมินผลรายคาบ (ไม่บังคับ)</p>
                {avgScore > 0 && (
                  <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    ★ เฉลี่ย {avgScore.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SKILL_LABELS.map(skill => {
                  const Icon = SKILL_ICONS[skill.icon];
                  return (
                    <div key={skill.key} className="bg-white border border-gray-200 rounded-[10px] px-3 py-2.5">
                      <StarRatingInput
                        label={<span className="flex items-center gap-1">{Icon && <Icon className="w-3.5 h-3.5" />}{skill.label}</span>}
                        value={loggingSession[skillScoreKey(skill.key)]}
                        onChange={loggingSession[skillChangeKey(skill.key)]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
            <button type="button" onClick={onClose} className={btnSecondary}>ยกเลิก</button>
            <button type="submit" disabled={isSubmitting} className={`${btnSuccess} flex-1`}>{isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการบันทึก'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
