// Web Push encryption + VAPID for Cloudflare Workers
// RFC 8291 (aes128gcm message encryption) + RFC 8292 (VAPID auth)

const enc = new TextEncoder();

function b64u(bytes) {
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fb64u(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function concat(...arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// HKDF-Extract(salt, IKM) = HMAC-Hash(salt, IKM)
const hkdfExtract = (salt, ikm) => hmac(salt, ikm);

// HKDF-Expand for len ≤ 32 bytes: T(1) = HMAC-Hash(PRK, info || 0x01)
async function hkdfExpand(prk, info, len) {
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len);
}

// Encrypt a push payload per RFC 8291 §3.3 (aes128gcm)
export async function encryptPayload(subscription, payload) {
  const authSecret = fb64u(subscription.keys.auth);
  const uaPublicKey = fb64u(subscription.keys.p256dh);

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const asKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', asKP.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKP.privateKey, 256),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK_key = HKDF-Extract(auth_secret, ECDH(as, ua))
  const prkKey = await hkdfExtract(authSecret, sharedSecret);
  // IKM = HKDF-Expand(PRK_key, "WebPush: info\0" || ua_pub || as_pub, 32)
  const ikm = await hkdfExpand(prkKey, concat(enc.encode('WebPush: info\x00'), uaPublicKey, asPublicKey), 32);
  // PRK = HKDF-Extract(salt, IKM)
  const prk = await hkdfExtract(salt, ikm);

  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16);
  const iv  = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12);

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Plaintext: payload bytes + 0x02 delimiter (last-record, no padding)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cekKey,
      concat(enc.encode(payload), new Uint8Array([2])),
    ),
  );

  // RFC 8188 header: salt(16) + rs(4 uint32be) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([asPublicKey.length]), asPublicKey, ciphertext);
}

// Create a VAPID JWT (ES256) signed with the application server private key
export async function createVapidJWT(endpoint, subject, privateKeyJwk) {
  const audience = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const hdr  = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const sigInput = `${hdr}.${body}`;
  const privKey = await crypto.subtle.importKey(
    'jwk', privateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, enc.encode(sigInput)),
  );
  return `${sigInput}.${b64u(sig)}`;
}

// Send a Web Push notification to a subscriber
export async function sendWebPush(subscription, payload, vapid) {
  const { publicKey, privateKeyJwk, subject } = vapid;
  const [body, jwt] = await Promise.all([
    encryptPayload(subscription, payload),
    createVapidJWT(subscription.endpoint, subject, privateKeyJwk),
  ]);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body,
  });
}
