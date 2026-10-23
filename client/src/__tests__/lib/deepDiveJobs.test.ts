import { describe, expect, it } from 'vitest';
import {
  chargeAllWaiters,
  chargeWaiter,
  serveRecentDoneJob,
  markJobDone,
  completeDeepDiveJob,
  DEEP_DIVE_FAILED_MESSAGE,
  readJobForWaiter,
  startOrJoinDeepDiveJob,
  type Queryable,
} from '../../../../api/_lib/deepDiveJobs';

/** Minimal in-memory model of the two tables, matched on SQL shape. */
function fakeDb() {
  type Job = { id: string; key: string; status: string; result?: unknown; error?: string; old?: boolean };
  const jobs: Job[] = [];
  const waiters: { job_id: string; user_id: string; charged: boolean; exempt: boolean }[] = [];
  const charges: string[] = [];
  const inserts: string[] = [];
  let n = 0;
  const k = (p: unknown[]) => p.slice(0, 4).join('|');
  const db: Queryable = {
    async query(sql: string, p: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ');
      if (s.startsWith("UPDATE crypto_ai_deep_jobs SET status = 'error'") && s.includes('interval')) {
        let c = 0;
        for (const j of jobs) {
          const hit = s.includes('WHERE id =') ? j.id === p[0] : j.key === k(p);
          if (hit && j.old && ['pending', 'running'].includes(j.status)) { j.status = 'error'; j.error = 'Deep-dive timed out'; c++; }
        }
        return { rows: [], rowCount: c };
      }
      if (s.startsWith('SELECT id, status FROM crypto_ai_deep_jobs')) {
        const j = jobs.find((x) => x.key === k(p) && ['pending', 'running'].includes(x.status));
        return { rows: j ? [{ id: j.id, status: j.status }] : [], rowCount: j ? 1 : 0 };
      }
      if (s.startsWith('INSERT INTO crypto_ai_deep_jobs')) {
        const key = (p as string[]).slice(1, 5).join('|');
        if (jobs.some((x) => x.key === key && ['pending', 'running'].includes(x.status))) return { rows: [], rowCount: 0 };
        const id = `job-${++n}`;
        jobs.push({ id, key, status: 'pending' });
        inserts.push(id);
        return { rows: [{ id }], rowCount: 1 };
      }
      if (s.startsWith('INSERT INTO crypto_ai_deep_job_waiters')) {
        if (waiters.some((w) => w.job_id === p[0] && w.user_id === p[1])) return { rows: [], rowCount: 0 };
        waiters.push({ job_id: p[0] as string, user_id: p[1] as string, charged: false, exempt: Boolean(p[2]) });
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('WITH w AS ( UPDATE crypto_ai_deep_job_waiters SET charged = true')) {
        const w = waiters.find((x) => x.job_id === p[0] && x.user_id === p[1] && !x.charged);
        if (!w) return { rows: [{ flipped: 0 }], rowCount: 1 };
        w.charged = true;
        if (!w.exempt) charges.push(w.user_id);
        return { rows: [{ flipped: 1 }], rowCount: 1 };
      }
      if (s.startsWith('SELECT id, result FROM crypto_ai_deep_jobs')) {
        const j = [...jobs].reverse().find((x) => x.key === k(p) && x.status === 'done' && x.result != null && !x.old);
        return { rows: j ? [{ id: j.id, result: j.result }] : [], rowCount: j ? 1 : 0 };
      }
      if (s.startsWith('SELECT user_id FROM crypto_ai_deep_job_waiters')) {
        return { rows: waiters.filter((w) => w.job_id === p[0] && !w.charged), rowCount: null };
      }
      if (s.startsWith("UPDATE crypto_ai_deep_jobs SET status = 'done'")) {
        const j = jobs.find((x) => x.id === p[0] && x.status === 'running');
        if (!j) return { rows: [], rowCount: 0 };
        j.status = 'done'; j.result = JSON.parse(p[1] as string);
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith("UPDATE crypto_ai_deep_jobs SET status = 'running'")) {
        const j = jobs.find((x) => x.id === p[0] && ['pending', 'running'].includes(x.status));
        if (j) j.status = 'running';
        return { rows: [], rowCount: j ? 1 : 0 };
      }
      if (s.startsWith("UPDATE crypto_ai_deep_jobs SET status = 'error', error = $2")) {
        const j = jobs.find((x) => x.id === p[0] && ['pending', 'running'].includes(x.status));
        if (j) { j.status = 'error'; j.error = p[1] as string; }
        return { rows: [], rowCount: j ? 1 : 0 };
      }
      if (s.startsWith('SELECT j.status')) {
        const j = jobs.find((x) => x.id === p[0]);
        const ok = j && waiters.some((w) => w.job_id === p[0] && w.user_id === p[1]);
        return { rows: ok ? [{ status: j!.status, result: j!.result, error: j!.error }] : [], rowCount: ok ? 1 : 0 };
      }
      throw new Error(`unexpected SQL: ${s}`);
    },
  };
  return { db, jobs, waiters, charges, inserts };
}

const key = { symbol: 'BTCUSDT', higherTimeframe: '1d', lowerTimeframe: '15m', mode: 'smc:intraday' };

describe('shared deep-dive jobs', () => {
  it('second POST by the same user while pending joins the same job, no new insert, no charge', async () => {
    const f = fakeDb();
    const a = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    const b = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ jobId: a.jobId, created: false });
    expect(f.inserts).toHaveLength(1);
    expect(f.waiters).toHaveLength(1);
    expect(f.charges).toHaveLength(0);
  });

  it('retry after a lost 202 (job already running) returns the same job', async () => {
    const f = fakeDb();
    const a = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    f.jobs[0].status = 'running';
    const b = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    expect(b).toMatchObject({ jobId: a.jobId, status: 'running', created: false });
  });

  it('a different user joins the shared job as a waiter; horizon is part of the key', async () => {
    const f = fakeDb();
    const a = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    const b = await startOrJoinDeepDiveJob(f.db, key, 'u2', false);
    expect(b.jobId).toBe(a.jobId);
    expect(f.waiters.map((w) => w.user_id)).toEqual(['u1', 'u2']);
    const c = await startOrJoinDeepDiveJob(f.db, { ...key, mode: 'smc:swing' }, 'u1', false);
    expect(c.jobId).not.toBe(a.jobId);
  });

  it('expired jobs are not joined', async () => {
    const f = fakeDb();
    const a = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    f.jobs[0].old = true;
    const b = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    expect(f.jobs[0].status).toBe('error');
    expect(b.created).toBe(true);
    expect(b.jobId).not.toBe(a.jobId);
  });

  it('done transition charges each waiter exactly once; admins exempt', async () => {
    const f = fakeDb();
    const { jobId } = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    await startOrJoinDeepDiveJob(f.db, key, 'u2', false);
    await startOrJoinDeepDiveJob(f.db, key, 'admin', true);
    expect(await markJobDone(f.db, jobId, { ok: 1 })).toBe(false); // still pending
    f.jobs[0].status = 'running';
    expect(await markJobDone(f.db, jobId, { ok: 1 })).toBe(true);
    expect(await markJobDone(f.db, jobId, { ok: 1 })).toBe(false);
    await chargeAllWaiters(f.db, jobId);
    await chargeAllWaiters(f.db, jobId);
    expect(await chargeWaiter(f.db, jobId, 'u1')).toBe(false);
    expect(f.charges.sort()).toEqual(['u1', 'u2']);
  });

  it('GET: 404 for non-waiters, charges caller once on done, expires stale jobs', async () => {
    const f = fakeDb();
    const { jobId } = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
    expect(await readJobForWaiter(f.db, jobId, 'intruder')).toBeNull();
    f.jobs[0].status = 'running';
    await markJobDone(f.db, jobId, { bestTrades: [] });
    const r1 = await readJobForWaiter(f.db, jobId, 'u1');
    const r2 = await readJobForWaiter(f.db, jobId, 'u1');
    expect(r1).toEqual({ status: 'done', result: { bestTrades: [] } });
    expect(r2?.status).toBe('done');
    expect(f.charges).toEqual(['u1']);

    const g = fakeDb();
    const s = await startOrJoinDeepDiveJob(g.db, key, 'u1', false);
    g.jobs[0].old = true;
    expect(await readJobForWaiter(g.db, s.jobId, 'u1')).toEqual({ status: 'error', error: 'Deep-dive timed out' });
  });

  describe('recent done job (lost 202 / done-but-not-cached window)', () => {
    async function doneJob() {
      const f = fakeDb();
      const { jobId } = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
      f.jobs[0].status = 'running';
      await markJobDone(f.db, jobId, { bestTrades: ['t'] });
      await chargeAllWaiters(f.db, jobId);
      return { f, jobId };
    }

    it('an already-charged waiter re-POSTing gets the result with no second charge', async () => {
      const { f, jobId } = await doneJob();
      const r = await serveRecentDoneJob(f.db, key, 'u1', false, 900);
      expect(r).toEqual({ jobId, result: { bestTrades: ['t'] }, charged: false });
      expect(f.charges).toEqual(['u1']);
    });

    it('done-but-not-cached window serves the done job and starts no new job', async () => {
      const { f } = await doneJob();
      const r = await serveRecentDoneJob(f.db, key, 'u1', false, 900);
      expect(r).not.toBeNull();
      expect(f.inserts).toHaveLength(1);
    });

    it('a different user on the done job is charged exactly once', async () => {
      const { f, jobId } = await doneJob();
      const a = await serveRecentDoneJob(f.db, key, 'u2', false, 900);
      const b = await serveRecentDoneJob(f.db, key, 'u2', false, 900);
      expect(a?.charged).toBe(true);
      expect(b?.charged).toBe(false);
      expect(await chargeWaiter(f.db, jobId, 'u2')).toBe(false);
      expect(f.charges).toEqual(['u1', 'u2']);
    });

    it('returns null when no fresh done job exists', async () => {
      const { f } = await doneJob();
      f.jobs[0].old = true;
      expect(await serveRecentDoneJob(f.db, key, 'u2', false, 900)).toBeNull();
    });
  });

  describe('completeDeepDiveJob (no fallback model)', () => {
    const quiet = { warn: () => {}, error: () => {} };
    async function twoWaiters() {
      const f = fakeDb();
      const { jobId } = await startOrJoinDeepDiveJob(f.db, key, 'u1', false);
      await startOrJoinDeepDiveJob(f.db, key, 'u2', false);
      return { f, jobId };
    }

    for (const [label, failure] of [
      ['model error / timeout', new Error('Request was aborted.')],
      ['invalid JSON', new Error('invalid model JSON: Unexpected token')],
    ] as const) {
      it(`${label}: job is error with the user message, nobody charged, nothing cached`, async () => {
        const { f, jobId } = await twoWaiters();
        let cached = 0;
        const outcome = await completeDeepDiveJob(f.db, jobId, async () => { throw failure; }, () => true, quiet);
        expect(outcome).toBe('error');
        expect(f.jobs[0]).toMatchObject({ status: 'error', error: DEEP_DIVE_FAILED_MESSAGE });
        expect(f.waiters.every((w) => !w.charged)).toBe(true);
        expect(f.charges).toEqual([]);
        expect(cached).toBe(0);
        // Polling waiters see the message and are still not charged; no done result to serve from cache.
        expect(await readJobForWaiter(f.db, jobId, 'u1')).toEqual({ status: 'error', error: DEEP_DIVE_FAILED_MESSAGE });
        expect(await readJobForWaiter(f.db, jobId, 'u2')).toEqual({ status: 'error', error: DEEP_DIVE_FAILED_MESSAGE });
        expect(f.charges).toEqual([]);
        expect(await serveRecentDoneJob(f.db, key, 'u3', false, 900)).toBeNull();
      });
    }

    it('success: done, each waiter charged once, cache written once', async () => {
      const { f, jobId } = await twoWaiters();
      let cached = 0;
      const outcome = await completeDeepDiveJob(
        f.db, jobId,
        async () => ({ body: { bestTrades: [] }, writeDeepCache: async () => { cached += 1; } }),
        () => true, quiet,
      );
      expect(outcome).toBe('done');
      expect(f.jobs[0].status).toBe('done');
      expect(f.charges.sort()).toEqual(['u1', 'u2']);
      expect(cached).toBe(1);
    });

    it('job expired mid-run: no charge, no cache', async () => {
      const { f, jobId } = await twoWaiters();
      let cached = 0;
      const outcome = await completeDeepDiveJob(
        f.db, jobId,
        async () => { f.jobs[0].status = 'error'; return { body: {}, writeDeepCache: async () => { cached += 1; } }; },
        () => true, quiet,
      );
      expect(outcome).toBe('expired');
      expect(f.charges).toEqual([]);
      expect(cached).toBe(0);
    });
  });
});
