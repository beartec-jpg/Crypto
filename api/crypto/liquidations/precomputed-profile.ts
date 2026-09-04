import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

type StoredLevel = {
  price: number;
  liquidationValue: number;
  side: 'long' | 'short';
  score?: number;
  type?: 'primary' | 'secondary';
};

function normalizeSymbol(input: string): string {
  const cleaned = input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!cleaned) return 'BTCUSDT';
  if (cleaned.endsWith('USDT')) return cleaned;
  return `${cleaned}USDT`;
}

function toLevels(raw: unknown): StoredLevel[] {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row: any) => ({
      price: Number(row?.price || 0),
      liquidationValue: Number(row?.liquidationValue || 0),
      side: (row?.side === 'short' ? 'short' : 'long') as StoredLevel['side'],
      score: Number.isFinite(Number(row?.score)) ? Number(row.score) : undefined,
      type: row?.type === 'primary' || row?.type === 'secondary' ? row.type : undefined,
    }))
    .filter((row) => row.price > 0 && row.liquidationValue > 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      code: '1',
      data: {
        levels: [],
        targetLevels: [],
        directionScore: 50,
        maxLongPrice: 0,
        maxShortPrice: 0,
        totalLongLiquidation: 0,
        totalShortLiquidation: 0,
        lastUpdated: Date.now(),
      },
      meta: {
        source: 'precomputed-profile',
        note: 'database_unavailable',
      },
    });
  }

  const symbol = normalizeSymbol(String(req.query.symbol || 'BTCUSDT'));
  const range = String(req.query.range || '7d');

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT symbol, range, levels_json, direction_score, meta_json, updated_at
      FROM liquidation_heatmap_profiles
      WHERE symbol = ${symbol} AND range = ${range}
      LIMIT 1;
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({
        code: '1',
        data: {
          levels: [],
          targetLevels: [],
          directionScore: 50,
          maxLongPrice: 0,
          maxShortPrice: 0,
          totalLongLiquidation: 0,
          totalShortLiquidation: 0,
          lastUpdated: Date.now(),
        },
        meta: {
          source: 'precomputed-profile',
          note: 'not_found',
        },
      });
    }

    const row = rows[0] as any;
    const levels = toLevels(row.levels_json);
    const directionScore = Number.isFinite(Number(row.direction_score)) ? Number(row.direction_score) : 50;

    let totalLongLiquidation = 0;
    let totalShortLiquidation = 0;
    let maxLongPrice = 0;
    let maxShortPrice = 0;
    let maxLongValue = 0;
    let maxShortValue = 0;

    for (const level of levels) {
      if (level.side === 'long') {
        totalLongLiquidation += level.liquidationValue;
        if (level.liquidationValue > maxLongValue) {
          maxLongValue = level.liquidationValue;
          maxLongPrice = level.price;
        }
      } else {
        totalShortLiquidation += level.liquidationValue;
        if (level.liquidationValue > maxShortValue) {
          maxShortValue = level.liquidationValue;
          maxShortPrice = level.price;
        }
      }
    }

    const targetLevels = levels.filter((l) => l.type === 'primary' || l.type === 'secondary');
    const updatedMs = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();

    return res.status(200).json({
      code: '0',
      data: {
        levels,
        targetLevels,
        directionScore,
        maxLongPrice,
        maxShortPrice,
        totalLongLiquidation,
        totalShortLiquidation,
        lastUpdated: updatedMs,
      },
      meta: {
        symbol,
        range,
        source: 'precomputed-profile',
        updatedAt: row.updated_at,
        cached: true,
        pivots: row.meta_json?.pivots || { pivotHighs: [], pivotLows: [] },
      },
    });
  } catch (error: any) {
    return res.status(200).json({
      code: '1',
      data: {
        levels: [],
        targetLevels: [],
        directionScore: 50,
        maxLongPrice: 0,
        maxShortPrice: 0,
        totalLongLiquidation: 0,
        totalShortLiquidation: 0,
        lastUpdated: Date.now(),
      },
      meta: {
        source: 'precomputed-profile',
        note: 'query_failed',
      },
      error: error?.message || 'Failed to read precomputed profile',
    });
  }
}
