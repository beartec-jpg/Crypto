import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

type PredictiveResponse = {
  code?: string;
  data?: {
    levels?: Array<{ price: number; liquidationValue: number; side: 'long' | 'short' }>;
    targetLevels?: Array<{ price: number; liquidationValue: number; side: 'long' | 'short'; score: number; type: 'primary' | 'secondary' }>;
    directionScore?: number;
  };
  meta?: {
    pivots?: { pivotHighs?: number[]; pivotLows?: number[] };
    inputs?: Record<string, unknown>;
  };
  error?: string;
};

function getRequestOrigin(req: VercelRequest): string {
  const host = req.headers.host;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = typeof protoHeader === 'string' ? protoHeader : 'https';
  return `${proto}://${host}`;
}

function parseSymbols(raw: unknown): string[] {
  const fallback = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const parsed = raw
    .split(',')
    .map((s) => s.replace(/[^A-Z0-9]/gi, '').toUpperCase())
    .filter(Boolean)
    .map((s) => (s.endsWith('USDT') ? s : `${s}USDT`));
  return parsed.length > 0 ? parsed.slice(0, 20) : fallback;
}

async function fetchProfile(origin: string, symbol: string, range: string): Promise<PredictiveResponse> {
  const url = `${origin}/api/crypto/liquidations/predictive-profile?symbol=${symbol}&range=${range}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    return { code: '1', error: `http_${response.status}` };
  }
  return await response.json() as PredictiveResponse;
}

async function ensureTable(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS liquidation_heatmap_profiles (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      range VARCHAR(16) NOT NULL,
      levels_json JSONB NOT NULL,
      direction_score DOUBLE PRECISION,
      meta_json JSONB,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(symbol, range)
    );
  `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL missing',
    });
  }

  const symbols = parseSymbols(req.query.symbols);
  const ranges = typeof req.query.ranges === 'string' && req.query.ranges.trim()
    ? req.query.ranges.split(',').map((r) => r.trim()).filter(Boolean)
    : ['7d'];

  const origin = getRequestOrigin(req);
  const sql = neon(process.env.DATABASE_URL);

  await ensureTable(sql);

  const results: Array<{
    symbol: string;
    range: string;
    ok: boolean;
    levelsStored: number;
    directionScore: number;
    error?: string;
  }> = [];

  for (const symbol of symbols) {
    for (const range of ranges) {
      try {
        const profile = await fetchProfile(origin, symbol, range);
        if (profile.code !== '0' || !profile.data) {
          results.push({
            symbol,
            range,
            ok: false,
            levelsStored: 0,
            directionScore: 50,
            error: profile.error || 'profile_unavailable',
          });
          continue;
        }

        const levels = Array.isArray(profile.data.targetLevels) && profile.data.targetLevels.length > 0
          ? profile.data.targetLevels
          : (profile.data.levels || []);
        const directionScore = Number(profile.data.directionScore ?? 50);
        const meta = {
          pivots: profile.meta?.pivots || { pivotHighs: [], pivotLows: [] },
          inputs: profile.meta?.inputs || {},
          generatedAt: Date.now(),
        };

        await sql`
          INSERT INTO liquidation_heatmap_profiles (symbol, range, levels_json, direction_score, meta_json, updated_at)
          VALUES (${symbol}, ${range}, ${JSON.stringify(levels)}::jsonb, ${directionScore}, ${JSON.stringify(meta)}::jsonb, NOW())
          ON CONFLICT (symbol, range)
          DO UPDATE SET
            levels_json = EXCLUDED.levels_json,
            direction_score = EXCLUDED.direction_score,
            meta_json = EXCLUDED.meta_json,
            updated_at = NOW();
        `;

        results.push({
          symbol,
          range,
          ok: true,
          levelsStored: levels.length,
          directionScore,
        });
      } catch (error: any) {
        results.push({
          symbol,
          range,
          ok: false,
          levelsStored: 0,
          directionScore: 50,
          error: error?.message || 'unknown_error',
        });
      }
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;

  return res.status(200).json({
    ok: fail === 0,
    message: 'Heatmap profile compute completed',
    symbols,
    ranges,
    summary: {
      total: results.length,
      ok,
      fail,
    },
    results,
    timestamp: Date.now(),
  });
}
