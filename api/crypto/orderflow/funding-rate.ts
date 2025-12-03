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

    const coinalyzeSymbol = `${symbol}_PERP.A`;

    const apiKey = process.env.COINALYZE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Coinalyze API not configured',
        message: 'COINALYZE_API_KEY environment variable required'
      });
    }

    const to = Math.floor(Date.now() / 1000);
    const from = to - (7 * 24 * 60 * 60);
    const historyUrl = `https://api.coinalyze.net/v1/funding-rate-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

    console.log(`📊 Fetching Coinalyze Funding Rate History: ${coinalyzeSymbol}`);

    const response = await fetch(historyUrl, {
      headers: {
        'Accept': 'application/json',
        'api_key': apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Coinalyze Funding API error: ${response.status}`, errorText);
      throw new Error(`Coinalyze API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const historyData = data[0]?.history || [];
    
    const newHistory = historyData.slice(-10).map((point: any) => ({
      timestamp: (point.t || point.time || point.timestamp) * 1000,
      value: point.c || point.v || point.fr || point.fundingRate || point.value || 0
    }));
    
    const currentValue = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
    const currentRaw = historyData.length > 0 ? historyData[historyData.length - 1] : { value: currentValue };

    const result = {
      symbol,
      source: 'coinalyze-funding',
      timestamp: Date.now(),
      current: currentRaw,
      history: newHistory,
      cached: false
    };

    res.json(result);

  } catch (error: any) {
    console.error('❌ Error fetching Coinalyze Funding Rate:', error);
    res.status(500).json({
      error: 'Failed to fetch Funding Rate data',
      details: error.message
    });
  }
}
