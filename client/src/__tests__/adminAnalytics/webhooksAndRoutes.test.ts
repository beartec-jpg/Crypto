import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { signSvixForTest, verifySvixSignature } from '../../../../api/_lib/svix';
import { authEventFromClerk, insertAuthEvent } from '../../../../api/_lib/authEvents';
import { createHandler } from '../../../../api/admin/analytics';
import clerkWebhook from '../../../../api/clerk/webhook';

const SECRET = 'whsec_' + Buffer.from('test-secret-0123456789').toString('base64');

function mockRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  return res;
}

describe('svix verification', () => {
  const body = '{"type":"user.created"}';
  const ts = '1790000000';
  it('accepts a valid signature among several', () => {
    const sig = signSvixForTest(SECRET, 'msg_1', ts, body);
    expect(verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signatureHeader: `v1,AAAA ${sig}`, body, nowSeconds: 1790000010 })).toBe(true);
  });
  it('rejects tampered body, wrong id, stale timestamp and missing headers', () => {
    const sig = signSvixForTest(SECRET, 'msg_1', ts, body);
    const base = { secret: SECRET, id: 'msg_1', timestamp: ts, signatureHeader: sig, body, nowSeconds: 1790000010 };
    expect(verifySvixSignature({ ...base, body: body + ' ' })).toBe(false);
    expect(verifySvixSignature({ ...base, id: 'msg_2' })).toBe(false);
    expect(verifySvixSignature({ ...base, nowSeconds: 1790000000 + 3600 })).toBe(false);
    expect(verifySvixSignature({ ...base, signatureHeader: undefined })).toBe(false);
  });
});

describe('Clerk auth events', () => {
  it('maps tracked events without storing email', () => {
    const row = authEventFromClerk('msg_1', { type: 'user.created', timestamp: 1790000000000, data: { id: 'user_1', email_addresses: [{ email_address: 'a@b.c' }] } })!;
    expect(row).toMatchObject({ type: 'user.created', userId: 'user_1', sessionId: null });
    expect(JSON.stringify(row.raw)).not.toContain('a@b.c');
    expect(authEventFromClerk('msg_2', { type: 'session.created', data: { id: 'sess_1', user_id: 'user_1' } })!)
      .toMatchObject({ userId: 'user_1', sessionId: 'sess_1' });
    expect(authEventFromClerk('msg_3', { type: 'email.created', data: {} })).toBeNull();
  });
  it('replaying the same svix id creates one row', async () => {
    const ids = new Set<string>();
    const db = { query: async (_t: string, p: any[] = []) => {
      if (ids.has(p[0])) return { rows: [], rowCount: 0 };
      ids.add(p[0]); return { rows: [], rowCount: 1 };
    } };
    const row = authEventFromClerk('msg_1', { type: 'user.created', data: { id: 'u' } })!;
    expect(await insertAuthEvent(db, row)).toBe(true);
    expect(await insertAuthEvent(db, row)).toBe(false);
    expect(ids.size).toBe(1);
  });
  it('webhook handler refuses unsigned or unconfigured calls', async () => {
    const mkReq = (headers: Record<string, string>) => Object.assign(Readable.from([Buffer.from('{}')]), { method: 'POST', headers }) as any;
    const prev = process.env.CLERK_WEBHOOK_SECRET;
    delete process.env.CLERK_WEBHOOK_SECRET;
    let res = mockRes();
    await clerkWebhook(mkReq({}), res);
    expect(res.statusCode).toBe(503);
    process.env.CLERK_WEBHOOK_SECRET = SECRET;
    res = mockRes();
    await clerkWebhook(mkReq({ 'svix-id': 'm', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,bad' }), res);
    expect(res.statusCode).toBe(400);
    if (prev === undefined) delete process.env.CLERK_WEBHOOK_SECRET; else process.env.CLERK_WEBHOOK_SECRET = prev;
  });
});

describe('/api/admin/analytics/*', () => {
  const views = ['summary', 'timeseries', 'tiers', 'ai-cost'];
  it('returns 403 for non-admins on every view and never touches the DB', async () => {
    const pool = vi.fn();
    const handler = createHandler(async () => false, pool as any);
    for (const view of views) {
      const res = mockRes();
      await handler({ method: 'GET', query: { view, metric: 'mrr' }, headers: {} } as any, res);
      expect(res.statusCode).toBe(403);
    }
    expect(pool).not.toHaveBeenCalled();
  });
  it('rejects non-GET, bad metric and unknown view for admins', async () => {
    const db = { query: async () => ({ rows: [] }) };
    const handler = createHandler(async () => true, () => db);
    let res = mockRes();
    await handler({ method: 'POST', query: {}, headers: {} } as any, res);
    expect(res.statusCode).toBe(405);
    res = mockRes();
    await handler({ method: 'GET', query: { view: 'timeseries', metric: 'nope' }, headers: {} } as any, res);
    expect(res.statusCode).toBe(400);
    res = mockRes();
    await handler({ method: 'GET', query: { view: 'secrets' }, headers: {} } as any, res);
    expect(res.statusCode).toBe(404);
  });
  it('returns the summary shape in GBP pence for admins', async () => {
    const db = { query: async (sql: string) => {
      if (sql.includes("type IN ('trial_started'")) return { rows: [{ type: 'trial_started', c: 10 }, { type: 'trial_converted', c: 4 }, { type: 'first_payment', c: 3 }] };
      if (sql.includes('FILTER (WHERE mrr_pence > 0) AS paid')) return { rows: [{ paid: 20, mrr: 58000 }] };
      if (sql.includes('SELECT COUNT(*) AS c FROM (') && sql.includes('WHERE mrr_pence > 0')) return { rows: [{ c: 20 }] };
      if (sql.includes("type = 'subscription_canceled'")) return { rows: [{ c: 1 }] };
      if (sql.includes('mrr_pence - mrr_delta_pence AS prev')) return { rows: [{ prev: 0, next: 2900 }, { prev: 2900, next: 0 }] };
      if (sql.includes('AS dau')) return { rows: [{ dau: 5, wau: 12, mau: 40 }] };
      if (sql.includes('SUM(estimated_cost)')) return { rows: [{ usd: 10 }] };
      return { rows: [{ c: 7 }] };
    } };
    const handler = createHandler(async () => true, () => db);
    const res = mockRes();
    await handler({ method: 'GET', query: { view: 'summary', from: '2026-10-04', to: '2026-11-03' }, headers: {} } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body).toMatchObject({
      currency: 'gbp', signups: 7, trialStarts: 10, trialToPaidPct: 40, paidConversions: 7,
      mrrPence: 58000, arrPence: 696000, activePaid: 20, churnPct: 5,
      netMrrMovement: { new: 2900, expansion: 0, contraction: 0, churn: -2900 }, dau: 5, wau: 12, mau: 40,
    });
  });
  it('hides DB error details', async () => {
    const handler = createHandler(async () => true, () => ({ query: async () => { throw new Error('password=hunter2'); } }));
    const res = mockRes();
    await handler({ method: 'GET', query: { view: 'tiers' }, headers: {} } as any, res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
