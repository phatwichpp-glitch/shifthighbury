// @ts-nocheck
import { labelClasses } from './styles';

export function StarRatingInput({ label, value, onChange }) {
  const v = parseInt(value, 10) || 0;
  return (
    <div>
      <label className={labelClasses}>{label}</label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(v === n ? '' : String(n))}
            className={`text-[24px] leading-none transition-transform active:scale-90 ${n <= v ? 'text-amber-400' : 'text-gray-200 hover:text-gray-300'}`}
            aria-label={`${label} ${n} ดาว`}
          >★</button>
        ))}
        {v > 0 && <span className="ml-1 text-[12px] text-gray-400">{v}/5</span>}
      </div>
    </div>
  );
}
