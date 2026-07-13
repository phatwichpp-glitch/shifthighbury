// @ts-nocheck
import { INVOICE_DEFAULT_SUBJECT } from '../../lib/appConfig';

export function InvoiceDocument({ id, previewData, accentColor, logoUrl, instituteName, paymentMethods, footerNote, qrCodeUrl, promptpayId }) {
  const R = ({ label, value, bold, big, accent }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: big ? '6px 0' : '2px 0',
                  fontWeight: bold ? 700 : 400,
                  fontSize: big ? '15px' : '12px',
                  color: accent ? accentColor : bold ? '#111' : '#555' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
  return (
    <div id={id} style={{ background: 'white', margin: '0 auto', width: '72mm',
                          fontFamily: '"Courier New", Courier, monospace',
                          fontSize: '12px', color: '#111', padding: '16px 14px 24px',
                          boxSizing: 'border-box', lineHeight: 1.5 }}>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        {logoUrl
          ? <img src={logoUrl} alt={instituteName} style={{ maxHeight: '60px', maxWidth: '160px', objectFit: 'contain', display: 'block', margin: '0 auto 6px' }} />
          : <div style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '4px' }}>{instituteName}</div>
        }
        <div style={{ fontSize: '10px', color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>ใบแจ้งค่าเรียน</div>
      </div>
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <R label="เลขที่" value={previewData.invoiceNumber} />
      <R label="วันที่"  value={previewData.date} />
      <R label="ลูกค้า" value={previewData.studentName} bold />
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
        <span>รายการ</span><span style={{ minWidth: '52px', textAlign: 'right' }}>ชม × ราคา</span>
      </div>
      {previewData.items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#111' }}>{item.date} · {item.subject || INVOICE_DEFAULT_SUBJECT}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555' }}>
            <span>ค่าเรียน</span>
            <span>{item.hours} ชม × {(item.rate||0).toLocaleString()} = <strong style={{ color: '#111' }}>{item.amount.toLocaleString()} ฿</strong></span>
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <R label={`รวม ${previewData.totalHours} ชั่วโมง`} value="" />
      {(previewData.vatAmount || 0) > 0 && (
        <>
          <R label="ยอดก่อน VAT" value={`${((previewData.totalAmount || 0) - (previewData.vatAmount || 0)).toLocaleString()} ฿`} />
          <R label={`VAT ${Math.round((previewData.vatRate || 0) * 100)}%`} value={`${(previewData.vatAmount || 0).toLocaleString()} ฿`} />
        </>
      )}
      <R label="ยอดรวมสุทธิ" value={`${previewData.totalAmount.toLocaleString()} ฿`} bold big accent />
      <div style={{ borderTop: '2px solid #111', margin: '8px 0' }} />
      {(paymentMethods || promptpayId) && (
        <>
          <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginBottom: '6px', letterSpacing: '0.08em' }}>— ช่องทางการชำระเงิน —</div>
          {promptpayId && (
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              {qrCodeUrl
                ? <img src={qrCodeUrl} alt="PromptPay QR" style={{ width: '110px', height: '110px', display: 'block', margin: '0 auto 4px', border: '1px solid #ddd', borderRadius: '6px', padding: '4px' }} />
                : <div style={{ fontSize: '10px', color: '#aaa' }}>กำลังสร้าง QR...</div>
              }
              <div style={{ fontSize: '10px', color: '#555' }}>สแกน PromptPay</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{previewData.totalAmount.toLocaleString()} ฿</div>
            </div>
          )}
          {paymentMethods && (
            <div style={{ fontSize: '11px', color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{paymentMethods}</div>
          )}
          <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
        </>
      )}
      <div style={{ textAlign: 'center', fontSize: '10px', color: '#aaa', lineHeight: 1.8 }}>
        <div>{footerNote || 'ขอบคุณที่ไว้วางใจเราครับ 🙏'}</div>
        <div style={{ marginTop: '4px', letterSpacing: '0.05em' }}>{instituteName}</div>
      </div>
    </div>
  );
}
