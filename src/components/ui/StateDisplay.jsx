// @ts-nocheck
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

/**
 * Unified loading / error / empty state display.
 *
 * Props:
 *   loading       boolean   – show spinner
 *   error         Error|null– show error UI with retry
 *   empty         boolean   – show empty-state UI (checked after loading & error)
 *   emptyMessage  string    – Thai message for empty state
 *   emptyIcon     ReactNode – optional icon override for empty state
 *   onRetry       function  – called when "ลองใหม่" is clicked
 *   loadingMessage string   – override "กำลังโหลด..."
 *   children      ReactNode – rendered when none of the above
 *   className     string    – wrapper class for all states
 */
export function StateDisplay({
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'ยังไม่มีข้อมูลครับ',
  emptyIcon = null,
  onRetry,
  loadingMessage = 'กำลังโหลด...',
  children,
  className = '',
}) {
  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 gap-3 ${className}`}>
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin" />
        <p className="text-gray-500 text-[14px] font-medium">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    const msg = error?.message || String(error || 'เกิดข้อผิดพลาดที่ไม่คาดคิดครับ');
    return (
      <div className={`flex flex-col items-center justify-center py-16 gap-4 text-center ${className}`}>
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-500" strokeWidth={2} />
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">โหลดข้อมูลไม่สำเร็จ</p>
          <p className="text-gray-500 text-[13px] max-w-xs leading-relaxed">{msg}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[8px] text-[13px] transition-all active:scale-95 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
            ลองใหม่
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 gap-3 text-center ${className}`}>
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
          {emptyIcon || <Inbox className="w-6 h-6 text-gray-400" strokeWidth={1.5} />}
        </div>
        <p className="text-gray-400 text-[14px] leading-relaxed max-w-xs">{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}
