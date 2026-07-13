// @ts-nocheck
import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { SKILL_LABELS } from '../../lib/appConfig';

const SKILL_NAMES = SKILL_LABELS.map(s => s.label).join(', ');

const SECTIONS = [
  {
    id: 'login',
    title: '🔑 How to Sign In',
    content: (
      <div className="space-y-3 text-[14px] text-gray-700 leading-relaxed">
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[10px] space-y-1.5">
          <p className="font-semibold text-emerald-800 text-[13px]">🏠 Enter these 2 codes</p>
          <div className="space-y-1 text-[13px] text-emerald-700">
            <p><strong>Classroom Code</strong> — your teacher will provide it (e.g. <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-[12px]">ZWEN</code>, max 4 letters)</p>
            <p><strong>Login Code</strong> — your personal code (e.g. <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-[12px]">PA47</code>)</p>
          </div>
        </div>
        <p>Enter both codes and tap <strong>Sign In</strong></p>
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-[10px]">
          <p className="font-semibold text-blue-800 text-[13px] mb-1">💡 Quick sign in</p>
          <p className="text-[13px] text-blue-700">If your teacher sends you a link with the code already included (like /portal?code=PA47), just tap the link — no need to type both codes</p>
        </div>
        <p className="text-[13px] text-gray-500">Your login will be remembered on this browser, so you won't need to sign in again next time</p>
      </div>
    ),
  },
  {
    id: 'overview',
    title: '📊 Overview',
    content: (
      <div className="space-y-3 text-[14px] text-gray-700 leading-relaxed">
        <p>The Overview tab shows all your important information:</p>
        <div className="space-y-2">
          {[
            ['📅 This Week', 'Your class schedule for the current week with "Join Class" button when it\'s time'],
            ['⏱️ Package Balance', 'Remaining hours in your package — you\'ll get a warning when running low'],
            ['⭐ 4 Skills', `${SKILL_NAMES} — shown as a radar chart and progress bars`],
            ['📈 Monthly Hours', 'Your study hours for the last 6 months shown as a bar chart'],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-2.5 p-2.5 bg-gray-50 rounded-[8px]">
              <div>
                <p className="font-semibold text-[13px]">{t}</p>
                <p className="text-[12px] text-gray-500">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'history',
    title: '📚 History',
    content: (
      <div className="space-y-3 text-[14px] text-gray-700 leading-relaxed">
        <p>The <strong>"History"</strong> tab shows all your past lessons, newest first</p>
        <p>Each lesson shows: date · hours · subject · scores for 4 skills · teacher's notes</p>
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-[10px]">
          <p className="text-[13px] text-emerald-800">📈 Skill scores on the Overview are calculated as an average of all your past lessons. The more you study, the more accurate your progress chart becomes</p>
        </div>
      </div>
    ),
  },
  {
    id: 'join',
    title: '🎥 How to Join Class',
    content: (
      <div className="space-y-3 text-[14px] text-gray-700 leading-relaxed">
        <div className="space-y-2.5">
          {[
            ['1', 'Open the Portal (/portal) about 5 minutes before class time'],
            ['2', 'Wait for your teacher to come online — you\'ll see a green "Teacher is ready" banner'],
            ['3', 'Tap "Join Classroom" — the video call will start immediately'],
          ].map(([n, t]) => (
            <div key={n} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
              <p>{t}</p>
            </div>
          ))}
        </div>
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-[10px]">
          <p className="text-[13px] text-amber-800">📱 If your teacher sends you a direct join link via LINE, you can tap it to join without using the Portal</p>
        </div>
        <p className="text-[13px] text-gray-500">The system uses peer-to-peer WebRTC video, so you need a stable internet connection and a compatible browser (Chrome/Safari)</p>
      </div>
    ),
  },
  {
    id: 'line',
    title: '💬 Connect LINE',
    content: (
      <div className="space-y-3 text-[14px] text-gray-700 leading-relaxed">
        <p>Once you connect LINE, you'll receive: invoices · class reminders · announcements from your teacher — all directly in LINE</p>
        <div className="space-y-2.5">
          {[
            ['1', 'Go to the "Connect" tab in the Portal'],
            ['2', 'Copy your Login Code (e.g. PA47)'],
            ['3', 'Add the academy\'s LINE Official Account as a friend'],
            ['4', 'Send your Login Code in the LINE chat'],
            ['5', 'The system will reply with confirmation — connected!'],
          ].map(([n, t]) => (
            <div key={n} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
              <p>{t}</p>
            </div>
          ))}
        </div>
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-[10px]">
          <p className="text-[13px] text-blue-800">You only need to connect once — the system will remember your LINE account</p>
        </div>
      </div>
    ),
  },
];

export function PortalHelpModal({ open, onClose }) {
  const [openIdx, setOpenIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
      <div
        className="relative w-full bg-white rounded-[20px] shadow-[0_32px_80px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden"
        style={{ maxWidth: 520, maxHeight: 'min(90vh, 680px)', animation: 'slideUp 220ms cubic-bezier(0.22,1,0.36,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Portal Help & Guide</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">For Students</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Accordion content */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {SECTIONS.map((s, i) => (
            <div key={s.id}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[14px] font-semibold text-gray-900">{s.title}</span>
                {openIdx === i
                  ? <ChevronUp className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                  {s.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
