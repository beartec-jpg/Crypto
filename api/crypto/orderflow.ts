import type { VercelRequest, VercelResponse } from '@vercel/node';
import { calculateVWAP, CandleData } from '../lib/_indicators';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'XRPUSDT', period = '1mo', interval = '15m' } = req.query;
    
    const symbolStr = Array.isArray(symbol) ? symbol[0] : symbol;
    const intervalStr = Array.isArray(interval) ? interval[0] : interval;
    
    const binanceSymbol = symbolStr.toUpperCase().replace('-USD', 'USDT').replace('-', '');
    
    const periodMs = parsePeriodToMs(period as string);
    const intervalMs = parseIntervalToMs(intervalStr);
    const endTime = Date.now();
    const startTime = endTime - periodMs;
    
    console.log(`📊 Fetching orderflow for ${binanceSymbol}`);
    
    const trades = await fetchBinanceTrades(binanceSymbol, startTime, endTime);
    
    if (!trades.length) {
      return res.status(200).json({
        footprint: [],
        cvd: [],
        vwaps: { session: [] },
        vrvp: { profile: [], poc: 0, valueAreaHigh: 0, valueAreaLow: 0 },
        orderflowTable: []
      });
    }
    
    console.log(`📊 Fetched ${trades.length} trades`);
    
    const candles = aggregateTradesToCandles(trades, intervalMs);
    const cvd = calculateCVD(candles);
    const vwapData = calculateVWAP(candles);
    const orderflowTable = buildOrderflowTable(candles);
    const vrvp = calculateVRVP(candles);
    
    const result = {
      footprint: [],
      cvd,
      vwaps: { session: vwapData },
      vrvp,
      orderflowTable,
      divergences: []
    };
    
    console.log(`✅ Orderflow: ${candles.length} candles, ${cvd.length} CVD points`);
    return res.status(200).json(result);
    
  } catch (error: any) {
    console.error('Error fetching orderflow:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function fetchBinanceTrades(symbol: string, startTime: number, endTime: number): Promise<any[]> {
  const url = 'https://api.binance.us/api/v3/aggTrades';
  const allTrades: any[] = [];
  let currentStart = startTime;
  
  const maxIterations = 10;
  let iterations = 0;
  
  while (currentStart < endTime && iterations < maxIterations) {
    iterations++;
    const params = new URLSearchParams({
      symbol,
      startTime: currentStart.toString(),
      endTime: endTime.toString(),
      limit: '1000'
    });
    
    try {
      const response = await fetch(`${url}?${params}`);
      if (!response.ok) break;
      
      const trades = await response.json();
      if (!trades.length) break;
      
      allTrades.push(...trades);
      currentStart = trades[trades.length - 1].T + 1;
      
      if (trades.length < 1000) break;
    } catch {
      break;
    }
  }
  
  return allTrades;
}

interface AggCandle extends CandleData {
  buyVolume: number;
  sellVolume: number;
  delta: number;
  trades: number;
}

function aggregateTradesToCandles(trades: any[], intervalMs: number): AggCandle[] {
  if (!trades.length) return [];
  
  const candleMap = new Map<number, AggCandle>();
  
  for (const trade of trades) {
    const timestamp = trade.T;
    const candleStart = Math.floor(timestamp / intervalMs) * intervalMs;
    const candleTime = Math.floor(candleStart / 1000);
    const price = parseFloat(trade.p);
    const qty = parseFloat(trade.q);
    const isBuyerMaker = trade.m;
    
    let candle = candleMap.get(candleTime);
    if (!candle) {
      candle = {
        time: candleTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        delta: 0,
        trades: 0
      };
      candleMap.set(candleTime, candle);
    }
    
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    candle.volume += qty;
    candle.trades++;
    
    if (isBuyerMaker) {
      candle.sellVolume += qty;
    } else {
      candle.buyVolume += qty;
    }
    candle.delta = candle.buyVolume - candle.sellVolume;
  }
  
  return Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
}

function calculateCVD(candles: AggCandle[]): { time: number; value: number; delta: number; color: string }[] {
  const result: { time: number; value: number; delta: number; color: string }[] = [];
  let cumulativeDelta = 0;
  let prevCVD = 0;
  
  for (const candle of candles) {
    cumulativeDelta += candle.delta;
    result.push({
      time: candle.time,
      value: cumulativeDelta,
      delta: candle.delta,
      color: cumulativeDelta > prevCVD ? 'green' : 'red'
    });
    prevCVD = cumulativeDelta;
  }
  
  return result;
}

function buildOrderflowTable(candles: AggCandle[]): any[] {
  const last10 = candles.slice(-10);
  return last10.map(c => ({
    time: c.time,
    buyVol: c.buyVolume,
    sellVol: c.sellVolume,
    delta: c.delta,
    volume: c.volume
  }));
}

function calculateVRVP(candles: AggCandle[]): { profile: any[]; poc: number; valueAreaHigh: number; valueAreaLow: number } {
  if (!candles.length) {
    return { profile: [], poc: 0, valueAreaHigh: 0, valueAreaLow: 0 };
  }
  
  const minPrice = Math.min(...candles.map(c => c.low));
  const maxPrice = Math.max(...candles.map(c => c.high));
  const priceRange = maxPrice - minPrice;
  
  if (priceRange === 0) {
    return { profile: [], poc: minPrice, valueAreaHigh: maxPrice, valueAreaLow: minPrice };
  }
  
  const numBins = Math.min(50, candles.length);
  const binSize = priceRange / numBins;
  const volumeProfile: { price: number; volume: number }[] = [];
  
  for (let i = 0; i < numBins; i++) {
    const binPrice = minPrice + (i + 0.5) * binSize;
    volumeProfile.push({ price: binPrice, volume: 0 });
  }
  
  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    if (candleRange === 0) {
      const binIdx = Math.floor((candle.close - minPrice) / binSize);
      if (binIdx >= 0 && binIdx < numBins) {
        volumeProfile[binIdx].volume += candle.volume;
      }
    } else {
      for (let i = 0; i < numBins; i++) {
        const binLow = minPrice + i * binSize;
        const binHigh = binLow + binSize;
        if (binLow <= candle.high && binHigh >= candle.low) {
          volumeProfile[i].volume += candle.volume / numBins;
        }
      }
    }
  }
  
  const poc = volumeProfile.reduce((max, curr) => curr.volume > max.volume ? curr : max).price;
  const totalVolume = volumeProfile.reduce((sum, p) => sum + p.volume, 0);
  const valueAreaVolume = totalVolume * 0.7;
  
  const pocIdx = volumeProfile.findIndex(p => p.price === poc);
  let currentVolume = volumeProfile[pocIdx]?.volume || 0;
  let lowIdx = pocIdx;
  let highIdx = pocIdx;
  
  while (currentVolume < valueAreaVolume && (lowIdx > 0 || highIdx < numBins - 1)) {
    const lowVol = lowIdx > 0 ? volumeProfile[lowIdx - 1].volume : 0;
    const highVol = highIdx < numBins - 1 ? volumeProfile[highIdx + 1].volume : 0;
    
    if (lowVol > highVol && lowIdx > 0) {
      lowIdx--;
      currentVolume += volumeProfile[lowIdx].volume;
    } else if (highIdx < numBins - 1) {
      highIdx++;
      currentVolume += volumeProfile[highIdx].volume;
    } else {
      break;
    }
  }
  
  return {
    profile: volumeProfile,
    poc,
    valueAreaHigh: volumeProfile[highIdx]?.price || maxPrice,
    valueAreaLow: volumeProfile[lowIdx]?.price || minPrice
  };
}

function parsePeriodToMs(period: string): number {
  if (period.endsWith('mo')) return parseInt(period) * 30 * 24 * 60 * 60 * 1000;
  if (period.endsWith('y')) return parseInt(period) * 365 * 24 * 60 * 60 * 1000;
  if (period.endsWith('d')) return parseInt(period) * 24 * 60 * 60 * 1000;
  if (period.endsWith('wk')) return parseInt(period) * 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function parseIntervalToMs(interval: string): number {
  const unit = interval.slice(-1);
  const value = parseInt(interval);
  
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}
