// @ts-nocheck
import { Link, useLocation } from 'react-router-dom';

export function NavLink({ to, children, onClick }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] transition-all text-[13.5px] font-medium select-none
        ${active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
    >
      {children}
    </Link>
  );
}
