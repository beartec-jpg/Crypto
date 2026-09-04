import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
    const coinalyzeSymbol = `${symbol}_PERP.A`;

    const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
    const coinglassApiKey = process.env.COINGLASS_API_KEY || process.env.CG_API_KEY;
    
    let historyData: any[] = [];
    let dataSource = 'none';

    // Try Coinalyze first
    if (coinalyzeApiKey) {
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (7 * 24 * 60 * 60);
        const historyUrl = `https://api.coinalyze.net/v1/open-interest-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

        console.log(`📊 Fetching Coinalyze Open Interest: ${coinalyzeSymbol}`);

        const response = await fetch(historyUrl, {
          headers: { 'Accept': 'application/json', 'api_key': coinalyzeApiKey }
        });

        if (response.ok) {
          const data = await response.json();
          historyData = data[0]?.history || [];
          if (historyData.length > 0) {
            dataSource = 'coinalyze-oi';
            console.log(`✅ Coinalyze OI data: ${historyData.length} points`);
          }
        } else {
          console.log(`⚠️ Coinalyze OI failed: ${response.status}, trying CoinGlass...`);
        }
      } catch (err) {
        console.log(`⚠️ Coinalyze OI error, trying CoinGlass...`);
      }
    }

    // Fallback to CoinGlass
    if (historyData.length === 0 && coinglassApiKey) {
      try {
        // Pair OI history wants the full futures pair (BTCUSDT), not the coin (BTC).
        const coinglassSymbol = symbol.replace(/BUSD$/, 'USDT');
        const cgUrl = `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${coinglassSymbol}&interval=4h&limit=42`;
        
        console.log(`📊 Fetching CoinGlass OI for ${symbol}...`);
        
        const cgResponse = await fetch(cgUrl, {
          headers: { 'accept': 'application/json', 'CG-API-KEY': coinglassApiKey }
        });
        
        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          console.log(`📊 CoinGlass OI response: code=${cgData.code}, data count=${cgData.data?.length || 0}`);
          if (cgData.code === '0' && cgData.data?.length > 0) {
            historyData = cgData.data.map((item: any) => ({
              t: (item.time || item.t) / 1000,
              o: parseFloat(item.open) || 0,
              h: parseFloat(item.high) || 0,
              l: parseFloat(item.low) || 0,
              c: parseFloat(item.close) || 0
            }));
            dataSource = 'coinglass-oi';
            console.log(`✅ CoinGlass OI fallback: ${historyData.length} points`);
          }
        }
      } catch (err) {
        console.log(`⚠️ CoinGlass OI fallback failed`);
      }
    }

    // Return placeholder if no data
    if (historyData.length === 0) {
      return res.json({
        symbol,
        source: 'unavailable',
        timestamp: Date.now(),
        current: { value: 0 },
        history: [],
        delta: 0,
        trend: 'neutral',
        cached: false,
        message: 'Open Interest data temporarily unavailable'
      });
    }
    
    // Keep ≥24h of 4h marks so Tide Zone can compute a 24h OI change.
    const newHistory = historyData.slice(-18).map((point: any) => {
      let t = Number(point.t || point.time || point.timestamp || 0);
      if (t > 0 && t < 1e12) t *= 1000;
      return {
        timestamp: t,
        value: Number([point.c, point.v, point.oi, point.value].find((v) => v !== undefined) ?? 0),
      };
    });
    
    const currentValue = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
    const previousValue = newHistory.length > 1 ? newHistory[newHistory.length - 2].value : currentValue;
    const delta = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
    const trend = delta > 0.5 ? 'rising' : delta < -0.5 ? 'falling' : 'neutral';

    res.json({
      symbol,
      source: dataSource,
      timestamp: Date.now(),
      current: currentValue,
      history: newHistory,
      delta,
      trend,
      cached: false
    });

  } catch (error: any) {
    console.error('❌ Error fetching Open Interest:', error);
    res.status(500).json({
      error: 'Failed to fetch Open Interest data',
      details: error.message
    });
  }
}
