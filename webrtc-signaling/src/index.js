import { sendWebPush } from './webpush.js';
import { sendClassReminders } from './reminders.js';

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Line-Token, X-Teacher-Token',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/** Returns true when the request carries a valid teacher secret. */
function isTeacherAuthed(request, env) {
  if (!env.TEACHER_SECRET) return false;
  return request.headers.get('X-Teacher-Token') === env.TEACHER_SECRET;
}

/**
 * Auth gate for teacher-only endpoints. Returns null when the request may
 * proceed, or a 401 Response to return as-is.
 * Unlike isTeacherAuthed, deployments that never set TEACHER_SECRET stay open
 * (with a warning) so a fresh setup isn't bricked before the secret exists.
 */
function requireTeacher(request, env, routeName) {
  if (!env.TEACHER_SECRET) {
    console.warn(`[AUTH] ${routeName} is unprotected — set the TEACHER_SECRET secret to lock it down`);
    return null;
  }
  if (request.headers.get('X-Teacher-Token') === env.TEACHER_SECRET) return null;
  return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: getCorsHeaders(request) });
}

async function safeGetMessages(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function safeGetPresence(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Keep only messages from the last 30 minutes to bound KV value size.
// Called on every write so arrays shrink naturally over time.
function pruneOldMessages(messages) {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return messages.filter(m => m.timestamp > cutoff);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(request) });
    const url = new URL(request.url);

    try {
      // ── POST /room/signal ─────────────────────────────────────────────────────
      // Body: { roomId, sender, target, signal }
      //
      // Each sender writes to their own KV key  room_${roomId}_from_${sender}
      // instead of a single shared room key, eliminating concurrent write races
      // during ICE candidate exchange.  The poll endpoint merges all sender keys.
      if (url.pathname === '/room/signal' && request.method === 'POST') {
        console.log('[SIGNAL] received');
        let body;
        try {
          body = await request.json();
          console.log('[SIGNAL] body:', JSON.stringify(body).slice(0, 300));
        } catch (e) {
          console.error('[ERROR] /room/signal body parse failed:', e.message);
          return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400, headers: getCorsHeaders(request) });
        }
        const { roomId, sender, target, signal } = body;
        const senderKey   = `room_${roomId}_from_${sender}`;
        const presenceKey = `presence_${roomId}`;

        // Update presence — every signal write refreshes the sender's heartbeat
        try {
          const presence = await safeGetPresence(env.WEBRTC_KV, presenceKey);
          presence[sender] = Date.now();
          await env.WEBRTC_KV.put(presenceKey, JSON.stringify(presence), { expirationTtl: 14400 });
        } catch (e) {
          console.warn('[WARN] presence update failed:', e.message);
        }

        // Batched ICE candidates — one KV write per burst, to sender's own key
        if (signal?.type === 'candidates' && Array.isArray(signal.items)) {
          try {
            const messages = pruneOldMessages(await safeGetMessages(env.WEBRTC_KV, senderKey));
            const now = Date.now();
            signal.items.forEach((item, i) =>
              messages.push({ sender, target, signal: item, timestamp: now + i }),
            );
            console.log('[KV] batch candidates:', signal.items.length, 'room:', roomId, 'sender:', sender, 'target:', target, 'total:', messages.length);
            await env.WEBRTC_KV.put(senderKey, JSON.stringify(messages), { expirationTtl: 14400 });
            return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
          } catch (e) {
            console.error('[ERROR] /room/signal candidates batch KV failed:', e.message);
            throw e;
          }
        }

        // All other signals (offer, answer, sync-time, screenshare, camera, chat, join-announce, joined)
        // go to the sender's own key — no shared key, no write-write races.
        try {
          const messages = pruneOldMessages(await safeGetMessages(env.WEBRTC_KV, senderKey));
          messages.push({ sender, target, signal, timestamp: Date.now() });
          console.log('[KV] signal type:', signal?.type || 'unknown', 'room:', roomId, 'sender:', sender, 'target:', target, 'total:', messages.length);
          await env.WEBRTC_KV.put(senderKey, JSON.stringify(messages), { expirationTtl: 14400 });
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /room/signal KV failed:', e.message);
          throw e;
        }
      }

      // ── GET /room/poll ────────────────────────────────────────────────────────
      // Params: roomId, lastTimestamp, participantId
      //
      // Reads from two sources and merges:
      //   1. room_${roomId}_broadcast — leave signals (written by /room/leave)
      //   2. room_${roomId}_from_${id} — one key per sender in presence
      //
      // Filtering rules (unchanged from before):
      //   1. Only messages newer than lastTimestamp
      //   2. Never return the requester's own signals
      //   3. If message has a target: only deliver to target or broadcast recipients
      //   4. If message has no target: deliver to all
      if (url.pathname === '/room/poll' && request.method === 'GET') {
        try {
          const roomId        = url.searchParams.get('roomId');
          const lastTimestamp = parseInt(url.searchParams.get('lastTimestamp') || '0');
          const participantId = url.searchParams.get('participantId') || '';

          // 1. Always read the broadcast key (leave signals live here)
          const broadcastMsgs = pruneOldMessages(
            await safeGetMessages(env.WEBRTC_KV, `room_${roomId}_broadcast`),
          );

          // 2. Read per-sender keys for every participant currently in presence,
          //    skipping the requester's own key to avoid returning their own messages.
          const presence = await safeGetPresence(env.WEBRTC_KV, `presence_${roomId}`);
          const otherIds = Object.keys(presence).filter(id => !participantId || id !== participantId);
          const senderArrays = await Promise.all(
            otherIds.map(id =>
              safeGetMessages(env.WEBRTC_KV, `room_${roomId}_from_${id}`).then(pruneOldMessages),
            ),
          );

          const allMessages = [...broadcastMsgs, ...senderArrays.flat()]
            .sort((a, b) => a.timestamp - b.timestamp);

          const newMessages = allMessages.filter(m => {
            if (m.timestamp <= lastTimestamp) return false;
            if (participantId && m.sender === participantId) return false;
            if (m.target && m.target !== 'broadcast' && participantId && m.target !== participantId) return false;
            return true;
          });

          console.log('[POLL] room:', roomId, 'participant:', participantId, 'last:', lastTimestamp, 'senders:', otherIds.length, 'delivering:', newMessages.length);
          return new Response(JSON.stringify({ messages: newMessages }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /room/poll failed:', e.message);
          throw e;
        }
      }

      // ── GET /room/participants ────────────────────────────────────────────────
      // Returns participants who sent a signal within the last 30 seconds.
      if (url.pathname === '/room/participants' && request.method === 'GET') {
        try {
          const roomId = url.searchParams.get('roomId');
          if (!roomId) {
            return new Response(JSON.stringify({ error: 'missing roomId' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const presence = await safeGetPresence(env.WEBRTC_KV, `presence_${roomId}`);
          const cutoff = Date.now() - 30000;
          const active = Object.entries(presence)
            .filter(([, lastSeen]) => lastSeen > cutoff)
            .map(([id]) => id);
          console.log('[PARTICIPANTS] room:', roomId, 'active:', active);
          return new Response(JSON.stringify({ participants: active }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /room/participants failed:', e.message);
          throw e;
        }
      }

      // ── POST /room/leave ──────────────────────────────────────────────────────
      // Body: { roomId, sender }
      //
      // Leave signals go to the shared broadcast key (not the sender's own key)
      // so the other party can still read them after the sender is removed from
      // presence.  Does NOT clear sender signals — remaining participants' data
      // stays intact until the 30-minute prune window expires.
      if (url.pathname === '/room/leave' && request.method === 'POST') {
        try {
          const { roomId, sender } = await request.json();
          const broadcastKey = `room_${roomId}_broadcast`;
          const presenceKey  = `presence_${roomId}`;

          // Append leave signal to broadcast key
          const messages = pruneOldMessages(await safeGetMessages(env.WEBRTC_KV, broadcastKey));
          messages.push({ sender, target: 'broadcast', signal: { type: 'leave', sender }, timestamp: Date.now() });
          console.log('[LEAVE] sender:', sender, 'room:', roomId, 'broadcast total:', messages.length);
          await env.WEBRTC_KV.put(broadcastKey, JSON.stringify(messages), { expirationTtl: 14400 });

          // Remove from presence so /room/participants and future polls stop reading their key
          const presence = await safeGetPresence(env.WEBRTC_KV, presenceKey);
          delete presence[sender];
          await env.WEBRTC_KV.put(presenceKey, JSON.stringify(presence), { expirationTtl: 14400 });

          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /room/leave failed:', e.message);
          throw e;
        }
      }

      // ── GET /config/sheet ─────────────────────────────────────────────────────
      if (url.pathname === '/config/sheet' && request.method === 'GET') {
        try {
          const sheetId = await env.WEBRTC_KV.get('config_sheet_id') || null;
          const vcRaw = await env.WEBRTC_KV.get('config_video_call_enabled');
          const videoCallEnabled = vcRaw !== 'false';
          return new Response(JSON.stringify({ sheetId, videoCallEnabled }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /config/sheet GET failed:', e.message);
          throw e;
        }
      }

      // ── POST /config/features ─────────────────────────────────────────────────
      // Teacher-only: flips the global videoCallEnabled flag.
      if (url.pathname === '/config/features' && request.method === 'POST') {
        const denied = requireTeacher(request, env, 'POST /config/features');
        if (denied) return denied;
        try {
          const { videoCallEnabled } = await request.json();
          await env.WEBRTC_KV.put('config_video_call_enabled', videoCallEnabled ? 'true' : 'false');
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /config/features POST failed:', e.message);
          throw e;
        }
      }

      // ── GET /admin/line-config ────────────────────────────────────────────────
      // Protected: requires X-Teacher-Token header matching TEACHER_SECRET env var.
      if (url.pathname === '/admin/line-config' && request.method === 'GET') {
        if (!isTeacherAuthed(request, env)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: getCorsHeaders(request) });
        }
        try {
          const raw = await env.WEBRTC_KV.get('line_config');
          if (!raw) return new Response(JSON.stringify({ lineToken: '', lineWorkerUrl: '' }), { headers: getCorsHeaders(request) });
          return new Response(raw, { headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' } });
        } catch (e) {
          console.error('[ERROR] /admin/line-config GET failed:', e.message);
          throw e;
        }
      }

      // ── POST /admin/line-config ───────────────────────────────────────────────
      // Body: { lineToken, lineWorkerUrl }
      // Saves LINE secrets to KV so they are never stored in the public Google Sheet.
      // Protected: requires X-Teacher-Token header.
      if (url.pathname === '/admin/line-config' && request.method === 'POST') {
        if (!isTeacherAuthed(request, env)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: getCorsHeaders(request) });
        }
        try {
          const { lineToken, lineWorkerUrl } = await request.json();
          await env.WEBRTC_KV.put('line_config', JSON.stringify({
            lineToken: lineToken || '',
            lineWorkerUrl: lineWorkerUrl || '',
          }));
          console.log('[ADMIN] line config updated');
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /admin/line-config POST failed:', e.message);
          throw e;
        }
      }

      // ── POST /config/sheet ────────────────────────────────────────────────────
      // Teacher-only: rebinding the global sheet ID redirects every student
      // portal, so an open endpoint would let anyone hijack the whole system.
      if (url.pathname === '/config/sheet' && request.method === 'POST') {
        const denied = requireTeacher(request, env, 'POST /config/sheet');
        if (denied) return denied;
        try {
          const { sheetId } = await request.json();
          if (!sheetId || typeof sheetId !== 'string' || sheetId.length < 20) {
            return new Response(JSON.stringify({ error: 'invalid sheetId' }), { status: 400, headers: getCorsHeaders(request) });
          }
          await env.WEBRTC_KV.put('config_sheet_id', sheetId);
          console.log('[CONFIG] sheet ID updated:', sheetId);
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /config/sheet POST failed:', e.message);
          throw e;
        }
      }

      // ── GET /proxy/sheet ──────────────────────────────────────────────────────
      // Proxies Google Sheets GViz CSV server-side so iOS Safari never makes a
      // cross-origin request to docs.google.com (which fails with "Load failed").
      // Only allows reading the four public-portal sheets — blocks settings and
      // any other sheet that may contain sensitive data (LINE tokens, etc.)
      if (url.pathname === '/proxy/sheet' && request.method === 'GET') {
        const sheetId = url.searchParams.get('sheetId') || '';
        const sheet   = url.searchParams.get('sheet')   || '';
        if (!sheetId || !sheet) {
          return new Response(JSON.stringify({ error: 'missing sheetId or sheet param' }), { status: 400, headers: getCorsHeaders(request) });
        }
        const ALLOWED_SHEETS = new Set(['students', 'sessions', 'schedules', 'groups']);
        if (!ALLOWED_SHEETS.has(sheet.toLowerCase())) {
          console.warn('[PROXY] blocked request for sheet:', sheet);
          return new Response(JSON.stringify({ error: 'sheet not publicly accessible' }), { status: 403, headers: getCorsHeaders(request) });
        }
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
        try {
          const upstream = await fetch(gvizUrl);
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: { ...getCorsHeaders(request), 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        } catch (e) {
          console.error('[ERROR] /proxy/sheet fetch failed:', e.message);
          return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: getCorsHeaders(request) });
        }
      }

      // ── POST /push/subscribe ──────────────────────────────────────────────
      if (url.pathname === '/push/subscribe' && request.method === 'POST') {
        try {
          const { studentId, subscription } = await request.json();
          if (!studentId || !subscription?.endpoint) {
            return new Response(JSON.stringify({ error: 'missing studentId or subscription' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const key = `push_sub_${studentId}`;
          const raw = await env.WEBRTC_KV.get(key);
          let subscriptions = [];
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              subscriptions = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              subscriptions = [];
            }
          }
          const exists = subscriptions.some((s) => s?.endpoint === subscription.endpoint);
          if (!exists) subscriptions.push(subscription);
          await env.WEBRTC_KV.put(key, JSON.stringify(subscriptions), { expirationTtl: 90 * 86400 });
          console.log('[PUSH] subscribed:', studentId);
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /push/subscribe failed:', e.message);
          throw e;
        }
      }

      // ── POST /push/unsubscribe ────────────────────────────────────────────
      if (url.pathname === '/push/unsubscribe' && request.method === 'POST') {
        try {
          const { studentId, endpoint } = await request.json();
          if (!studentId || !endpoint) {
            return new Response(JSON.stringify({ error: 'missing studentId or endpoint' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const key = `push_sub_${studentId}`;
          const raw = await env.WEBRTC_KV.get(key);
          if (!raw) return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
          let subscriptions;
          try {
            const parsed = JSON.parse(raw);
            subscriptions = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            subscriptions = [];
          }
          const updated = subscriptions.filter(s => s?.endpoint !== endpoint);
          if (updated.length > 0) {
            await env.WEBRTC_KV.put(key, JSON.stringify(updated), { expirationTtl: 90 * 86400 });
          } else {
            await env.WEBRTC_KV.delete(key);
          }
          console.log('[PUSH] unsubscribed:', studentId, 'remaining:', updated.length);
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /push/unsubscribe failed:', e.message);
          throw e;
        }
      }

      // ── POST /push/send ───────────────────────────────────────────────────
      // Body: { studentId, title, body }
      // Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK (secret), VAPID_SUBJECT vars
      if (url.pathname === '/push/send' && request.method === 'POST') {
        const denied = requireTeacher(request, env, 'POST /push/send');
        if (denied) return denied;
        try {
          const { studentId, title, body: msgBody } = await request.json();
          if (!studentId) return new Response(JSON.stringify({ error: 'missing studentId' }), { status: 400, headers: getCorsHeaders(request) });
          const raw = await env.WEBRTC_KV.get(`push_sub_${studentId}`);
          if (!raw) return new Response(JSON.stringify({ error: 'no subscription found' }), { status: 404, headers: getCorsHeaders(request) });
          let subscriptions;
          try {
            const parsed = JSON.parse(raw);
            subscriptions = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            subscriptions = [];
          }
          if (subscriptions.length === 0) return new Response(JSON.stringify({ error: 'no valid subscription found' }), { status: 404, headers: getCorsHeaders(request) });
          const payload = JSON.stringify({ title: title || 'SHIFTHIGHBURY', body: msgBody || '' });
          const vapid = {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKeyJwk: JSON.parse(env.VAPID_PRIVATE_JWK),
            subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
          };
          const alive = [];
          let delivered = 0;
          let lastErr = '';
          for (const subscription of subscriptions) {
            const resp = await sendWebPush(subscription, payload, vapid);
            if (resp.status === 410 || resp.status === 404) {
              continue;
            }
            if (resp.ok) {
              delivered += 1;
              alive.push(subscription);
              continue;
            }
            lastErr = await resp.text().catch(() => '');
            alive.push(subscription);
          }
          if (alive.length > 0) {
            await env.WEBRTC_KV.put(`push_sub_${studentId}`, JSON.stringify(alive), { expirationTtl: 90 * 86400 });
          } else {
            await env.WEBRTC_KV.delete(`push_sub_${studentId}`);
            console.log('[PUSH] all subscriptions expired, deleted:', studentId);
          }
          if (delivered === 0) {
            if (alive.length === 0) {
              return new Response(JSON.stringify({ error: 'subscription expired' }), { status: 410, headers: getCorsHeaders(request) });
            }
            console.error('[PUSH] send failed for all live subscriptions:', lastErr);
            return new Response(JSON.stringify({ error: 'push service error' }), { status: 502, headers: getCorsHeaders(request) });
          }
          console.log('[PUSH] sent to:', studentId);
          return new Response(JSON.stringify({ success: true, delivered }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /push/send failed:', e.message, e.stack);
          throw e;
        }
      }

      // ── POST /push-bill-image ─────────────────────────────────────────────────
      if (url.pathname === '/push-bill-image' && request.method === 'POST') {
        try {
          const lineToken = request.headers.get('X-Line-Token');
          if (!lineToken) {
            return new Response(JSON.stringify({ error: 'missing X-Line-Token' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const { to, imageDataUrl } = await request.json();
          if (!to || !imageDataUrl) {
            return new Response(JSON.stringify({ error: 'missing to or imageDataUrl' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const id = crypto.randomUUID().replace(/-/g, '');
          await env.WEBRTC_KV.put(`bill_img_${id}`, imageDataUrl, { expirationTtl: 1800 });
          const imageUrl = `${url.origin}/bill-image/${id}`;
          const lineResp = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${lineToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to,
              messages: [{ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl }],
            }),
          });
          if (!lineResp.ok) {
            const errText = await lineResp.text().catch(() => '');
            console.error('[PUSH-BILL-IMAGE] LINE error:', lineResp.status, errText);
            return new Response(JSON.stringify({ error: `LINE API error ${lineResp.status}`, detail: errText }), { status: 502, headers: getCorsHeaders(request) });
          }
          console.log('[PUSH-BILL-IMAGE] sent to:', to, 'id:', id);
          return new Response(JSON.stringify({ success: true, imageUrl }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /push-bill-image failed:', e.message);
          throw e;
        }
      }

      // ── GET /bill-image/:id ───────────────────────────────────────────────────
      if (url.pathname.startsWith('/bill-image/') && request.method === 'GET') {
        try {
          const id = url.pathname.slice('/bill-image/'.length);
          if (!id) return new Response('Not Found', { status: 404 });
          const dataUrl = await env.WEBRTC_KV.get(`bill_img_${id}`);
          if (!dataUrl) return new Response('Not Found', { status: 404 });
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new Response(bytes, {
            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=1800' },
          });
        } catch (e) {
          console.error('[ERROR] /bill-image GET failed:', e.message);
          throw e;
        }
      }

      // ── POST /class-code ──────────────────────────────────────────────────────
      // Teacher-only: overwriting an existing code would silently point student
      // portals at someone else's sheet.
      if (url.pathname === '/class-code' && request.method === 'POST') {
        const denied = requireTeacher(request, env, 'POST /class-code');
        if (denied) return denied;
        try {
          const { code, sheetId, videoCallEnabled } = await request.json();
          if (!code || !sheetId || code.length > 4) {
            return new Response(JSON.stringify({ error: 'invalid code or sheetId' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const upper = code.toUpperCase();
          await env.WEBRTC_KV.put(`class_code_${upper}`, sheetId);
          if (videoCallEnabled !== undefined) {
            await env.WEBRTC_KV.put(`class_code_vc_${upper}`, videoCallEnabled ? 'true' : 'false');
          }
          console.log('[CLASS-CODE] registered:', upper, '->', sheetId, 'vc:', videoCallEnabled);
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /class-code POST failed:', e.message);
          throw e;
        }
      }

      // ── GET /class-code/:code ──────────────────────────────────────────────────
      if (url.pathname.startsWith('/class-code/') && request.method === 'GET') {
        try {
          const code = decodeURIComponent(url.pathname.slice('/class-code/'.length)).toUpperCase();
          const sheetId = await env.WEBRTC_KV.get(`class_code_${code}`);
          if (!sheetId) {
            return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: getCorsHeaders(request) });
          }
          const vcRaw = await env.WEBRTC_KV.get(`class_code_vc_${code}`);
          const videoCallEnabled = vcRaw !== 'false';
          return new Response(JSON.stringify({ sheetId, videoCallEnabled }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /class-code GET failed:', e.message);
          throw e;
        }
      }

      // ── POST /booking ──────────────────────────────────────────────────────────
      if (url.pathname === '/booking' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { studentId, studentName, requestedDate, timeStart, timeEnd, subject, note } = body;
          if (!studentId || !requestedDate) {
            return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400, headers: getCorsHeaders(request) });
          }
          const bookings = await safeGetMessages(env.WEBRTC_KV, 'pending_bookings');
          const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
          bookings.push({ id, studentId, studentName: studentName || '', requestedDate, timeStart: timeStart || '', timeEnd: timeEnd || '', subject: subject || '', note: note || '', createdAt: Date.now() });
          await env.WEBRTC_KV.put('pending_bookings', JSON.stringify(bookings), { expirationTtl: 30 * 86400 });
          console.log('[BOOKING] new request:', studentId, requestedDate);
          return new Response(JSON.stringify({ success: true, id }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /booking POST failed:', e.message);
          throw e;
        }
      }

      // ── GET /bookings/pending ──────────────────────────────────────────────────
      // Teacher-only: the full list exposes every student's name and schedule.
      // Students read their own bookings via /booking/student/:id instead.
      if (url.pathname === '/bookings/pending' && request.method === 'GET') {
        const denied = requireTeacher(request, env, 'GET /bookings/pending');
        if (denied) return denied;
        try {
          const bookings = await safeGetMessages(env.WEBRTC_KV, 'pending_bookings');
          return new Response(JSON.stringify({ bookings }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /bookings/pending GET failed:', e.message);
          throw e;
        }
      }

      // ── DELETE /booking/:id ────────────────────────────────────────────────────
      // Teacher-only: only Calendar.jsx (approve/reject) deletes bookings.
      if (url.pathname.startsWith('/booking/') && !url.pathname.startsWith('/booking/student/') && request.method === 'DELETE') {
        const denied = requireTeacher(request, env, 'DELETE /booking/:id');
        if (denied) return denied;
        try {
          const id = url.pathname.slice('/booking/'.length);
          const bookings = await safeGetMessages(env.WEBRTC_KV, 'pending_bookings');
          const updated = bookings.filter(b => b.id !== id);
          await env.WEBRTC_KV.put('pending_bookings', JSON.stringify(updated), { expirationTtl: 30 * 86400 });
          console.log('[BOOKING] deleted:', id, 'remaining:', updated.length);
          return new Response(JSON.stringify({ success: true }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /booking DELETE failed:', e.message);
          throw e;
        }
      }

      // ── GET /booking/student/:studentId ───────────────────────────────────────
      if (url.pathname.startsWith('/booking/student/') && request.method === 'GET') {
        try {
          const studentId = decodeURIComponent(url.pathname.slice('/booking/student/'.length));
          const bookings = await safeGetMessages(env.WEBRTC_KV, 'pending_bookings');
          const myBookings = bookings.filter(b => b.studentId === studentId);
          return new Response(JSON.stringify({ bookings: myBookings }), { headers: getCorsHeaders(request) });
        } catch (e) {
          console.error('[ERROR] /booking/student GET failed:', e.message);
          throw e;
        }
      }

      return new Response('Not Found', { status: 404, headers: getCorsHeaders(request) });

    } catch (err) {
      console.error('[ERROR]', request.url, err.message, err.stack);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: getCorsHeaders(request) });
    }
  },

  // Cron trigger (see wrangler.jsonc "triggers") — sends "class starting soon"
  // LINE reminders so they no longer depend on the teacher's browser being open.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendClassReminders(env).catch(e => console.error('[REMINDER] failed:', e.message)));
  },
};
