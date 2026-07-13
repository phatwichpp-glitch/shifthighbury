// @ts-nocheck
import { useState, useEffect } from 'react';
import { X, BookOpen, Calendar, FileText, GraduationCap, Receipt, Users, BarChart2, MessageSquare, Settings2, Smartphone, ChevronRight } from 'lucide-react';

const SECTIONS = [
  { id: 'overview',   icon: <BookOpen className="w-4 h-4" />,       label: 'ภาพรวมระบบ' },
  { id: 'calendar',   icon: <Calendar className="w-4 h-4" />,        label: 'ปฏิทินตารางสอน' },
  { id: 'sessions',   icon: <FileText className="w-4 h-4" />,        label: 'บันทึกการสอน' },
  { id: 'students',   icon: <GraduationCap className="w-4 h-4" />,   label: 'นักเรียน & แพ็กเกจ' },
  { id: 'invoices',   icon: <Receipt className="w-4 h-4" />,         label: 'ออกบิล & ใบเสร็จ' },
  { id: 'groups',     icon: <Users className="w-4 h-4" />,           label: 'จัดการกลุ่ม' },
  { id: 'dashboard',  icon: <BarChart2 className="w-4 h-4" />,       label: 'Dashboard' },
  { id: 'templates',  icon: <MessageSquare className="w-4 h-4" />,   label: 'Template ข้อความ' },
  { id: 'settings',   icon: <Settings2 className="w-4 h-4" />,       label: 'ตั้งค่า' },
  { id: 'portal',     icon: <Smartphone className="w-4 h-4" />,      label: 'Portal นักเรียน' },
];

function Step({ n, children }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center mt-0.5">{n}</span>
      <p className="text-[14px] text-gray-700 leading-relaxed">{children}</p>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-[10px]">
      <p className="text-[13px] text-amber-800">💡 {children}</p>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className="text-[16px] font-bold text-gray-900 mb-3 mt-5 first:mt-0">{children}</h3>;
}

function SectionContent({ id }) {
  if (id === 'overview') return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ระบบนี้ออกแบบมาสำหรับติวเตอร์ส่วนตัว ช่วยจัดการตารางสอน นักเรียน การออกบิล และการแจ้งเตือนผ่าน LINE ทั้งหมดในที่เดียว
      </p>
      <SectionTitle>ส่วนประกอบหลัก</SectionTitle>
      <div className="grid gap-3">
        {[
          ['📅 ปฏิทินตารางสอน', 'จัดตาราง เพิ่ม/ยกเลิกคาบ และส่ง LINE แจ้งเตือนนักเรียนก่อนเรียน'],
          ['👨‍🎓 นักเรียน & แพ็กเกจ', 'เพิ่มนักเรียน จัดการแพ็กเกจชั่วโมง และออกบิลรายคน'],
          ['👥 กลุ่ม', 'สอนและออกบิลแบบกลุ่ม บันทึกคาบครั้งเดียวสำหรับทุกคนในกลุ่ม'],
          ['🧾 บิล & ใบเสร็จ', 'ออกบิล PDF พร้อม QR PromptPay ส่ง LINE เป็นรูปภาพได้ทันที'],
          ['📱 Portal นักเรียน', 'นักเรียนเข้าดูประวัติ คะแนน ตาราง และเข้าห้องเรียนผ่าน /portal'],
        ].map(([title, desc]) => (
          <div key={title} className="flex gap-3 p-3 bg-gray-50 rounded-[10px] border border-gray-100">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">{title}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
      <SectionTitle>ฐานข้อมูล</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ข้อมูลทั้งหมดเก็บใน <strong>Google Sheets</strong> ที่เชื่อมกับบัญชี Google ของคุณ ไม่มีเซิร์ฟเวอร์กลาง ข้อมูลอยู่ที่คุณเต็มๆ
      </p>
      <Tip>กด "รีเฟรช" (ไอคอน ↺ ด้านบน) ทุกครั้งหลังจากแก้ไขข้อมูลใน Google Sheets โดยตรง</Tip>
    </div>
  );

  if (id === 'calendar') return (
    <div className="space-y-4">
      <SectionTitle>เพิ่มตารางสอน</SectionTitle>
      <div className="space-y-2">
        <Step n="1">คลิกที่วันในปฏิทิน — แผง "ตารางวันนี้" จะเปิดขึ้น</Step>
        <Step n="2">กดปุ่ม <strong>+ เพิ่มตาราง</strong> ใต้ชื่อวัน</Step>
        <Step n="3">เลือกนักเรียน, เวลาเริ่ม-สิ้นสุด, วิชา</Step>
        <Step n="4">เลือกรูปแบบซ้ำ: ครั้งเดียว / ทุกสัปดาห์ / ทุก 2 สัปดาห์</Step>
        <Step n="5">กด <strong>บันทึก</strong></Step>
      </div>
      <SectionTitle>ยกเลิกหรือเลื่อนคาบ</SectionTitle>
      <div className="space-y-2">
        <Step n="1">คลิกที่คาบที่ต้องการ — จะมีแผงรายละเอียดเปิดขึ้น</Step>
        <Step n="2">กด <strong>ยกเลิกคาบนี้</strong> หากต้องการยกเลิกเพียงครั้งเดียว หรือ <strong>ยกเลิกทั้งหมด</strong> หากต้องการยกเลิกตลอดไป</Step>
        <Step n="3">หากต้องการเลื่อน: ยกเลิกคาบนี้ก่อน แล้วเพิ่มตารางใหม่ในวันที่ต้องการ</Step>
      </div>
      <SectionTitle>Action Inbox</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        กล่องด้านขวาของปฏิทินแสดง <strong>คาบที่รอดำเนินการ</strong> เช่น คาบที่ผ่านมาแล้วแต่ยังไม่ได้บันทึก ช่วยให้ไม่หลุดบันทึก
      </p>
      <SectionTitle>ส่ง LINE แจ้งเตือนก่อนเรียน</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ระบบส่ง LINE ให้นักเรียนอัตโนมัติก่อนเรียนตามเวลาที่ตั้งไว้ (เช่น 30 นาทีล่วงหน้า) ตั้งค่าได้ที่ <strong>ตั้งค่า → LINE OA</strong>
      </p>
      <Tip>คลิกปุ่ม "ส่งแจ้งเตือนก่อนเรียน" ในแผงตารางวันได้ทุกเมื่อ หากต้องการส่งด้วยตนเอง</Tip>
    </div>
  );

  if (id === 'sessions') return (
    <div className="space-y-4">
      <SectionTitle>บันทึกคาบเรียน</SectionTitle>
      <div className="space-y-2">
        <Step n="1">ไปที่ปฏิทิน คลิกวันที่สอน</Step>
        <Step n="2">คลิกที่คาบในแผงวัน แล้วกด <strong>บันทึกการสอน</strong></Step>
        <Step n="3">ระบบสร้าง session อัตโนมัติจากเวลาในตาราง</Step>
        <Step n="4">ให้คะแนน 4 ทักษะ (ไม่บังคับ): ฟัง พูด อ่าน เขียน (1-5 ดาว)</Step>
        <Step n="5">กด <strong>บันทึก</strong></Step>
      </div>
      <SectionTitle>บันทึกนอกตาราง</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ไปที่เมนู <strong>ประวัติการสอน</strong> แล้วกด <strong>+ บันทึกคาบ</strong> เพื่อเพิ่มคาบที่ไม่ได้อยู่ในตาราง
      </p>
      <SectionTitle>ดูและแก้ไขประวัติ</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        เมนู <strong>ประวัติการสอน</strong> แสดงทุกคาบ กรองตามนักเรียนหรือช่วงวันที่ได้ คลิกที่แถวเพื่อแก้ไข
      </p>
      <Tip>คะแนนทักษะที่บันทึกจะแสดงในกราฟเรดาร์บน Portal ของนักเรียนด้วย</Tip>
    </div>
  );

  if (id === 'students') return (
    <div className="space-y-4">
      <SectionTitle>เพิ่มนักเรียนใหม่</SectionTitle>
      <div className="space-y-2">
        <Step n="1">เมนู <strong>นักเรียน & ออกบิล</strong> → กด <strong>+ เพิ่มนักเรียน</strong></Step>
        <Step n="2">กรอกชื่อ, ชื่อย่อ (nickname), ราคาต่อชั่วโมง</Step>
        <Step n="3">กด <strong>บันทึก</strong> — ระบบสร้างรหัส Login อัตโนมัติ (เช่น PA47)</Step>
      </div>
      <SectionTitle>รหัส Login นักเรียน</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        รหัสสร้างจาก <strong>ตัวย่อชื่อ + ตัวเลข</strong> เช่น "ปาน" → PA47 นักเรียนใช้รหัสนี้เข้า Portal และส่งให้ LINE OA เพื่อเชื่อม LINE
      </p>
      <SectionTitle>แพ็กเกจชั่วโมง</SectionTitle>
      <div className="space-y-2">
        <Step n="1">ในการ์ดนักเรียน กดปุ่ม <strong>เติมแพ็กเกจ</strong></Step>
        <Step n="2">ใส่จำนวนชั่วโมงที่ซื้อ</Step>
        <Step n="3">กด <strong>บันทึก</strong> — ระบบหักชั่วโมงอัตโนมัติทุกครั้งที่บันทึกคาบ</Step>
      </div>
      <SectionTitle>เชื่อมต่อ LINE</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        นักเรียนส่งรหัส Login ไปที่ LINE OA ของสถาบัน ระบบจะเชื่อม LINE User ID กับบัญชีนักเรียนโดยอัตโนมัติ หลังจากนั้นส่งบิลและแจ้งเตือนผ่าน LINE ได้ทันที
      </p>
      <Tip>ดูสถานะ LINE ของนักเรียนได้ในคอลัมน์ "LINE" ในรายชื่อนักเรียน — ไอคอนสีเขียว = เชื่อมแล้ว</Tip>
    </div>
  );

  if (id === 'invoices') return (
    <div className="space-y-4">
      <SectionTitle>ออกบิล</SectionTitle>
      <div className="space-y-2">
        <Step n="1">เมนู <strong>นักเรียน & ออกบิล</strong> → หาการ์ดนักเรียน</Step>
        <Step n="2">กด <strong>ออกบิล</strong> — ระบบรวบรวมคาบที่ยังไม่ได้ออกบิลทั้งหมด</Step>
        <Step n="3">ตรวจสอบรายการ แล้วกด <strong>ยืนยันออกบิล</strong></Step>
        <Step n="4">บิลจะแสดงขึ้นพร้อม QR PromptPay</Step>
      </div>
      <SectionTitle>ส่งบิลให้นักเรียน</SectionTitle>
      <div className="grid gap-2">
        {[
          ['📄 ดาวน์โหลด PDF', 'กดปุ่ม "PDF" ในหน้าบิล — ไฟล์ PDF พร้อมส่งทันที'],
          ['🖼️ ส่ง LINE รูปภาพ', 'กดปุ่ม "ส่ง LINE (รูป)" — ระบบส่งรูปบิลเข้า LINE ของนักเรียนโดยตรง'],
          ['📤 แชร์', 'กดปุ่มแชร์เพื่อส่งผ่านแอปอื่น'],
        ].map(([t, d]) => (
          <div key={t} className="p-3 bg-gray-50 rounded-[10px] border border-gray-100">
            <p className="text-[13px] font-semibold text-gray-900">{t}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{d}</p>
          </div>
        ))}
      </div>
      <SectionTitle>รับเงิน (ออกใบเสร็จ)</SectionTitle>
      <div className="space-y-2">
        <Step n="1">เมนู <strong>บิล & ใบเสร็จ</strong> → ค้นหาบิลที่ต้องการ</Step>
        <Step n="2">กด <strong>รับเงิน</strong> → เลือกช่องทางชำระ และยืนยัน</Step>
        <Step n="3">สถานะบิลเปลี่ยนเป็น PAID พร้อมออกใบเสร็จ</Step>
      </div>
      <Tip>VAT และราคาต่อชั่วโมงเริ่มต้น ตั้งค่าได้ที่หน้า <strong>ตั้งค่า</strong></Tip>
    </div>
  );

  if (id === 'groups') return (
    <div className="space-y-4">
      <SectionTitle>สร้างกลุ่ม</SectionTitle>
      <div className="space-y-2">
        <Step n="1">เมนู <strong>จัดการกลุ่ม</strong> → กด <strong>+ สร้างกลุ่ม</strong></Step>
        <Step n="2">ตั้งชื่อกลุ่ม, เลือกสมาชิก, ตั้งอัตราค่าเรียน</Step>
        <Step n="3">ใส่ LINE Group ID (ถ้ามี) เพื่อส่งแจ้งเตือนเข้ากลุ่ม LINE</Step>
        <Step n="4">กด <strong>บันทึก</strong></Step>
      </div>
      <SectionTitle>บันทึกคาบกลุ่ม</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ในปฏิทิน คาบกลุ่มจะมีไอคอน 👥 สีส้ม คลิกแล้วกด <strong>บันทึกการสอน</strong> — ระบบสร้าง session ให้สมาชิกทุกคนพร้อมกัน
      </p>
      <SectionTitle>ออกบิลกลุ่ม</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ใน <strong>จัดการกลุ่ม</strong> กดปุ่ม 3 จุด → <strong>ออกบิลกลุ่ม</strong> ระบบออกบิลแยกให้สมาชิกแต่ละคนตามอัตราของตนเอง
      </p>
      <SectionTitle>แพ็กเกจกลุ่ม</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        กด <strong>แพ็กเกจกลุ่ม (เติม)</strong> เพื่อเติมชั่วโมงพร้อมกันทุกคน หรือ <strong>เติมแพ็กเกจ (รายคน)</strong> เพื่อเติมทีละคน
      </p>
      <Tip>Portal กลุ่ม (/portal) รองรับรหัสกลุ่ม (เช่น G47) — นักเรียนในกลุ่มเข้าดูข้อมูลกลุ่มได้</Tip>
    </div>
  );

  if (id === 'dashboard') return (
    <div className="space-y-4">
      <SectionTitle>ข้อมูลที่แสดงใน Dashboard</SectionTitle>
      <div className="grid gap-3">
        {[
          ['📊 รายได้รายเดือน', 'กราฟแท่งแสดงรายได้จากคาบที่ออกบิลแล้ว เทียบรายเดือน'],
          ['📈 ชั่วโมงสอน', 'จำนวนชั่วโมงสะสมทั้งหมดและรายเดือน'],
          ['👨‍🎓 นักเรียน Active', 'รายชื่อนักเรียนที่มีคาบในช่วง 30 วันที่ผ่านมา'],
          ['⭐ คะแนนเฉลี่ย', 'คะแนนทักษะเฉลี่ยแยกตามนักเรียน'],
          ['💳 บิลค้างรับ', 'รายการบิลที่ออกแล้วแต่ยังไม่ได้รับเงิน'],
        ].map(([t, d]) => (
          <div key={t} className="flex gap-3 p-3 bg-gray-50 rounded-[10px] border border-gray-100">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">{t}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">{d}</p>
            </div>
          </div>
        ))}
      </div>
      <Tip>Dashboard อ่านข้อมูลจาก Google Sheets ตรงๆ กด รีเฟรช (↺) เพื่ออัพเดทข้อมูลล่าสุด</Tip>
    </div>
  );

  if (id === 'templates') return (
    <div className="space-y-4">
      <SectionTitle>Template ข้อความ LINE</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ปรับแต่งข้อความที่ระบบส่งให้นักเรียนผ่าน LINE OA ได้ที่เมนู <strong>Template ข้อความ</strong>
      </p>
      <SectionTitle>ตัวแปรที่ใช้ได้</SectionTitle>
      <div className="grid gap-2">
        {[
          ['{studentName}', 'ชื่อนักเรียน'],
          ['{groupName}', 'ชื่อกลุ่ม'],
          ['{subject}', 'วิชาที่เรียน'],
          ['{timeStart}', 'เวลาเริ่มเรียน (เช่น 10:00)'],
          ['{timeEnd}', 'เวลาสิ้นสุด (เช่น 11:30)'],
          ['{portalUrl}', 'ลิงก์เข้า Portal ของนักเรียน'],
          ['{stuCode}', 'รหัส Login ของนักเรียน'],
        ].map(([v, d]) => (
          <div key={v} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-[8px] border border-gray-100">
            <code className="text-[12px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{v}</code>
            <span className="text-[13px] text-gray-600">{d}</span>
          </div>
        ))}
      </div>
      <SectionTitle>Tab "ข้อความระบบ"</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        แก้ไขข้อความสำเร็จรูปที่ระบบใช้ เช่น ข้อความแจ้งเตือนก่อนเรียน, ข้อความแนะนำ Portal กด <strong>รีเซ็ต</strong> เพื่อกลับค่าเริ่มต้น
      </p>
      <Tip>ถ้าเว้นว่างไว้ ระบบจะใช้ข้อความเริ่มต้นอัตโนมัติ</Tip>
    </div>
  );

  if (id === 'settings') return (
    <div className="space-y-4">
      <SectionTitle>LINE OA</SectionTitle>
      <div className="space-y-2">
        <Step n="1">ไปที่ LINE Developers Console → Messaging API</Step>
        <Step n="2">คัดลอก <strong>Channel Access Token</strong></Step>
        <Step n="3">วางใน <strong>ตั้งค่า → LINE OA Token</strong></Step>
        <Step n="4">ใส่ URL ของ Cloudflare Worker (LINE Proxy) ใน <strong>LINE Worker URL</strong></Step>
      </div>
      <SectionTitle>PromptPay</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ใส่เบอร์โทรหรือเลขบัตรประชาชนใน <strong>รหัสพร้อมเพย์</strong> — QR Code จะแสดงในบิลโดยอัตโนมัติ
      </p>
      <SectionTitle>VAT</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        เปิด/ปิด VAT และตั้งเปอร์เซ็นต์ (ค่าเริ่มต้น 7%) ตั้งค่าได้ว่านักเรียนคนไหน VAT-exempt
      </p>
      <SectionTitle>แจ้งเตือนก่อนเรียน</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        เปิดการแจ้งเตือนอัตโนมัติและเลือกว่าจะส่งก่อนกี่นาที (10, 15, 20, 30, 45, หรือ 60 นาที)
      </p>
      <Tip>การตั้งค่าทั้งหมดเก็บใน Google Sheets — เปลี่ยนแล้วมีผลทันทีในทุกอุปกรณ์ที่ login ด้วย Google account เดียวกัน</Tip>
    </div>
  );

  if (id === 'portal') return (
    <div className="space-y-4">
      <SectionTitle>รหัสห้องเรียน (ระบบ Multi-tenant)</SectionTitle>
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[10px] space-y-2">
        <p className="text-[13px] font-semibold text-emerald-800">🏠 ตั้งรหัสห้องเรียนก่อนแชร์ให้นักเรียน</p>
        <div className="space-y-1.5">
          <Step n="1">ไปที่ <strong>ตั้งค่า → Portal นักเรียน</strong></Step>
          <Step n="2">ตั้ง <strong>รหัสห้องเรียน</strong> สูงสุด 4 ตัวอักษร เช่น <code className="text-[12px] font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">ZWEN</code></Step>
          <Step n="3">กด <strong>บันทึก</strong> — รหัสจะถูกลงทะเบียนในระบบทันที</Step>
        </div>
      </div>
      <SectionTitle>แชร์ Portal ให้นักเรียน</SectionTitle>
      <div className="space-y-2">
        <Step n="1">แชร์ URL <code className="text-[12px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">/portal</code> ให้นักเรียน</Step>
        <Step n="2">นักเรียนกรอก <strong>รหัสห้องเรียน</strong> (เช่น ZWEN) และ <strong>รหัสนักเรียน</strong> (เช่น PA47)</Step>
        <Step n="3">นักเรียนเห็น: ตารางสัปดาห์นี้, ชั่วโมงแพ็กเกจ, คะแนน 4 ทักษะ, ประวัติ</Step>
      </div>
      <p className="text-[13px] text-gray-500">หากไม่ตั้งรหัสห้องเรียน นักเรียนต้องเข้าจากลิงก์ที่มี <code className="font-mono">?code=</code> แทน</p>
      <SectionTitle>ข้อความ LINE / คัดลอก / แชร์</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        ข้อความที่ส่ง LINE หรือคัดลอกจากหน้า <strong>นักเรียน / กลุ่ม</strong> จะมี <strong>รหัสห้องเรียน</strong> แนบให้อัตโนมัติ เมื่อตั้งค่าไว้แล้ว
      </p>
      <SectionTitle>การเข้าห้องเรียนจาก Portal</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        เมื่อครูอยู่ออนไลน์ในช่วงเวลาเรียน บนหน้า Portal จะมีแบนเนอร์ <strong>"ครูพร้อมแล้ว"</strong> ปรากฏขึ้น นักเรียนกดปุ่มนั้นเพื่อเข้าห้องเรียนวิดีโอ
      </p>
      <SectionTitle>เชื่อม LINE</SectionTitle>
      <div className="space-y-2">
        <Step n="1">นักเรียนไปที่ Portal → tab <strong>"เชื่อมต่อ"</strong> — คัดลอกรหัส Login</Step>
        <Step n="2">ส่งรหัสนั้นไปที่ LINE Official Account ของสถาบัน</Step>
        <Step n="3">ระบบตอบกลับยืนยัน — หลังจากนั้นนักเรียนรับบิลและแจ้งเตือนผ่าน LINE ได้</Step>
      </div>
      <SectionTitle>กลุ่ม</SectionTitle>
      <p className="text-[14px] text-gray-600 leading-relaxed">
        นักเรียนในกลุ่มสามารถใส่รหัสกลุ่ม (เช่น G47) ใน Portal เพื่อดูข้อมูลและตารางกลุ่มได้
      </p>
      <Tip>ส่งลิงก์ <code className="text-[12px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">/portal?code=PA47</code> ให้นักเรียนเพื่อ auto-login โดยไม่ต้องพิมพ์รหัสห้องเรียนหรือรหัสนักเรียน</Tip>
    </div>
  );

  return null;
}

export function HelpModal({ open, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full bg-white rounded-[20px] shadow-[0_32px_80px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden"
        style={{ maxWidth: 900, maxHeight: 'min(88vh, 700px)', animation: 'slideUp 220ms cubic-bezier(0.22,1,0.36,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-[17px] font-bold text-gray-900">คู่มือการใช้งาน</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">ระบบจัดการติวพิเศษ · ฉบับครู</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile nav: horizontal scroll */}
        <div className="lg:hidden flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto flex-shrink-0">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveIdx(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${activeIdx === i ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Desktop sidebar nav */}
          <nav className="hidden lg:flex flex-col w-52 border-r border-gray-100 flex-shrink-0 overflow-y-auto py-2">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActiveIdx(i)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-left transition-colors ${activeIdx === i ? 'bg-emerald-50 text-emerald-700 font-semibold border-r-2 border-emerald-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                {s.icon}
                <span className="flex-1">{s.label}</span>
                {activeIdx === i && <ChevronRight className="w-3.5 h-3.5 text-emerald-500" />}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-xl">
              <h2 className="text-[19px] font-bold text-gray-900 mb-4 flex items-center gap-2">
                {SECTIONS[activeIdx].icon}
                {SECTIONS[activeIdx].label}
              </h2>
              <SectionContent id={SECTIONS[activeIdx].id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
