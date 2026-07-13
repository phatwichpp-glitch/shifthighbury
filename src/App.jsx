// @ts-nocheck
import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { Calendar as CalendarIcon, FileText, GraduationCap, Users, Receipt, BarChart2, MessageSquare, Upload, Settings2, UserCircle, LogOut, RefreshCw, Menu, X, HelpCircle, Bell, BellOff, Lightbulb } from 'lucide-react';

import { tokenStore, dbStore, userStore } from './lib/tokenStore';
import { teacherAuthHeaders } from './lib/business';
import { LOGO_B64 } from './lib/constants';
import { APP_NAME, APP_SUBTITLE, TEACHER_ROLE_LABEL, TEACHER_ROLE_SUBLABEL, STUDENT_PORTAL_LINK_TEXT, STUDENT_CODE_HINT, APP_TIMEZONE, APP_LOCALE, PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from './lib/appConfig';
import { AppErrorBoundary } from './components/ui/ErrorBoundary';
import { useToast } from './hooks/useToast';
import { Toast } from './components/ui/Toast';
import { NavLink } from './components/ui/NavLink';

import { findExistingDatabase, addMissingSheets, migrateSchemaV2, migrateSchemaV3, migrateSchemaV4, migrateSchemaV5, migrateSchemaV6, migrateSchemaV7, migrateSchemaV8, migrateSchemaV9 } from './services/googleSheets';

// Stale-chunk guard: after a new deploy, cached index.html may reference old chunk
// hashes that no longer exist (-> "Failed to fetch dynamically imported module").
// Detect once per session and hard-reload to pick up the new build.
function lazyPage(importFn) {
  return lazy(() =>
    importFn().catch(err => {
      const isChunkError =
        err && err.name === 'TypeError' &&
        (String(err.message).includes('Failed to fetch') ||
         String(err.message).includes('dynamically imported'));
      if (isChunkError && !sessionStorage.getItem('_chunkReload')) {
        sessionStorage.setItem('_chunkReload', '1');
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    })
  );
}

const Calendar      = lazyPage(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })));
const Sessions      = lazyPage(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Students      = lazyPage(() => import('./pages/Students').then(m => ({ default: m.Students })));
const Groups        = lazyPage(() => import('./pages/Groups').then(m => ({ default: m.Groups })));
const Invoices      = lazyPage(() => import('./pages/Invoices').then(m => ({ default: m.Invoices })));
const Dashboard     = lazyPage(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Templates     = lazyPage(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const ExportExcel   = lazyPage(() => import('./pages/ExportExcel').then(m => ({ default: m.ExportExcel })));
const Settings      = lazyPage(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Feedback      = lazyPage(() => import('./pages/Feedback').then(m => ({ default: m.Feedback })));
const StudentPortal = lazyPage(() => import('./pages/StudentPortal').then(m => ({ default: m.StudentPortal })));
const JoinClass     = lazyPage(() => import('./pages/JoinClass').then(m => ({ default: m.JoinClass })));
const LineConnect   = lazyPage(() => import('./pages/LineConnect').then(m => ({ default: m.LineConnect })));
import { HelpModal }     from './components/modals/HelpModal';

function FloatingRefreshButton() {
  const [spinning, setSpinning] = useState(false);
  const handleRefresh = () => {
    setSpinning(true);
    window.dispatchEvent(new Event('zw-refresh'));
    setTimeout(() => setSpinning(false), 800);
  };
  return (
    <button
      onClick={handleRefresh}
      title="รีเฟรชข้อมูล"
      className="fixed bottom-6 left-6 z-[9990] w-12 h-12 bg-white border border-gray-200 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.12)] flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:shadow-[0_4px_20px_rgba(59,130,246,0.2)] active:scale-95 transition-all"
    >
      <RefreshCw className="w-[18px] h-[18px]" style={{ animation: spinning ? 'spin 0.8s linear' : 'none' }} />
    </button>
  );
}

// Isolated clock component — state changes here never re-render AppShell or its children
function SidebarClock() {
  const [clockTime, setClockTime] = useState(() => new Date().toLocaleTimeString(APP_LOCALE, { timeZone: APP_TIMEZONE, hour12: false }));
  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date().toLocaleTimeString(APP_LOCALE, { timeZone: APP_TIMEZONE, hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-sm font-mono font-medium text-gray-700 tabular-nums">{clockTime}</span>;
}

function AppShell({ accessToken, dbId, setDbId, handleLogout, userInfo }) {
  const { toasts, removeToast, toast } = useToast();
  const [sidebarSpinning, setSidebarSpinning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });

  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      toast('เปิดแจ้งเตือนแล้ว', 'success');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      toast('เปิดแจ้งเตือนแล้ว', 'success');
    } else if (permission === 'denied') {
      toast('เบราว์เซอร์บล็อกการแจ้งเตือน กรุณาเปิดใน Browser Settings', 'error');
    }
  };

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    try {
      const pendingNotice = sessionStorage.getItem('zw_bootstrap_notice');
      if (pendingNotice) {
        toast(pendingNotice, 'success');
        sessionStorage.removeItem('zw_bootstrap_notice');
      }
    } catch {
      // ignore storage failures
    }
  }, [toast]);

  const handleSidebarRefresh = () => {
    setSidebarSpinning(true);
    window.dispatchEvent(new Event('zw-refresh'));
    setTimeout(() => setSidebarSpinning(false), 800);
  };
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700;800&display=swap');
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shrink  { from { width: 100%; } to { width: 0%; } }
        @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        *, body { font-family: 'Inter', 'Sarabun', sans-serif !important; }
        body { background-color: #F3F4F6; }
      `}</style>
      <Toast toasts={toasts} removeToast={removeToast} />
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <div className="min-h-screen text-gray-900">
        {/* Backdrop overlay for mobile/tablet */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — overlay on mobile/tablet, static on desktop */}
        <nav className={`fixed inset-y-0 left-0 w-60 bg-white border-r border-gray-200 h-screen flex flex-col z-40 shadow-[1px_0_4px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="px-4 pt-5 pb-4 border-b border-gray-100 flex items-center gap-2">
            <Link to="/" className="block cursor-pointer select-none group shrink-0" onClick={() => setSidebarOpen(false)}>
              <img src={LOGO_B64} alt={APP_NAME} className="h-10 w-auto object-contain group-hover:opacity-80 transition-opacity" />
            </Link>
            <div className="flex-1 flex items-center justify-end gap-1">
              <SidebarClock />
              <button onClick={handleSidebarRefresh} title="รีเฟรชข้อมูล" className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-[6px] transition-colors flex-shrink-0">
                <RefreshCw className="w-3.5 h-3.5" style={{ animation: sidebarSpinning ? 'spin 0.8s linear' : 'none' }} />
              </button>
              {notificationPermission !== 'unsupported' && (
                <button
                  onClick={handleEnableNotifications}
                  title={notificationPermission === 'denied' ? 'Notifications blocked — enable in browser settings' : 'เปิดแจ้งเตือน'}
                  className={`p-1 rounded-[6px] transition-colors flex-shrink-0 ${notificationPermission === 'granted' ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : notificationPermission === 'denied' ? 'text-gray-300 hover:bg-gray-100' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
                >
                  {notificationPermission === 'denied' ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                </button>
              )}
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-[6px] transition-colors ml-0.5 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            <NavLink to="/" onClick={() => setSidebarOpen(false)}><CalendarIcon className="w-4 h-4" />ปฏิทินตารางสอน</NavLink>
            <NavLink to="/sessions" onClick={() => setSidebarOpen(false)}><FileText className="w-4 h-4" />ประวัติการสอน</NavLink>
            <NavLink to="/students" onClick={() => setSidebarOpen(false)}><GraduationCap className="w-4 h-4" />นักเรียน &amp; ออกบิล</NavLink>
            <NavLink to="/groups" onClick={() => setSidebarOpen(false)}><Users className="w-4 h-4" />จัดการกลุ่ม</NavLink>
            <NavLink to="/invoices" onClick={() => setSidebarOpen(false)}><Receipt className="w-4 h-4" />บิล &amp; ใบเสร็จ</NavLink>
            <NavLink to="/dashboard" onClick={() => setSidebarOpen(false)}><BarChart2 className="w-4 h-4" />Dashboard</NavLink>
            <div className="pt-2 pb-1 px-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">เครื่องมือ</p>
            </div>
            <NavLink to="/templates" onClick={() => setSidebarOpen(false)}><MessageSquare className="w-4 h-4" />Template ข้อความ</NavLink>
            <NavLink to="/export" onClick={() => setSidebarOpen(false)}><Upload className="w-4 h-4" />Export Excel</NavLink>
            <NavLink to="/settings" onClick={() => setSidebarOpen(false)}><Settings2 className="w-4 h-4" />ตั้งค่าสถาบัน</NavLink>
            <NavLink to="/feedback" onClick={() => setSidebarOpen(false)}><Lightbulb className="w-4 h-4" />ข้อเสนอแนะระบบ</NavLink>
          </div>
          <div className="px-3 pb-4 border-t border-gray-100 pt-3">
            <button
              onClick={() => setShowHelp(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 mb-2 text-[13px] font-medium text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-[8px] transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              คู่มือการใช้งาน
            </button>
            {userInfo && (
              <div className="flex items-center gap-2.5 px-2 py-2 mb-2 rounded-[10px] bg-gray-50 border border-gray-200">
                {userInfo.picture
                  ? <img src={userInfo.picture} alt="profile" className="w-8 h-8 rounded-full shadow-sm" referrerPolicy="no-referrer" />
                  : <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">{(userInfo.name || '?')[0]}</div>
                }
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-gray-900 truncate leading-tight">{userInfo.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{userInfo.email}</p>
                </div>
              </div>
            )}
            <button onClick={handleLogout} className="w-full text-left text-[13px] text-red-500 hover:bg-red-50 hover:text-red-600 px-3 py-2 rounded-[8px] transition-colors font-medium flex items-center gap-2">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main className="lg:ml-60 overflow-auto bg-gray-50 min-h-screen">
          {/* Mobile/tablet top bar with hamburger */}
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:hidden shadow-sm">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-[8px] transition-colors flex-shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <img src={LOGO_B64} alt={APP_NAME} className="h-7 w-auto object-contain" />
          </div>
          <Suspense fallback={<div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <Routes>
              <Route path="/"          element={<Calendar    accessToken={accessToken} dbId={dbId} setDbId={setDbId} toast={toast} />} />
              <Route path="/sessions"  element={<Sessions    accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/students"  element={<Students    accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/groups"    element={<Groups      accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/invoices"  element={<Invoices    accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/dashboard" element={<Dashboard   accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/templates" element={<Templates   accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/export"    element={<ExportExcel accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/settings"  element={<Settings    accessToken={accessToken} dbId={dbId} toast={toast} />} />
              <Route path="/feedback"  element={<Feedback    accessToken={accessToken} dbId={dbId} toast={toast} />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </>
  );
}

function App() {
  const [accessToken, setAccessToken] = useState(() => tokenStore.get());
  const [dbId, setDbIdState]          = useState(() => dbStore.get());
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const [userInfo, setUserInfo]       = useState(() => userStore.get());

  const setDbId = (id) => { dbStore.set(id); setDbIdState(id); };

  useEffect(() => {
    if (!accessToken || !dbId) return;
    migrateSchemaV5(accessToken, dbId).catch(e => console.warn('[migrateSchemaV5]', e));
    migrateSchemaV6(accessToken, dbId).catch(e => console.warn('[migrateSchemaV6]', e));
    migrateSchemaV7(accessToken, dbId).catch(e => console.warn('[migrateSchemaV7]', e));
    migrateSchemaV8(accessToken, dbId).catch(e => console.warn('[migrateSchemaV8]', e));
    migrateSchemaV9(accessToken, dbId).catch(e => console.warn('[migrateSchemaV9]', e));
  }, [accessToken, dbId]);

  // Publish the active sheet ID to the signaling worker so the student portal
  // can discover which spreadsheet to use — resolves the PUBLISHED_SHEET_ID
  // vs dbId mismatch that prevents the teacher-waiting banner from firing.
  useEffect(() => {
    const sigUrl = import.meta.env.VITE_WEBRTC_SIGNALING_URL;
    if (!dbId || !sigUrl) return;
    fetch(`${sigUrl}/config/sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teacherAuthHeaders() },
      body: JSON.stringify({ sheetId: dbId }),
    }).catch(() => {});
  }, [dbId]);

  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const token = tokenResponse.access_token;
      tokenStore.set(token);
      setAccessToken(token);
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(info => { userStore.set(info); setUserInfo(info); }).catch(() => {});
      const cachedId = dbStore.get();
      setIsCheckingFile(true);
      // Safety net: never leave the spinner running forever on network drop
      const checkTimer = setTimeout(() => setIsCheckingFile(false), 15000);

      const ensureSchema = async (sheetId) => {
        await addMissingSheets(token, sheetId);
        await migrateSchemaV2(token, sheetId);
        await migrateSchemaV3(token, sheetId);
        await migrateSchemaV4(token, sheetId);
        await migrateSchemaV5(token, sheetId);
        await migrateSchemaV6(token, sheetId);
        await migrateSchemaV7(token, sheetId);
        await migrateSchemaV8(token, sheetId);
        await migrateSchemaV9(token, sheetId);
      };

      const findDatabaseWithRetry = async (attempts = 3) => {
        let lastErr = null;
        for (let i = 0; i < attempts; i += 1) {
          try {
            const found = await findExistingDatabase(token);
            if (found) return found;
          } catch (e) {
            lastErr = e;
          }
          if (i < attempts - 1) {
            // Small retry gap helps transient Drive/OAuth readiness issues right after login.
            await new Promise(resolve => setTimeout(resolve, 600));
          }
        }
        if (lastErr) throw lastErr;
        return null;
      };

      try {
        let usedFallbackLookup = false;
        if (cachedId) {
          setDbId(cachedId);
          try {
            await ensureSchema(cachedId);
            return;
          } catch (e) {
            console.warn('[login] cached dbId not ready, fallback to Drive lookup:', e);
            usedFallbackLookup = true;
          }
        }

        const existingId = await findDatabaseWithRetry(3);
        if (existingId) {
          setDbId(existingId);
          if (usedFallbackLookup) {
            try {
              sessionStorage.setItem('zw_bootstrap_notice', 'เชื่อมต่อฐานข้อมูลสำรองจาก Google Drive สำเร็จแล้ว');
            } catch {
              // ignore storage failures
            }
          }
          try {
            await ensureSchema(existingId);
          } catch (e) {
            console.log('sheet check:', e);
          }
        }
      } catch (err) {
        console.error('[login] database bootstrap failed:', err);
      } finally {
        clearTimeout(checkTimer);
        setIsCheckingFile(false);
      }
    },
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar',
    prompt: 'select_account',
  });

  const handleLogout = () => { tokenStore.clear(); userStore.clear(); dbStore.clear(); setAccessToken(''); setDbIdState(''); setUserInfo(null); };

  return (
    <BrowserRouter>
      <AppErrorBoundary>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/portal"       element={<StudentPortal />} />
        <Route path="/line-connect" element={<LineConnect />} />
        <Route path="/join"         element={<JoinClass />} />
        <Route
          path="/*"
          element={
            !accessToken ? (
              <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full space-y-4">
                  <div className="text-center mb-6">
                    <img src={LOGO_B64} alt={APP_NAME} className="h-24 w-auto object-contain mx-auto mb-4 drop-shadow-md" />
                    <h1 className="text-[26px] font-extrabold text-gray-900 tracking-tight">{APP_NAME}</h1>
                    <p className="text-gray-400 text-[13px] mt-1 tracking-wide">{APP_SUBTITLE}</p>
                  </div>
                  <div className="bg-white p-6 rounded-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                      <UserCircle className="w-6 h-6 text-gray-600" />
                      <div>
                        <p className="font-bold text-gray-900 text-[16px]">{TEACHER_ROLE_LABEL}</p>
                        <p className="text-[12px] text-gray-400">{TEACHER_ROLE_SUBLABEL}</p>
                      </div>
                    </div>
                    {/* Google-compliant sign-in button — https://developers.google.com/identity/branding-guidelines */}
                    <button
                      onClick={() => loginWithGoogle()}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                        width: '100%', height: '40px', padding: '0 12px',
                        background: '#ffffff', border: '1px solid #dadce0', borderRadius: '4px',
                        fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
                        fontSize: '14px', fontWeight: 500, color: '#1f1f1f', letterSpacing: '0.25px',
                        boxShadow: '0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)',
                        transition: 'background .218s, border-color .218s, box-shadow .218s',
                        cursor: 'pointer', userSelect: 'none',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)'; }}
                      onMouseDown={e => { e.currentTarget.style.background = '#f0f4ff'; }}
                      onMouseUp={e => { e.currentTarget.style.background = '#f8faff'; }}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.657 14.013 17.64 11.706 17.64 9.2z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.258c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958l3.007 2.332C4.671 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
                    <p className="text-[11px] text-gray-400 mt-2 text-center">สำหรับครูผู้สอน — เข้าสู่ระบบด้วย Google Account</p>
                  </div>
                  <div className="bg-white p-6 rounded-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                      <GraduationCap className="w-6 h-6 text-gray-600" />
                      <div>
                        <p className="font-bold text-gray-900 text-[16px]">นักเรียน</p>
                        <p className="text-[12px] text-gray-400">ดูประวัติการเรียน คะแนน และบิล</p>
                      </div>
                    </div>
                    <Link to="/portal" className="flex items-center justify-center gap-2 bg-green-600 text-white rounded-[12px] px-6 py-3 font-medium hover:bg-green-700 active:scale-95 transition-all w-full text-[14px]">
                      {STUDENT_PORTAL_LINK_TEXT}
                    </Link>
                    <p className="text-[11px] text-gray-400 mt-2 text-center">{STUDENT_CODE_HINT}</p>
                  </div>
                  <p className="text-center text-[11px] text-gray-400 pt-1 pb-2">
                    <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline underline-offset-2 transition-colors">Privacy Policy</a>
                    {TERMS_OF_USE_URL && (
                      <> · <a href={TERMS_OF_USE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline underline-offset-2 transition-colors">Terms of Use</a></>
                    )}
                  </p>
                </div>
              </div>
            ) : isCheckingFile ? (
              <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
                  <p className="text-gray-600 font-medium text-[14px]">กำลังเชื่อมต่อฐานข้อมูลจาก Google Drive...</p>
                </div>
              </div>
            ) : (
              <AppShell accessToken={accessToken} dbId={dbId} setDbId={setDbId} handleLogout={handleLogout} userInfo={userInfo} />
            )
          }
        />
      </Routes>
      </Suspense>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
