/**
 * AI output log — compliance record of every technical scenario / overview delivered to users.
 *
 * Writes to `ai_output_log` (see migrations/015_ai_output_log.sql and shared/schema.ts `aiOutputLog`).
 * Self-contained (no imports) so it bundles into Vercel functions via api/_lib/** and can be
 * used from server/routes.ts too.
 *
 * The writer is NON-BLOCKING: it never throws and never awaits in the caller's response path.
 * Any DB failure is swallowed and logged to console only.
 *
 * Retention: rows are kept for AI_OUTPUT_LOG_RETENTION_DAYS (default 5 years, in line with typical
 * UK record-keeping expectations for financial-promotion-adjacent content). Purge with
 * `pruneAiOutputLog` from a cron or run the SQL in the migration file manually.
 */

/** Bump when AI prompt wording changes materially so logged outputs can be traced to prompts. */
export const AI_PROMPT_VERSION = '2026-11-technical-scenarios-v1';

export const AI_OUTPUT_LOG_RETENTION_DAYS = 365 * 5;

export type AiOutputDeliveryChannel = 'web' | 'discord' | 'png';

export interface AiOutputLogEntry {
  userId?: string | null;
  symbol: string;
  timeframe?: string | null;
  mode?: string | null;
  analysisType?: string | null;
  promptVersion?: string;
  channel: AiOutputDeliveryChannel;
  cached?: boolean;
  output: unknown;
}

export interface QueryableDb {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
}

export const AI_OUTPUT_LOG_INSERT_SQL =
  `INSERT INTO ai_output_log (user_id, symbol, timeframe, mode, analysis_type, prompt_version, delivery_channel, cached, output_json, output_text)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null) ?? 'null';
  } catch {
    return JSON.stringify(String(value));
  }
}

export function buildAiOutputLogParams(entry: AiOutputLogEntry): unknown[] {
  const json = safeStringify(entry.output);
  return [
    entry.userId ?? null,
    String(entry.symbol || 'UNKNOWN'),
    entry.timeframe ?? null,
    entry.mode ?? null,
    entry.analysisType ?? null,
    entry.promptVersion ?? AI_PROMPT_VERSION,
    entry.channel,
    Boolean(entry.cached),
    json,
    typeof entry.output === 'string' ? entry.output : json,
  ];
}

/**
 * Write a log row. Returns a promise that ALWAYS resolves (true on success, false on failure),
 * so callers may `void logAiOutput(...)` without awaiting or may await safely.
 */
export function logAiOutput(db: QueryableDb | null | undefined, entry: AiOutputLogEntry): Promise<boolean> {
  try {
    if (!db || typeof db.query !== 'function') return Promise.resolve(false);
    return Promise.resolve()
      .then(() => db.query(AI_OUTPUT_LOG_INSERT_SQL, buildAiOutputLogParams(entry)))
      .then(() => true)
      .catch((error: any) => {
        console.warn('⚠️ ai_output_log write failed (ignored):', error?.message || error);
        return false;
      });
  } catch (error: any) {
    console.warn('⚠️ ai_output_log write failed (ignored):', error?.message || error);
    return Promise.resolve(false);
  }
}

export function pruneAiOutputLog(db: QueryableDb, retentionDays = AI_OUTPUT_LOG_RETENTION_DAYS): Promise<boolean> {
  return Promise.resolve()
    .then(() => db.query(`DELETE FROM ai_output_log WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`, [retentionDays]))
    .then(() => true)
    .catch(() => false);
}

/**
 * Same as logAiOutput but resolves after at most `timeoutMs` even if the DB is slow, so it can be
 * awaited just before closing a short-lived pool without delaying the response meaningfully.
 */
export function logAiOutputBounded(
  db: QueryableDb | null | undefined,
  entry: AiOutputLogEntry,
  timeoutMs = 1500,
): Promise<boolean> {
  return Promise.race([
    logAiOutput(db, entry),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}
