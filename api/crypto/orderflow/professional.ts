import type { VercelRequest, VercelResponse } from '@vercel/node';

// Fetch OHLCV from Binance with taker buy/sell volume breakdown
async function fetchBinanceOHLCV(symbol: string, interval: string, limit: number) {
  const since = Date.now() - 86400000; // Last 24 hours
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

// Fetch Open Interest from CoinGlass
async function fetchOpenInterest(symbol: string): Promise<any> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return null;
  
  try {
    const base = symbol.replace('USDT', '');
    const url = `https://open-api-v3.coinglass.com/api/futures/openInterest/ohlc-history?exchange=Binance&symbol=${base}&interval=1h&limit=24`;
    const response = await fetch(url, {
      headers: { 'CG-API-KEY': apiKey, 'accept': 'application/json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== '0') return null;
    
    const history = data.data?.map((item: any) => ({
      timestamp: item.t || item.time,
      value: parseFloat(item.o || item.openInterest || 0)
    })) || [];
    
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

// Fetch Funding Rate from CoinGlass
async function fetchFundingRate(symbol: string): Promise<any> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return null;
  
  try {
    const base = symbol.replace('USDT', '');
    const url = `https://open-api-v3.coinglass.com/api/futures/fundingRate/ohlc-history?exchange=Binance&symbol=${base}&interval=8h&limit=24`;
    const response = await fetch(url, {
      headers: { 'CG-API-KEY': apiKey, 'accept': 'application/json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== '0') return null;
    
    const history = data.data?.map((item: any) => ({
      timestamp: item.t || item.time,
      value: parseFloat(item.o || item.fundingRate || 0)
    })) || [];
    
    const currentRate = history.length > 0 ? history[history.length - 1].value : 0;
    
    return {
      history,
      current: currentRate,
      rate: currentRate,
      bias: currentRate > 0.01 ? 'bullish' : currentRate < -0.01 ? 'bearish' : 'neutral'
    };
  } catch (error) {
    console.warn('Failed to fetch funding rate:', error);
    return null;
  }
}

// Fetch Long/Short Ratio from CoinGlass
async function fetchLongShortRatio(symbol: string): Promise<any> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return { current: { ratio: 1.0 }, ratio: 1.0 };
  
  try {
    const base = symbol.replace('USDT', '');
    const url = `https://open-api-v3.coinglass.com/api/futures/globalLongShortAccountRatio/history?exchange=Binance&symbol=${base}&interval=1h&limit=24`;
    const response = await fetch(url, {
      headers: { 'CG-API-KEY': apiKey, 'accept': 'application/json' }
    });
    if (!response.ok) return { current: { ratio: 1.0 }, ratio: 1.0 };
    const data = await response.json();
    if (data.code !== '0') return { current: { ratio: 1.0 }, ratio: 1.0 };
    
    const history = data.data?.map((item: any) => ({
      timestamp: item.t || item.time,
      ratio: parseFloat(item.longRate || 0.5) / parseFloat(item.shortRate || 0.5)
    })) || [];
    
    const currentRatio = history.length > 0 ? history[history.length - 1].ratio : 1.0;
    
    return {
      history,
      current: { ratio: currentRatio },
      ratio: currentRatio
    };
  } catch (error) {
    console.warn('Failed to fetch L/S ratio:', error);
    return { current: { ratio: 1.0 }, ratio: 1.0 };
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
    
    // Fetch all data directly from external APIs in parallel
    const [binanceData, openInterest, fundingRate, longShortRatio] = await Promise.all([
      fetchBinanceOHLCV(symbol, interval, 100).catch(() => []),
      fetchOpenInterest(symbol),
      fetchFundingRate(symbol),
      fetchLongShortRatio(symbol)
    ]);
    
    // Calculate CVD from Binance delta data
    let cumulativeDelta = 0;
    const cvdData = binanceData.map((candle: any) => {
      cumulativeDelta += candle.delta;
      return {
        time: Math.floor(candle.timestamp / 1000),
        value: cumulativeDelta,
        delta: candle.delta,
        color: candle.delta >= 0 ? 'green' : 'red'
      };
    });
    
    res.json({
      cvd: cvdData,
      openInterest: openInterest || { history: [], current: null, delta: 0, trend: 'neutral' },
      fundingRate: fundingRate || { history: [], current: null, rate: 0, bias: 'neutral' },
      longShortRatio: longShortRatio || { current: { ratio: 1.0 }, ratio: 1.0 },
      symbol,
      interval,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('❌ Error fetching professional orderflow:', error);
    res.status(500).json({
      error: 'Failed to fetch professional orderflow data',
      details: error.message
    });
  }
}
