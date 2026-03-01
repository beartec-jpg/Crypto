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
    const interval = (req.query.interval as string) || '1h';
    
    const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
    
    // Try Coinalyze first
    if (coinalyzeApiKey) {
      try {
        const coinalyzeSymbol = `${symbol}_PERP.A`;
        const to = Math.floor(Date.now() / 1000);
        const from = to - (7 * 24 * 60 * 60); // 7 days
        const url = `https://api.coinalyze.net/v1/taker-buy-sell-volume-history?symbols=${coinalyzeSymbol}&interval=1hour&from=${from}&to=${to}`;
        
        console.log(`📊 Fetching Coinalyze CVD: ${coinalyzeSymbol}`);
        
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json', 'api_key': coinalyzeApiKey }
        });
        
        if (response.ok) {
          const data = await response.json();
          const history = data[0]?.history || [];
          
          if (history.length > 0) {
            // Calculate cumulative delta
            let cumDelta = 0;
            const cvdHistory = history.map((item: any) => {
              const buyVol = parseFloat(item.b || 0);
              const sellVol = parseFloat(item.s || 0);
              const delta = buyVol - sellVol;
              cumDelta += delta;
              
              return {
                timestamp: item.t * 1000,
                value: cumDelta
              };
            });
            
            console.log(`✅ Coinalyze CVD: ${cvdHistory.length} points`);
            
            return res.json({
              symbol,
              source: 'coinalyze-cvd',
              timestamp: Date.now(),
              history: cvdHistory,
              current: cvdHistory.length > 0 ? cvdHistory[cvdHistory.length - 1] : null
            });
          }
        }
      } catch (err) {
        console.log('⚠️ Coinalyze CVD failed, falling back to Binance calculation');
      }
    }
    
    // Fallback: Calculate CVD from Binance taker buy/sell volume
    console.log(`📊 Calculating CVD from Binance for ${symbol}`);
    
    const binanceUrls = [
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`,
      `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
    ];
    
    let klines = null;
    for (const url of binanceUrls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          klines = await response.json();
          break;
        }
      } catch (err) {
        console.log(`⚠️ Binance API failed: ${url}`);
      }
    }
    
    if (!klines || klines.length === 0) {
      return res.json({
        symbol,
        source: 'unavailable',
        timestamp: Date.now(),
        history: [],
        current: null
      });
    }
    
    // Calculate CVD from Binance data
    let cumDelta = 0;
    const cvdHistory = klines.map((k: any) => {
      const volume = parseFloat(k[5]);
      const takerBuyVolume = parseFloat(k[9]);
      const delta = (2 * takerBuyVolume) - volume; // Buy volume - Sell volume
      cumDelta += delta;
      
      return {
        timestamp: k[0],
        value: cumDelta
      };
    });
    
    console.log(`✅ Binance CVD calculated: ${cvdHistory.length} points`);
    
    res.json({
      symbol,
      source: 'binance-calculated',
      timestamp: Date.now(),
      history: cvdHistory,
      current: cvdHistory.length > 0 ? cvdHistory[cvdHistory.length - 1] : null
    });
    
  } catch (error: any) {
    console.error('❌ CVD endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch CVD data',
      details: error.message
    });
  }
}
