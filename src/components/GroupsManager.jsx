// @ts-nocheck
// ============================================================
// GroupsManager — Refactored
// New features:
//   1. Group Billing Modal: เลือกคาบทุกคนในหน้าเดียว
//   2. Billing Mode Toggle: "แยกบิลรายคน" vs "รวมบิลเดียว"
//   3. Consolidated Invoice: เลือก Primary Payer ได้
//   4. handleCreateGroupInvoices: รองรับทั้ง 2 โหมด
//
// Rules: googleSheets.js ไม่ถูกแตะ — build payload ฝั่ง React แทน
// ============================================================
import { copyText } from '../lib/business';
import { TEACHER_ROLE_LABEL } from '../lib/appConfig';
import { Receipt, MessageCircle, Video, Package, Pencil, Trash2, X, AlertTriangle, Check, Copy, Send } from 'lucide-react';
import { RowActionsMenu } from './ui/RowActionsMenu';

function GroupsManager({ accessToken, dbId, toast }) {
  // ── Form / Edit states ─────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '', studentIds: [], line_group_id: '', default_subject: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const { confirm, Dialog } = useConfirm();

  // ── Group Billing states ───────────────────────────────────────────────
  const [billingGroup, setBillingGroup] = useState(null);
  const [groupUnbilledMap, setGroupUnbilledMap] = useState({});   // studentId → sessions[]
  const [groupInvoiceNumbers, setGroupInvoiceNumbers] = useState({}); // studentId → invNum
  const [groupDateFrom, setGroupDateFrom] = useState('');
  const [groupDateTo, setGroupDateTo] = useState('');
  const [groupSelectedIds, setGroupSelectedIds] = useState({});   // studentId → sessionId[]

  // ── NEW: Billing Mode ─────────────────────────────────────────────────
  // 'separate' = แยกบิลรายคน (Logic เดิม) | 'consolidated' = รวมบิลเดียว
  const [billingMode, setBillingMode] = useState('separate');
  const [primaryPayerId, setPrimaryPayerId] = useState('');       // ผู้ชำระหลักสำหรับโหมด consolidated

  // ── Package / Preview / Export states (unchanged) ─────────────────────
  const [previewData, setPreviewData] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingLineImage, setIsSendingLineImage] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [topUpGroup, setTopUpGroup] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpMode, setTopUpMode] = useState('hours');
  const [topUpMoneyAmount, setTopUpMoneyAmount] = useState('');
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [pkgHistoryGroup, setPkgHistoryGroup] = useState(null);
  const [sendTemplateTarget, setSendTemplateTarget] = useState(null);

  // ── Data ────────────────────────────────────────────────────────────
  const { data, refresh } = useSheetData({
    accessToken, dbId,
    fetchers: {
      groups: getGroups, students: getStudents, sessions: getSessions,
      invoices: getInvoices, settings: getSettings, receipts: getReceipts,
    },
  });
  const groups    = data.groups   || [];
  const students  = data.students || [];
  const sessions  = data.sessions || [];
  const invoices  = data.invoices || [];
  const receipts  = data.receipts || [];
  const settingsRow = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings : null;
  const lineOAEnabled = isLineOAEnabled(settingsRow);

  const getStudentName = (id) =>
    (students.find((s) => s[STUDENT.ID] === id) || [])[STUDENT.NAME] || id;

  // QR Code effect (unchanged logic)
  useEffect(() => {
    let active = true;
    if (previewData && settingsRow?.[SETTINGS.PROMPTPAY_ID]) {
      generatePromptPayQRCode(settingsRow[SETTINGS.PROMPTPAY_ID], previewData.totalAmount)
        .then((url) => { if (active) setQrCodeUrl(url || ''); });
    } else setQrCodeUrl('');
    return () => { active = false; };
  }, [previewData, settingsRow]);

  // ── Derived: total summary for consolidated mode (live) ───────────────
  const consolidatedSummary = useMemo(() => {
    if (!billingGroup) return { totalHours: 0, totalAmount: 0, studentLines: [] };
    const memberIds = groupStudentIds(billingGroup.data);
    const lines = memberIds.map((sid) => {
      const stu    = students.find((s) => s[STUDENT.ID] === sid);
      const rate   = safeFloat(stu?.[STUDENT.RATE] || 0);
      const selIds = groupSelectedIds[sid] || [];
      const unbilledFiltered = (groupUnbilledMap[sid] || []).filter((s) => {
        if (groupDateFrom && s.data[SESSION.DATE] < groupDateFrom) return false;
        if (groupDateTo   && s.data[SESSION.DATE] > groupDateTo)   return false;
        return true;
      });
      const chosen = unbilledFiltered.filter((s) => selIds.includes(s.data[SESSION.ID]));
      const hours  = chosen.reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);
      return {
        sid, stuName: stu?.[STUDENT.NAME] || sid, rate,
        hours, amount: hours * rate, sessionCount: chosen.length,
      };
    }).filter((l) => l.sessionCount > 0);
    const totalHours  = lines.reduce((s, l) => s + l.hours, 0);
    const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
    return { totalHours, totalAmount, studentLines: lines };
  }, [billingGroup, groupSelectedIds, groupUnbilledMap, groupDateFrom, groupDateTo, students]);

  // ── Open billing modal ─────────────────────────────────────────────────
  const handleOpenGroupBilling = (group) => {
    const memberIds  = groupStudentIds(group.data);
    const unbilledMap  = {};
    const invoiceNums  = {};
    const selectedMap  = {};
    const prefix = settingsRow?.[SETTINGS.PREFIX] || 'ZW';
    const year   = new Date().getFullYear();
    memberIds.forEach((sid, i) => {
      const unbilled = sessions
        .map((s, ri) => ({ data: s, rowIndex: ri + 2 }))
        .filter((s) =>
          s.data[SESSION.STUDENT_ID] === sid &&
          s.data[SESSION.INVOICED]   === 'FALSE' &&
          s.data[SESSION.DELETED]    !== 'TRUE',
        )
        .sort((a, b) => new Date(a.data[SESSION.DATE]) - new Date(b.data[SESSION.DATE]));
      unbilledMap[sid]  = unbilled;
      invoiceNums[sid]  = `${prefix}-${year}-${String(Date.now()).slice(-4)}-${i + 1}`;
      selectedMap[sid]  = unbilled.map((s) => s.data[SESSION.ID]);
    });
    setGroupUnbilledMap(unbilledMap);
    setGroupInvoiceNumbers(invoiceNums);
    setGroupSelectedIds(selectedMap);
    setGroupDateFrom('');
    setGroupDateTo('');
    setBillingMode('separate');
    setPrimaryPayerId(memberIds[0] || '');
    setBillingGroup(group);
  };

  // ── Toggle a session checkbox ──────────────────────────────────────────
  const toggleSession = (sid, sessionId) => {
    setGroupSelectedIds((prev) => {
      const cur = prev[sid] || [];
      return {
        ...prev,
        [sid]: cur.includes(sessionId)
          ? cur.filter((id) => id !== sessionId)
          : [...cur, sessionId],
      };
    });
  };

  // Toggle ALL sessions for one student
  const toggleAllForStudent = (sid, filteredSessions) => {
    setGroupSelectedIds((prev) => {
      const cur  = prev[sid] || [];
      const allIds = filteredSessions.map((s) => s.data[SESSION.ID]);
      const allSelected = allIds.every((id) => cur.includes(id));
      return {
        ...prev,
        [sid]: allSelected ? cur.filter((id) => !allIds.includes(id)) : Array.from(new Set([...cur, ...allIds])),
      };
    });
  };

  // ── handleCreateGroupInvoices — รองรับ 2 โหมด ─────────────────────────
  const handleCreateGroupInvoices = async (e) => {
    e.preventDefault();
    const memberIds = groupStudentIds(billingGroup.data);
    const hasAny = memberIds.some((sid) => (groupSelectedIds[sid] || []).length > 0);
    if (!hasAny) return toast('กรุณาเลือกคาบเรียนอย่างน้อย 1 คาบค่ะ', 'error');

    setIsSubmitting(true);
    const dateNow = new Date().toLocaleDateString('th-TH');
    const prefix  = settingsRow?.[SETTINGS.PREFIX] || 'ZW';
    const year    = new Date().getFullYear();

    const ok = await runWithFeedback(async () => {
      // ── เตรียม per-student data ──────────────────────────────────────
      const perStudent = memberIds
        .filter((sid) => (groupSelectedIds[sid] || []).length > 0)
        .map((sid, i) => {
          const stu          = students.find((s) => s[STUDENT.ID] === sid);
          const rate         = safeFloat(stu?.[STUDENT.RATE] || 0);
          const unbilledAll  = groupUnbilledMap[sid] || [];
          const sessForBill  = unbilledAll.filter((s) =>
            (groupSelectedIds[sid] || []).includes(s.data[SESSION.ID]),
          );
          const totalHours   = sessForBill.reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);
          const subtotal     = totalHours * rate;
          return { sid, stu, rate, sessForBill, totalHours, subtotal };
        });

      if (billingMode === 'separate') {
        // ════════════════════════════════════════════════════════════════
        // โหมด A: แยกบิลรายคน — Logic เดิม 100%
        // ════════════════════════════════════════════════════════════════
        const invoicesWithItems = perStudent.map((ps, i) => {
          const invId  = 'INV-ID-' + Date.now() + '-' + ps.sid;
          const invNum = groupInvoiceNumbers[ps.sid] || (`${prefix}-${year}-${String(Date.now()).slice(-4)}-${i + 1}`);
          const invoiceRow = [
            invId, invNum, ps.sid, dateNow, '', 'TH',
            ps.totalHours, ps.rate, ps.subtotal, '0', '0', ps.subtotal,
            'โอนเงิน', 'UNPAID', '', new Date().toLocaleString('th-TH'), '', '',
          ];
          const itemsRows = ps.sessForBill.map((s) => [
            'ITEM-' + Date.now() + Math.random().toString(36).slice(2, 6),
            invId,
            s.data[SESSION.ID],
            s.data[SESSION.DATE],
            s.data[SESSION.SUBJECT],
            s.data[SESSION.HOURS],
            ps.rate,
            safeFloat(s.data[SESSION.HOURS]) * ps.rate,
            ps.sid, // student_id column I (schema v5)
          ]);
          const sessionsToMark = ps.sessForBill.map((s) => ({
            rowIndex: s.rowIndex, invoiceId: invId,
          }));
          return { invoiceRow, itemsRows, sessionsToMark };
        });

        await addGroupInvoicesComplete(accessToken, dbId, invoicesWithItems);
        for (const inv of invoicesWithItems) {
          await markSessionsAsInvoiced(accessToken, dbId, inv.sessionsToMark);
        }

      } else {
        // ════════════════════════════════════════════════════════════════
        // โหมด B: รวมบิลเดียว (Consolidated Invoice)
        // ─ สร้าง invoice หัวใบเดียว ใช้ studentId ของ primaryPayer
        // ─ items rows มาจากทุกคน (student_id ในแต่ละ item = เจ้าของจริง)
        // ─ group_invoice_key ช่อง S เชื่อมทุก row ไว้ด้วยกัน
        // ════════════════════════════════════════════════════════════════
        const payerStu    = students.find((s) => s[STUDENT.ID] === primaryPayerId) || perStudent[0]?.stu;
        const payerRate   = safeFloat(payerStu?.[STUDENT.RATE] || 0);
        const grandTotal  = perStudent.reduce((sum, ps) => sum + ps.subtotal, 0);
        const grandHours  = perStudent.reduce((sum, ps) => sum + ps.totalHours, 0);
        const consolidatedInvId  = 'INV-ID-CONS-' + Date.now();
        const consolidatedInvNum = `${prefix}-${year}-${String(Date.now()).slice(-4)}-CONS`;
        const groupInvoiceKey    = 'GRP-INV-' + Date.now(); // tag ที่ช่อง S

        // Invoice header row — ใช้ primary payer เป็น student_id หลัก
        // schema: [id, number, student_id, date, due_date, currency, total_hours, rate,
        //          subtotal, discount, tax, grand_total, payment_method, status,
        //          note, created_at, line_sent_at, pdf_url, group_invoice_key]
        const invoiceRow = [
          consolidatedInvId,
          consolidatedInvNum,
          primaryPayerId,   // ผู้ชำระหลัก
          dateNow, '', 'TH',
          grandHours,
          payerRate,        // rate ของ primary payer (แสดงบน header ใบบิล)
          grandTotal,
          '0', '0',
          grandTotal,
          'โอนเงิน', 'UNPAID', '',
          new Date().toLocaleString('th-TH'),
          '', '',
          groupInvoiceKey,  // column S — ใช้จัดกลุ่มตอนพิมพ์ PDF
        ];

        // Items: รวมทุกคาบจากทุกนักเรียน — student_id ใน column I = เจ้าของคาบนั้น
        const allItemsRows = perStudent.flatMap((ps) =>
          ps.sessForBill.map((s) => [
            'ITEM-' + Date.now() + Math.random().toString(36).slice(2, 6),
            consolidatedInvId,
            s.data[SESSION.ID],
            s.data[SESSION.DATE],
            // Prefix ชื่อนักเรียนเจ้าของคาบไว้ใน subject เพื่อแสดงบน PDF
            `[${getStudentName(ps.sid)}] ${s.data[SESSION.SUBJECT] || ''}`.trim(),
            s.data[SESSION.HOURS],
            ps.rate,
            safeFloat(s.data[SESSION.HOURS]) * ps.rate,
            ps.sid,   // student_id ตัวจริงของรายการนี้
          ]),
        );

        const allSessionsToMark = perStudent.flatMap((ps) =>
          ps.sessForBill.map((s) => ({ rowIndex: s.rowIndex, invoiceId: consolidatedInvId })),
        );

        // ส่งผ่าน addGroupInvoicesComplete แบบ single-element array
        await addGroupInvoicesComplete(accessToken, dbId, [
          { invoiceRow, itemsRows: allItemsRows, sessionsToMark: allSessionsToMark },
        ]);
        await markSessionsAsInvoiced(accessToken, dbId, allSessionsToMark);
      }
    }, toast, billingMode === 'consolidated'
      ? `ออกบิลรวม "${billingGroup.data[GROUP.NAME]}" สำเร็จ!`
      : `ออกบิลกลุ่ม "${billingGroup.data[GROUP.NAME]}" (${groupStudentIds(billingGroup.data).length} ใบ) สำเร็จ!`,
    );

    if (ok) { setBillingGroup(null); refresh({ force: true }); }
    setIsSubmitting(false);
  };

  // ── Group Top-up Handler (unchanged logic) ─────────────────────────────
  const handleGroupTopUp = async (e) => {
    e.preventDefault();
    if (!topUpGroup) return;
    const { group, studentId } = topUpGroup;
    const stu      = students.find((s) => s[STUDENT.ID] === studentId);
    const stuIdx   = students.findIndex((s) => s[STUDENT.ID] === studentId);
    const rate     = safeFloat(stu?.[STUDENT.RATE] || 0);
    const hoursFromAmount = rate > 0 ? Math.round((safeFloat(topUpMoneyAmount) / rate) * 100) / 100 : 0;
    const effectiveHours  = topUpMode === 'amount' ? hoursFromAmount : safeFloat(topUpAmount);
    if (effectiveHours <= 0) return toast('กรุณากรอกจำนวนที่ถูกต้องค่ะ', 'error');
    setIsToppingUp(true);
    const current  = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
    const newHours = current + effectiveHours;
    const ok = await runWithFeedback(
      () => updateStudentPackageHours(accessToken, dbId, stuIdx + 2, newHours),
      toast,
      `เติมแพ็กเกจ ${stu?.[STUDENT.NAME]} สำเร็จ! (เหลือ ${newHours} ชม.)`,
    );
    if (ok) {
      setTopUpGroup(null);
      setTopUpAmount('');
      setTopUpMoneyAmount('');
      setTopUpMode('hours');
      refresh({ force: true });
    }
    setIsToppingUp(false);
  };

  // ── Send Zoom to Group LINE (unchanged logic) ──────────────────────────
  const handleSendGroupZoom = async (group) => {
    const lineToken    = settingsRow?.[SETTINGS.LINE_TOKEN]      || '';
    const lineWorkerUrl = settingsRow?.[SETTINGS.LINE_WORKER_URL] || '';
    const zoomLink     = settingsRow?.[SETTINGS.ZOOM_LINK]        || '';
    if (!lineToken || !lineWorkerUrl) return toast('ยังไม่ได้ตั้งค่า LINE OA ค่ะ', 'error');
    if (!zoomLink)                    return toast('ยังไม่ได้ตั้งค่าลิงก์ Zoom ค่ะ', 'error');
    const lineGroupId = group.data[GROUP.LINE_GROUP_ID] || '';
    const grpName     = group.data[GROUP.NAME] || 'กลุ่ม';
    if (lineGroupId) {
      const msg = buildZoomMessage({
        studentName: grpName, subject: group.data[GROUP.DEFAULT_SUBJECT] || '',
        timeStart: '', timeEnd: '', zoomLink,
      });
      await runWithFeedback(
        () => sendLineMessage(lineWorkerUrl, lineToken, lineGroupId, msg),
        toast, `ส่งลิงก์ Zoom เข้ากลุ่ม LINE "${grpName}" แล้วค่ะ`,
      );
    } else {
      const memberIds = groupStudentIds(group.data);
      let sent = 0;
      for (const sid of memberIds) {
        const stu    = students.find((s) => s[STUDENT.ID] === sid);
        const target = stu?.[STUDENT_LINE_GROUP_ID] || stu?.[STUDENT_LINE_USER_ID] || '';
        if (!target) continue;
        const msg = buildZoomMessage({
          studentName: stu[STUDENT.NAME], subject: group.data[GROUP.DEFAULT_SUBJECT] || '',
          timeStart: '', timeEnd: '', zoomLink,
        });
        try { await sendLineMessage(lineWorkerUrl, lineToken, target, msg); sent++; } catch {}
      }
      toast(`ส่งลิงก์ Zoom DM ${sent}/${memberIds.length} คนแล้วค่ะ`, sent > 0 ? 'success' : 'error');
    }
  };

  // ── Color helpers / form helpers ──────────────────────────────────────
  const getStudentColorIdx = (id) => {
    const idx = students.findIndex((s) => s[STUDENT.ID] === id);
    return idx >= 0 ? idx % STUDENT_COLORS.length : 0;
  };

  const resetForm = () => {
    setFormData({ name: '', studentIds: [], line_group_id: '', default_subject: '' });
    setMemberSearch('');
  };

  const activeGroups = groups
    .map((g, i) => ({ data: g, rowIndex: i + 2 }))
    .filter((item) => item.data[GROUP.DELETED] !== 'TRUE')
    .sort((a, b) => (a.data[GROUP.NAME] || '').localeCompare(b.data[GROUP.NAME] || '', 'th'));

  const allActiveStudents = students
    .map((s, i) => ({ data: s, rowIndex: i + 2 }))
    .filter((item) => item.data[STUDENT.DELETED] !== 'TRUE')
    .sort((a, b) => (a.data[STUDENT.NAME] || '').localeCompare(b.data[STUDENT.NAME] || '', 'th'));

  const pickerStudents = memberSearch
    ? allActiveStudents.filter((item) =>
        (item.data[STUDENT.NAME] || '').toLowerCase().includes(memberSearch.toLowerCase()),
      )
    : allActiveStudents;

  const isValid = !!formData.name?.trim() && formData.studentIds.length > 0;

  const handleToggleStudent = (id) => {
    setFormData((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id)
        ? f.studentIds.filter((x) => x !== id)
        : [...f.studentIds, id],
    }));
  };

  const allPickerSelected = pickerStudents.length > 0 &&
    pickerStudents.every((s) => formData.studentIds.includes(s.data[STUDENT.ID]));

  const handleSelectAllStudents = () => {
    const idsInView = pickerStudents.map((s) => s.data[STUDENT.ID]);
    setFormData((f) => ({
      ...f,
      studentIds: allPickerSelected
        ? f.studentIds.filter((id) => !idsInView.includes(id))
        : Array.from(new Set([...f.studentIds, ...idsInView])),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const dateNow = new Date().toLocaleString('th-TH');
    const ok = await runWithFeedback(async () => {
      if (editingGroup) {
        const row = [...editingGroup.data];
        row[GROUP.NAME]            = formData.name;
        row[GROUP.STUDENT_IDS]     = formData.studentIds.join(',');
        row[GROUP.LINE_GROUP_ID]   = formData.line_group_id || '';
        row[GROUP.DEFAULT_SUBJECT] = formData.default_subject || '';
        while (row.length < 7) row.push('');
        await updateGroup(accessToken, dbId, editingGroup.rowIndex, row);
      } else {
        await addGroup(accessToken, dbId, [
          'GRP-' + Date.now(), formData.name, formData.studentIds.join(','),
          formData.line_group_id || '', formData.default_subject || '', 'FALSE', dateNow,
        ]);
      }
    }, toast, editingGroup ? 'อัปเดตกลุ่มเรียบร้อย!' : 'สร้างกลุ่มสำเร็จ!');
    if (ok) { setShowForm(false); setEditingGroup(null); resetForm(); refresh({ force: true }); }
    setIsSubmitting(false);
  };

  const handleEditClick = (group) => {
    setEditingGroup(group);
    setFormData({
      name:            group.data[GROUP.NAME]            || '',
      studentIds:      groupStudentIds(group.data),
      line_group_id:   group.data[GROUP.LINE_GROUP_ID]   || '',
      default_subject: group.data[GROUP.DEFAULT_SUBJECT] || '',
    });
    setMemberSearch('');
    setShowForm(true);
    setTimeout(() => {
      document.getElementById('group-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleDeleteClick = async (group) => {
    const memberCount = groupStudentIds(group.data).length;
    const ok = await confirm(
      `ลบกลุ่ม "${group.data[GROUP.NAME]}" (${memberCount} คน) ใช่ไหมคะ? ตารางสอน/ประวัติของสมาชิกแต่ละคนจะไม่หายไปเลย — แค่ยกเลิกการจัดกลุ่มเฉยๆ ค่ะ`,
      true,
    );
    if (!ok) return;
    const success = await runWithFeedback(
      () => softDeleteGroup(accessToken, dbId, group.rowIndex),
      toast, `ลบกลุ่ม "${group.data[GROUP.NAME]}" สำเร็จ!`,
    );
    if (success) refresh({ force: true });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 max-w-6xl mx-auto relative">
      <Dialog />

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-[24px] font-bold text-gray-900">จัดการกลุ่ม</h2>
          <p className="text-[14px] text-gray-500 mt-1">
            รวมนักเรียนหลายคนไว้ลงตาราง/log/ออกบิลทีเดียว — เรท/ชั่วโมง/VAT ยังคิดแยกรายคน 100% เหมือนเดิมทุกประการ
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) { setEditingGroup(null); resetForm(); }
            setShowForm(!showForm);
          }}
          className={showForm ? btnSecondary : btnPrimary}
        >
          {showForm ? 'ยกเลิก' : '+ สร้างกลุ่มใหม่'}
        </button>
      </div>

      {/* ── Create / Edit group form ─────────────────────────────────── */}
      {showForm && (
        <form
          id="group-form-anchor"
          onSubmit={handleSubmit}
          className="mb-8 p-6 bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] animate-[slideIn_150ms_ease-out]"
        >
          <h3 className="font-semibold text-gray-900 mb-5 text-[16px]">
            {editingGroup ? 'แก้ไขกลุ่ม' : 'สร้างกลุ่มนักเรียนใหม่'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className={labelClasses}>ชื่อกลุ่ม <span className="text-red-500">*</span></label>
              <input
                type="text" required autoFocus value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputClasses} placeholder="เช่น กลุ่มเช้าวันเสาร์"
              />
            </div>
            <div>
              <label className={labelClasses}>
                วิชา default{' '}
                <span className="text-gray-400 font-normal">(prefill ตอนลงตาราง/log คาบกลุ่ม)</span>
              </label>
              <SubjectComboInput
                value={formData.default_subject}
                onChange={(v) => setFormData({ ...formData, default_subject: v })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClasses}>
                LINE Group ID{' '}
                <span className="text-gray-400 font-normal">
                  (ถ้ามี — ใช้ส่งลิงก์ Zoom/แจ้งเตือน/บิลรวมเข้ากลุ่มแชทนี้)
                </span>
              </label>
              <input
                type="text" value={formData.line_group_id}
                onChange={(e) => setFormData({ ...formData, line_group_id: e.target.value })}
                className={`${inputClasses} font-mono text-[13px]`}
                placeholder="C1a2b3c4d5e6f..."
              />
              <p className="text-[11px] text-gray-400 mt-1">
                กรอกเอง หรือเว้นว่างไว้ให้ระบบบันทึกอัตโนมัติเมื่อมีคนส่งรหัสนักเรียนในกรุ๊ปแชท LINE
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className={`${labelClasses} mb-0`}>
                สมาชิกในกลุ่ม <span className="text-red-500">*</span>{' '}
                <span className="text-gray-400 font-normal">({formData.studentIds.length} คน)</span>
              </label>
              <button
                type="button" onClick={handleSelectAllStudents}
                className="text-[12px] font-semibold text-blue-600 hover:text-blue-800"
              >
                {allPickerSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
            </div>
            <input
              type="text" value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className={`${inputClasses} mb-2`} placeholder="ค้นหาชื่อนักเรียน..."
            />
            <div className="border border-gray-200 rounded-[12px] overflow-hidden">
              <div className="max-h-60 overflow-y-auto bg-white p-2">
                {pickerStudents.length === 0 ? (
                  <p className="text-center text-gray-500 py-4 text-[14px]">ไม่พบนักเรียน</p>
                ) : pickerStudents.map((s, i) => (
                  <label key={i} className="flex items-center p-2.5 hover:bg-gray-50 rounded-[8px] cursor-pointer transition-colors">
                    <input
                      type="checkbox" className="w-5 h-5 text-blue-600 rounded mr-3"
                      checked={formData.studentIds.includes(s.data[STUDENT.ID])}
                      onChange={() => handleToggleStudent(s.data[STUDENT.ID])}
                    />
                    <span className="text-[14px] text-gray-900">{s.data[STUDENT.NAME]}</span>
                    {s.data[STUDENT.SUBJECT] && (
                      <span className="ml-2 text-[12px] text-gray-400">({s.data[STUDENT.SUBJECT]})</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button type="submit" disabled={!isValid || isSubmitting} className={btnPrimary}>
              {isSubmitting ? 'กำลังบันทึก...' : editingGroup ? 'อัปเดตกลุ่ม' : 'สร้างกลุ่ม'}
            </button>
          </div>
        </form>
      )}

      {/* ── Groups table ─────────────────────────────────────────────── */}
      {activeGroups.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-[16px]">
          <p className="text-[16px] text-gray-500">ยังไม่มีกลุ่มนักเรียน</p>
          <p className="text-[13px] text-gray-400 mt-1">
            กดปุ่ม "+ สร้างกลุ่มใหม่" ด้านบนเพื่อเริ่มจัดกลุ่มได้เลยค่ะ
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-[16px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500 uppercase tracking-wide">
                <th className="p-4 font-semibold">ชื่อกลุ่ม</th>
                <th className="p-4 font-semibold">สมาชิก</th>
                <th className="p-4 font-semibold">วิชา default</th>
                <th className="p-4 font-semibold">คาบค้างบิล</th>
                <th className="p-4 font-semibold">LINE Group</th>
                <th className="p-4 font-semibold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {activeGroups.map((group, index) => {
                const memberIds = groupStudentIds(group.data);
                return (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900 text-[14px] align-top">
                      {group.data[GROUP.NAME]}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {memberIds.length === 0
                          ? <span className="text-gray-400 text-[12px]">ไม่มีสมาชิก</span>
                          : memberIds.map((sid, mi) => {
                            const ci = getStudentColorIdx(sid);
                            return (
                              <span
                                key={mi}
                                className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[12px] font-medium"
                                style={{ background: STUDENT_COLORS[ci], color: STUDENT_TEXT_COLORS[ci] }}
                              >
                                {getStudentName(sid)}
                              </span>
                            );
                          })}
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      {group.data[GROUP.DEFAULT_SUBJECT]
                        ? <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-[6px] text-[12px] font-medium border border-blue-100">{group.data[GROUP.DEFAULT_SUBJECT]}</span>
                        : <span className="text-gray-400">-</span>
                      }
                    </td>
                    <td className="p-4 align-top">
                      {(() => {
                        const mids  = groupStudentIds(group.data);
                        const total = mids.reduce((sum, sid) => sum + (sessions || []).filter(
                          (s) => s[SESSION.STUDENT_ID] === sid && s[SESSION.INVOICED] === 'FALSE' && s[SESSION.DELETED] !== 'TRUE',
                        ).length, 0);
                        return total > 0
                          ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-[6px] text-[12px] font-medium border border-amber-100">{total} คาบ</span>
                          : <span className="text-gray-300 text-[12px]">—</span>;
                      })()}
                    </td>
                    <td className="p-4 align-top">
                      {(() => {
                        const mids   = groupStudentIds(group.data);
                        const oaName = settingsRow?.[SETTINGS.INSTITUTE_NAME] || 'LINE OA';
                        const firstStu = students.find((s) => s[STUDENT.ID] === mids[0]);
                        const linkUrl  = firstStu
                          ? `${window.location.origin}/line-connect?sid=${firstStu[STUDENT.ID]}&db=${dbId}&name=${encodeURIComponent(firstStu[STUDENT.NAME])}&oa=${encodeURIComponent(oaName)}`
                          : '';
                        const copyMsg  = firstStu
                          ? `📲 สวัสดีค่ะ 😊\n\nกดลิงก์แล้วส่งรหัสในกลุ่มนี้ เพื่อเชื่อมต่อกลุ่มกับระบบของ${TEACHER_ROLE_LABEL}นะคะ\n\n${linkUrl}\n\n💡 กดลิงก์ → copy รหัส → ส่งในกลุ่มนี้เลยค่ะ`
                          : '';
                        if (group.data[GROUP.LINE_GROUP_ID]) {
                          return (
                            <div className="flex flex-col gap-1.5">
                              <span title={group.data[GROUP.LINE_GROUP_ID]} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> เชื่อมต่อแล้ว
                              </span>
                              {linkUrl && (
                                <button
                                  onClick={() => { copyText(linkUrl); toast('คัดลอกลิงก์แล้ว — ส่งเข้ากลุ่ม LINE ได้เลยค่ะ', 'success'); }}
                                  className="text-[10px] text-gray-400 hover:text-blue-600 underline text-left"
                                >
                                  เชื่อมต่อใหม่
                                </button>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-amber-600 font-medium inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> ยังไม่เชื่อมต่อ</span>
                            {linkUrl && (
                              <button
                                onClick={() => { copyText(copyMsg); toast(`คัดลอกลิงก์กลุ่ม ${group.data[GROUP.NAME]} แล้ว — วางส่งเข้ากลุ่ม LINE ได้เลยค่ะ`, 'success'); }}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold rounded-[6px] transition-all active:scale-95 whitespace-nowrap"
                              >
                                <Copy className="w-3 h-3" /> คัดลอกลิงก์เชื่อมต่อ
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex justify-center items-center gap-2">
                        <RowActionsMenu items={[
                          {
                            label: 'ออกบิลกลุ่ม', icon: <Receipt className="w-3.5 h-3.5" />, colorClass: 'text-blue-700',
                            hidden: groupStudentIds(group.data).every(
                              (sid) => !(sessions || []).some(
                                (s) => s[SESSION.STUDENT_ID] === sid && s[SESSION.INVOICED] === 'FALSE' && s[SESSION.DELETED] !== 'TRUE',
                              ),
                            ),
                            onClick: () => handleOpenGroupBilling(group),
                          },
                          {
                            label: 'ส่ง LINE กลุ่ม', icon: <MessageCircle className="w-3.5 h-3.5" />, colorClass: 'text-green-700',
                            onClick: () => setSendTemplateTarget({ group }),
                          },
                          {
                            label: 'ฉุกเฉิน: ส่งลิงก์ Zoom', icon: <Send className="w-3.5 h-3.5" />, colorClass: 'text-orange-600',
                            hidden: !settingsRow?.[SETTINGS.ZOOM_LINK],
                            onClick: () => handleSendGroupZoom(group),
                          },
                          {
                            label: 'เติมแพ็กเกจ (รายคน)', icon: <Package className="w-3.5 h-3.5" />, colorClass: 'text-purple-700',
                            onClick: () => setSendTemplateTarget({ group, mode: 'topup' }),
                          },
                          { label: 'แก้ไข', icon: <Pencil className="w-3.5 h-3.5" />, onClick: () => handleEditClick(group) },
                          { label: 'ลบกลุ่ม', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: () => handleDeleteClick(group) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          GROUP BILLING MODAL — Refactored
      ═══════════════════════════════════════════════════════════════ */}
      {billingGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-[20px] w-full max-w-2xl shadow-[0_32px_64px_rgba(0,0,0,0.22)] mb-10">

            {/* ── Modal header ── */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-[20px] inline-flex items-center gap-2">
                  <Receipt className="w-5 h-5" /> ออกบิลกลุ่ม
                </h3>
                <p className="text-[13px] text-gray-400 mt-0.5">
                  {billingGroup.data[GROUP.NAME]} · {groupStudentIds(billingGroup.data).length} คน
                </p>
              </div>
              <button
                onClick={() => setBillingGroup(null)}
                className="text-gray-300 hover:text-gray-500 mt-0.5"
              ><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateGroupInvoices}>
              {/* ── Date range filter ── */}
              <div className="px-6 pt-4 pb-3 bg-gray-50/60 border-b border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  กรองช่วงวันที่ (ไม่บังคับ)
                </p>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <span className="text-[12px] text-gray-500 whitespace-nowrap">ตั้งแต่</span>
                    <input
                      type="date" value={groupDateFrom}
                      onChange={(e) => setGroupDateFrom(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-[8px] text-[13px] bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <span className="text-[12px] text-gray-500 whitespace-nowrap">ถึง</span>
                    <input
                      type="date" value={groupDateTo}
                      onChange={(e) => setGroupDateTo(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-[8px] text-[13px] bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                    />
                  </div>
                  {(groupDateFrom || groupDateTo) && (
                    <button
                      type="button"
                      onClick={() => { setGroupDateFrom(''); setGroupDateTo(''); }}
                      className="text-[12px] text-gray-400 hover:text-gray-600 font-medium self-center"
                    >
                      ล้าง
                    </button>
                  )}
                </div>
              </div>

              {/* ── Billing Mode Toggle ── */}
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  รูปแบบการออกบิล
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* โหมด A */}
                  <label
                    className={`relative flex flex-col gap-1 p-4 rounded-[12px] border-2 cursor-pointer transition-all
                      ${billingMode === 'separate'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <input
                      type="radio" name="billingMode" value="separate"
                      checked={billingMode === 'separate'}
                      onChange={() => setBillingMode('separate')}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                        ${billingMode === 'separate' ? 'border-blue-500' : 'border-gray-300'}`}
                      >
                        {billingMode === 'separate' && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 block" />
                        )}
                      </span>
                      <span className={`text-[13px] font-bold ${billingMode === 'separate' ? 'text-blue-700' : 'text-gray-700'}`}>
                        แยกบิลรายคน
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 pl-6">
                      ออก {groupStudentIds(billingGroup.data).length} ใบ · แต่ละคนรับบิลของตัวเอง
                    </p>
                  </label>

                  {/* โหมด B */}
                  <label
                    className={`relative flex flex-col gap-1 p-4 rounded-[12px] border-2 cursor-pointer transition-all
                      ${billingMode === 'consolidated'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <input
                      type="radio" name="billingMode" value="consolidated"
                      checked={billingMode === 'consolidated'}
                      onChange={() => setBillingMode('consolidated')}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                        ${billingMode === 'consolidated' ? 'border-indigo-500' : 'border-gray-300'}`}
                      >
                        {billingMode === 'consolidated' && (
                          <span className="w-2 h-2 rounded-full bg-indigo-500 block" />
                        )}
                      </span>
                      <span className={`text-[13px] font-bold ${billingMode === 'consolidated' ? 'text-indigo-700' : 'text-gray-700'}`}>
                        รวมบิลเดียว
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 pl-6">
                      ออก 1 ใบ · เหมาะสำหรับพี่น้องที่ผู้ปกครองจ่ายรวม
                    </p>
                  </label>
                </div>

                {/* Primary Payer selector (โหมด consolidated เท่านั้น) */}
                {billingMode === 'consolidated' && (
                  <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-[10px] flex items-center gap-3">
                    <span className="text-[12px] font-semibold text-indigo-700 whitespace-nowrap">
                      ผู้ชำระเงินหลัก
                    </span>
                    <select
                      value={primaryPayerId}
                      onChange={(e) => setPrimaryPayerId(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-indigo-200 rounded-[8px] text-[13px] bg-white focus:ring-2 focus:ring-indigo-400 outline-none font-medium text-indigo-900"
                    >
                      {groupStudentIds(billingGroup.data).map((sid) => (
                        <option key={sid} value={sid}>{getStudentName(sid)}</option>
                      ))}
                    </select>
                    <span className="text-[11px] text-indigo-400 whitespace-nowrap">ชื่อขึ้นหัวบิล</span>
                  </div>
                )}
              </div>

              {/* ── Session checklist per student ── */}
              <div className="px-6 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
                {groupStudentIds(billingGroup.data).map((sid) => {
                  const stu  = students.find((s) => s[STUDENT.ID] === sid);
                  const rate = safeFloat(stu?.[STUDENT.RATE] || 0);
                  const unbilled = (groupUnbilledMap[sid] || []).filter((s) => {
                    if (groupDateFrom && s.data[SESSION.DATE] < groupDateFrom) return false;
                    if (groupDateTo   && s.data[SESSION.DATE] > groupDateTo)   return false;
                    return true;
                  });
                  const selIds      = groupSelectedIds[sid] || [];
                  const chosenSess  = unbilled.filter((s) => selIds.includes(s.data[SESSION.ID]));
                  const totalHours  = chosenSess.reduce((sum, s) => sum + safeFloat(s.data[SESSION.HOURS]), 0);
                  const totalAmount = totalHours * rate;
                  const allChecked  = unbilled.length > 0 && unbilled.every((s) => selIds.includes(s.data[SESSION.ID]));
                  const ci = getStudentColorIdx(sid);

                  return (
                    <div key={sid} className="border border-gray-200 rounded-[14px] overflow-hidden">
                      {/* Student card header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Color swatch matching calendar */}
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: STUDENT_COLORS[ci % STUDENT_COLORS.length] }}
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-[14px] truncate">
                              {stu?.[STUDENT.NAME] || sid}
                              {billingMode === 'consolidated' && sid === primaryPayerId && (
                                <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
                                  ผู้ชำระหลัก
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {rate.toLocaleString()} ฿/ชม.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Running total */}
                          {chosenSess.length > 0 && (
                            <div className="text-right">
                              <p className="text-[13px] font-bold text-gray-900 tabular-nums">
                                {totalHours} ชม.
                              </p>
                              <p className="text-[11px] font-semibold text-emerald-600 tabular-nums">
                                {totalAmount.toLocaleString()} ฿
                              </p>
                            </div>
                          )}

                          {/* Select all toggle for this student */}
                          {unbilled.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleAllForStudent(sid, unbilled)}
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all
                                ${allChecked
                                  ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
                            >
                              {allChecked ? <><Check className="w-3 h-3 inline mr-0.5" />ยกเลิกทั้งหมด</> : 'เลือกทั้งหมด'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Session rows */}
                      <div className="divide-y divide-gray-50">
                        {unbilled.length === 0 ? (
                          <p className="text-[13px] text-gray-400 text-center py-4">
                            ไม่มีคาบที่ค้างชำระ
                          </p>
                        ) : unbilled.map((sess, si) => {
                          const checked = selIds.includes(sess.data[SESSION.ID]);
                          const sessHours  = safeFloat(sess.data[SESSION.HOURS]);
                          const sessAmount = sessHours * rate;
                          return (
                            <label
                              key={si}
                              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                                ${checked ? 'bg-blue-50/60' : 'bg-white hover:bg-gray-50'}`}
                            >
                              {/* Checkbox */}
                              <span
                                className={`w-5 h-5 rounded-[5px] border-2 flex-shrink-0 flex items-center justify-center transition-all
                                  ${checked
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'border-gray-300 bg-white'}`}
                              >
                                {checked && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <input
                                type="checkbox" className="sr-only"
                                checked={checked}
                                onChange={() => toggleSession(sid, sess.data[SESSION.ID])}
                              />

                              {/* Date */}
                              <span className="text-[12px] text-gray-400 font-mono tabular-nums w-24 flex-shrink-0">
                                {sess.data[SESSION.DATE]}
                              </span>

                              {/* Subject */}
                              <span className="text-[13px] text-gray-700 flex-1 truncate">
                                {sess.data[SESSION.SUBJECT] || '—'}
                              </span>

                              {/* Hours + Amount */}
                              <div className="text-right flex-shrink-0">
                                <span className="text-[12px] font-bold text-gray-800 tabular-nums">
                                  {sessHours} ชม.
                                </span>
                                <span className="text-[11px] text-gray-400 ml-2 tabular-nums">
                                  {sessAmount.toLocaleString()} ฿
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Grand total summary bar ── */}
              {consolidatedSummary.studentLines.length > 0 && (
                <div className="mx-6 mb-4 rounded-[12px] border border-gray-200 overflow-hidden">
                  {/* Per-student breakdown */}
                  {consolidatedSummary.studentLines.map((l) => (
                    <div key={l.sid} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
                      <span className="text-[13px] text-gray-600">{l.stuName}</span>
                      <span className="text-[13px] text-gray-800 font-medium tabular-nums">
                        {l.hours} ชม. · {l.amount.toLocaleString()} ฿
                      </span>
                    </div>
                  ))}
                  {/* Total row */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t-2 border-gray-200">
                    <div>
                      <span className="text-[13px] font-bold text-gray-900">
                        {billingMode === 'consolidated' ? 'ยอดรวม (1 ใบ)' : `รวม (${consolidatedSummary.studentLines.length} ใบ)`}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-extrabold text-gray-900 tabular-nums">
                        {consolidatedSummary.totalAmount.toLocaleString()}{' '}
                        <span className="text-[12px] font-medium text-gray-400">฿</span>
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {consolidatedSummary.totalHours} ชั่วโมง
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Action buttons ── */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setBillingGroup(null)}
                  className={btnSecondary}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || consolidatedSummary.studentLines.length === 0}
                  className={`flex-1 py-3 rounded-[12px] font-bold text-[15px] transition-all active:scale-[0.98]
                    ${isSubmitting || consolidatedSummary.studentLines.length === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : billingMode === 'consolidated'
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'}`}
                >
                  {isSubmitting
                    ? 'กำลังออกบิล...'
                    : billingMode === 'consolidated'
                      ? `ยืนยันออกบิลรวม 1 ใบ · ${consolidatedSummary.totalAmount.toLocaleString()} ฿`
                      : `ยืนยันออกบิล ${consolidatedSummary.studentLines.length} ใบ · ${consolidatedSummary.totalAmount.toLocaleString()} ฿`
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          GROUP TOPUP — เลือกคนในกลุ่มเติมแพ็กเกจ
      ══════════════════════════════════════════════════════════════ */}
      {sendTemplateTarget?.mode === 'topup' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 text-[18px]">
                เติมแพ็กเกจ — {sendTemplateTarget.group.data[GROUP.NAME]}
              </h3>
              <button onClick={() => setSendTemplateTarget(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[13px] text-gray-500 mb-4">เลือกนักเรียนที่ต้องการเติมแพ็กเกจ</p>
            <div className="space-y-2">
              {groupStudentIds(sendTemplateTarget.group.data).map((sid) => {
                const stu = students.find((s) => s[STUDENT.ID] === sid);
                const pkg = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
                return (
                  <button
                    key={sid} type="button"
                    onClick={() => {
                      setTopUpGroup({ group: sendTemplateTarget.group, studentId: sid });
                      setSendTemplateTarget(null);
                      setTopUpAmount('');
                      setTopUpMoneyAmount('');
                      setTopUpMode('hours');
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-[10px] hover:border-purple-300 hover:bg-purple-50 transition-all text-left"
                  >
                    <span className="font-medium text-gray-900 text-[14px]">{stu?.[STUDENT.NAME] || sid}</span>
                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${pkg > 0 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                      {pkg > 0 ? `${pkg} ชม.` : 'ไม่มีแพ็กเกจ'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TOPUP MODAL
      ══════════════════════════════════════════════════════════════ */}
      {topUpGroup && !sendTemplateTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold text-gray-900 text-[18px]">เติมแพ็กเกจ</h3>
              <button onClick={() => setTopUpGroup(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            {(() => {
              const stu = students.find((s) => s[STUDENT.ID] === topUpGroup.studentId);
              const rate    = safeFloat(stu?.[STUDENT.RATE] || 0);
              const current = safeFloat(stu?.[STUDENT.PACKAGE_HOURS]);
              const hoursFromAmt = rate > 0 ? Math.round((safeFloat(topUpMoneyAmount) / rate) * 100) / 100 : 0;
              return (
                <form onSubmit={handleGroupTopUp} className="space-y-4">
                  <div className="bg-purple-50 border border-purple-100 p-4 rounded-[12px] text-[14px]">
                    <p><span className="font-semibold text-purple-900">นักเรียน:</span> {stu?.[STUDENT.NAME]}</p>
                    <p className="mt-1"><span className="font-semibold text-purple-900">คงเหลือ:</span> {current} ชม.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-[10px]">
                    <button
                      type="button" onClick={() => setTopUpMode('hours')}
                      className={`py-2 rounded-[8px] text-[13px] font-medium transition-all ${topUpMode === 'hours' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}
                    >กรอกชั่วโมง</button>
                    <button
                      type="button" onClick={() => setTopUpMode('amount')}
                      className={`py-2 rounded-[8px] text-[13px] font-medium transition-all ${topUpMode === 'amount' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}
                    >กรอกยอดเงิน</button>
                  </div>
                  {topUpMode === 'hours' ? (
                    <div>
                      <label className={labelClasses}>จำนวนชั่วโมง</label>
                      <input
                        type="number" step="0.5" min="0.5" required autoFocus
                        value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className={labelClasses}>ยอดเงิน (฿)</label>
                      <input
                        type="number" required autoFocus
                        value={topUpMoneyAmount} onChange={(e) => setTopUpMoneyAmount(e.target.value)}
                        className={inputClasses}
                      />
                      <p className="text-[12px] text-gray-500 mt-1">
                        {rate > 0 ? `= ${hoursFromAmt} ชม.` : 'ยังไม่ได้ตั้งเรท'}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setTopUpGroup(null)} className={btnSecondary}>ยกเลิก</button>
                    <button type="submit" disabled={isToppingUp} className={`${btnPrimary} flex-1`}>
                      {isToppingUp ? 'กำลังเติม...' : 'ยืนยันเติมแพ็กเกจ'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SEND LINE TEMPLATE TO GROUP
      ══════════════════════════════════════════════════════════════ */}
      {sendTemplateTarget && !sendTemplateTarget.mode && (
        <SendTemplateModal
          student={{ data: (() => {
            const mids = groupStudentIds(sendTemplateTarget.group.data);
            const arr  = [];
            arr[STUDENT.NAME]    = sendTemplateTarget.group.data[GROUP.NAME];
            arr[STUDENT.SUBJECT] = sendTemplateTarget.group.data[GROUP.DEFAULT_SUBJECT] || '';
            arr[STUDENT_LINE_USER_ID] = sendTemplateTarget.group.data[GROUP.LINE_GROUP_ID] ||
              (mids.length === 1
                ? (students.find((s) => s[STUDENT.ID] === mids[0])?.[STUDENT_LINE_USER_ID] || '')
                : '');
            arr[STUDENT.ID] = sendTemplateTarget.group.data[GROUP.ID];
            return arr;
          })() }}
          settingsRow={settingsRow}
          lineOAEnabled={lineOAEnabled}
          invoices={invoices}
          sessions={sessions}
          onClose={() => setSendTemplateTarget(null)}
          toast={toast}
        />
      )}
    </div>
  );
}
