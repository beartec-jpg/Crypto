import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ExchangeConfig {
  id: string;
  name: string;
  priority: number;
  fetchTrades: (symbol: string) => Promise<{ timestamp: number; side: string; amount: number; price: number }[]>;
}

// Direct REST API calls to each exchange
async function fetchBinanceUSTrades(symbol: string): Promise<{ timestamp: number; side: string; amount: number; price: number }[]> {
  const formattedSymbol = symbol.replace('/', '');
  const url = `https://api.binance.us/api/v3/trades?symbol=${formattedSymbol}&limit=500`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance US error: ${response.status}`);
  const trades = await response.json();
  return trades.map((t: any) => ({
    timestamp: t.time,
    side: t.isBuyerMaker ? 'sell' : 'buy',
    amount: parseFloat(t.qty),
    price: parseFloat(t.price),
  }));
}

async function fetchOKXTrades(symbol: string): Promise<{ timestamp: number; side: string; amount: number; price: number }[]> {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const instId = `${base}-USDT`;
  const url = `https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=100`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OKX error: ${response.status}`);
  const data = await response.json();
  if (!data.data) throw new Error('OKX: No data');
  return data.data.map((t: any) => ({
    timestamp: parseInt(t.ts),
    side: t.side,
    amount: parseFloat(t.sz),
    price: parseFloat(t.px),
  }));
}

async function fetchGateIOTrades(symbol: string): Promise<{ timestamp: number; side: string; amount: number; price: number }[]> {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const currencyPair = `${base}_USDT`;
  const url = `https://api.gateio.ws/api/v4/spot/trades?currency_pair=${currencyPair}&limit=100`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gate.io error: ${response.status}`);
  const trades = await response.json();
  return trades.map((t: any) => ({
    timestamp: parseInt(t.create_time_ms),
    side: t.side,
    amount: parseFloat(t.amount),
    price: parseFloat(t.price),
  }));
}

async function fetchKrakenTrades(symbol: string): Promise<{ timestamp: number; side: string; amount: number; price: number }[]> {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const pair = `${base}USD`;
  const url = `https://api.kraken.com/0/public/Trades?pair=${pair}&count=100`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Kraken error: ${response.status}`);
  const data = await response.json();
  if (data.error?.length) throw new Error(`Kraken: ${data.error[0]}`);
  const pairKey = Object.keys(data.result).find(k => k !== 'last');
  if (!pairKey) throw new Error('Kraken: No pair data');
  return data.result[pairKey].map((t: any) => ({
    timestamp: Math.floor(parseFloat(t[2]) * 1000),
    side: t[3] === 'b' ? 'buy' : 'sell',
    amount: parseFloat(t[1]),
    price: parseFloat(t[0]),
  }));
}

async function fetchKuCoinTrades(symbol: string): Promise<{ timestamp: number; side: string; amount: number; price: number }[]> {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const kcSymbol = `${base}-USDT`;
  const url = `https://api.kucoin.com/api/v1/market/histories?symbol=${kcSymbol}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`KuCoin error: ${response.status}`);
  const data = await response.json();
  if (!data.data) throw new Error('KuCoin: No data');
  return data.data.slice(0, 100).map((t: any) => ({
    timestamp: parseInt(t.time) / 1000000, // KuCoin uses nanoseconds - convert to ms
    side: t.side,
    amount: parseFloat(t.size),
    price: parseFloat(t.price),
  }));
}

async function fetchCoinbaseTrades(symbol: string): Promise<{ timestamp: number; side: string; amount: number; price: number }[]> {
  const base = symbol.replace('USDT', '').replace('USD', '');
  const productId = `${base}-USD`;
  const url = `https://api.exchange.coinbase.com/products/${productId}/trades?limit=100`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Coinbase error: ${response.status}`);
  const trades = await response.json();
  return trades.map((t: any) => ({
    timestamp: new Date(t.time).getTime(),
    side: t.side,
    amount: parseFloat(t.size),
    price: parseFloat(t.price),
  }));
}

const EXCHANGES: ExchangeConfig[] = [
  { id: 'binanceus', name: 'Binance US', priority: 1.0, fetchTrades: fetchBinanceUSTrades },
  { id: 'okx', name: 'OKX', priority: 0.9, fetchTrades: fetchOKXTrades },
  { id: 'gateio', name: 'Gate.io', priority: 0.85, fetchTrades: fetchGateIOTrades },
  { id: 'kraken', name: 'Kraken', priority: 0.8, fetchTrades: fetchKrakenTrades },
  { id: 'kucoin', name: 'KuCoin', priority: 0.75, fetchTrades: fetchKuCoinTrades },
  { id: 'coinbase', name: 'Coinbase', priority: 0.7, fetchTrades: fetchCoinbaseTrades },
];

function calculateDelta(trades: any[], intervalMs: number): Map<number, { buyVol: number; sellVol: number; delta: number; totalVol: number; tradeCount: number }> {
  const candles = new Map<number, { buyVol: number; sellVol: number; delta: number; totalVol: number; tradeCount: number }>();
  
  for (const trade of trades) {
    const candleTs = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    
    if (!candles.has(candleTs)) {
      candles.set(candleTs, { buyVol: 0, sellVol: 0, delta: 0, totalVol: 0, tradeCount: 0 });
    }
    
    const candle = candles.get(candleTs)!;
    if (trade.side === 'buy') {
      candle.buyVol += trade.amount;
    } else {
      candle.sellVol += trade.amount;
    }
    candle.totalVol += trade.amount;
    candle.tradeCount += 1;
    candle.delta = candle.buyVol - candle.sellVol;
  }
  
  return candles;
}

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
    const INTERVAL_MS: Record<string, number> = {
      '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
      '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000,
      '6h': 21600000, '12h': 43200000, '1d': 86400000
    };

    const symbol = (req.query.symbol as string)?.toUpperCase() || 'XRPUSDT';
    const interval = (req.query.interval as string) || '15m';

    if (!ALLOWED_SYMBOLS.includes(symbol)) {
      return res.status(400).json({ 
        error: 'Invalid symbol',
        message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
      });
    }

    const intervalMs = INTERVAL_MS[interval] || 900000;

    // Fetch from all exchanges in parallel with timeout
    const exchangeResults = await Promise.allSettled(
      EXCHANGES.map(async (exchange) => {
        const startTime = Date.now();
        try {
          const trades = await Promise.race([
            exchange.fetchTrades(symbol),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
          ]);
          return {
            exchange,
            success: true,
            trades,
            responseTime: Date.now() - startTime,
            error: undefined,
          };
        } catch (error: any) {
          return {
            exchange,
            success: false,
            trades: [],
            responseTime: Date.now() - startTime,
            error: error.message?.substring(0, 100),
          };
        }
      })
    );

    // Collect successful results
    const exchangeDeltas: { exchange: ExchangeConfig; deltas: Map<number, any> }[] = [];
    const metadata: any[] = [];

    for (const result of exchangeResults) {
      if (result.status === 'fulfilled') {
        const { exchange, success, trades, responseTime, error } = result.value;
        metadata.push({
          exchange_id: exchange.id,
          exchange: exchange.name,
          success,
          trades_count: trades.length,
          response_time_ms: responseTime,
          error,
          retries: 0,
        });

        if (success && trades.length > 0) {
          const deltas = calculateDelta(trades, intervalMs);
          if (deltas.size > 0) {
            exchangeDeltas.push({ exchange, deltas });
          }
        }
      }
    }

    // Calculate volume-weighted average across exchanges
    const allTimestamps = new Set<number>();
    for (const { deltas } of exchangeDeltas) {
      for (const ts of deltas.keys()) {
        allTimestamps.add(ts);
      }
    }

    const footprint: any[] = [];
    const cvdData: any[] = [];
    const orderflowTable: any[] = [];
    let cumulativeDelta = 0;

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    for (const timestamp of sortedTimestamps) {
      let totalWeightedDelta = 0;
      let totalWeight = 0;
      let totalVolume = 0;
      const exchangeParticipation: { name: string; delta: number; volume: number }[] = [];

      for (const { exchange, deltas } of exchangeDeltas) {
        const candle = deltas.get(timestamp);
        if (candle) {
          const weight = candle.totalVol * exchange.priority;
          totalWeightedDelta += candle.delta * weight;
          totalWeight += weight;
          totalVolume += candle.totalVol;
          exchangeParticipation.push({
            name: exchange.name,
            delta: candle.delta,
            volume: candle.totalVol,
          });
        }
      }

      if (totalWeight > 0) {
        const avgDelta = totalWeightedDelta / totalWeight;
        cumulativeDelta += avgDelta;
        const exchangeCount = exchangeParticipation.length;

        footprint.push({
          time: Math.floor(timestamp / 1000),
          delta: avgDelta,
          volume: totalVolume,
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

        // Add to orderflow table (for display)
        const buyVol = exchangeParticipation.reduce((sum, e) => sum + (e.delta > 0 ? e.volume : 0), 0);
        const sellVol = exchangeParticipation.reduce((sum, e) => sum + (e.delta < 0 ? e.volume : 0), 0);
        
        orderflowTable.push({
          time: Math.floor(timestamp / 1000),
          buyVol,
          sellVol,
          delta: avgDelta,
          volume: totalVolume,
          exchanges: exchangeCount,
          confidence: Math.min(1.0, exchangeCount / EXCHANGES.length),
        });
      }
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
