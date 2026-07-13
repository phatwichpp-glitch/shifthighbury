// @ts-nocheck
import { useState, useEffect } from 'react';
import { inputClasses, labelClasses, btnPrimary, btnSecondary } from '../components/ui/styles';
import { MessageSquare, Settings2 } from 'lucide-react';
import { CopyButton } from '../components/ui/CopyButton';
import { SETTINGS } from '../lib/constants';
import { updateSettings, getSettings } from '../services/googleSheets';

const DEFAULT_TEMPLATES = [
  { id: 'lesson-summary', name: 'สรุปบทเรียน', text: '📚 สรุปบทเรียนวันนี้ครับ\n\nวิชา: {subject}\nเนื้อหา: {note}\n\nการบ้าน: {homework}\n\nสอบถามเพิ่มเติมได้เลยนะครับ 😊' },
  { id: 'bill-reminder', name: 'แจ้งเตือนบิล', text: '💰 แจ้งเตือนค่าเรียนครับ\n\nเรียนคุณ{name} ครับ\nมีบิลค้างชำระ {amount} บาท\nกรุณาชำระภายใน {due} นะครับ 🙏' },
  { id: 'class-cancel', name: 'ยกเลิกคลาส', text: '⚠️ แจ้งเลื่อนคลาสครับ\n\nเรียนคุณ{name} ครับ\nขอเลื่อนคลาสวันที่ {date} เนื่องจาก{reason}\nจะนัดวันใหม่ให้เร็วๆ นี้นะครับ 🙏' },
  { id: 'encouragement', name: 'กำลังใจ', text: '🌟 สู้ๆ นะครับ!\n\nคุณ{name} พัฒนาขึ้นมากเลยครับ\nโดยเฉพาะเรื่อง{skill} ครับ\nเดินหน้าต่อไปนะครับ 💪' },
];

export { DEFAULT_TEMPLATES };

export function getTemplates() {
  try { return JSON.parse(localStorage.getItem('zw_templates') || 'null') || DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; }
}

export function fillTemplate(text, vars) {
  return text
    .replace(/\{name\}/g, vars.name || '')
    .replace(/\{subject\}/g, vars.subject || '')
    .replace(/\{date\}/g, vars.date || '')
    .replace(/\{amount\}/g, vars.amount || '')
    .replace(/\{note\}/g, vars.note || '')
    .replace(/\{homework\}/g, vars.homework || '')
    .replace(/\{reason\}/g, vars.reason || '')
    .replace(/\{skill\}/g, vars.skill || '')
    .replace(/\{due\}/g, vars.due || '');
}

const SYS_MSG_DEFS = [
  {
    key: SETTINGS.MSG_PORTAL_REMINDER,
    name: 'แจ้งเตือนคลาส (Portal)',
    hint: 'ส่งก่อนคลาส — ตัวแปร: {name} {subject} {time} {url} {code} {class_code}',
    defaultText: `สวัสดีครับคุณ{name} 😊\nใกล้ถึงเวลาเรียนแล้วนะครับ{subject}\n{time}\n\n📱 เข้า Portal เพื่อกดลิงก์เข้าห้องเรียนได้เลยนะครับ:\n👉 {url}\nClass Code: {class_code}\nLogin Code: {code}`,
  },
  {
    key: SETTINGS.MSG_GROUP_PORTAL_REMINDER,
    name: 'แจ้งเตือนคลาสกลุ่ม (Portal)',
    hint: 'ส่งก่อนคลาสกลุ่ม — ตัวแปร: {name} {group} {subject} {time} {url} {code} {class_code}',
    defaultText: `สวัสดีครับคุณ{name} 😊\nใกล้ถึงเวลาเรียน{group}แล้วนะครับ{subject}\n{time}\n\n📱 เข้า Portal เพื่อกดลิงก์เข้าห้องเรียนได้เลยนะครับ:\n👉 {url}\nClass Code: {class_code}\nLogin Code: {code}`,
  },
  {
    key: SETTINGS.MSG_PORTAL_INTRO,
    name: 'แนะนำ Portal (รายคน)',
    hint: 'ส่งครั้งแรกเมื่อเพิ่มนักเรียนใหม่ — ตัวแปร: {name} {url} {code} {class_code}',
    defaultText: `สวัสดีครับคุณ{name} 😊\n\nสามารถเข้า Student Portal เพื่อดูตารางเรียน คะแนน และข้อมูลการเรียนได้เลยนะครับ\n\n📚 ลิงก์เข้าระบบ:\n👉 {url}\n🔑 Class Code: {class_code}\nLogin Code: {code}`,
  },
  {
    key: SETTINGS.MSG_GROUP_PORTAL_INTRO,
    name: 'แนะนำ Portal (กลุ่ม)',
    hint: 'ส่งในกลุ่ม LINE — ตัวแปร: {group} {url} {class_code}',
    defaultText: `สวัสดีครับนักเรียนกลุ่ม{group} 😊\n\nสามารถเข้า Student Portal เพื่อดูตารางเรียน คะแนน และข้อมูลการเรียนได้เลยนะครับ\n\n📚 ลิงก์เข้าระบบ:\n👉 {url}\n🔑 สามารถใช้รหัสกลุ่มหรือรหัสส่วนตัวของแต่ละคนในการล็อกอินนะครับ\n🔑 Class Code: {class_code}\nLogin Code: {code}`,
  },
  {
    key: SETTINGS.MSG_ZOOM,
    name: 'ลิงก์เข้าเรียน Zoom',
    hint: 'ส่งก่อนคลาส Zoom — ตัวแปร: {name} {subject} {time} {url}',
    defaultText: `🎥 ลิงก์เข้าเรียน Zoom ครับ\n\nสวัสดีครับคุณ{name} 😊\nใกล้ถึงเวลาเรียนแล้วนะครับ{subject}\n{time}\n\n🔗 {url}\n\nกดลิงก์เข้าห้องเรียนได้เลยครับ เจอกันนะครับ 🌟`,
  },
];

function SystemMessages({ accessToken, dbId, toast }) {
  const [values, setValues] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken || !dbId) return;
    getSettings(accessToken, dbId).then(row => {
      if (!row) return;
      const init = {};
      SYS_MSG_DEFS.forEach(({ key }) => { init[key] = row[key] || ''; });
      setValues(init);
    }).catch(() => {});
  }, [accessToken, dbId]);

  const startEdit = (def) => { setEditingKey(def.key); setEditText(values[def.key] || def.defaultText); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const row = await getSettings(accessToken, dbId);
      if (!row) throw new Error('โหลด settings ไม่ได้');
      const newRow = [...row];
      while (newRow.length <= editingKey) newRow.push('');
      newRow[editingKey] = editText.trim() === SYS_MSG_DEFS.find(d => d.key === editingKey)?.defaultText.trim() ? '' : editText;
      await updateSettings(accessToken, dbId, newRow);
      setValues(v => ({ ...v, [editingKey]: editText }));
      setEditingKey(null);
      toast('บันทึก template ระบบแล้วครับ');
    } catch (e) {
      toast(e.message || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const def = SYS_MSG_DEFS.find(d => d.key === editingKey);
    if (def) setEditText(def.defaultText);
  };

  return (
    <div className="space-y-3">
      {SYS_MSG_DEFS.map(def => {
        const current = values[def.key]?.trim() || def.defaultText;
        const isCustom = !!(values[def.key]?.trim());
        return (
          <div key={def.key} className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-semibold text-gray-900 text-[14px] flex items-center gap-2">
                  {def.name}
                  {isCustom && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">แก้ไขแล้ว</span>}
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">{def.hint}</p>
              </div>
              <button onClick={() => startEdit(def)} className="text-[12px] text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors shrink-0">แก้ไข</button>
            </div>
            <p className="text-[12px] text-gray-500 whitespace-pre-wrap line-clamp-3 leading-relaxed">{current}</p>
          </div>
        );
      })}

      {editingKey !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] border border-blue-200 p-5 shadow-xl w-full max-w-lg">
            <h3 className="font-semibold text-gray-900 mb-1">{SYS_MSG_DEFS.find(d => d.key === editingKey)?.name}</h3>
            <p className="text-[11px] text-gray-400 mb-3">{SYS_MSG_DEFS.find(d => d.key === editingKey)?.hint}</p>
            <textarea value={editText} onChange={e => setEditText(e.target.value)} className={`${inputClasses} resize-none text-[13px]`} rows={8} />
            <div className="flex gap-3 justify-between pt-3">
              <button onClick={handleReset} className="text-[12px] text-gray-400 hover:text-gray-600 underline">คืนค่าเริ่มต้น</button>
              <div className="flex gap-2">
                <button onClick={() => setEditingKey(null)} className={btnSecondary} disabled={saving}>ยกเลิก</button>
                <button onClick={handleSave} className={btnPrimary} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Templates({ accessToken, dbId, toast }) {
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zw_templates') || 'null') || DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; }
  });
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('custom');

  const save = (list) => { setTemplates(list); localStorage.setItem('zw_templates', JSON.stringify(list)); };

  const handleSave = () => {
    if (!editing.name.trim() || !editing.text.trim()) return toast('กรุณากรอกชื่อและข้อความครับ', 'error');
    const exists = templates.find(t => t.id === editing.id);
    if (exists) save(templates.map(t => t.id === editing.id ? editing : t));
    else save([...templates, { ...editing, id: 'tpl-' + Date.now() }]);
    setEditing(null);
    toast('บันทึก template แล้วครับ');
  };

  const handleDelete = (id) => { save(templates.filter(t => t.id !== id)); toast('ลบ template แล้วครับ'); };

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-[24px] font-bold text-gray-900 flex items-center gap-2"><MessageSquare className="w-6 h-6 text-gray-600" />Template ข้อความ</h2>
          <p className="text-[14px] text-gray-500 mt-1">จัดการ template ข้อความที่ใช้บ่อย — ส่งตรงจากหน้านักเรียนได้เลย ไม่ต้องมาแก้ทีละครั้งครับ</p>
        </div>
        {tab === 'custom' && <button onClick={() => setEditing({ id: '', name: '', text: '' })} className={btnPrimary}>+ เพิ่ม Template</button>}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-[10px] p-1 w-fit">
        <button onClick={() => setTab('custom')} className={`px-4 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${tab === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Template ของฉัน</button>
        <button onClick={() => setTab('system')} className={`px-4 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors flex items-center gap-1.5 ${tab === 'system' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Settings2 className="w-3.5 h-3.5" />ข้อความระบบ</button>
      </div>

      {tab === 'system' && (
        <div>
          <p className="text-[13px] text-gray-500 mb-3">ข้อความที่ระบบส่งอัตโนมัติ — แก้ไขข้อความหรือภาษาได้ตามต้องการ บันทึกลง Google Sheets</p>
          <SystemMessages accessToken={accessToken} dbId={dbId} toast={toast} />
        </div>
      )}

      {tab === 'custom' && (
        <>
          {editing && (
            <div className="bg-white rounded-[16px] border border-blue-200 p-5 shadow-sm animate-[slideIn_150ms_ease-out]">
              <h3 className="font-semibold text-gray-900 mb-4">{editing.id ? 'แก้ไข Template' : 'เพิ่ม Template ใหม่'}</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelClasses}>ชื่อ Template</label>
                  <input value={editing.name} onChange={e => setEditing(f => ({ ...f, name: e.target.value }))} className={inputClasses} placeholder="เช่น สรุปบทเรียน" />
                </div>
                <div>
                  <label className={labelClasses}>ข้อความ</label>
                  <textarea value={editing.text} onChange={e => setEditing(f => ({ ...f, text: e.target.value }))} className={`${inputClasses} resize-none`} rows={6} placeholder="พิมพ์ข้อความ... ใช้ {name} {subject} {note} แทนชื่อ/วิชา/หมายเหตุได้ครับ" />
                  <p className="text-[11px] text-gray-400 mt-1">ตัวแปร: {'{name}'} = ชื่อนักเรียน, {'{subject}'} = วิชา, {'{note}'} = หมายเหตุ, {'{date}'} = วันที่, {'{amount}'} = ยอดเงิน</p>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button onClick={() => setEditing(null)} className={btnSecondary}>ยกเลิก</button>
                  <button onClick={handleSave} className={btnPrimary}>บันทึก</button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-semibold text-gray-900 text-[15px]">{t.name}</h4>
                  <div className="flex gap-1.5">
                    <button onClick={() => setEditing(t)} className="text-[12px] text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">แก้ไข</button>
                    <button onClick={() => handleDelete(t.id)} className="text-[12px] text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">ลบ</button>
                  </div>
                </div>
                <p className="text-[13px] text-gray-600 whitespace-pre-wrap mb-3 leading-relaxed line-clamp-4">{t.text}</p>
                <CopyButton
                  variant="button"
                  text={t.text}
                  label="คัดลอกข้อความ"
                  onCopy={() => toast('คัดลอกแล้วครับ')}
                  className="w-full py-2 rounded-[8px] text-[13px] font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
