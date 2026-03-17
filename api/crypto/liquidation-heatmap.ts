import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Cache for 5 minutes
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
    const exchange = (req.query.exchange as string) || 'Binance';
    const range = (req.query.range as string) || '7d';

    const apiKey = process.env.COINGLASS_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Coinglass API not configured',
        message: 'COINGLASS_API_KEY environment variable required'
      });
    }

    // Normalize symbol (strip non-alphanumeric, uppercase)
    const normalizedSymbol = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const url = `https://open-api.coinglass.com/api/futures/liquidation/heatmap/model2?symbol=${normalizedSymbol}&exchange=${exchange}&range=${range}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CG-API-KEY': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Coinglass API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code !== '0') {
      throw new Error(`Coinglass API returned error: ${data.msg}`);
    }

    return res.json({
      code: '0',
      data: data.data,
      meta: {
        symbol: normalizedSymbol,
        exchange,
        range,
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    console.error('Error fetching liquidation heatmap:', error);
    return res.status(500).json({
      error: 'Failed to fetch liquidation heatmap',
      message: error.message
    });
  }
}
