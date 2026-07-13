// @ts-nocheck
import { Component } from 'react';

// ── AppErrorBoundary ──────────────────────────────────────────────────────────
// Catches JS errors in the subtree and shows a friendly Thai fallback UI.
// Usage: wrap <Routes> or any subtree that should not bring down the whole app.
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { title = 'เกิดข้อผิดพลาด', message, onReset } = this.props;
    const errorMsg = this.state.error?.message || String(this.state.error || '');

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.10)] border border-red-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-[20px] font-extrabold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-500 text-[14px] leading-relaxed mb-1">
            {message || 'ระบบพบข้อผิดพลาดที่ไม่คาดคิดค่ะ กรุณารีโหลดหน้าเพื่อลองใหม่'}
          </p>
          {errorMsg && (
            <p className="text-[11px] text-red-400 font-mono bg-red-50 rounded-[8px] px-3 py-2 mt-3 mb-5 text-left break-all">
              {errorMsg}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-5">
            <button
              onClick={onReset ?? (() => window.location.reload())}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-[14px] transition-all active:scale-95"
            >
              รีโหลดหน้า
            </button>
            {onReset && (
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-[10px] text-[14px] transition-all active:scale-95"
              >
                รีโหลดทั้งหมด
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// ── VideoCallErrorBoundary ────────────────────────────────────────────────────
// Smaller boundary for VideoCallModal — on crash shows an inline card instead
// of taking down the whole app. Calls onClose so the modal dismisses cleanly.
export class VideoCallErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[VideoCallErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { onClose } = this.props;

    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950/90 flex items-center justify-center p-6">
        <div className="bg-white rounded-[20px] shadow-2xl border border-red-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              <line x1="8" y1="10" x2="8" y2="14" />
              <line x1="8" y1="18" x2="8.01" y2="18" />
            </svg>
          </div>
          <h2 className="text-[18px] font-extrabold text-gray-900 mb-2">วิดีโอคอลล่มค่ะ</h2>
          <p className="text-gray-500 text-[13px] leading-relaxed mb-5">
            เกิดข้อผิดพลาดในระบบวิดีโอคอล<br />ส่วนอื่นของแอปยังทำงานได้ปกติค่ะ
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { this.setState({ hasError: false }); }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-[14px] transition-all active:scale-95"
            >
              ลองเปิดวิดีโอคอลใหม่
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-[10px] text-[14px] transition-all active:scale-95"
            >
              ปิดหน้าต่างนี้
            </button>
          </div>
        </div>
      </div>
    );
  }
}
