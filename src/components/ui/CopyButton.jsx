// @ts-nocheck
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Reusable copy-to-clipboard button.
// variant="icon"   — icon only (tooltip shows label) — good for inline use
// variant="button" — icon + text label
export function CopyButton({ text, label, className, onCopy, size = 'md', variant = 'icon' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e?.stopPropagation();
    if (!text || copied) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  const iconCls = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'คัดลอกแล้ว' : (label || 'คัดลอก')}
        className={className || `p-1.5 rounded-[6px] transition-all active:scale-95 ${copied ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
      >
        {copied
          ? <Check className={iconCls} strokeWidth={2.5} />
          : <Copy className={iconCls} strokeWidth={2} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      className={className || `inline-flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-medium transition-all active:scale-95 border ${copied ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'}`}
    >
      {copied
        ? <Check className={iconCls} strokeWidth={2.5} />
        : <Copy className={iconCls} strokeWidth={2} />}
      <span>{copied ? 'คัดลอกแล้ว' : (label || 'คัดลอก')}</span>
    </button>
  );
}
