// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Video, RotateCcw, X, Clock } from 'lucide-react';

const TOTAL_SECS = 40 * 60;
const WARN_AMBER = 10 * 60;
const WARN_RED   =  5 * 60;

function fmtTime(secs) {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function ZoomClassTimer({ active, startedAt, currentLink, linksPool = [], onSwitchRoom, onStop, onTimeUp }) {
  const [secsRemaining, setSecsRemaining] = useState(TOTAL_SECS);
  const [shownAmber, setShownAmber] = useState(false);
  const [shownRed, setShownRed]     = useState(false);
  const prevSecsRef = useRef(null);

  useEffect(() => {
    if (!active || !startedAt) { setSecsRemaining(TOTAL_SECS); setShownAmber(false); setShownRed(false); return; }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecsRemaining(Math.max(0, TOTAL_SECS - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);

  // C3: Fire onTimeUp once when countdown transitions from >0 to 0
  useEffect(() => {
    if (prevSecsRef.current !== null && prevSecsRef.current > 0 && secsRemaining === 0) {
      onTimeUp?.();
    }
    prevSecsRef.current = secsRemaining;
  }, [secsRemaining, onTimeUp]);

  // Reset banner dismissal when timer restarts
  useEffect(() => { setShownAmber(false); setShownRed(false); prevSecsRef.current = null; }, [startedAt]);

  if (!active) return null;

  const isRed   = secsRemaining <= WARN_RED;
  const isAmber = !isRed && secsRemaining <= WARN_AMBER;
  const isGreen = !isRed && !isAmber;

  const pillBg    = isRed ? 'bg-red-600'   : isAmber ? 'bg-amber-500' : 'bg-emerald-600';
  const pillBorder= isRed ? 'border-red-700' : isAmber ? 'border-amber-600' : 'border-emerald-700';
  const bannerBg  = isRed ? 'bg-red-50 border-red-300'   : 'bg-amber-50 border-amber-300';
  const bannerText= isRed ? 'text-red-800'   : 'text-amber-800';
  const bannerBtn = isRed ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600';

  const canSwitch = linksPool.length > 1;
  const showBanner = (isAmber && !shownAmber) || (isRed && !shownRed);
  const bannerMsg = isRed
    ? 'เหลือ 5 นาที — ควรสลับห้อง Zoom ครับ!'
    : 'ใกล้ครบ 40 นาที — สลับห้อง Zoom ได้เลยครับ';

  return (
    <div className="mb-4 space-y-2">
      {/* ─── Timer pill ─── */}
      <div className={`flex items-center gap-3 px-4 py-2 rounded-[12px] border text-white ${pillBg} ${pillBorder}`}>
        <Clock className={`w-4 h-4 flex-shrink-0 ${isRed || isAmber ? 'animate-pulse' : ''}`} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-bold tabular-nums">{fmtTime(secsRemaining)}</span>
          <span className="text-[12px] opacity-75 ml-2">เหลือ</span>
          {currentLink && (
            <a href={currentLink} target="_blank" rel="noopener noreferrer"
              className="ml-3 text-[11px] underline opacity-80 hover:opacity-100 truncate hidden sm:inline">
              {currentLink.replace(/https?:\/\/(www\.)?/i, '').slice(0, 40)}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canSwitch && (
            <button type="button" onClick={onSwitchRoom}
              className="flex items-center gap-1 text-[12px] font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-[8px] transition-colors whitespace-nowrap">
              <RotateCcw className="w-3 h-3" />สลับห้อง
            </button>
          )}
          <button type="button" onClick={onStop} title="หยุดตัวนับ"
            className="p-1 rounded-full hover:bg-white/20 transition-colors opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Warning banner (dismissable) ─── */}
      {showBanner && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-[12px] border ${bannerBg}`}>
          <Video className={`w-4 h-4 flex-shrink-0 ${bannerText}`} />
          <p className={`flex-1 text-[13px] font-semibold ${bannerText}`}>{bannerMsg}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canSwitch && (
              <button type="button" onClick={onSwitchRoom}
                className={`flex items-center gap-1.5 text-[12px] font-bold text-white px-3 py-1.5 rounded-[8px] transition-all active:scale-95 ${bannerBtn}`}>
                <RotateCcw className="w-3 h-3" />สลับห้อง
              </button>
            )}
            <button type="button"
              onClick={() => isRed ? setShownRed(true) : setShownAmber(true)}
              className={`text-[11px] font-medium ${bannerText} opacity-60 hover:opacity-100 px-2 py-1.5`}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
