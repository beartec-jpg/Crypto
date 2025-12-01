import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  CandleData
} from '../../server/lib/indicators';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'XRPUSDT', period = '3mo', interval = '1d' } = req.query;
    
    const symbolStr = Array.isArray(symbol) ? symbol[0] : symbol;
    const intervalStr = Array.isArray(interval) ? interval[0] : interval;
    
    const binanceSymbol = symbolStr.toUpperCase().replace('-USD', 'USDT').replace('-', '');
    
    const periodMs = parsePeriodToMs(period as string);
    const endTime = Date.now();
    const startTime = endTime - periodMs;
    
    const binanceInterval = convertInterval(intervalStr);
    
    const url = `https://api.binance.us/api/v3/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    
    console.log('📊 Fetching from Binance:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const klines = await response.json();
    
    const candleData: CandleData[] = klines.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
    
    const sma20 = calculateSMA(candleData, 20);
    const sma50 = calculateSMA(candleData, 50);
    const ema12 = calculateEMA(candleData, 12);
    const ema26 = calculateEMA(candleData, 26);
    const rsi14 = calculateRSI(candleData, 14);
    const { macd, signal: macdSignal, histogram: macdHistogram } = calculateMACD(candleData);
    const { upper: bbUpper, middle: bbMiddle, lower: bbLower } = calculateBollingerBands(candleData);
    
    const result = {
      symbol: binanceSymbol,
      period,
      interval: intervalStr,
      candlestick: candleData.map(c => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      })),
      volume: candleData.map(c => ({
        time: c.time,
        value: c.volume
      })),
      indicators: {
        sma_20: sma20,
        sma_50: sma50,
        ema_12: ema12,
        ema_26: ema26,
        rsi_14: rsi14,
        macd: macd,
        macd_signal: macdSignal,
        macd_histogram: macdHistogram,
        bb_upper: bbUpper,
        bb_middle: bbMiddle,
        bb_lower: bbLower
      }
    };
    
    console.log(`✅ Crypto data: ${candleData.length} candles`);
    return res.status(200).json(result);
    
  } catch (error: any) {
    console.error('Error fetching crypto data:', error);
    return res.status(500).json({ error: error.message });
  }
}

function parsePeriodToMs(period: string): number {
  if (period.endsWith('mo')) {
    return parseInt(period) * 30 * 24 * 60 * 60 * 1000;
  } else if (period.endsWith('y')) {
    return parseInt(period) * 365 * 24 * 60 * 60 * 1000;
  } else if (period.endsWith('d')) {
    return parseInt(period) * 24 * 60 * 60 * 1000;
  } else if (period.endsWith('wk')) {
    return parseInt(period) * 7 * 24 * 60 * 60 * 1000;
  }
  return 30 * 24 * 60 * 60 * 1000;
}

function convertInterval(interval: string): string {
  const map: { [key: string]: string } = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d', '1wk': '1w', '1mo': '1M'
  };
  return map[interval] || '1d';
}
