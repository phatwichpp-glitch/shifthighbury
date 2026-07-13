// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export function RowActionsMenu({ items, label = 'จัดการ' }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      const dropdowns = document.querySelectorAll('[data-row-menu-portal]');
      for (const el of dropdowns) {
        if (el.contains(e.target)) return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visibleItems = items.filter(it => !it.hidden);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(visibleItems.length * 40 + 16, 320);
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < estimatedHeight;
      setMenuStyle({
        position: 'fixed',
        right: window.innerWidth - rect.right,
        width: 192,
        zIndex: 99999,
        ...(dropUp
          ? { bottom: window.innerHeight - rect.top }
          : { top: rect.bottom + 4 }),
      });
    }
    setOpen(o => !o);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        title={label}
        className="w-9 h-9 flex items-center justify-center rounded-[8px] border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 hover:text-gray-700 active:scale-95 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div data-row-menu-portal style={menuStyle} className="bg-white border border-gray-200 rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] py-1.5 overflow-hidden">
          {visibleItems.map((it, i) => (
            <button
              key={i}
              type="button"
              title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full text-left px-3.5 py-2 text-[13px] font-medium flex items-center gap-2 transition-colors ${it.danger ? 'text-red-600 hover:bg-red-50' : `${it.colorClass || 'text-gray-700'} hover:bg-gray-50`}`}
            >
              {it.icon && <span className="flex items-center justify-center w-4 h-4 flex-shrink-0">{it.icon}</span>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
