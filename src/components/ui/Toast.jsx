// @ts-nocheck
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} onClick={() => removeToast(t.id)}
             className={`p-4 rounded-[12px] cursor-pointer pointer-events-auto flex items-start gap-3 shadow-[0_12px_24px_rgba(0,0,0,0.12)] transition-all animate-[slideIn_200ms_ease-out] border overflow-hidden relative
               ${t.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                 t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          <div className={`absolute bottom-0 left-0 h-[3px] animate-[shrink_3s_linear_forwards] ${t.type === 'success' ? 'bg-green-400' : t.type === 'error' ? 'bg-red-400' : 'bg-blue-400'}`} style={{width:'100%'}} />
          <span className="mt-0.5 flex-shrink-0">
            {t.type === 'error' ? <AlertCircle className="w-5 h-5" /> : t.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <Info className="w-5 h-5" />}
          </span>
          <span className="flex-1 text-[14px] font-medium leading-relaxed">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
