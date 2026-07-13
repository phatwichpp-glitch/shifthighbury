// @ts-nocheck
import { useState } from 'react';
import { LOGO_B64 } from '../lib/constants';
import { TEACHER_ROLE_LABEL } from '../lib/appConfig';
import { copyText } from '../lib/business';
import { AlertTriangle, Smartphone, MessageSquare, Users, Check, Copy } from 'lucide-react';

export function LineConnect() {
  const params      = new URLSearchParams(window.location.search);
  const studentId   = params.get('sid')  || '';
  const studentName = params.get('name') || '';
  const oaName      = params.get('oa')   || 'LINE OA ของสถาบัน';
  const dbId        = params.get('db')   || '';
  const [copied, setCopied] = useState(false);

  const connectCode = dbId ? `${studentId}|${dbId}` : studentId;

  const handleCopy = () => {
    copyText(connectCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700;800&display=swap'); *, body { font-family: 'Inter', 'Sarabun', sans-serif !important; }`}</style>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] p-10 max-w-sm w-full">
          <div className="flex items-center justify-center mb-8">
            <img src={LOGO_B64} alt="SHIFTHIGHBURY" className="h-16 w-auto object-contain drop-shadow-sm" />
          </div>
          {!studentId ? (
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <p className="text-gray-500 text-[14px]">ลิงก์ไม่ถูกต้อง กรุณาติดต่อ{TEACHER_ROLE_LABEL}ค่ะ</p>
            </div>
          ) : (
            <div className="text-center">
              <Smartphone className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-[20px] font-extrabold text-gray-900 mb-2">เชื่อมต่อ LINE OA</h2>
              {studentName && <p className="text-gray-500 text-[14px] mb-1">สวัสดีค่ะคุณ <strong>{studentName}</strong></p>}
              <p className="text-gray-500 text-[14px] mb-3 leading-relaxed">กดปุ่ม <strong>คัดลอกรหัส</strong> ด้านล่าง แล้วส่งในที่ที่ต้องการ:</p>
              <div className="text-left bg-gray-50 rounded-[10px] p-3 mb-3 space-y-2 text-[13px]">
                <p className="text-gray-700"><span className="font-semibold flex items-center gap-1 mb-0.5"><MessageSquare className="w-3.5 h-3.5 text-green-600" />ส่ง DM</span> หา {oaName} → รับบิล/สรุปบทเรียนส่วนตัว</p>
                <p className="text-gray-700"><span className="font-semibold flex items-center gap-1 mb-0.5"><Users className="w-3.5 h-3.5 text-blue-600" />ส่งในกลุ่ม LINE</span> (ที่มีผู้ปกครอง) → ลิงก์ Zoom และแจ้งเตือนเข้ากลุ่ม</p>
              </div>
              <p className="text-gray-400 text-[12px] mb-4 flex items-center justify-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />ส่งตัวอักษรทั้งหมดนี้มาให้ครบนะคะ อย่าแก้ไขค่ะ</p>
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[12px] px-4 py-3 font-mono text-[13px] text-gray-800 font-bold mb-4 select-all break-all">{connectCode}</div>
              <button onClick={handleCopy} className="w-full px-4 py-3 bg-green-600 text-white font-semibold rounded-[12px] hover:bg-green-700 active:scale-95 transition-all text-[15px] flex items-center justify-center gap-2">
                {copied ? <><Check className="w-4 h-4" />คัดลอกแล้ว!</> : <><Copy className="w-4 h-4" />คัดลอกรหัส</>}
              </button>
              <p className="text-gray-400 text-[12px] mt-4">หลังส่งรหัสแล้ว ระบบจะตอบกลับยืนยันทาง LINE ค่ะ</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
