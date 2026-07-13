// @ts-nocheck
import { PACKAGE_RECEIPT_LABEL } from '../../lib/appConfig';

export function PackageReceiptDocument({ id, receipt, accentColor, logoUrl, instituteName, footerNote, signatureUrl }) {
  const R = ({ label, value, bold, big, accent, green }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: big ? '6px 0' : '2px 0',
                  fontWeight: bold ? 700 : 400,
                  fontSize: big ? '15px' : '12px',
                  color: green ? '#059669' : accent ? accentColor : bold ? '#111' : '#555' }}>
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
        <div style={{ fontSize: '10px', color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>ใบเสร็จเติมแพ็กเกจ</div>
      </div>
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <R label="เลขที่"  value={receipt.receiptNum} />
      <R label="วันที่"   value={receipt.dateNow} />
      <R label="ลูกค้า" value={receipt.studentName} bold />
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{PACKAGE_RECEIPT_LABEL}</div>
      <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>{receipt.hours} ชั่วโมง</div>
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <R label="ยอดรับชำระ"     value={`${receipt.amount.toLocaleString()} ฿`} bold big accent />
      <R label="วิธีชำระเงิน"   value={receipt.paymentMethod} />
      <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
      <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginBottom: '4px', letterSpacing: '0.08em' }}>— ยอดชั่วโมงคงเหลือ —</div>
      <R label="ก่อนเติม"       value={`${receipt.hoursBefore} ชม.`} />
      <R label="เติมเพิ่ม"      value={`+${receipt.hours} ชม.`} />
      <R label="คงเหลือหลังเติม" value={`${receipt.hoursAfter} ชม.`} bold green />
      <div style={{ borderTop: '2px solid #111', margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
        <div style={{ textAlign: 'center', minWidth: '120px' }}>
          {signatureUrl
            ? <img src={signatureUrl} crossOrigin="anonymous" alt="ลายเซ็น" style={{ maxHeight: '52px', maxWidth: '140px', objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
            : <div style={{ height: '40px' }} />}
          <div style={{ borderTop: '1px solid #374151', paddingTop: '3px', fontSize: '11px', fontWeight: 600 }}>{receipt.issuedBy}</div>
          <div style={{ fontSize: '10px', color: '#888' }}>ผู้รับเงิน</div>
        </div>
      </div>
      <div style={{ borderTop: '1px dashed #aaa', margin: '12px 0 6px' }} />
      <div style={{ textAlign: 'center', fontSize: '10px', color: '#aaa', lineHeight: 1.8 }}>
        <div>{footerNote || 'ขอบคุณที่ไว้วางใจเราค่ะ 🙏'}</div>
        <div style={{ marginTop: '4px', letterSpacing: '0.05em' }}>{instituteName}</div>
      </div>
    </div>
  );
}
