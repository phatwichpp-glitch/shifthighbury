// @ts-nocheck
import { useState, useEffect } from 'react';
import { Share2, Loader2, Video, X, Info } from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { copyText } from '../../lib/business';

export function VideoCallLauncher({ scheduleId, studentName, joinCode, onStart, onClose, toast }) {
  const [sharing, setSharing] = useState(false);

  // Embedding the login code makes the link one-tap for the student —
  // without it they have to type their code before every class.
  const joinUrl   = `${window.location.origin}/join?token=${scheduleId}${joinCode ? `&code=${encodeURIComponent(joinCode)}` : ''}`;
  const shareText = `🎓 ${studentName || 'คุณ'} — ครูรอสายอยู่นะคะ\nกดลิงก์นี้เพื่อเข้าห้องเรียนได้เลยค่ะ 👇\n\n${joinUrl}`;

  const handleShare = async () => {
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: `เข้าห้องเรียน — ${studentName}`, text: shareText });
      } else {
        await copyText(shareText);
        toast?.('คัดลอกลิงก์แล้ว — วางส่งใน LINE ได้เลยค่ะ', 'success');
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast?.('แชร์ไม่ได้ — ลองคัดลอกแทนค่ะ', 'error');
    }
    setSharing(false);
  };

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9997] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-[20px] shadow-[0_24px_60px_rgba(0,0,0,0.25)] w-full max-w-sm overflow-hidden"
        style={{ animation: 'slideUp 200ms cubic-bezier(0.22,1,0.36,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 pt-6 pb-5 text-white">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Video Call</p>
              <h3 className="text-[20px] font-bold leading-tight flex items-center gap-2"><Video className="w-5 h-5" /> โทรหา {studentName || 'นักเรียน'}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-slate-300 text-[14px] flex-shrink-0 mt-0.5"
            ><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
            <span>ส่งลิงก์ให้นักเรียน</span>
            <span className="text-slate-600">→</span>
            <span className="w-5 h-5 rounded-full bg-slate-600 text-slate-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
            <span>กด "เริ่มการโทร"</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">ลิงก์เข้าห้องสำหรับนักเรียน</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-[10px] px-3 py-2.5">
              <span className="text-[12px] text-gray-600 font-mono truncate flex-1 leading-snug">{joinUrl}</span>
              <CopyButton
                variant="icon"
                size="sm"
                text={joinUrl}
                label="คัดลอก URL"
                onCopy={() => toast?.('คัดลอก URL แล้วค่ะ', 'success')}
                className="flex-shrink-0 p-1.5 rounded-[6px] transition-all active:scale-95 text-gray-500 hover:text-gray-700 hover:bg-gray-200"
              />
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">ข้อความที่จะส่ง</p>
            <pre className="text-[12px] text-gray-700 font-sans whitespace-pre-wrap leading-relaxed">{shareText}</pre>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <CopyButton
              variant="button"
              text={shareText}
              label="คัดลอกข้อความ"
              onCopy={() => toast?.('คัดลอกลิงก์แล้ว — วางส่งใน LINE ได้เลยค่ะ', 'success')}
              className="flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-semibold border transition-all active:scale-95"
            />
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-semibold bg-green-600 hover:bg-green-700 text-white transition-all active:scale-95 disabled:opacity-60"
            >
              {sharing
                ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                : <Share2 className="w-4 h-4" strokeWidth={2} />}
              {sharing ? 'กำลังแชร์...' : 'แชร์ / LINE'}
            </button>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[10px]">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-relaxed">
              ถ้าโควตา LINE OA หมด — คัดลอกลิงก์แล้ว<strong>วางส่งใน LINE ด้วยตัวเอง</strong>ได้เลย ไม่ต้องผ่าน API
            </p>
          </div>

          <button
            onClick={onStart}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-bold text-[15px] rounded-[12px] transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2.5"
          >
            <Video className="w-5 h-5" /> เริ่มการโทร
          </button>
          <p className="text-center text-[11px] text-gray-400">ส่งลิงก์ให้นักเรียนก่อน แล้วค่อยกดเริ่ม — ระบบจะรอนักเรียนเข้าร่วมอัตโนมัติ</p>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
