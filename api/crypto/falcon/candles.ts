// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readCandles } from '../../_lib/falconCandleStore.js';
import { normalizeFalconSymbol } from '../../_lib/falconMarkets.js';

function q(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pair = normalizeFalconSymbol(q(req.query.pair) || q(req.query.symbol) || '');
  if (!pair) {
    return res.status(400).json({ error: 'pair must be USDC-FPL or BTC4-FPL' });
  }
  const timeframe = (q(req.query.timeframe) || q(req.query.interval) || '5m').toLowerCase();
  const limit = Math.min(Number(q(req.query.limit) || 500) || 500, 5000);

  try {
    const { candles, coverage, emptyReason } = await readCandles(pair, timeframe, limit);
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    return res.status(200).json({
      source: 'falcon-pl-testnet',
      networkId: 2300,
      pair,
      timeframe,
      candles: candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
      count: candles.length,
      emptyReason,
      coverage,
      quote: 'FPL',
      priceUnit: 'FPL per 1 whole base',
      note: 'OHLCV built only from fills with explorer-resolved block times. Latest RPC ring is ≤200 fills — not full history.',
    });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'candle read failed' });
  }
}
