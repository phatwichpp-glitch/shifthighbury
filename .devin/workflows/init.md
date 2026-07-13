---
description: Initialize project for new deployment
---

# Project Initialization Workflow

This workflow guides you through setting up the shifthighbury project for a new institution/teacher deployment.

## Prerequisites

Ensure you have accounts for:
- Google Account (for OAuth, Sheets, Calendar)
- Google Cloud Project
- LINE Official Account
- LINE Developers Account
- Cloudflare Account (free)
- TURN Server credentials (metered.ca)
- Vercel Account (free)

## Step 1: Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a new project
2. Enable the following APIs (APIs & Services → Library):
   - Google Sheets API
   - Google Drive API
   - Google Calendar API
3. Create OAuth 2.0 Client ID (APIs & Services → Credentials → Create Credentials):
   - Application type: Web application
   - Authorized JavaScript origins: Your Vercel URL (e.g., `https://your-app.vercel.app`)
   - Authorized redirect URIs: Same as above
   - Copy the **Client ID** (no Client Secret needed)

## Step 2: Configure .env File

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and fill in all values:
- `VITE_GOOGLE_CLIENT_ID` - From Google Cloud Console
- `VITE_LIFF_ID` - From LINE Developers (Step 4)
- `VITE_WEBRTC_SIGNALING_URL` - Cloudflare Worker URL (Step 5)
- `VITE_TURN_USERNAME` - From metered.ca
- `VITE_TURN_CREDENTIAL` - From metered.ca
- `VITE_VAPID_PUBLIC_KEY` - Generate with `npx web-push generate-vapid-keys`

## Step 3: Edit src/lib/appConfig.js

This is the main file for branding and content customization. Update:
- APP_NAME, APP_SUBTITLE, APP_PWA_DESCRIPTION
- TEACHER_ROLE_LABEL, TEACHER_ROLE_SUBLABEL
- STUDENT_PORTAL_LINK_TEXT, STUDENT_CODE_HINT
- SUBJECT_PRESETS (subjects you teach)
- Invoice/receipt labels (INVOICE_LINE_LABEL, RECEIPT_SERVICE_LABEL, etc.)
- APP_TIMEZONE, APP_LOCALE
- DATABASE_NAME, PUBLISHED_SHEET_ID

## Step 4: LINE Setup (LINE OA + LIFF)

### 4.1 Create LINE Official Account
1. Sign up at [LINE Business](https://account.line.biz)
2. Go to LINE Developers → select your channel
3. Copy **Channel Access Token** (Messaging API tab)
4. Copy **Channel Secret**
5. These values are set via the Settings page in the app (not in code)

### 4.2 Create LIFF App
1. LINE Developers → select channel (LINE Login) → LIFF tab → Add
2. Endpoint URL: `https://your-app.vercel.app/liff`
3. Copy **LIFF ID** → add to `.env` as `VITE_LIFF_ID`

## Step 5: Deploy Cloudflare Worker (WebRTC Signaling)

```bash
cd webrtc-signaling
npm install

# Login to Cloudflare
npx wrangler login

# Create KV namespace
npx wrangler kv namespace create WEBRTC_KV
# Copy the id and add to wrangler.jsonc

# Generate VAPID key pair
npx web-push generate-vapid-keys
# Add Public Key to wrangler.jsonc and .env
# Add Private Key as secret:
npx wrangler secret put VAPID_PRIVATE_KEY

# Edit wrangler.jsonc with KV namespace id, VAPID_PUBLIC_KEY, VAPID_SUBJECT

# Deploy
npm run deploy
# Copy the URL and add to .env as VITE_WEBRTC_SIGNALING_URL
```

## Step 6: Change Logo and Favicon

Logo is embedded as Base64 in `src/lib/constants.js` (variable `LOGO_B64`):
1. Prepare your logo file (PNG with transparent background, recommended 256×256 px)
2. Convert to Base64:
   ```bash
   node -e "const fs=require('fs'); console.log('data:image/png;base64,'+fs.readFileSync('logo.png').toString('base64'))"
   ```
3. Open `src/lib/constants.js`, find `LOGO_B64`, and replace with your Base64 value

Replace favicon files in `public/`:
- `public/favicon.png` (32×32 px)
- `public/favicon-256.png` (256×256 px)
- `public/apple-touch-icon.png` (180×180 px)

Edit `index.html` - change app name in:
```html
<title>Your App Name</title>
<meta name="apple-mobile-web-app-title" content="Your App Name" />
```

Edit `public/manifest.json`:
```json
{
  "name": "Full App Name",
  "short_name": "Short Name",
  "description": "Description"
}
```

## Step 7: Configure App Settings

After logging in as a teacher, go to **Settings** and fill in:
- Institution name (shown on invoices/receipts)
- Address
- Phone number
- Tax ID (if applicable)
- Default tuition rate
- VAT % (0 if none)
- PromptPay ID
- LINE Channel Token
- LINE Worker URL (if using LINE OA)
- Teacher LINE User ID
- Zoom Link

## Step 8: Deploy Frontend to Vercel

```bash
npm install -g vercel
vercel
```

Or connect GitHub repo on vercel.com and set environment variables:
- VITE_GOOGLE_CLIENT_ID
- VITE_LIFF_ID
- VITE_WEBRTC_SIGNALING_URL
- VITE_TURN_USERNAME
- VITE_TURN_CREDENTIAL
- VITE_VAPID_PUBLIC_KEY

**Important:** Add your Vercel URL to Google Cloud Console → OAuth → Authorized JavaScript origins

## Step 9: Create Database

1. Login to the app with teacher's Google account
2. System will search for Google Spreadsheet named `DATABASE_NAME` (from appConfig.js) in Drive
3. If not found, system will create it automatically
4. After creation, share the spreadsheet as "Anyone with link → Viewer"
5. Copy the Spreadsheet ID (from `/d/XXXXX/edit` in URL) and add to `appConfig.js` → `PUBLISHED_SHEET_ID`

## Summary of Files to Edit

| File | What to Change |
|------|----------------|
| `.env` | All API keys |
| `src/lib/appConfig.js` | App name, subjects, labels, timezone |
| `index.html` | `<title>` and `apple-mobile-web-app-title` |
| `public/manifest.json` | `name`, `short_name`, `description` |
| `public/favicon*.png` | Logo image files |
| `public/apple-touch-icon.png` | Logo image file |
| `src/lib/constants.js` | `LOGO_B64` (Base64 logo) |
| `webrtc-signaling/wrangler.jsonc` | KV namespace ID, VAPID key, email |

Other values (institution name, address, PromptPay, LINE tokens, etc.) are configured via the **Settings** page in the app.
