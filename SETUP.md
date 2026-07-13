# คู่มือติดตั้งสำหรับเจ้าของใหม่ (Setup Guide)

คู่มือนี้อธิบายวิธีนำระบบนี้ไปใช้กับสถาบันหรือครูผู้สอนคนใหม่ ตั้งแต่ต้นจนถึง deploy จริง

---

## สิ่งที่ต้องเตรียมก่อนเริ่ม

| สิ่งที่ต้องมี | ใช้ทำอะไร | ลิงก์สมัคร / สร้าง |
|---|---|---|
| Google Account | OAuth Login, Google Sheets DB, Google Calendar | https://accounts.google.com |
| Google Cloud Project | สร้าง OAuth Client ID และเปิด APIs | https://console.cloud.google.com |
| LINE Official Account | ส่งข้อความหานักเรียน | https://account.line.biz |
| LINE Developers Account | เอา Channel Access Token (Messaging API) | https://developers.line.biz |
| Cloudflare Account (free) | deploy WebRTC signaling worker | https://dash.cloudflare.com |
| TURN Server credentials | video call ผ่าน firewall/NAT | https://dashboard.metered.ca |
| Vercel Account (free) | deploy frontend | https://vercel.com |

---

## ขั้นตอนที่ 1 — ตั้งค่า Google Cloud

1. เข้า [Google Cloud Console](https://console.cloud.google.com) → สร้าง Project ใหม่
2. เปิด APIs ต่อไปนี้ (APIs & Services → Library):
   - **Google Sheets API**
   - **Google Drive API**
   - **Google Calendar API**
3. สร้าง OAuth 2.0 Client ID (APIs & Services → Credentials → Create Credentials):
   - Application type: **Web application**
   - Authorized JavaScript origins: ใส่ URL ของ Vercel เช่น `https://your-app.vercel.app`
   - Authorized redirect URIs: ใส่ URL เดียวกัน
   - คัดลอก **Client ID** (ไม่ต้องใช้ Client Secret)

---

## ขั้นตอนที่ 2 — แก้ไขไฟล์ `.env`

คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าจริง:

```bash
cp .env.example .env
```

เปิด `.env` และแก้ทุกบรรทัด:

```env
VITE_GOOGLE_CLIENT_ID=       ← ใส่ Client ID จาก Google Cloud Console
VITE_WEBRTC_SIGNALING_URL=   ← URL ของ Cloudflare Worker (ดูขั้นตอนที่ 5)
VITE_TURN_USERNAME=          ← จาก https://dashboard.metered.ca
VITE_TURN_CREDENTIAL=        ← จาก https://dashboard.metered.ca
VITE_VAPID_PUBLIC_KEY=       ← สร้างด้วย npx web-push generate-vapid-keys
```

> **หมายเหตุ:** ไฟล์ `.env` ต้องไม่ถูก commit ขึ้น git (มีใน `.gitignore` อยู่แล้ว)

---

## ขั้นตอนที่ 3 — แก้ไขไฟล์ `src/lib/appConfig.js`

นี่คือไฟล์หลักสำหรับ **ปรับ branding และเนื้อหา** ทั้งหมด เปิดไฟล์และแก้ทุกค่าให้ตรงกับสถาบันของคุณ:

```js
// ── ชื่อแอปและ branding ──────────────────────────────────────────
export const APP_NAME = 'ชื่อสถาบันของคุณ';
export const APP_SUBTITLE = 'ระบบจัดการคลาสเรียน...';
export const APP_PWA_DESCRIPTION = 'คำอธิบายแอปสำหรับ PWA';
export const TEACHER_ROLE_LABEL = 'ครู';           // ปุ่ม login ฝั่งครู
export const TEACHER_ROLE_SUBLABEL = 'ผู้สอน / Admin';
export const STUDENT_PORTAL_LINK_TEXT = 'เข้า Student Portal →';
export const STUDENT_CODE_HINT = 'ใช้รหัสจากครูเพื่อเข้าระบบ';

// ── วิชาที่สอน ────────────────────────────────────────────────────
export const SUBJECT_PRESETS = [
  'วิชา 1', 'วิชา 2', ...   // เปลี่ยนเป็นวิชาที่สอนจริง
];

// ── ป้ายในเอกสาร (บิล/ใบเสร็จ) ────────────────────────────────────
export const INVOICE_LINE_LABEL = 'ค่าเรียน...';
export const RECEIPT_SERVICE_LABEL = 'ค่าเรียน...';
export const PACKAGE_RECEIPT_LABEL = 'แพ็กเกจชั่วโมงเรียน...';
export const INVOICE_DEFAULT_SUBJECT = 'วิชา...';

// ── Timezone และภาษา ──────────────────────────────────────────────
export const APP_TIMEZONE = 'Asia/Bangkok';   // เปลี่ยนถ้าอยู่คนละ timezone
export const APP_LOCALE = 'th-TH';

// ── Google Sheets ─────────────────────────────────────────────────
export const DATABASE_NAME = 'ชื่อไฟล์ Database ใน Google Drive';
export const PUBLISHED_SHEET_ID = 'ID ของ Spreadsheet ที่แชร์เป็น public';
```

---

## ขั้นตอนที่ 4 — ตั้งค่า LINE (LINE Official Account)

1. สมัครที่ [LINE Business](https://account.line.biz)
2. เข้า LINE Developers → เลือก channel ที่สร้าง
3. คัดลอก **Channel Access Token** (Messaging API tab)
4. คัดลอก **Channel Secret**
5. ค่าเหล่านี้ตั้งผ่านหน้า **Settings** ในแอป (ไม่ต้องใส่ในโค้ด)

> ไม่ต้องสร้าง LIFF App — ระบบระบุตัวตนนักเรียนด้วย connect code (`/line-connect`) และ class code แทน

---

## ขั้นตอนที่ 5 — Deploy Cloudflare Worker (WebRTC Signaling)

```bash
cd webrtc-signaling
npm install

# Login เข้า Cloudflare
npx wrangler login

# สร้าง KV namespace
npx wrangler kv namespace create WEBRTC_KV
# → จะได้ id: "abc123..." → นำไปใส่ใน wrangler.jsonc

# สร้าง VAPID key pair
npx web-push generate-vapid-keys
# → จะได้ Public Key และ Private Key
# → Public Key: ใส่ใน wrangler.jsonc (VAPID_PUBLIC_KEY) และ .env (VITE_VAPID_PUBLIC_KEY)
# → Private Key: ใส่เป็น secret

# ใส่ VAPID private key เป็น secret (ไม่ถูก commit ขึ้น git)
npx wrangler secret put VAPID_PRIVATE_KEY
# (วาง private key แล้วกด Enter)

# แก้ wrangler.jsonc: ใส่ KV namespace id, VAPID_PUBLIC_KEY, VAPID_SUBJECT (email)
# และ APP_ORIGIN = URL หน้าเว็บจริงบน Vercel (ใช้สร้างลิงก์ใน LINE แจ้งเตือนก่อนเรียน)

# ตั้ง Teacher Secret (ป้องกัน endpoints ฝั่งจัดการ — ต้องตรงกับ VITE_TEACHER_SECRET ใน .env)
npx wrangler secret put TEACHER_SECRET
# (ตั้งรหัสยาวๆ สุ่มเอง แล้วนำค่าเดียวกันใส่ .env เป็น VITE_TEACHER_SECRET)

# Deploy
npm run deploy
# → จะได้ URL เช่น https://webrtc-signaling.YOUR_ACCOUNT.workers.dev
# → นำ URL นี้ใส่ใน .env เป็น VITE_WEBRTC_SIGNALING_URL
# → cron trigger (แจ้งเตือน LINE ก่อนเรียนทุก 5 นาที) จะติดตั้งอัตโนมัติพร้อม deploy
```

---

## ขั้นตอนที่ 6 — เปลี่ยน Logo และ Favicon

Logo ถูก embed เป็น Base64 ใน `src/lib/constants.js` (ตัวแปร `LOGO_B64`):

1. เตรียมไฟล์ logo ของคุณ (PNG พื้นหลังโปร่งใส แนะนำ 256×256 px)
2. แปลงเป็น Base64:
   ```bash
   # วิธีที่ 1: ใช้เว็บ https://www.base64-image.de
   # วิธีที่ 2: ใช้ Node.js
   node -e "const fs=require('fs'); console.log('data:image/png;base64,'+fs.readFileSync('logo.png').toString('base64'))"
   ```
3. เปิด `src/lib/constants.js` หาตัวแปร `LOGO_B64` และแทนที่ค่า Base64 ด้วยของคุณ

**Favicon files** (ใน `public/`):
- `public/favicon.png` — 32×32 px
- `public/favicon-256.png` — 256×256 px  
- `public/apple-touch-icon.png` — 180×180 px

แทนที่ไฟล์เหล่านี้ด้วย logo ของคุณในขนาดที่ถูกต้อง

**index.html** — เปลี่ยนชื่อแอปใน 2 จุด:
```html
<title>ชื่อแอปของคุณ</title>
<meta name="apple-mobile-web-app-title" content="ชื่อแอปของคุณ" />
```

**public/manifest.json** — เปลี่ยนชื่อและคำอธิบาย PWA:
```json
{
  "name": "ชื่อแอปเต็ม",
  "short_name": "ชื่อย่อ",
  "description": "คำอธิบาย"
}
```

---

## ขั้นตอนที่ 7 — ตั้งค่าในหน้า Settings ของแอป

หลัง login เป็นครูแล้ว เข้าเมนู **Settings** และกรอกข้อมูลสถาบัน:

| รายการ | คำอธิบาย |
|---|---|
| ชื่อสถาบัน | แสดงบนบิลและใบเสร็จ |
| ที่อยู่ | แสดงบนบิลและใบเสร็จ |
| เบอร์โทร | ข้อมูลติดต่อ |
| Tax ID | เลขประจำตัวผู้เสียภาษี (ถ้ามี) |
| อัตราค่าเรียน (default) | ราคาต่อชั่วโมงเริ่มต้น |
| VAT % | ภาษีมูลค่าเพิ่ม (0 ถ้าไม่มี) |
| PromptPay ID | เบอร์มือถือหรือเลขบัตรประชาชน 13 หลัก |
| LINE Channel Token | จาก LINE Developers (Messaging API) |
| LINE Worker URL | URL ของ Cloudflare Worker (ถ้าใช้ LINE OA) |
| Teacher LINE User ID | LINE User ID ของครู (สำหรับแจ้งเตือนก่อนสอน) |
| Zoom Link | ลิงก์ Zoom ประจำห้องเรียน |

---

## ขั้นตอนที่ 8 — Deploy Frontend บน Vercel

```bash
# ติดตั้ง Vercel CLI (ถ้ายังไม่มี)
npm install -g vercel

# Deploy
vercel

# หรือ connect GitHub repo ที่ vercel.com แล้วตั้ง Environment Variables:
# VITE_GOOGLE_CLIENT_ID, VITE_WEBRTC_SIGNALING_URL,
# VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL, VITE_VAPID_PUBLIC_KEY
```

> **สำคัญ:** ต้องเพิ่ม URL ของ Vercel ใน Google Cloud Console → OAuth → Authorized JavaScript origins ด้วย

---

## ขั้นตอนที่ 9 — สร้างฐานข้อมูลใหม่

1. Login เข้าแอปด้วย Google account ของครู
2. ระบบจะค้นหา Google Spreadsheet ชื่อ `DATABASE_NAME` (ที่ตั้งใน `appConfig.js`) ใน Drive
3. ถ้าไม่พบ ระบบจะสร้างให้อัตโนมัติ
4. หลังสร้างแล้ว ให้แชร์ Spreadsheet นั้นเป็น "Anyone with link → Viewer"
5. คัดลอก Spreadsheet ID (ส่วน `/d/XXXXX/edit` ใน URL) ใส่ใน `appConfig.js` → `PUBLISHED_SHEET_ID`

---

## สรุปไฟล์ที่ต้องแก้ทั้งหมด

| ไฟล์ | สิ่งที่ต้องแก้ |
|---|---|
| `.env` | API keys ทั้งหมด |
| `src/lib/appConfig.js` | ชื่อแอป, วิชา, ป้ายเอกสาร, timezone |
| `index.html` | `<title>` และ `apple-mobile-web-app-title` |
| `public/manifest.json` | `name`, `short_name`, `description` |
| `public/favicon*.png` | ไฟล์รูป logo |
| `public/apple-touch-icon.png` | ไฟล์รูป logo |
| `src/lib/constants.js` | `LOGO_B64` (ค่า Base64 ของ logo) |
| `webrtc-signaling/wrangler.jsonc` | KV namespace ID, VAPID key, email |

ค่าอื่นๆ (ชื่อสถาบัน, ที่อยู่, PromptPay, LINE token ฯลฯ) ตั้งผ่านหน้า **Settings** ในแอปได้เลย ไม่ต้องแก้ไขโค้ด
