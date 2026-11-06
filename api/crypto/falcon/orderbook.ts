// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FalconCloudError,
  clampLevels,
  getFalconCloudClient,
  hasFalconCloudApiKey,
  normalizePair,
} from '../../_lib/falconCloudClient.js';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function q(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!hasFalconCloudApiKey()) {
    return res.status(503).json({
      error: 'Falcon Cloud not configured',
      configured: false,
      env: 'FALCON_CLOUD_API_KEY',
    });
  }

  const pair = normalizePair(q(req.query.pair) || 'BTC4');
  const levels = clampLevels(q(req.query.levels), 200, 50);

  try {
    const book = await getFalconCloudClient().getOrderBook(pair, levels);
    res.setHeader('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=15');
    return res.status(200).json({
      configured: true,
      source: 'falcon-cloud',
      pair,
      levels,
      orderBook: book,
      // Explicit: this is live depth + AMM spot, not OHLCV candles.
      candlesSupported: false,
    });
  } catch (err: any) {
    const e = err instanceof FalconCloudError ? err : null;
    const status = e?.status && e.status >= 400 ? e.status : 502;
    return res.status(status === 200 ? 502 : status).json({
      error: e?.message || err?.message || 'Falcon Cloud order book failed',
      code: e?.code,
      configured: true,
    });
  }
}
