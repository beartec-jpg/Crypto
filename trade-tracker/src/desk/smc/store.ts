import type pg from 'pg';
import type { StoredEvent, StoredSwing, StoredZone, TfState, VolumeLevels } from './types.js';

export async function upsertZones(pool: pg.Pool, zones: StoredZone[]): Promise<void> {
  if (!zones.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const z of zones) {
      await client.query(
        `INSERT INTO smc_zones (
           id, symbol, timeframe, kind, direction,
           low, high, origin_swing, impulse_extreme, width, atr_multiple, suggested_stop,
           created_at_bar, mitigated, mitigated_at_bar, tests, last_tested_at_bar, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (id) DO UPDATE SET
           atr_multiple = EXCLUDED.atr_multiple,
           width = EXCLUDED.width,
           tests = GREATEST(smc_zones.tests, EXCLUDED.tests),
           last_tested_at_bar = COALESCE(EXCLUDED.last_tested_at_bar, smc_zones.last_tested_at_bar),
           mitigated = smc_zones.mitigated OR EXCLUDED.mitigated,
           mitigated_at_bar = COALESCE(smc_zones.mitigated_at_bar, EXCLUDED.mitigated_at_bar),
           updated_at = NOW()`,
        [
          z.id,
          z.symbol,
          z.timeframe,
          z.kind,
          z.direction,
          z.low,
          z.high,
          z.originSwing,
          z.impulseExtreme,
          z.width,
          z.atrMultiple,
          z.suggestedStop,
          z.createdAtBar,
          z.mitigated,
          z.mitigatedAtBar,
          z.tests,
          z.lastTestedAtBar,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function loadZones(pool: pg.Pool, symbol: string, timeframe: string): Promise<StoredZone[]> {
  const r = await pool.query(
    `SELECT id, symbol, timeframe, kind, direction,
            low, high, origin_swing, impulse_extreme, width, atr_multiple, suggested_stop,
            created_at_bar, mitigated, mitigated_at_bar, tests, last_tested_at_bar
     FROM smc_zones
     WHERE symbol = $1 AND timeframe = $2
     ORDER BY created_at_bar DESC`,
    [symbol.toUpperCase(), timeframe],
  );
  return r.rows.map(rowToZone);
}

export async function loadZoneById(pool: pg.Pool, id: string): Promise<StoredZone | null> {
  const r = await pool.query(
    `SELECT id, symbol, timeframe, kind, direction,
            low, high, origin_swing, impulse_extreme, width, atr_multiple, suggested_stop,
            created_at_bar, mitigated, mitigated_at_bar, tests, last_tested_at_bar
     FROM smc_zones WHERE id = $1`,
    [id],
  );
  return r.rows[0] ? rowToZone(r.rows[0]) : null;
}

function rowToZone(row: Record<string, unknown>): StoredZone {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    kind: row.kind as StoredZone['kind'],
    direction: row.direction as StoredZone['direction'],
    low: Number(row.low),
    high: Number(row.high),
    originSwing: Number(row.origin_swing),
    impulseExtreme: Number(row.impulse_extreme),
    width: Number(row.width),
    atrMultiple: Number(row.atr_multiple),
    suggestedStop: Number(row.suggested_stop),
    createdAtBar: Number(row.created_at_bar),
    mitigated: Boolean(row.mitigated),
    mitigatedAtBar: row.mitigated_at_bar != null ? Number(row.mitigated_at_bar) : null,
    tests: Number(row.tests || 0),
    lastTestedAtBar: row.last_tested_at_bar != null ? Number(row.last_tested_at_bar) : null,
  };
}

export async function replaceSwings(pool: pg.Pool, symbol: string, timeframe: string, swings: StoredSwing[]): Promise<void> {
  await pool.query(`DELETE FROM smc_swings WHERE symbol = $1 AND timeframe = $2`, [
    symbol.toUpperCase(),
    timeframe,
  ]);
  for (const s of swings) {
    await pool.query(
      `INSERT INTO smc_swings (id, symbol, timeframe, kind, price, bar_time)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.symbol, s.timeframe, s.kind, s.price, s.barTime],
    );
  }
}

export async function loadSwings(pool: pg.Pool, symbol: string, timeframe: string): Promise<StoredSwing[]> {
  const r = await pool.query(
    `SELECT id, symbol, timeframe, kind, price, bar_time
     FROM smc_swings WHERE symbol = $1 AND timeframe = $2
     ORDER BY bar_time ASC`,
    [symbol.toUpperCase(), timeframe],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    kind: row.kind,
    price: Number(row.price),
    barTime: Number(row.bar_time),
  }));
}

export async function insertEvents(pool: pg.Pool, events: StoredEvent[]): Promise<number> {
  let n = 0;
  for (const e of events) {
    const r = await pool.query(
      `INSERT INTO smc_events (id, symbol, timeframe, event_type, direction, price, bar_time, broken_swing)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [e.id, e.symbol, e.timeframe, e.eventType, e.direction, e.price, e.barTime, e.brokenSwing],
    );
    n += r.rowCount ?? 0;
  }
  return n;
}

export async function loadEvents(
  pool: pg.Pool,
  symbol: string,
  timeframe: string,
  limit = 40,
  sinceBar?: number,
): Promise<StoredEvent[]> {
  const params: unknown[] = [symbol.toUpperCase(), timeframe];
  let sql = `SELECT id, symbol, timeframe, event_type, direction, price, bar_time, broken_swing
             FROM smc_events WHERE symbol = $1 AND timeframe = $2`;
  if (sinceBar != null) {
    params.push(sinceBar);
    sql += ` AND bar_time >= $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY bar_time DESC LIMIT $${params.length}`;
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: String(row.id),
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    eventType: row.event_type,
    direction: row.direction,
    price: Number(row.price),
    barTime: Number(row.bar_time),
    brokenSwing: row.broken_swing != null ? Number(row.broken_swing) : null,
  }));
}

export async function upsertTfState(pool: pg.Pool, st: TfState): Promise<void> {
  await pool.query(
    `INSERT INTO smc_tf_state (symbol, timeframe, last_bar_time, last_price, atr, bos, choch, engine_version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (symbol, timeframe) DO UPDATE SET
       last_bar_time = EXCLUDED.last_bar_time,
       last_price = EXCLUDED.last_price,
       atr = EXCLUDED.atr,
       bos = EXCLUDED.bos,
       choch = EXCLUDED.choch,
       engine_version = EXCLUDED.engine_version,
       updated_at = NOW()`,
    [st.symbol, st.timeframe, st.lastBarTime, st.lastPrice, st.atr, st.bos, st.choch, st.engineVersion],
  );
}

export async function loadTfState(pool: pg.Pool, symbol: string, timeframe: string): Promise<TfState | null> {
  const r = await pool.query(
    `SELECT symbol, timeframe, last_bar_time, last_price, atr, bos, choch, engine_version
     FROM smc_tf_state WHERE symbol = $1 AND timeframe = $2`,
    [symbol.toUpperCase(), timeframe],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    lastBarTime: Number(row.last_bar_time),
    lastPrice: Number(row.last_price),
    atr: Number(row.atr),
    bos: String(row.bos),
    choch: String(row.choch),
    engineVersion: Number(row.engine_version),
  };
}

export async function upsertVolume(pool: pg.Pool, v: VolumeLevels): Promise<void> {
  await pool.query(
    `INSERT INTO smc_volume_levels (symbol, timeframe, poc, vah, val, bars_used, as_of_bar, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (symbol, timeframe) DO UPDATE SET
       poc = EXCLUDED.poc, vah = EXCLUDED.vah, val = EXCLUDED.val,
       bars_used = EXCLUDED.bars_used, as_of_bar = EXCLUDED.as_of_bar, updated_at = NOW()`,
    [v.symbol, v.timeframe, v.poc, v.vah, v.val, v.barsUsed, v.asOfBar],
  );
}

export async function loadVolume(pool: pg.Pool, symbol: string, timeframe: string): Promise<VolumeLevels | null> {
  const r = await pool.query(
    `SELECT symbol, timeframe, poc, vah, val, bars_used, as_of_bar
     FROM smc_volume_levels WHERE symbol = $1 AND timeframe = $2`,
    [symbol.toUpperCase(), timeframe],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    poc: Number(row.poc),
    vah: Number(row.vah),
    val: Number(row.val),
    barsUsed: Number(row.bars_used),
    asOfBar: Number(row.as_of_bar),
  };
}

/** Keep 30 newest unmitigated + 15 newest mitigated per symbol/tf. */
export async function pruneZones(pool: pg.Pool, symbol: string, timeframe: string): Promise<void> {
  const sym = symbol.toUpperCase();
  await pool.query(
    `DELETE FROM smc_zones
     WHERE id IN (
       SELECT id FROM (
         SELECT id, row_number() OVER (ORDER BY created_at_bar DESC) AS rn
         FROM smc_zones
         WHERE symbol = $1 AND timeframe = $2 AND mitigated = false
       ) t WHERE rn > 30
     )`,
    [sym, timeframe],
  );
  await pool.query(
    `DELETE FROM smc_zones
     WHERE id IN (
       SELECT id FROM (
         SELECT id, row_number() OVER (ORDER BY COALESCE(mitigated_at_bar, created_at_bar) DESC) AS rn
         FROM smc_zones
         WHERE symbol = $1 AND timeframe = $2 AND mitigated = true
       ) t WHERE rn > 15
     )`,
    [sym, timeframe],
  );
}

export async function pruneEvents(pool: pg.Pool, symbol: string, timeframe: string, keep = 40): Promise<void> {
  await pool.query(
    `DELETE FROM smc_events
     WHERE id IN (
       SELECT id FROM (
         SELECT id, row_number() OVER (ORDER BY bar_time DESC) AS rn
         FROM smc_events
         WHERE symbol = $1 AND timeframe = $2
       ) t WHERE rn > $3
     )`,
    [symbol.toUpperCase(), timeframe, keep],
  );
}
