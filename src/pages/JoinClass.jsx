// @ts-nocheck
import { useState, useEffect, Suspense, lazy } from 'react';
import { STUDENT, GROUP, PUBLISHED_SHEET_ID, LOGO_B64 } from '../lib/constants';
import { buildStudentLoginCode } from '../lib/business';
import { getPublicStudents, getGroups } from '../services/googleSheets';
const VideoCallModal = lazy(() => import('../components/VideoCallModal'));

const PORTAL_SESSION_KEY = 'zw_portal_student';
const SIGNALING_URL = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
// รหัสนักเรียน = 2 ตัวอักษร + เลข 2 หลัก (เช่น PA47), รหัสกลุ่ม = G + เลข 2 หลัก (เช่น G47)
const CODE_FORMAT = /^([A-Z]{2}\d{2}|G\d{2})$/i;

export function JoinClass() {
  const params     = new URLSearchParams(window.location.search);
  const tokenParam = params.get('token') || '';
  const codeParam  = params.get('code')  || '';

  const [codeInput, setCodeInput]     = useState(codeParam);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [activeCall, setActiveCall]   = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sheetId, setSheetId] = useState(PUBLISHED_SHEET_ID);

  // Stable participant ID for group sub-room routing (survives page reload in same session)
  const participantId = (() => {
    try {
      let pid = sessionStorage.getItem('zw_pid');
      if (!pid) { pid = Math.random().toString(36).slice(2, 14); sessionStorage.setItem('zw_pid', pid); }
      return pid;
    } catch { return Math.random().toString(36).slice(2, 14); }
  })();

  useEffect(() => {
    if (!SIGNALING_URL) return;
    const attempt = (n) =>
      fetch(`${SIGNALING_URL}/config/sheet`)
        .then(r => r.json())
        .then(data => { if (data.sheetId) setSheetId(data.sheetId); })
        .catch(err => {
          if (n < 3) return new Promise(res => setTimeout(res, 1500 * n)).then(() => attempt(n + 1));
          console.warn('[JOIN CONFIG] /config/sheet failed after 3 attempts:', err.message);
        });
    attempt(1);
  }, []);

  const verify = async (key, { silent = false } = {}) => {
    setError('');
    if (!key) { setCheckingSession(false); return; }
    if (!silent && !CODE_FORMAT.test(key.trim())) {
      setCheckingSession(false);
      setError('Invalid code format — please check the code your teacher gave you · รูปแบบรหัสไม่ถูกต้อง ลองตรวจสอบอีกครั้งนะคะ');
      return;
    }
    setLoading(true);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setCheckingSession(false);
      if (!silent) setError('Connection timed out — please check your internet and try again · เชื่อมต่อนานเกินไป ลองใหม่อีกครั้งนะคะ');
    }, 10000);
    try {
      const [allStudents, allGroups] = await Promise.all([
        getPublicStudents(sheetId),
        getGroups(null, sheetId).catch(() => []),
      ]);
      if (timedOut) return;
      const normalizedKey = key.toUpperCase();
      const matchStudent = allStudents.find(s => s[STUDENT.DELETED] !== 'TRUE' && buildStudentLoginCode(s[STUDENT.NICKNAME], s[STUDENT.NAME]) === normalizedKey);
      const matchGroup   = (allGroups || []).find(g => g[GROUP.DELETED] !== 'TRUE' && (g[GROUP.CODE] || '').toUpperCase() === normalizedKey);
      if (!matchStudent && !matchGroup) {
        if (!silent && !timedOut) setError('Code not found — please check the spelling or ask your teacher · ไม่พบรหัสนี้ ลองตรวจสอบอีกครั้งนะคะ');
        return;
      }

      // Detect if this is a group-token join: URL token matches a group ID
      const groupFromToken = tokenParam
        ? (allGroups || []).find(g => g[GROUP.DELETED] !== 'TRUE' && g[GROUP.ID] === tokenParam)
        : null;

      if (groupFromToken || matchGroup) {
        // Group call: use sub-room routing (${groupId}__${participantId})
        const groupId = groupFromToken ? tokenParam : matchGroup[GROUP.ID];
        const pid = matchStudent?.[STUDENT.ID] || participantId;
        const name = matchStudent?.[STUDENT.NAME] || matchGroup?.[GROUP.NAME] || 'นักเรียน';
        const subRoomId = `${groupId}__${pid}`;

        // Announce to lobby so teacher knows this student is joining
        if (SIGNALING_URL) {
          fetch(`${SIGNALING_URL}/room/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: `${groupId}__lobby`,
              sender: pid,
              signal: { type: 'join-announce', participantId: pid, name },
            }),
          }).catch(() => {});
        }

        try { localStorage.setItem(`zw_room_${subRoomId}`, 'waiting'); } catch (_) {}
        if (!timedOut) setActiveCall({ scheduleId: subRoomId, studentName: 'Teacher' });
      } else {
        // Individual call: existing behavior
        const scheduleId = tokenParam || (matchStudent?.[STUDENT.ID]) || '';
        if (scheduleId) { try { localStorage.setItem(`zw_room_${scheduleId}`, 'waiting'); } catch (_) {} }
        if (!timedOut) setActiveCall({ scheduleId, studentName: matchStudent?.[STUDENT.NAME] || '' });
      }
    } catch (err) {
      if (!silent && !timedOut) {
        console.warn('[JOIN VERIFY]', err.name, err.message);
        setError('Could not join the class — please try again or tell your teacher · เข้าห้องเรียนไม่สำเร็จ ลองใหม่หรือแจ้งครูนะคะ');
      }
    } finally {
      clearTimeout(timer);
      if (!timedOut) { setLoading(false); setCheckingSession(false); }
    }
  };

  useEffect(() => {
    if (!sheetId) return;
    (async () => {
      if (codeParam) { await verify(codeParam, { silent: true }); return; }
      try {
        const savedId = localStorage.getItem(PORTAL_SESSION_KEY) || sessionStorage.getItem(PORTAL_SESSION_KEY);
        if (savedId && sheetId) {
          const allStudents = await getPublicStudents(sheetId);
          const found = allStudents.find(s => s[STUDENT.ID] === savedId && s[STUDENT.DELETED] !== 'TRUE');
          if (found) { const code = buildStudentLoginCode(found[STUDENT.NICKNAME], found[STUDENT.NAME]); if (code) { await verify(code, { silent: true }); return; } }
        }
      } catch (_) {}
      setCheckingSession(false);
    })();
  }, [sheetId]);

  const handleVerify = (e) => { e.preventDefault(); const key = codeInput.trim(); if (!key) return; verify(key); };

  if (activeCall) {
    return (
      <Suspense fallback={null}>
        <VideoCallModal
          scheduleId={activeCall.scheduleId}
          role="student"
          studentName={activeCall.studentName || 'Teacher'}
          onClose={() => { if (activeCall.scheduleId) { try { localStorage.removeItem(`zw_room_${activeCall.scheduleId}`); } catch (_) {} } setActiveCall(null); setError(''); }}
          onPeerJoined={() => { if (activeCall.scheduleId) { try { localStorage.setItem(`zw_room_${activeCall.scheduleId}`, 'joined'); } catch (_) {} } }}
          toast={null}
        />
      </Suspense>
    );
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-blue-900 to-slate-800 flex items-center justify-center p-4">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); *, body { font-family: 'Inter', sans-serif !important; }`}</style>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-[14px] font-medium">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-blue-900 to-slate-800 flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); *, body { font-family: 'Inter', sans-serif !important; }`}</style>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_B64} alt="SHIFTHIGHBURY" className="h-14 w-auto object-contain mx-auto mb-3 brightness-0 invert" />
          <h1 className="text-[22px] font-extrabold text-white">Join Class</h1>
          <p className="text-slate-300 text-[13px] mt-1">Enter your login code to connect with your teacher</p>
        </div>
        <div className="bg-white/15 backdrop-blur-xl border border-white/25 rounded-[20px] p-6 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
          {loading ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white text-[14px] font-medium">Connecting...</p>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-300 uppercase tracking-wider mb-2">Login Code</label>
                <input type="text" value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="e.g. PA47 or G-A8X2" autoFocus className="w-full px-4 py-3 rounded-[12px] bg-white/15 border border-white/20 text-white placeholder-slate-400 font-mono text-[18px] text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/20 transition-all" />
              </div>
              {error && <div className="bg-red-500/20 border border-red-400/30 rounded-[10px] px-3 py-2.5 text-[13px] text-red-300 text-center">{error}</div>}
              <button type="submit" disabled={!codeInput.trim()} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-[15px] rounded-[12px] transition-all active:scale-[0.98]">Join Class</button>
              <a href="/portal" className="block text-center text-[12px] text-slate-500 hover:text-slate-300 transition-colors mt-1">← Back to Student Portal</a>
            </form>
          )}
        </div>
        {!tokenParam && !codeParam && <p className="text-center text-[11px] text-amber-500/70 mt-4">No class link found — please request one from your teacher</p>}
      </div>
    </div>
  );
}
