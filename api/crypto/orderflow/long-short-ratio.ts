import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
    const interval = (req.query.interval as string) || '4h';

    const coinalyzeSymbol = `${symbol}_PERP.A`;

    const apiKey = process.env.COINALYZE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Coinalyze API not configured',
        message: 'COINALYZE_API_KEY environment variable required'
      });
    }

    const coinalyzeInterval = interval === '15m' ? '15min' : interval === '1h' ? '1hour' : interval === '4h' ? '4hour' : interval;
    const to = Math.floor(Date.now() / 1000);
    const from = to - (7 * 24 * 60 * 60);

    const url = `https://api.coinalyze.net/v1/long-short-ratio-history?symbols=${coinalyzeSymbol}&interval=${coinalyzeInterval}&from=${from}&to=${to}`;

    console.log(`📊 Fetching Coinalyze Long/Short Ratio: ${coinalyzeSymbol}, interval: ${coinalyzeInterval}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'api_key': apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Coinalyze L/S Ratio API error: ${response.status}`, errorText);
      throw new Error(`Coinalyze API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawHistory = data[0]?.history || [];

    const normalizedHistory = rawHistory.map((item: any) => ({
      timestamp: item.t,
      ratio: item.r,
      longPercent: item.l,
      shortPercent: item.s
    }));

    const current = normalizedHistory.length > 0 
      ? normalizedHistory[normalizedHistory.length - 1] 
      : { ratio: 1.0, longPercent: 50, shortPercent: 50 };

    const result = {
      symbol,
      source: 'coinalyze-lsr',
      timestamp: Date.now(),
      current,
      history: normalizedHistory.slice(-10),
      cached: false
    };

    res.json(result);

  } catch (error: any) {
    console.error('❌ Error fetching Coinalyze Long/Short Ratio:', error);
    res.status(500).json({
      error: 'Failed to fetch Long/Short Ratio data',
      details: error.message
    });
  }
}
