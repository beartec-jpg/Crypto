import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ExchangeConfig {
  id: string;
  name: string;
  priority: number;
  fetchOHLCV: (symbol: string, interval: string, since: number, limit: number) => Promise<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number; buyVolume: number; sellVolume: number; delta: number }[]>;
}

// Fetch OHLCV from Binance with taker buy/sell volume breakdown
async function fetchBinanceOHLCV(symbol: string, interval: string, since: number, limit: number) {
  const formattedSymbol = symbol.replace('/', '');
  const url = `https://api.binance.us/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&startTime=${since}&limit=${limit}`;
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

// Fetch OHLCV from OKX
async function fetchOKXOHLCV(symbol: string, interval: string, since: number, limit: number) {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const instId = `${base}-USDT`;
  const barMap: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D' };
  const bar = barMap[interval] || '15m';
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OKX error: ${response.status}`);
  const data = await response.json();
  if (!data.data) throw new Error('OKX: No data');
  
  // OKX returns [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
  return data.data.map((k: any) => {
    const volume = parseFloat(k[5]);
    // OKX doesn't provide taker volume, estimate 50/50
    return {
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume,
      buyVolume: volume * 0.5,
      sellVolume: volume * 0.5,
      delta: 0, // Unknown without taker data
    };
  }).reverse(); // OKX returns newest first
}

// Fetch OHLCV from Gate.io
async function fetchGateIOOHLCV(symbol: string, interval: string, since: number, limit: number) {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const currencyPair = `${base}_USDT`;
  const intervalMap: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d' };
  const gateInterval = intervalMap[interval] || '15m';
  const url = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${currencyPair}&interval=${gateInterval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gate.io error: ${response.status}`);
  const candles = await response.json();
  
  // Gate.io returns [timestamp, volume, close, high, low, open, amount]
  return candles.map((k: any) => {
    const volume = parseFloat(k[1]);
    return {
      timestamp: parseInt(k[0]) * 1000, // Gate.io uses seconds
      open: parseFloat(k[5]),
      high: parseFloat(k[3]),
      low: parseFloat(k[4]),
      close: parseFloat(k[2]),
      volume,
      buyVolume: volume * 0.5,
      sellVolume: volume * 0.5,
      delta: 0,
    };
  });
}

// Fetch OHLCV from Kraken
async function fetchKrakenOHLCV(symbol: string, interval: string, since: number, limit: number) {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const pair = `${base}USD`;
  const intervalMap: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
  const krakenInterval = intervalMap[interval] || 15;
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${krakenInterval}&since=${Math.floor(since / 1000)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Kraken error: ${response.status}`);
  const data = await response.json();
  if (data.error?.length) throw new Error(`Kraken: ${data.error[0]}`);
  const pairKey = Object.keys(data.result).find(k => k !== 'last');
  if (!pairKey) throw new Error('Kraken: No pair data');
  
  // Kraken returns [time, open, high, low, close, vwap, volume, count]
  return data.result[pairKey].slice(-limit).map((k: any) => {
    const volume = parseFloat(k[6]);
    return {
      timestamp: k[0] * 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume,
      buyVolume: volume * 0.5,
      sellVolume: volume * 0.5,
      delta: 0,
    };
  });
}

// Fetch OHLCV from KuCoin
async function fetchKuCoinOHLCV(symbol: string, interval: string, since: number, limit: number) {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const kcSymbol = `${base}-USDT`;
  const intervalMap: Record<string, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '1d': '1day' };
  const kcInterval = intervalMap[interval] || '15min';
  const url = `https://api.kucoin.com/api/v1/market/candles?type=${kcInterval}&symbol=${kcSymbol}&startAt=${Math.floor(since / 1000)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`KuCoin error: ${response.status}`);
  const data = await response.json();
  if (!data.data) throw new Error('KuCoin: No data');
  
  // KuCoin returns [time, open, close, high, low, volume, turnover]
  return data.data.slice(0, limit).map((k: any) => {
    const volume = parseFloat(k[5]);
    return {
      timestamp: parseInt(k[0]) * 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[3]),
      low: parseFloat(k[4]),
      close: parseFloat(k[2]),
      volume,
      buyVolume: volume * 0.5,
      sellVolume: volume * 0.5,
      delta: 0,
    };
  }).reverse(); // KuCoin returns newest first
}

// Fetch OHLCV from Coinbase
async function fetchCoinbaseOHLCV(symbol: string, interval: string, since: number, limit: number) {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const productId = `${base}-USD`;
  const granularityMap: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  const granularity = granularityMap[interval] || 900;
  const start = new Date(since).toISOString();
  const end = new Date(since + granularity * 1000 * limit).toISOString();
  const url = `https://api.exchange.coinbase.com/products/${productId}/candles?granularity=${granularity}&start=${start}&end=${end}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Coinbase error: ${response.status}`);
  const candles = await response.json();
  
  // Coinbase returns [time, low, high, open, close, volume]
  return candles.slice(-limit).map((k: any) => {
    const volume = parseFloat(k[5]);
    return {
      timestamp: k[0] * 1000,
      open: parseFloat(k[3]),
      high: parseFloat(k[2]),
      low: parseFloat(k[1]),
      close: parseFloat(k[4]),
      volume,
      buyVolume: volume * 0.5,
      sellVolume: volume * 0.5,
      delta: 0,
    };
  }).reverse(); // Coinbase returns newest first
}

const EXCHANGES: ExchangeConfig[] = [
  { id: 'binanceus', name: 'Binance US', priority: 1.0, fetchOHLCV: fetchBinanceOHLCV },
  { id: 'okx', name: 'OKX', priority: 0.9, fetchOHLCV: fetchOKXOHLCV },
  { id: 'gateio', name: 'Gate.io', priority: 0.85, fetchOHLCV: fetchGateIOOHLCV },
  { id: 'kraken', name: 'Kraken', priority: 0.8, fetchOHLCV: fetchKrakenOHLCV },
  { id: 'kucoin', name: 'KuCoin', priority: 0.75, fetchOHLCV: fetchKuCoinOHLCV },
  { id: 'coinbase', name: 'Coinbase', priority: 0.7, fetchOHLCV: fetchCoinbaseOHLCV },
];

const INTERVAL_MS: Record<string, number> = {
  '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
  '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000,
  '6h': 21600000, '12h': 43200000, '1d': 86400000
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ALLOWED_SYMBOLS = ['XRPUSDT', 'BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'];

    const symbol = (req.query.symbol as string)?.toUpperCase() || 'XRPUSDT';
    const interval = (req.query.interval as string) || '15m';

    if (!ALLOWED_SYMBOLS.includes(symbol)) {
      return res.status(400).json({ 
        error: 'Invalid symbol',
        message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
      });
    }

    const intervalMs = INTERVAL_MS[interval] || 900000;
    const since = Date.now() - intervalMs * 100; // Fetch last 100 candles
    const limit = 100;

    // Fetch OHLCV from all exchanges in parallel with timeout
    const exchangeResults = await Promise.allSettled(
      EXCHANGES.map(async (exchange) => {
        const startTime = Date.now();
        try {
          const candles = await Promise.race([
            exchange.fetchOHLCV(symbol, interval, since, limit),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
          ]);
          return {
            exchange,
            success: true,
            candles,
            responseTime: Date.now() - startTime,
            error: undefined,
          };
        } catch (error: any) {
          return {
            exchange,
            success: false,
            candles: [],
            responseTime: Date.now() - startTime,
            error: error.message?.substring(0, 100),
          };
        }
      })
    );

    // Collect successful results and aggregate by timestamp
    const candlesByTimestamp = new Map<number, { exchanges: string[]; totalDelta: number; totalVolume: number; weightedDelta: number; totalWeight: number }>();
    const metadata: any[] = [];

    for (const result of exchangeResults) {
      if (result.status === 'fulfilled') {
        const { exchange, success, candles, responseTime, error } = result.value;
        metadata.push({
          exchange_id: exchange.id,
          exchange: exchange.name,
          success,
          candles_count: candles.length,
          response_time_ms: responseTime,
          error,
        });

        if (success && candles.length > 0) {
          for (const candle of candles) {
            // Normalize timestamp to interval boundary
            const normalizedTs = Math.floor(candle.timestamp / intervalMs) * intervalMs;
            
            if (!candlesByTimestamp.has(normalizedTs)) {
              candlesByTimestamp.set(normalizedTs, {
                exchanges: [],
                totalDelta: 0,
                totalVolume: 0,
                weightedDelta: 0,
                totalWeight: 0,
              });
            }
            
            const agg = candlesByTimestamp.get(normalizedTs)!;
            agg.exchanges.push(exchange.name);
            agg.totalDelta += candle.delta;
            agg.totalVolume += candle.volume;
            agg.weightedDelta += candle.delta * candle.volume * exchange.priority;
            agg.totalWeight += candle.volume * exchange.priority;
          }
        }
      }
    }

    // Build output arrays
    const footprint: any[] = [];
    const cvdData: any[] = [];
    const orderflowTable: any[] = [];
    let cumulativeDelta = 0;

    const sortedTimestamps = Array.from(candlesByTimestamp.keys()).sort((a, b) => a - b);

    for (const timestamp of sortedTimestamps) {
      const agg = candlesByTimestamp.get(timestamp)!;
      const exchangeCount = new Set(agg.exchanges).size;
      const avgDelta = agg.totalWeight > 0 ? agg.weightedDelta / agg.totalWeight : 0;
      cumulativeDelta += avgDelta;

      footprint.push({
        time: Math.floor(timestamp / 1000),
        delta: avgDelta,
        volume: agg.totalVolume,
        exchanges: exchangeCount,
        confidence: Math.min(1.0, exchangeCount / EXCHANGES.length),
        divergence: false,
      });

      cvdData.push({
        time: Math.floor(timestamp / 1000),
        value: cumulativeDelta,
        delta: avgDelta,
        color: avgDelta >= 0 ? 'green' : 'red',
        confidence: Math.min(1.0, exchangeCount / EXCHANGES.length),
      });

      orderflowTable.push({
        time: Math.floor(timestamp / 1000),
        buyVol: agg.totalVolume * 0.5 + avgDelta * 0.5,
        sellVol: agg.totalVolume * 0.5 - avgDelta * 0.5,
        delta: avgDelta,
        volume: agg.totalVolume,
        exchanges: exchangeCount,
        confidence: Math.min(1.0, exchangeCount / EXCHANGES.length),
      });
    }

    // Calculate divergences
    const divergences: any[] = [];
    for (let i = 5; i < cvdData.length; i++) {
      const priceChange = cvdData[i].value - cvdData[i-5].value;
      const deltaSum = cvdData.slice(i-5, i+1).reduce((sum: number, c: any) => sum + c.delta, 0);
      
      if ((priceChange > 0 && deltaSum < 0) || (priceChange < 0 && deltaSum > 0)) {
        divergences.push({
          time: cvdData[i].time,
          type: priceChange > 0 ? 'bearish' : 'bullish',
          cvd: cvdData[i].value,
        });
      }
    }

    const successfulExchanges = metadata.filter(m => m.success).length;
    const avgResponseTime = metadata.length > 0 
      ? metadata.reduce((sum, m) => sum + m.response_time_ms, 0) / metadata.length 
      : 0;

    res.json({
      footprint: footprint.slice(-100),
      cvd: cvdData.slice(-100),
      orderflowTable: orderflowTable.slice(-20),
      divergences,
      metadata: {
        symbol,
        interval,
        exchanges: metadata,
        success_rate: successfulExchanges / EXCHANGES.length,
        avg_response_time_ms: avgResponseTime,
        total_candles: footprint.length,
        exchanges_responding: successfulExchanges,
        total_exchanges: EXCHANGES.length,
      }
    });

  } catch (error: any) {
    console.error('Multi-exchange orderflow error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch multi-exchange orderflow',
      details: error.message 
    });
  }
}
