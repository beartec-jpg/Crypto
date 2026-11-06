// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FalconCloudError,
  clampLimit,
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

  const pairRaw = q(req.query.pair);
  const account = q(req.query.account)?.trim();
  const limit = clampLimit(q(req.query.limit), 200, 50);

  try {
    const { fills } = await getFalconCloudClient().getFills({
      pair: pairRaw ? normalizePair(pairRaw) : undefined,
      account: account || undefined,
      limit,
    });
    res.setHeader('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=15');
    return res.status(200).json({
      configured: true,
      source: 'falcon-cloud',
      pair: pairRaw ? normalizePair(pairRaw) : null,
      account: account || null,
      limit,
      count: fills.length,
      fills,
      pagination: {
        // Confirmed against live gateway 2026-11-06: only pair?/account?/limit?≤200.
        // offset/cursor/beforeHeight are ignored by the node; no historical page API.
        mode: 'recent-window',
        maxLimit: 200,
        cursorSupported: false,
        offsetSupported: false,
      },
      candlesSupported: false,
      note:
        'Fills are a recent newest-first window only. Chart OHLCV requires a persistent ingest job; this endpoint does not synthesize candles.',
    });
  } catch (err: any) {
    const e = err instanceof FalconCloudError ? err : null;
    const status = e?.status && e.status >= 400 ? e.status : 502;
    return res.status(status === 200 ? 502 : status).json({
      error: e?.message || err?.message || 'Falcon Cloud fills failed',
      code: e?.code,
      configured: true,
    });
  }
}
