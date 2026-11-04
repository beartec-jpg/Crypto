import type { Queryable } from './billingEvents.js';

export const TRACKED_CLERK_EVENTS = new Set(['user.created', 'session.created', 'user.deleted']);

export interface AuthEventRow {
  svixId: string;
  type: string;
  userId: string | null;
  sessionId: string | null;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

/** Map a Clerk webhook payload to an auth_events row (no email or names kept). */
export function authEventFromClerk(svixId: string, payload: any): AuthEventRow | null {
  if (!svixId || !payload || !TRACKED_CLERK_EVENTS.has(payload.type)) return null;
  const data = payload.data ?? {};
  const isSession = payload.type === 'session.created';
  const tsMs = typeof payload.timestamp === 'number' ? payload.timestamp
    : typeof data.created_at === 'number' ? data.created_at : Date.now();
  return {
    svixId,
    type: payload.type,
    userId: isSession ? (data.user_id ?? null) : (data.id ?? null),
    sessionId: isSession ? (data.id ?? null) : null,
    occurredAt: new Date(tsMs),
    raw: { type: payload.type, id: data.id ?? null, user_id: data.user_id ?? null, deleted: data.deleted ?? null },
  };
}

export async function insertAuthEvent(db: Queryable, row: AuthEventRow): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO auth_events (svix_id, type, user_id, session_id, occurred_at, raw)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (svix_id) DO NOTHING`,
    [row.svixId, row.type, row.userId, row.sessionId, row.occurredAt, JSON.stringify(row.raw)],
  );
  return (r.rowCount ?? 0) > 0;
}
