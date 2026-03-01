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

    const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
    const coinglassApiKey = process.env.COINGLASS_API_KEY;
    
    let historyData: any[] = [];
    let dataSource = 'none';

    // Try Coinalyze first
    if (coinalyzeApiKey) {
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (7 * 24 * 60 * 60);
        const historyUrl = `https://api.coinalyze.net/v1/long-short-ratio-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

        console.log(`📊 Fetching Coinalyze Long/Short Ratio: ${coinalyzeSymbol}`);

        const response = await fetch(historyUrl, {
          headers: { 'Accept': 'application/json', 'api_key': coinalyzeApiKey }
        });

        if (response.ok) {
          const data = await response.json();
          historyData = data[0]?.history || [];
          if (historyData.length > 0) {
            dataSource = 'coinalyze-ls';
            console.log(`✅ Coinalyze L/S data: ${historyData.length} points`);
          }
        } else {
          console.log(`⚠️ Coinalyze L/S failed: ${response.status}, trying CoinGlass...`);
        }
      } catch (err) {
        console.log(`⚠️ Coinalyze L/S error, trying CoinGlass...`);
      }
    }

    // Fallback to CoinGlass
    if (historyData.length === 0 && coinglassApiKey) {
      try {
        // CoinGlass expects base symbol without USDT (e.g., "BTC" not "BTCUSDT")
        const coinglassSymbol = symbol.replace(/USDT$/, '').replace(/BUSD$/, '');
        const cgUrl = `https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?exchange=Binance&symbol=${coinglassSymbol}&interval=4h&limit=42`;
        
        console.log(`📊 Fetching CoinGlass L/S for ${symbol}...`);
        
        const cgResponse = await fetch(cgUrl, {
          headers: { 'accept': 'application/json', 'CG-API-KEY': coinglassApiKey }
        });
        
        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          if (cgData.code === '0' && cgData.data?.length > 0) {
            historyData = cgData.data.map((item: any) => ({
              t: (item.time || item.t) / 1000,
              longRate: parseFloat(item.longRate) || 0.5,
              shortRate: parseFloat(item.shortRate) || 0.5
            }));
            dataSource = 'coinglass-ls';
            console.log(`✅ CoinGlass L/S fallback: ${historyData.length} points`);
          }
        }
      } catch (err) {
        console.log(`⚠️ CoinGlass L/S fallback failed`);
      }
    }

    // Return placeholder if no data
    if (historyData.length === 0) {
      return res.json({
        symbol,
        source: 'unavailable',
        timestamp: Date.now(),
        current: { ratio: 1.0 },
        ratio: 1.0,
        history: [],
        cached: false,
        message: 'Long/Short Ratio data temporarily unavailable'
      });
    }
    
    const newHistory = historyData.slice(-10).map((point: any) => {
      const longRate = point.longRate || point.l || 0.5;
      const shortRate = point.shortRate || point.s || 0.5;
      const ratio = shortRate > 0 ? longRate / shortRate : 1.0;
      return {
        timestamp: (point.t || point.time || point.timestamp) * 1000,
        ratio
      };
    });
    
    const currentRatio = newHistory.length > 0 ? newHistory[newHistory.length - 1].ratio : 1.0;

    res.json({
      symbol,
      source: dataSource,
      timestamp: Date.now(),
      current: { ratio: currentRatio },
      ratio: currentRatio,
      history: newHistory,
      cached: false
    });

  } catch (error: any) {
    console.error('❌ Error fetching Long/Short Ratio:', error);
    res.status(500).json({
      error: 'Failed to fetch Long/Short Ratio data',
      details: error.message
    });
  }
}
