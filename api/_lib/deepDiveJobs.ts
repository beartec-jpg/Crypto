/**
 * Shared deep-dive jobs: one in-flight AI run per (symbol, HTF, LTF, mode incl. horizon),
 * joined by any number of users via crypto_ai_deep_job_waiters. Each waiter is charged
 * at most once (charged flag flipped with a guarded UPDATE).
 */
export type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export const DEEP_DIVE_JOB_EXPIRY_SECONDS = 320;
export const DEEP_DIVE_DEDUPE_WINDOW_SECONDS = 360;
export const DEEP_DIVE_TIMED_OUT_MESSAGE = 'Deep-dive timed out';

export type DeepDiveJobKey = { symbol: string; higherTimeframe: string; lowerTimeframe: string; mode: string };

export async function expireStaleJobsForKey(db: Queryable, key: DeepDiveJobKey): Promise<void> {
  await db.query(
    `UPDATE crypto_ai_deep_jobs
     SET status = 'error', error = $5, updated_at = NOW()
     WHERE symbol = $1 AND higher_timeframe = $2 AND lower_timeframe = $3 AND mode = $4
       AND status IN ('pending', 'running')
       AND created_at < NOW() - interval '${DEEP_DIVE_JOB_EXPIRY_SECONDS} seconds'`,
    [key.symbol, key.higherTimeframe, key.lowerTimeframe, key.mode, DEEP_DIVE_TIMED_OUT_MESSAGE],
  );
}

export async function expireStaleJobById(db: Queryable, jobId: string): Promise<void> {
  await db.query(
    `UPDATE crypto_ai_deep_jobs
     SET status = 'error', error = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'running')
       AND created_at < NOW() - interval '${DEEP_DIVE_JOB_EXPIRY_SECONDS} seconds'`,
    [jobId, DEEP_DIVE_TIMED_OUT_MESSAGE],
  );
}

export async function findActiveJob(db: Queryable, key: DeepDiveJobKey): Promise<{ id: string; status: string } | null> {
  const r = await db.query(
    `SELECT id, status FROM crypto_ai_deep_jobs
     WHERE symbol = $1 AND higher_timeframe = $2 AND lower_timeframe = $3 AND mode = $4
       AND status IN ('pending', 'running')
       AND created_at >= NOW() - interval '${DEEP_DIVE_DEDUPE_WINDOW_SECONDS} seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [key.symbol, key.higherTimeframe, key.lowerTimeframe, key.mode],
  );
  const row = r.rows[0];
  return row ? { id: String(row.id), status: String(row.status) } : null;
}

export async function addWaiter(db: Queryable, jobId: string, userId: string, exempt: boolean): Promise<void> {
  await db.query(
    `INSERT INTO crypto_ai_deep_job_waiters (job_id, user_id, exempt)
     VALUES ($1, $2, $3) ON CONFLICT (job_id, user_id) DO NOTHING`,
    [jobId, userId, exempt],
  );
}

export type StartOrJoinResult = { jobId: string; status: string; created: boolean };

/** Expire stale, join an active job for the key, or create one. Never creates a second active job. */
export async function startOrJoinDeepDiveJob(
  db: Queryable,
  key: DeepDiveJobKey,
  userId: string,
  exempt: boolean,
): Promise<StartOrJoinResult> {
  await expireStaleJobsForKey(db, key);
  const existing = await findActiveJob(db, key);
  if (existing) {
    await addWaiter(db, existing.id, userId, exempt);
    return { jobId: existing.id, status: existing.status, created: false };
  }
  const inserted = await db.query(
    `INSERT INTO crypto_ai_deep_jobs (user_id, symbol, higher_timeframe, lower_timeframe, mode, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [userId, key.symbol, key.higherTimeframe, key.lowerTimeframe, key.mode],
  );
  if (inserted.rows.length > 0) {
    const jobId = String(inserted.rows[0].id);
    await addWaiter(db, jobId, userId, exempt);
    return { jobId, status: 'pending', created: true };
  }
  // Lost the race to a concurrent POST: join its job.
  const raced = await findActiveJob(db, key);
  if (!raced) throw new Error('Could not start deep-dive job');
  await addWaiter(db, raced.id, userId, exempt);
  return { jobId: raced.id, status: raced.status, created: false };
}

/** Flip one waiter to charged; consume a token only if this call did the flip. Idempotent. */
export async function chargeWaiter(db: Queryable, jobId: string, userId: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE crypto_ai_deep_job_waiters SET charged = true
     WHERE job_id = $1 AND user_id = $2 AND charged = false
     RETURNING exempt`,
    [jobId, userId],
  );
  if (r.rowCount !== 1) return false;
  if (!r.rows[0]?.exempt) {
    await db.query(
      'UPDATE crypto_subscriptions SET ai_credits = ai_credits + 1, updated_at = NOW() WHERE user_id = $1',
      [userId],
    );
  }
  return true;
}

export async function chargeAllWaiters(db: Queryable, jobId: string): Promise<number> {
  const w = await db.query(
    'SELECT user_id FROM crypto_ai_deep_job_waiters WHERE job_id = $1 AND charged = false',
    [jobId],
  );
  let charged = 0;
  for (const row of w.rows) {
    if (await chargeWaiter(db, jobId, String(row.user_id))) charged += 1;
  }
  return charged;
}

/** Done transition: only the running→done flip may trigger charging. */
export async function markJobDone(db: Queryable, jobId: string, result: unknown): Promise<boolean> {
  const r = await db.query(
    `UPDATE crypto_ai_deep_jobs
     SET status = 'done', result = $2::jsonb, error = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'running'`,
    [jobId, JSON.stringify(result)],
  );
  return r.rowCount === 1;
}

export async function markJobError(db: Queryable, jobId: string, message: string): Promise<void> {
  await db.query(
    `UPDATE crypto_ai_deep_jobs SET status = 'error', error = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'running')`,
    [jobId, message],
  );
}

export type JobStatusBody = { status: string; result?: unknown; error?: string };

/** GET logic: expire if stale, authorise by waiter, charge caller on done. null => 404. */
export async function readJobForWaiter(db: Queryable, jobId: string, userId: string): Promise<JobStatusBody | null> {
  await expireStaleJobById(db, jobId);
  const r = await db.query(
    `SELECT j.status, j.result, j.error
     FROM crypto_ai_deep_jobs j
     JOIN crypto_ai_deep_job_waiters w ON w.job_id = j.id AND w.user_id = $2
     WHERE j.id = $1 LIMIT 1`,
    [jobId, userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const body: JobStatusBody = { status: String(row.status) };
  if (row.status === 'done') {
    await chargeWaiter(db, jobId, userId);
    if (row.result != null) body.result = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
  } else if (row.status === 'error') {
    body.error = row.error || 'Deep-dive failed';
  }
  return body;
}
