# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend (root)
npm run dev        # Vite dev server with HMR
npm run build      # Production build → dist/
npm run lint       # ESLint
npm run preview    # Preview production build

# WebRTC signaling worker (webrtc-signaling/)
cd webrtc-signaling
npm run dev        # Local Cloudflare Workers dev
npm run deploy     # Deploy to Cloudflare Workers
npm run test       # Vitest unit tests (test/index.spec.js), runs in workerd via @cloudflare/vitest-pool-workers
npx vitest run test/index.spec.js -t "test name"   # Run a single test by name
```

There is no test suite for the frontend (`/`) — only `webrtc-signaling/` has tests. Note: `workerd` (used by `@cloudflare/vitest-pool-workers`) has no win32-arm64 build, so on an ARM64 Windows machine `npm install` in `webrtc-signaling/` fails with `Unsupported platform: win32 arm64 LE` and worker changes must be verified by review/deploy instead of local tests. Works fine on win32-x64/macOS/Linux.

`npm run lint` currently reports ~450 pre-existing errors (mostly `no-unused-vars`, `no-empty`, and the new strict `react-hooks/*` rules) — don't try to fix them all; just avoid adding new ones. `eslint.config.js`'s `globalIgnores` excludes `webrtc-signaling` — without that, `eslint .` also flags `webrtc-signaling/test/index.spec.js` for Vitest globals it was never configured to know about.

## Response Style (from `.cursorrules`)

- Keep answers short — no preamble, no closing summary.
- For bug fixes, return only the changed function/block, never the whole file.

## Architecture

This is a **Science/Math/Civil-Engineering tutoring management platform** for a private tutor in Thailand, deployed on Vercel. It has no traditional backend server—Google Sheets acts as the primary database.

### Two Sub-Projects

**`/` (Frontend)** — React 19 + Vite SPA (pure JSX, no TypeScript)
- Teacher accesses via Google OAuth at `/` (and its nested routes: `/sessions`, `/students`, `/groups`, `/invoices`, `/dashboard`, `/templates`, `/export`, `/settings`)
- `/line-connect` (`LineConnect.jsx`) shows a student a one-time "connect code" to paste into a LINE DM/group — LINE LIFF was never wired up and all its remnants (`@line/liff` dep, `VITE_LIFF_ID`, vendor chunk, `/liff` URLs) were removed in July 2026; student identification is connect codes + class codes only
- Students join video calls at `/join` (`JoinClass.jsx`, no login required)
- Student read-only portal at `/portal` (`StudentPortal.jsx`); when the login code identifies a group rather than an individual, `StudentPortal` renders `GroupPortal.jsx` internally — there is no separate `/group-portal` route

**`/webrtc-signaling/`** — Separate Cloudflare Workers project. It started as a WebRTC signaling relay but has grown into the SPA's general backend-for-frontend for everything that can't be done from a static site — see "Cloudflare Worker API Surface" below. It has its own `AGENTS.md` with Cloudflare-specific guidance (always check current Workers docs before Workers/KV work).

Other repo docs: `SETUP.md` is a Thai-language step-by-step guide for deploying the whole system for a new teacher/school (Google Cloud, LINE, Cloudflare, TURN, Vercel).

### Source Layout

```
src/
  App.jsx           # Auth shell + routing (~450 lines) — wraps all pages
  pages/            # One file per nav section; each owns its own state
  components/
    modals/         # All modal dialogs (cancel, reschedule, invoice preview, etc.)
    documents/      # PDF/print document components (InvoiceDocument, ReceiptDocument, etc.)
    ui/             # Reusable primitives (Toast, ErrorBoundary, NavLink, ConfirmDialog, etc.)
    *.jsx           # Feature-level components (CalendarGrid, VideoCallModal, etc.)
  hooks/            # useSheetData, useToast, useConfirm, useWaitingRoomStatus, useZoomReminder
  services/         # All external API calls
  lib/              # Pure utilities and constants (no React)
```

### State & Data Flow

`src/App.jsx` is a thin auth + routing shell (~450 lines). Per-page state lives in `src/pages/`, local `useState` only — no global state library.

Each page fetches its own data via `useSheetData` (`src/hooks/useSheetData.js`):
- Accepts a `fetchers` map of `{ key: (token, dbId) => Promise<rows[]> }`
- Returns `{ data, loading, error, refresh }`
- Auto-throttles re-fetches to once per 30 s; pass `{ force: true }` for user-triggered refreshes
- Listens for `window.dispatchEvent(new Event('zw-refresh'))` to trigger a forced reload across all active pages

`src/services/googleSheets.js` (~1200 lines, ~58 exported functions) contains all CRUD operations against the Google Sheets REST API. Calls go directly to `https://sheets.googleapis.com/v4/` — no SDK.

`src/services/googleCalendar.js` handles Google Calendar event sync for schedules.

### `src/lib/` Modules

| File | Purpose |
|------|---------|
| `appConfig.js` | **All branding/customization values** — edit this to rebrand for a new school (app name, subjects, timezone, currency, DB name, etc.) |
| `constants.js` | Column-index constants for every sheet (`STUDENT`, `SESSION`, `SCHEDULE`, `INVOICE`, `RECEIPT`, `INVOICE_ITEM`, `GROUP`, `SETTINGS`, `CANCELLATION`). When adding a column to a sheet, add the constant here, write a new migration, **and update the duplicated indexes in `webrtc-signaling/src/reminders.js`**. |
| `business.js` | Shared business logic: `AppError`, `runWithFeedback()` (toast-wraps async ops), `toastLineError()`, QR-code helpers |
| `tokenStore.js` | Auth storage wrappers — Google access token in `sessionStorage` (`zw_token`), user info (`zw_user`), DB spreadsheet ID in `localStorage` (`zw_db_id`) |

### Database Schema (Google Sheets)

Schema migrations are in `googleSheets.js` as `migrateSchemaV2` through `migrateSchemaV9`. Each migration appends missing columns to existing sheets.

| Sheet | Key columns |
|-------|-------------|
| `students` | id, name, line_id, line_user_id, rate_per_hour, package_hours_remaining |
| `sessions` | id, student_id, date, subject, hours, invoiced, invoice_id, group_id, listening/speaking/reading/writing_score |
| `invoices` | id, invoice_number, student_id, status, vat_amount, total_amount, group_invoice_key |
| `invoice_items` | id, invoice_id, session_id, hours, rate, amount |
| `schedules` | id, student_id, date, subject, repeat_type, repeat_until, time_start, time_end, gcal_event_id, group_id |
| `groups` | id, name, student_ids (comma-separated), line_group_id, package_hours, package_rate |
| `receipts` | id, receipt_number, invoice_id, payment_method, amount |
| `cancellations` | id, schedule_id, original_date, rescheduled_to |
| `settings` | Single-row config: VAT, rates, LINE tokens, PromptPay ID, invoice numbering, Zoom link, notification flags |

All deletions are **soft deletes** via `is_deleted` flag—never hard-delete rows.

**Package-hour invariant**: `sessions.invoiced` has a third state beyond `TRUE`/`FALSE` — `'PREPAID'`, meaning the session was paid for out of the student's `package_hours_remaining` balance instead of being billed. Any code path that creates, edits the hours of, or deletes a `PREPAID` session **must** also adjust `students!K` (`updateStudentPackageHours`) by the matching delta, or the balance silently drifts from what was actually taught — see `Sessions.jsx`'s `handleDeleteClick`/`handleSubmit` for the reference implementation (refund on delete, delta-adjust on hours edit). Note only `package_hours_remaining` is tracked for individual students — there is no "original package size" column, so any UI showing package balance (`StudentPortal.jsx`/`GroupPortal.jsx`) can only render an urgency tier (low/medium/healthy), never a true "% used of X hours purchased" bar. Groups (`groups` sheet) are the exception — they track both `package_hours` (original) and `package_hours_remaining`.

### Authentication

- **Teacher**: Google OAuth 2.0 via `@react-oauth/google`; access token in `sessionStorage` (`zw_token`), passed to every Sheets/Calendar API call. DB spreadsheet ID persists in `localStorage` (`zw_db_id`) so re-login doesn't require re-selecting the sheet.
- **Students**: no real login. `/line-connect` gives the student a connect code to send manually over LINE; the student portal (`/portal`) and video-call join (`/join`) identify the student/session from a code or schedule ID in the URL/local storage rather than any OAuth/LIFF flow.

### Cloudflare Worker API Surface (`webrtc-signaling/src/index.js`)

All state lives in one KV namespace (`WEBRTC_KV`, 4-hour to 90-day TTLs depending on key). CORS is open to any origin, so auth is per-endpoint: teacher-only endpoints check an `X-Teacher-Token` header against the `TEACHER_SECRET` secret via `requireTeacher()` — but stay open (with a console warning) when `TEACHER_SECRET` was never set, so a fresh deployment isn't bricked. The frontend sends the header via `teacherAuthHeaders()` in `src/lib/business.js` (reads `VITE_TEACHER_SECRET`). Teacher-gated: `POST /config/sheet`, `POST /config/features`, `POST /class-code`, `POST /push/send`, `GET /bookings/pending`, `DELETE /booking/:id`, plus `GET/POST /admin/line-config` (strictly gated — 401 even when the secret is unset). Known limitation: `VITE_TEACHER_SECRET` is baked into the public JS bundle, so this stops drive-by abuse, not a determined attacker who reads the bundle.

Routes, grouped by concern:
- **WebRTC signaling** — `POST /room/signal`, `GET /room/poll`, `GET /room/participants`, `POST /room/leave`. Each sender writes to its own KV key (`room_{id}_from_{sender}`) instead of one shared room key, avoiding write races during ICE exchange; `/room/leave` writes to a shared `_broadcast` key instead so the peer can still read it after the sender drops from presence.
- **Active-sheet config** — `GET/POST /config/sheet`, `POST /config/features`. The teacher's `App.jsx` POSTs its `dbId` here on load so student-facing pages (which have no Google auth) can resolve "the current sheet" and a `videoCallEnabled` feature flag.
- **Sheet CSV proxy** — `GET /proxy/sheet`. Server-side fetch of the Google Sheets GViz CSV export, because iOS Safari fails on direct cross-origin requests to `docs.google.com`. Hardcoded allowlist of 4 sheets (`students`, `sessions`, `schedules`, `groups`) — never add `settings` or other sheets here, since that would leak LINE tokens etc.
- **LINE admin config** — `GET/POST /admin/line-config`, gated by an `X-Teacher-Token` header matched against the `TEACHER_SECRET` secret. Keeps LINE channel token/worker URL out of the (semi-public) Google Sheet.
- **Web Push** — `POST /push/subscribe|unsubscribe|send`, using VAPID (`VAPID_PUBLIC_KEY` var, `VAPID_PRIVATE_JWK` secret, `VAPID_SUBJECT` var; sent via `webrtc-signaling/src/webpush.js`). Consumed from `StudentPortal.jsx` / `GroupPortal.jsx` (subscribe) via `public/sw.js` (the service worker that renders the notification).
- **LINE bill image relay** — `POST /push-bill-image` uploads a data URL to KV (30-min TTL) and pushes a LINE image message pointing at `GET /bill-image/:id`, since the LINE Messaging API requires a fetchable HTTPS image URL rather than a data URI.
- **Class codes** — `POST /class-code`, `GET /class-code/:code`. Short (≤4 char) codes mapping to a sheet ID + feature flag, used by `StudentPortal.jsx`/`Settings.jsx` as a friendlier join mechanism than a raw spreadsheet ID.
- **Booking requests** — `POST /booking`, `GET /bookings/pending`, `GET /booking/student/:id`, `DELETE /booking/:id`. Lets students propose a class time (`StudentPortal.jsx`) for the teacher to approve/reject in `Calendar.jsx`.
- **Class reminders (cron)** — `src/reminders.js`, run from the `scheduled()` handler every 5 minutes (`triggers.crons` in wrangler.jsonc). Sends the "class starting soon" LINE message to students, replacing the old client-side path in `useZoomReminder.js` (which only fired while the teacher's tab was open; the hook now handles teacher-facing toasts only). Reads schedules/students/cancellations/settings via public GViz CSV, LINE token from KV `line_config`, sheet ID from KV `config_sheet_id`; dedups with `reminded_{scheduleId}_{date}` KV keys (1-day TTL). The portal link in the message needs the `APP_ORIGIN` var (wrangler.jsonc) set to the deployed frontend URL. ⚠️ `reminders.js` duplicates column-index constants and `scheduleOccursOnDate`/`buildStudentLoginCode` from `src/lib/` — keep them in sync when adding sheet columns.

### Video Calls & Interactive Board

The platform's built-in video call is replacing Zoom as the teaching surface (target UX: "GoodNotes over Zoom" on iPad — note `getDisplayMedia` is unavailable on iPadOS Safari, so don't rely on screen share there).

- **`VideoCallModal.jsx`** (~1600 lines) — 1:1 teacher↔student call. Owns the `simple-peer` connection (lazy dynamic import to avoid the TDZ crash), media controls, and all board/PDF sync transport. Teacher launches from `Calendar.jsx` via `modals/VideoCallLauncher.jsx`; the student side is `JoinClass.jsx` (`/join`), which lazy-renders the same modal.
- **`GroupCallModal.jsx`** (~770 lines) — group calls as a full mesh: a `Map` of `participantId → Peer`, with per-peer signal polling against the worker's `/room/*` endpoints (HTTP polling, no WebSockets).
- **`InteractiveBoard.jsx`** (~1400 lines, lazy-loaded into both call modals) — shared multi-tab whiteboard with optional PDF page backgrounds (rendered via `react-pdf`, zoom/pan via `react-zoom-pan-pinch`).

Sync protocol over the simple-peer DataChannel:
- Board state is JSON messages: `DRAW`/`DRAW_POINT`, `ERASE`, `UNDO`/`REDO`, `CLEAR_PAGE`, `TAB` (active tab), `PAGE` (page number), `SYNC` (full-state restore for late joiners/reconnects), `PERMISSION` (student draw rights).
- PDFs transfer as **binary** DataChannel messages: `PDF_META` (JSON) announces the file, then per-chunk frames of `[4-byte header length (LE)][JSON header {tabId, chunkIndex}][raw PDF bytes]`. Sender pauses when `bufferedAmount` exceeds a 4 MB high-water mark and resumes after drain (`sendPdfChunks`/`waitForDrain` — the same protocol is implemented in both call modals). Keep JSON-message handlers tolerant of these binary frames and vice versa.
- Board state (strokes + PDF binary) is also persisted to Google Drive per student/group (`InteractiveBoard.jsx`'s `saveToDrive`/`loadFromDrive`/`saveDrivePdfBinary`), so reopening a call restores prior work without needing the other peer online — local IndexedDB is checked first (instant, offline-capable), then Drive (`recoverPdfBinary()`). Because a Drive restore never went through the normal `onTabSync`/`onPdfUpload` broadcast, `onBoardRestored` forces one fresh full `SYNC` to every already-connected peer so they don't miss it.

### Teacher Feedback Inbox (read this at the start of improvement sessions)

The teacher logs improvement requests in-app at `/feedback` (`src/pages/Feedback.jsx`), stored in the `feedback` sheet (columns: id, date, category, message, status, created_at; category ∈ bug/feature/ux/other; status `NEW` = not yet handled, `DONE` = closed). **When the user asks to improve the system (or says "อ่าน feedback"), fetch the pending items first:**

1. Get the sheet ID: `GET {WORKER_URL}/config/sheet` → `{ sheetId }` (worker URL = `VITE_WEBRTC_SIGNALING_URL`; if unknown, ask the user once).
2. Fetch `https://docs.google.com/spreadsheets/d/{sheetId}/gviz/tq?tqx=out:csv&sheet=feedback` (public GViz CSV — no auth needed).
3. Work through rows with status `NEW`, oldest first unless the user says otherwise. The teacher marks items `DONE` in the UI; you cannot write to the sheet without their OAuth token, so report which items you addressed and ask them to close those.

Do **not** add `feedback` to the worker's `/proxy/sheet` allowlist — students don't need it, and GViz direct fetch works fine from a dev machine.

### Environment Variables (`.env`)

```
VITE_GOOGLE_CLIENT_ID        # Google OAuth client ID
VITE_WEBRTC_SIGNALING_URL    # Cloudflare Workers endpoint (signaling + the API surface above)
VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL  # TURN server creds
VITE_TEACHER_SECRET          # must match the worker's TEACHER_SECRET; sent as X-Teacher-Token on teacher-only endpoints
VITE_VAPID_PUBLIC_KEY        # Web Push public key; must match VAPID_PUBLIC_KEY in webrtc-signaling/wrangler.jsonc
```

The worker itself is configured via `webrtc-signaling/wrangler.jsonc` (`WEBRTC_KV` binding, `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` vars) plus two secrets not in that file: `VAPID_PRIVATE_JWK` and `TEACHER_SECRET` (set with `wrangler secret put`).

### Invoicing & Payments

Invoices are generated from uninvoiced sessions:
1. Sessions marked `invoiced=false` are collected per student — `Students.jsx`'s `handleCreateInvoice` (one student, with a review modal) or `handleBulkInvoice` (every student with a pending balance, one click; supports retrying only the students that failed on a prior bulk run via `failedBulkStudents`)
2. `addInvoiceComplete()` + `markSessionsAsInvoiced()` in `googleSheets.js` create the invoice + invoice_items rows and flip the sessions to invoiced
3. Invoice PDF uses html2canvas + jsPDF; includes a PromptPay QR code via `promptpay-qr`. `settings.promptpay_id` is validated client-side in `Settings.jsx` (must be exactly 10 digits — mobile — or 13 digits — national/tax ID — after stripping non-digits) since a malformed value produces a QR that scans but pays the wrong account
4. VAT is configurable (default 7%); some clients are VAT-exempt
5. Voiding a `PAID` invoice that already has a receipt does **not** delete or void the receipt (no `VOID` status exists on `receipts`) — `Invoices.jsx`'s `handleVoidInvoice` just warns the teacher in the confirm dialog; reconciling the orphaned receipt is manual

### Bundle Chunking

`vite.config.js` splits vendor chunks manually to solve a `simple-peer` TDZ (Temporal Dead Zone) initialization crash and to keep the main bundle small:
- `simple-peer-vendor` — simple-peer + its Node polyfill deps (must be isolated)
- `recharts-vendor` — recharts + d3 (used on 3 pages only)

`lazyPage()` in `App.jsx` wraps `React.lazy` with a stale-chunk guard: if a `"Failed to fetch dynamically imported module"` error occurs (after a new deploy), it hard-reloads once per session to pick up the new hashes.

### Language

All UI strings are hardcoded **Thai** directly in the JSX (with some Chinese content for teaching material). Write new UI text in Thai to match. There is no i18n system — `i18next`, `@line/liff`, `zustand`, and `uuid` were unused dependencies and were removed in July 2026; don't reintroduce them without an actual import.

### Deployment

- Frontend: Vercel — `vercel.json` rewrites all routes to `index.html` (SPA), sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` (required for Google OAuth popup), and caches `/assets/*` immutably with `no-cache` on `index.html`.
- Signaling: Cloudflare Workers — config in `webrtc-signaling/wrangler.jsonc`
