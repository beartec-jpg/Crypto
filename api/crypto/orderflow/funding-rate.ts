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
    const coinglassApiKey = process.env.COINGLASS_API_KEY;
    
    let historyData: any[] = [];
    let dataSource = 'none';

    // Try Coinalyze first
    if (coinalyzeApiKey) {
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (7 * 24 * 60 * 60);
        const historyUrl = `https://api.coinalyze.net/v1/funding-rate-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

        console.log(`📊 Fetching Coinalyze Funding Rate: ${coinalyzeSymbol}`);

        const response = await fetch(historyUrl, {
          headers: { 'Accept': 'application/json', 'api_key': coinalyzeApiKey }
        });

        if (response.ok) {
          const data = await response.json();
          historyData = data[0]?.history || [];
          if (historyData.length > 0) {
            dataSource = 'coinalyze-funding';
            console.log(`✅ Coinalyze Funding data: ${historyData.length} points`);
          }
        } else {
          console.log(`⚠️ Coinalyze Funding failed: ${response.status}, trying CoinGlass...`);
        }
      } catch (err) {
        console.log(`⚠️ Coinalyze Funding error, trying CoinGlass...`);
      }
    }

    // Fallback to CoinGlass
    if (historyData.length === 0 && coinglassApiKey) {
      try {
        // CoinGlass expects base symbol without USDT (e.g., "BTC" not "BTCUSDT")
        const coinglassSymbol = symbol.replace(/USDT$/, '').replace(/BUSD$/, '');
        const cgUrl = `https://open-api-v4.coinglass.com/api/futures/funding-rates-history?exchange=Binance&symbol=${coinglassSymbol}&interval=8h&limit=21`;
        
        console.log(`📊 Fetching CoinGlass Funding for ${symbol}...`);
        
        const cgResponse = await fetch(cgUrl, {
          headers: { 'accept': 'application/json', 'CG-API-KEY': coinglassApiKey }
        });
        
        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          if (cgData.code === '0' && cgData.data?.length > 0) {
            historyData = cgData.data.map((item: any) => ({
              t: (item.time || item.t) / 1000,
              v: parseFloat(item.fundingRate || item.rate || item.fr) || 0
            }));
            dataSource = 'coinglass-funding';
            console.log(`✅ CoinGlass Funding fallback: ${historyData.length} points`);
          }
        }
      } catch (err) {
        console.log(`⚠️ CoinGlass Funding fallback failed`);
      }
    }

    // Return placeholder if no data
    if (historyData.length === 0) {
      return res.json({
        symbol,
        source: 'unavailable',
        timestamp: Date.now(),
        current: 0,
        rate: 0,
        bias: 'neutral',
        history: [],
        cached: false,
        message: 'Funding Rate data temporarily unavailable'
      });
    }
    
    const newHistory = historyData.slice(-10).map((point: any) => ({
      timestamp: (point.t || point.time || point.timestamp) * 1000,
      value: [point.v, point.value, point.fundingRate].find((v) => v !== undefined) ?? 0
    }));
    
    const currentRate = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
    const bias = currentRate > 0.01 ? 'bullish' : currentRate < -0.01 ? 'bearish' : 'neutral';

    res.json({
      symbol,
      source: dataSource,
      timestamp: Date.now(),
      current: currentRate,
      rate: currentRate,
      bias,
      history: newHistory,
      cached: false
    });

  } catch (error: any) {
    console.error('❌ Error fetching Funding Rate:', error);
    res.status(500).json({
      error: 'Failed to fetch Funding Rate data',
      details: error.message
    });
  }
}
