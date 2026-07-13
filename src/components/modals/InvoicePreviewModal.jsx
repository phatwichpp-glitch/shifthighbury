// @ts-nocheck
import { useState, useEffect } from 'react';
import { Check, X, Share2, Smartphone, Loader2, Download, Send } from 'lucide-react';

export function InvoicePreviewModal({ previewData, settings, onClose, onConfirmPaid, onDownloadJPG, onDownloadPDF, isExporting, onSendLine, isSendingLine, onSendLineImage, isSendingLineImage, sendImageLabel, lineSentAt, lastSharedAt, elementId, filename, children }) {
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleShare = async () => {
    const id = elementId || 'invoice-preview-container';
    setIsSharing(true);
    try {
      const el = document.getElementById(id);
      if (!el) throw new Error('ไม่พบเอกสาร');
      const imgs = Array.from(el.querySelectorAll('img'));
      await Promise.all(imgs.map(img => new Promise(r => { if (img.complete) r(); else { img.onload = r; img.onerror = r; } })));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, allowTaint: true, logging: false });
      canvas.toBlob(async (blob) => {
        try {
          const file = new File([blob], `Invoice_${previewData.invoiceNumber}.jpg`, { type: 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `บิล ${previewData.invoiceNumber}` });
          } else {
            await navigator.share({ title: `บิล ${previewData.invoiceNumber}`, text: `ใบแจ้งค่าเรียน ${previewData.invoiceNumber}` });
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('[Share]', e);
        } finally { setIsSharing(false); }
      }, 'image/jpeg', 0.95);
    } catch (e) {
      console.warn('[Share]', e);
      setIsSharing(false);
    }
  };

  const isPaid = previewData.status === 'PAID';
  const isVoid = previewData.status === 'VOID';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto py-6 px-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full flex flex-col rounded-[20px] shadow-[0_32px_80px_rgba(0,0,0,0.35)] overflow-hidden"
        style={{ maxWidth: 900, background: '#F1F3F5', animation: 'slideUp 220ms cubic-bezier(0.22,1,0.36,1)', minHeight: 'min(80vh, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200" style={{ background: '#F1F3F5' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-bold text-[17px] text-gray-900 leading-tight">{previewData.invoiceNumber}</h3>
              {isPaid
                ? <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1"><Check className="w-3 h-3" /> ชำระแล้ว</span>
                : isVoid
                  ? <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600 border border-red-200 inline-flex items-center gap-1"><X className="w-3 h-3" /> ยกเลิก</span>
                  : <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">รอชำระ</span>
              }
            </div>
            <p className="text-[13px] text-gray-500 mt-0.5">{previewData.studentName}</p>
            {(lineSentAt || lastSharedAt) && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {lineSentAt   && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 inline-flex items-center gap-1"><Check className="w-3 h-3" /> LINE — {lineSentAt}</span>}
                {lastSharedAt && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1"><Check className="w-3 h-3" /> แชร์ — {lastSharedAt}</span>}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors text-gray-600 text-[16px] font-bold"
            aria-label="ปิด"
          ><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto rounded-[12px] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-200" style={{ background: '#fff', maxWidth: 800 }}>
            {children}
          </div>
          <div className="mx-auto mt-4 flex items-start gap-2 px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-[10px]" style={{ maxWidth: 800 }}>
            <Smartphone className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
              แคปหน้าจอบริเวณเอกสารด้านบนส่งลูกค้าได้เลย — ไม่ต้องพึ่ง API ประหยัดโควตา LINE OA
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t border-gray-200 px-6 py-4 space-y-2.5" style={{ background: '#F1F3F5' }}>
          <div className="flex gap-2.5 flex-wrap">
            {!isPaid && !isVoid && (
              <button onClick={onConfirmPaid} className="flex-1 min-w-[140px] py-2.5 rounded-[10px] text-[13px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-sm">
                <Check className="w-4 h-4 inline mr-1" />ยืนยันรับเงินแล้ว
              </button>
            )}
            <button onClick={handleShare} disabled={isSharing || isExporting} className="flex-1 min-w-[120px] py-2.5 rounded-[10px] text-[13px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-sm disabled:bg-gray-400">
              {isSharing ? <><Loader2 className="w-4 h-4 inline mr-1 animate-spin" />กำลังแชร์...</> : <><Share2 className="w-4 h-4 inline mr-1" />แชร์บิล</>}
            </button>
            {onSendLineImage && (
              <button
                onClick={onSendLineImage}
                disabled={isSendingLineImage || isExporting}
                title={sendImageLabel ? `ส่งรูปภาพ${sendImageLabel}ทาง LINE OA` : 'ส่งรูปภาพบิลทาง LINE OA'}
                className="flex-1 min-w-[100px] py-2.5 rounded-[10px] text-[13px] font-bold text-white active:scale-95 transition-all shadow-sm disabled:bg-gray-400"
                style={{ background: isSendingLineImage || isExporting ? undefined : '#06C755' }}
              >{isSendingLineImage ? <><Loader2 className="w-4 h-4 inline mr-1 animate-spin" />ส่ง...</> : <><Send className="w-4 h-4 inline mr-1" />{(lineSentAt || lastSharedAt) ? 'ส่งซ้ำ' : 'LINE'}</>}</button>
            )}
          </div>
          <div className="flex gap-2.5">
            <button onClick={onDownloadJPG} disabled={isExporting} className="flex-1 py-2 rounded-[10px] text-[12px] font-semibold bg-gray-800 text-white hover:bg-gray-900 active:scale-95 transition-all disabled:bg-gray-400">
              {isExporting ? 'กำลังบันทึก...' : <><Download className="w-3.5 h-3.5 inline mr-1" />JPG</>}
            </button>
            <button onClick={onDownloadPDF} disabled={isExporting} className="flex-1 py-2 rounded-[10px] text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all disabled:bg-gray-400">
              {isExporting ? 'กำลังบันทึก...' : <><Download className="w-3.5 h-3.5 inline mr-1" />PDF</>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(32px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
