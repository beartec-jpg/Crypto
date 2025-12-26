import type { VercelRequest, VercelResponse } from '@vercel/node';

// Fetch OHLCV from Binance with taker buy/sell volume breakdown
async function fetchBinanceOHLCV(symbol: string, interval: string, limit: number) {
  const since = Date.now() - 86400000; // Last 24 hours
  
  // Try global Binance first, then US as fallback
  const urls = [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${since}&limit=${limit}`,
    `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${since}&limit=${limit}`
  ];
  
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const klines = await response.json();
        if (Array.isArray(klines) && klines.length > 0) {
          return klines.map((k: any) => {
            const volume = parseFloat(k[5]);
            const buyVolume = parseFloat(k[9]); // Taker buy base volume
            const sellVolume = volume - buyVolume;
            return {
              timestamp: k[0],
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume,
              buyVolume,
              sellVolume,
              delta: buyVolume - sellVolume,
            };
          });
        }
      }
    } catch (err: any) {
      lastError = err;
      console.log(`⚠️ Binance API failed (${url.includes('.com') ? 'global' : 'US'}): ${err.message}`);
    }
  }
  throw lastError || new Error('All Binance APIs failed');
}

// Legacy code path - kept for reference but replaced above
async function _fetchBinanceOHLCV_legacy(symbol: string, interval: string, limit: number) {
  const since = Date.now() - 86400000;
  const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${since}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance US error: ${response.status}`);
  const klines = await response.json();
  
  return klines.map((k: any) => {
    const volume = parseFloat(k[5]);
    const buyVolume = parseFloat(k[9]); // Taker buy base volume
    const sellVolume = volume - buyVolume;
    return {
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume,
      buyVolume,
      sellVolume,
      delta: buyVolume - sellVolume,
    };
  });
}

// Fetch Open Interest from CoinGlass v4 API
// Always uses 4h interval (fixed) - required by CoinGlass Hobbyist plan
async function fetchOpenInterest(symbol: string): Promise<any> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) {
    console.log('⚠️ No CoinGlass API key for OI');
    return null;
  }
  
  try {
    // Fixed 4h interval - ignores page timeframe setting
    const url = `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${symbol}&interval=4h&limit=24`;
    console.log(`📊 Fetching CoinGlass OI: ${symbol}`);
    
    const response = await fetch(url, {
      headers: { 'CG-API-KEY': apiKey, 'accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`⚠️ CoinGlass OI failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`📊 CoinGlass OI response: code=${data.code}, msg=${data.msg}, data count=${data.data?.length || 0}`);
    
    if (data.code !== '0' || !data.data?.length) {
      console.log(`⚠️ CoinGlass OI invalid response: ${JSON.stringify(data).substring(0, 200)}`);
      return null;
    }
    
    // Response format: { time, open, high, low, close }
    const history = data.data.map((item: any) => ({
      timestamp: item.time,
      value: parseFloat(item.close || item.open || 0)
    }));
    
    console.log(`✅ CoinGlass OI parsed: ${history.length} points, latest value: ${history[history.length - 1]?.value}`);
    
    return {
      history,
      current: history.length > 0 ? history[history.length - 1].value : 0,
      delta: history.length > 1 ? history[history.length - 1].value - history[history.length - 2].value : 0,
      trend: history.length > 1 ? (history[history.length - 1].value > history[history.length - 2].value ? 'rising' : 'falling') : 'neutral'
    };
  } catch (error) {
    console.warn('Failed to fetch OI:', error);
    return null;
  }
}

// Fetch Funding Rate from CoinGlass v4 API
// Always uses 8h interval (fixed) - standard funding interval
async function fetchFundingRate(symbol: string): Promise<any> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) {
    console.log('⚠️ No CoinGlass API key for Funding');
    return null;
  }
  
  try {
    // Fixed 8h interval - ignores page timeframe setting
    const url = `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=${symbol}&interval=8h&limit=24`;
    console.log(`📊 Fetching CoinGlass Funding: ${symbol}`);
    
    const response = await fetch(url, {
      headers: { 'CG-API-KEY': apiKey, 'accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`⚠️ CoinGlass Funding failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`📊 CoinGlass Funding response: code=${data.code}, msg=${data.msg}, data count=${data.data?.length || 0}`);
    
    if (data.code !== '0' || !data.data?.length) {
      console.log(`⚠️ CoinGlass Funding invalid response: ${JSON.stringify(data).substring(0, 200)}`);
      return null;
    }
    
    // Response format: { time, open, high, low, close }
    const history = data.data.map((item: any) => ({
      timestamp: item.time,
      value: parseFloat(item.close || item.open || 0)
    }));
    
    const currentRate = history.length > 0 ? history[history.length - 1].value : 0;
    console.log(`✅ CoinGlass Funding parsed: ${history.length} points, current rate: ${currentRate}`);
    
    return {
      history,
      current: currentRate,
      rate: currentRate,
      bias: currentRate > 0.0001 ? 'bullish' : currentRate < -0.0001 ? 'bearish' : 'neutral'
    };
  } catch (error) {
    console.warn('Failed to fetch funding rate:', error);
    return null;
  }
}

// Fetch Long/Short Ratio from CoinGlass v4 API
// Always uses 4h interval (fixed) - required by CoinGlass Hobbyist plan
async function fetchLongShortRatio(symbol: string): Promise<any> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return { current: { ratio: 1.0 }, ratio: 1.0, history: [] };
  
  try {
    // Fixed 4h interval - ignores page timeframe setting
    const url = `https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?exchange=Binance&symbol=${symbol}&interval=4h&limit=24`;
    console.log(`📊 Fetching CoinGlass L/S Ratio: ${symbol}`);
    
    const response = await fetch(url, {
      headers: { 'CG-API-KEY': apiKey, 'accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`⚠️ CoinGlass L/S failed: ${response.status}`);
      return { current: { ratio: 1.0 }, ratio: 1.0, history: [] };
    }
    
    const data = await response.json();
    console.log(`📊 CoinGlass L/S response: code=${data.code}, msg=${data.msg}, data count=${data.data?.length || 0}`);
    
    if (data.code !== '0' || !data.data?.length) {
      console.log(`⚠️ CoinGlass L/S invalid response: ${JSON.stringify(data).substring(0, 200)}`);
      return { current: { ratio: 1.0 }, ratio: 1.0, history: [] };
    }
    
    // Correct field names from CoinGlass v4 API:
    // - global_account_long_short_ratio: the L/S ratio directly
    // - global_account_long_percent: long percentage
    // - global_account_short_percent: short percentage
    const history = data.data.map((item: any) => {
      // Use the ratio directly if available, otherwise calculate from percentages
      const ratio = parseFloat(item.global_account_long_short_ratio || item.longShortRatio || 0) ||
        (parseFloat(item.global_account_long_percent || 50) / parseFloat(item.global_account_short_percent || 50));
      return {
        timestamp: item.time,
        ratio: ratio || 1.0,
        longPercent: parseFloat(item.global_account_long_percent || 50),
        shortPercent: parseFloat(item.global_account_short_percent || 50)
      };
    });
    
    const currentRatio = history.length > 0 ? history[history.length - 1].ratio : 1.0;
    console.log(`✅ CoinGlass L/S parsed: ${history.length} points, current ratio: ${currentRatio}`);
    
    return {
      history,
      current: { ratio: currentRatio },
      ratio: currentRatio
    };
  } catch (error) {
    console.warn('Failed to fetch L/S ratio:', error);
    return { current: { ratio: 1.0 }, ratio: 1.0, history: [] };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
    const interval = (req.query.interval as string) || '15m';
    
    console.log(`📊 Professional Orderflow request: ${symbol} @ ${interval}`);
    
    // Fetch all data directly from external APIs in parallel
    const [binanceData, openInterest, fundingRate, longShortRatio] = await Promise.all([
      fetchBinanceOHLCV(symbol, interval, 100).catch((err) => {
        console.log(`⚠️ Binance OHLCV failed: ${err.message}`);
        return [];
      }),
      fetchOpenInterest(symbol),
      fetchFundingRate(symbol),
      fetchLongShortRatio(symbol)
    ]);
    
    // Calculate CVD from Binance delta data
    let cumulativeDelta = 0;
    const cvdHistory = binanceData.map((candle: any) => {
      cumulativeDelta += candle.delta;
      return {
        timestamp: candle.timestamp,
        value: cumulativeDelta,
        delta: candle.delta
      };
    });
    
    const result = {
      cvd: { 
        history: cvdHistory,
        current: cvdHistory.length > 0 ? cvdHistory[cvdHistory.length - 1].value : 0
      },
      openInterest: openInterest || { history: [], current: null, delta: 0, trend: 'neutral' },
      fundingRate: fundingRate || { history: [], current: null, rate: 0, bias: 'neutral' },
      longShortRatio: longShortRatio || { current: { ratio: 1.0 }, ratio: 1.0, history: [] },
      symbol,
      interval,
      timestamp: Date.now()
    };
    
    console.log(`✅ Professional Orderflow result: OI=${result.openInterest.history?.length || 0} points, Funding=${result.fundingRate.history?.length || 0} points, CVD=${result.cvd.history?.length || 0} points`);
    
    res.json(result);

  } catch (error: any) {
    console.error('❌ Error fetching professional orderflow:', error);
    res.status(500).json({
      error: 'Failed to fetch professional orderflow data',
      details: error.message
    });
  }
}
