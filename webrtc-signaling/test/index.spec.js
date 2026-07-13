import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src';

async function call(method, path, body) {
  const url = `http://example.com${path}`;
  const req = body
    ? new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    : new Request(url, { method });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function json(method, path, body) {
  const res = await call(method, path, body);
  return { status: res.status, data: await res.json() };
}

async function get(path) { return json('GET', path); }
async function post(path, body) { return json('POST', path, body); }

describe('signaling worker', () => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  it('handles OPTIONS preflight', async () => {
    const res = await call('OPTIONS', '/room/signal');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await call('GET', '/unknown');
    expect(res.status).toBe(404);
  });

  // ── POST /room/signal ───────────────────────────────────────────────────────
  it('stores a signal and returns success', async () => {
    const { status, data } = await post('/room/signal', {
      roomId: 'r1', sender: 'teacher', target: 'student1',
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('rejects invalid JSON body', async () => {
    const req = new Request('http://example.com/room/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it('stores batch ICE candidates', async () => {
    const { status, data } = await post('/room/signal', {
      roomId: 'r-batch', sender: 'teacher', target: 'student1',
      signal: { type: 'candidates', items: [{ type: 'candidate', candidate: 'a' }, { type: 'candidate', candidate: 'b' }] },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  // ── GET /room/poll ──────────────────────────────────────────────────────────
  it('returns empty messages for an empty room', async () => {
    const { data } = await get('/room/poll?roomId=empty&lastTimestamp=0&participantId=teacher');
    expect(data.messages).toEqual([]);
  });

  it('poll filters out own signals', async () => {
    const roomId = 'r-filter-own';
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: '' } });
    // Teacher polling — should NOT see their own offer
    const { data } = await get(`/room/poll?roomId=${roomId}&lastTimestamp=0&participantId=teacher`);
    expect(data.messages.length).toBe(0);
  });

  it('poll filters by target — student only sees messages addressed to them', async () => {
    const roomId = 'r-target';
    const before = Date.now() - 1;
    // teacher → student1
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: 'for-s1' } });
    // teacher → student2
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student2', signal: { type: 'offer', sdp: 'for-s2' } });

    const s1 = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=student1`);
    const s2 = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=student2`);

    expect(s1.data.messages.length).toBe(1);
    expect(s1.data.messages[0].signal.sdp).toBe('for-s1');
    expect(s2.data.messages.length).toBe(1);
    expect(s2.data.messages[0].signal.sdp).toBe('for-s2');
  });

  it('poll delivers broadcast messages to all participants', async () => {
    const roomId = 'r-broadcast';
    const before = Date.now() - 1;
    await post('/room/signal', { roomId, sender: 'teacher', target: 'broadcast', signal: { type: 'sync-time' } });

    const s1 = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=student1`);
    const s2 = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=student2`);

    expect(s1.data.messages.length).toBe(1);
    expect(s2.data.messages.length).toBe(1);
    expect(s1.data.messages[0].signal.type).toBe('sync-time');
  });

  it('poll respects lastTimestamp — only returns newer messages', async () => {
    const roomId = 'r-ts';
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: '' } });
    const { data: first } = await get(`/room/poll?roomId=${roomId}&lastTimestamp=0&participantId=student1`);
    expect(first.messages.length).toBe(1);

    const latest = first.messages[first.messages.length - 1].timestamp;
    const { data: second } = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${latest}&participantId=student1`);
    expect(second.messages.length).toBe(0);
  });

  // ── GET /room/participants ──────────────────────────────────────────────────
  it('returns empty participants for unknown room', async () => {
    const { data } = await get('/room/participants?roomId=nobody');
    expect(data.participants).toEqual([]);
  });

  it('returns participants who signaled recently', async () => {
    const roomId = 'r-presence';
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: '' } });
    await post('/room/signal', { roomId, sender: 'student1', target: 'teacher', signal: { type: 'answer', sdp: '' } });

    const { data } = await get(`/room/participants?roomId=${roomId}`);
    expect(data.participants).toContain('teacher');
    expect(data.participants).toContain('student1');
  });

  it('returns 400 when roomId is missing from /room/participants', async () => {
    const { status } = await get('/room/participants');
    expect(status).toBe(400);
  });

  // ── POST /room/leave ────────────────────────────────────────────────────────
  it('appends a broadcast leave signal and removes from presence', async () => {
    const roomId = 'r-leave';
    const before = Date.now() - 1;
    // Two participants join
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: '' } });
    await post('/room/signal', { roomId, sender: 'student1', target: 'teacher', signal: { type: 'answer', sdp: '' } });

    // student1 leaves
    const { data: leaveRes } = await post('/room/leave', { roomId, sender: 'student1' });
    expect(leaveRes.success).toBe(true);

    // Teacher should see the leave signal
    const { data: poll } = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=teacher`);
    const leaveMsg = poll.messages.find(m => m.signal.type === 'leave');
    expect(leaveMsg).toBeTruthy();
    expect(leaveMsg.sender).toBe('student1');
    expect(leaveMsg.signal.sender).toBe('student1');

    // student1 should no longer be in participants
    const { data: presence } = await get(`/room/participants?roomId=${roomId}`);
    expect(presence.participants).not.toContain('student1');
    expect(presence.participants).toContain('teacher');
  });

  it('leave does not clear room — teacher signals remain visible after student leaves', async () => {
    const roomId = 'r-leave-persist';
    const before = Date.now() - 1;
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: 'original' } });
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student2', signal: { type: 'offer', sdp: 's2-offer' } });
    await post('/room/leave', { roomId, sender: 'student1' });

    // student2 should still see their offer from teacher
    const { data } = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=student2`);
    const offer = data.messages.find(m => m.signal.sdp === 's2-offer');
    expect(offer).toBeTruthy();
  });

  // ── Mesh: 3-student scenario ────────────────────────────────────────────────
  it('mesh — student2 gets offers from teacher and student1, not from itself', async () => {
    const roomId = 'r-mesh';
    const before = Date.now() - 1;

    await post('/room/signal', { roomId, sender: 'teacher', target: 'student2', signal: { type: 'offer', sdp: 'teacher-s2' } });
    await post('/room/signal', { roomId, sender: 'student1', target: 'student2', signal: { type: 'offer', sdp: 's1-s2' } });
    await post('/room/signal', { roomId, sender: 'student2', target: 'student1', signal: { type: 'answer', sdp: 's2-s1' } });
    await post('/room/signal', { roomId, sender: 'teacher', target: 'student1', signal: { type: 'offer', sdp: 'teacher-s1' } });

    const { data } = await get(`/room/poll?roomId=${roomId}&lastTimestamp=${before}&participantId=student2`);

    const sdps = data.messages.map(m => m.signal.sdp);
    expect(sdps).toContain('teacher-s2');
    expect(sdps).toContain('s1-s2');
    expect(sdps).not.toContain('s2-s1');    // student2's own signal
    expect(sdps).not.toContain('teacher-s1'); // addressed to student1, not student2
  });
});
