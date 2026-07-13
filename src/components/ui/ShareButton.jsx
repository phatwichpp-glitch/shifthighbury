// @ts-nocheck
import { useState } from 'react';
import { Share2, Copy, Check, Loader2 } from 'lucide-react';

export function ShareButton({ elementId, filename, text, label = 'แชร์', className = '', disabled = false }) {
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = !!navigator.share;

  const handleShareImage = async () => {
    if (!elementId) return;
    setIsSharing(true);
    try {
      const el = document.getElementById(elementId);
      if (!el) throw new Error('ไม่พบเอกสาร');
      const imgs = Array.from(el.querySelectorAll('img'));
      await Promise.all(imgs.map(img => new Promise(r => { if (img.complete) r(); else { img.onload = r; img.onerror = r; } })));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false });
      canvas.toBlob(async (blob) => {
        try {
          const file = new File([blob], filename || 'document.jpg', { type: 'image/jpeg' });
          if (canShare && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: filename || 'เอกสาร' });
          } else if (canShare) {
            await navigator.share({ title: filename || 'เอกสาร' });
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename || 'document.jpg';
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          }
        } catch (e) { if (e.name !== 'AbortError') console.warn('[Share]', e); }
        finally { setIsSharing(false); }
      }, 'image/jpeg', 0.92);
    } catch (e) { console.warn('[ShareImage]', e); setIsSharing(false); }
  };

  const handleShareText = async () => {
    if (!text) return;
    if (canShare) {
      try { await navigator.share({ text }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { console.warn('[Copy]', e); }
  };

  const handleClick = () => {
    if (elementId) handleShareImage();
    else handleShareText();
  };

  const isText = !elementId;

  const icon = isText
    ? copied
      ? <Check className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} />
      : canShare
        ? <Share2 className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
        : <Copy className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
    : isSharing
      ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" strokeWidth={2} />
      : <Share2 className="w-4 h-4 flex-shrink-0" strokeWidth={2} />;

  const btnText = isText
    ? (copied ? 'คัดลอกแล้ว' : canShare ? 'แชร์' : 'คัดลอก')
    : (isSharing ? 'กำลังเตรียม...' : label);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isSharing}
      className={className || 'px-4 py-2 bg-violet-600 text-white font-medium rounded-[8px] hover:bg-violet-700 active:scale-95 transition-all text-[14px] shadow-sm disabled:bg-gray-400 flex items-center gap-1.5'}
    >
      {icon}
      <span>{btnText}</span>
    </button>
  );
}
