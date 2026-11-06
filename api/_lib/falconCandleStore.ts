// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { getPool } from './db.js';
import type { FalconCandleRow, FalconCoverageMeta } from './falconTimeQuality.js';

export type { FalconCandleRow, FalconCoverageMeta };

let ready: Promise<void> | null = null;

export function ensureFalconCandleTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS falcon_candles (
          pair TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          bucket_time BIGINT NOT NULL,
          open DOUBLE PRECISION NOT NULL,
          high DOUBLE PRECISION NOT NULL,
          low DOUBLE PRECISION NOT NULL,
          close DOUBLE PRECISION NOT NULL,
          volume DOUBLE PRECISION NOT NULL,
          fill_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (pair, timeframe, bucket_time)
        );
        CREATE TABLE IF NOT EXISTS falcon_candle_coverage (
          pair TEXT PRIMARY KEY,
          meta JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })();
  }
  return ready;
}

export async function upsertCandles(
  pair: string,
  timeframe: string,
  candles: FalconCandleRow[],
): Promise<number> {
  await ensureFalconCandleTables();
  let n = 0;
  for (const c of candles) {
    await getPool().query(
      `INSERT INTO falcon_candles
        (pair, timeframe, bucket_time, open, high, low, close, volume, fill_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (pair, timeframe, bucket_time) DO UPDATE SET
         open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close,
         volume=EXCLUDED.volume, fill_count=EXCLUDED.fill_count, updated_at=NOW()`,
      [pair, timeframe, c.time, c.open, c.high, c.low, c.close, c.volume, c.fillCount],
    );
    n += 1;
  }
  return n;
}

export async function saveCoverage(pair: string, meta: FalconCoverageMeta): Promise<void> {
  await ensureFalconCandleTables();
  await getPool().query(
    `INSERT INTO falcon_candle_coverage(pair, meta, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (pair) DO UPDATE SET meta=EXCLUDED.meta, updated_at=NOW()`,
    [pair, JSON.stringify(meta)],
  );
}

export async function readCandles(
  pair: string,
  timeframe: string,
  limit = 500,
): Promise<{ candles: FalconCandleRow[]; coverage: FalconCoverageMeta | null; emptyReason: string | null }> {
  await ensureFalconCandleTables();
  const { rows } = await getPool().query(
    `SELECT bucket_time AS time, open, high, low, close, volume, fill_count AS "fillCount"
     FROM falcon_candles
     WHERE pair=$1 AND timeframe=$2
     ORDER BY bucket_time ASC
     LIMIT $3`,
    [pair, timeframe, Math.min(Math.max(limit, 1), 5000)],
  );
  const cov = await getPool().query(`SELECT meta FROM falcon_candle_coverage WHERE pair=$1`, [pair]);
  const coverage = (cov.rows[0]?.meta as FalconCoverageMeta) || null;
  const candles = rows.map((r: any) => ({
    time: Number(r.time),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    fillCount: Number(r.fillCount),
  }));
  let emptyReason: string | null = null;
  if (!candles.length) {
    const hint = coverage?.emptyReasonHint;
    emptyReason = hint && hint !== 'no_canonical_block_time'
      ? hint
      : (coverage ? 'verified_utc_unavailable' : 'no_ingest_yet');
  }
  return { candles, coverage, emptyReason };
}
