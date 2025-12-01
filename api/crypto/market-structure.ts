import type { VercelRequest, VercelResponse } from '@vercel/node';
import { calculateATR, CandleData } from '../lib/indicators';

interface SwingPoint {
  index: number;
  time: number;
  price: number;
}

interface StructurePoint {
  type: string;
  time: number;
  price: number;
  index: number;
}

interface FVG {
  type: string;
  top: number;
  bottom: number;
  start_time: number;
  end_time: number;
  current_time: number;
  mitigated: boolean;
  size: number;
}

interface BOSChoCh {
  type: string;
  direction: string;
  time: number;
  price: number;
  broken_level: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { 
      symbol = 'XRPUSDT', 
      period = '1mo', 
      interval = '15m',
      mode = 'present',
      minBosPercent = '1.0',
      fvgFilter = 'true'
    } = req.query;
    
    const symbolStr = Array.isArray(symbol) ? symbol[0] : symbol;
    const intervalStr = Array.isArray(interval) ? interval[0] : interval;
    const modeStr = Array.isArray(mode) ? mode[0] : mode;
    const minBos = parseFloat(Array.isArray(minBosPercent) ? minBosPercent[0] : minBosPercent);
    const filterFVG = (Array.isArray(fvgFilter) ? fvgFilter[0] : fvgFilter) === 'true';
    
    const binanceSymbol = symbolStr.toUpperCase().replace('-USD', 'USDT').replace('-', '');
    const binanceInterval = convertInterval(intervalStr);
    
    const periodMs = parsePeriodToMs(period as string);
    const endTime = Date.now();
    const startTime = endTime - periodMs;
    
    const url = `https://api.binance.us/api/v3/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    
    console.log(`📊 Fetching market structure for ${binanceSymbol}`);
    
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
    
    const swings = findSwingPoints(candleData, 5, 5);
    const structure = classifyMarketStructure(swings.highs, swings.lows);
    
    const atrValues = calculateATR(candleData, 14);
    const atr = atrValues.length > 0 ? atrValues[atrValues.length - 1].value : 0;
    const minGapSize = filterFVG ? atr * 0.5 : 0;
    
    let fvgs = detectFVGs(candleData, minGapSize);
    let bosChoch = detectBOSChoCh(candleData, swings.highs, swings.lows);
    
    if (minBos > 0) {
      bosChoch = bosChoch.filter(event => {
        const pctChange = Math.abs((event.price - event.broken_level) / event.broken_level * 100);
        return pctChange >= minBos;
      });
    }
    
    if (modeStr.toLowerCase() === 'present') {
      const filteredResult = filterPresentMode(structure, bosChoch, fvgs);
      const result = {
        symbol: binanceSymbol,
        period,
        interval: intervalStr,
        mode: modeStr,
        swing_highs: swings.highs,
        swing_lows: swings.lows,
        market_structure: filteredResult.structure,
        fvgs: filteredResult.fvgs,
        bos_choch: filteredResult.bosChoch,
        stats: {
          total_structure_points: filteredResult.structure.length,
          total_bos_choch: filteredResult.bosChoch.length,
          total_fvgs: filteredResult.fvgs.length,
          active_fvgs: filteredResult.fvgs.filter(f => !f.mitigated).length,
          bullish_fvgs: filteredResult.fvgs.filter(f => f.type === 'bullish').length,
          bearish_fvgs: filteredResult.fvgs.filter(f => f.type === 'bearish').length
        }
      };
      return res.status(200).json(result);
    }
    
    const result = {
      symbol: binanceSymbol,
      period,
      interval: intervalStr,
      mode: modeStr,
      swing_highs: swings.highs,
      swing_lows: swings.lows,
      market_structure: structure,
      fvgs,
      bos_choch: bosChoch,
      stats: {
        total_structure_points: structure.length,
        total_bos_choch: bosChoch.length,
        total_fvgs: fvgs.length,
        active_fvgs: fvgs.filter(f => !f.mitigated).length,
        bullish_fvgs: fvgs.filter(f => f.type === 'bullish').length,
        bearish_fvgs: fvgs.filter(f => f.type === 'bearish').length
      }
    };
    
    console.log(`✅ Market structure: ${structure.length} points, ${fvgs.length} FVGs, ${bosChoch.length} BOS/ChoCh`);
    return res.status(200).json(result);
    
  } catch (error: any) {
    console.error('Error analyzing market structure:', error);
    return res.status(500).json({ error: error.message });
  }
}

function findSwingPoints(data: CandleData[], leftBars: number, rightBars: number): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  
  for (let i = leftBars; i < data.length - rightBars; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (data[j].high >= data[i].high) isSwingHigh = false;
      if (data[j].low <= data[i].low) isSwingLow = false;
    }
    
    if (isSwingHigh) {
      swingHighs.push({ index: i, time: data[i].time, price: data[i].high });
    }
    if (isSwingLow) {
      swingLows.push({ index: i, time: data[i].time, price: data[i].low });
    }
  }
  
  return { highs: swingHighs, lows: swingLows };
}

function classifyMarketStructure(swingHighs: SwingPoint[], swingLows: SwingPoint[]): StructurePoint[] {
  const structure: StructurePoint[] = [];
  
  for (let i = 1; i < swingHighs.length; i++) {
    const type = swingHighs[i].price > swingHighs[i - 1].price ? 'HH' : 'LH';
    structure.push({
      type,
      time: swingHighs[i].time,
      price: swingHighs[i].price,
      index: swingHighs[i].index
    });
  }
  
  for (let i = 1; i < swingLows.length; i++) {
    const type = swingLows[i].price > swingLows[i - 1].price ? 'HL' : 'LL';
    structure.push({
      type,
      time: swingLows[i].time,
      price: swingLows[i].price,
      index: swingLows[i].index
    });
  }
  
  structure.sort((a, b) => a.index - b.index);
  return structure;
}

function detectFVGs(data: CandleData[], minGapSize: number): FVG[] {
  const fvgs: FVG[] = [];
  
  for (let i = 2; i < data.length; i++) {
    if (data[i - 2].high < data[i].low) {
      const gapSize = data[i].low - data[i - 2].high;
      if (gapSize >= minGapSize) {
        const top = data[i].low;
        const bottom = data[i - 2].high;
        
        let mitigated = false;
        for (let j = i + 1; j < data.length; j++) {
          if (data[j].low <= top && data[j].high >= bottom) {
            mitigated = true;
            break;
          }
        }
        
        fvgs.push({
          type: 'bullish',
          top,
          bottom,
          start_time: data[i - 2].time,
          end_time: data[i].time,
          current_time: data[i].time,
          mitigated,
          size: gapSize
        });
      }
    }
    
    if (data[i - 2].low > data[i].high) {
      const gapSize = data[i - 2].low - data[i].high;
      if (gapSize >= minGapSize) {
        const top = data[i - 2].low;
        const bottom = data[i].high;
        
        let mitigated = false;
        for (let j = i + 1; j < data.length; j++) {
          if (data[j].low <= top && data[j].high >= bottom) {
            mitigated = true;
            break;
          }
        }
        
        fvgs.push({
          type: 'bearish',
          top,
          bottom,
          start_time: data[i - 2].time,
          end_time: data[i].time,
          current_time: data[i].time,
          mitigated,
          size: gapSize
        });
      }
    }
  }
  
  return fvgs;
}

function detectBOSChoCh(data: CandleData[], swingHighs: SwingPoint[], swingLows: SwingPoint[]): BOSChoCh[] {
  const bosChoch: BOSChoCh[] = [];
  
  for (let i = 2; i < swingHighs.length; i++) {
    const currHigh = swingHighs[i];
    const maxPrevHigh = swingHighs.slice(0, i).reduce((max, h) => h.price > max.price ? h : max);
    
    if (currHigh.price > maxPrevHigh.price) {
      bosChoch.push({
        type: 'BOS',
        direction: 'bullish',
        time: currHigh.time,
        price: currHigh.price,
        broken_level: maxPrevHigh.price
      });
    }
  }
  
  for (let i = 2; i < swingLows.length; i++) {
    const currLow = swingLows[i];
    const minPrevLow = swingLows.slice(0, i).reduce((min, l) => l.price < min.price ? l : min);
    
    if (currLow.price < minPrevLow.price) {
      bosChoch.push({
        type: 'BOS',
        direction: 'bearish',
        time: currLow.time,
        price: currLow.price,
        broken_level: minPrevLow.price
      });
    }
  }
  
  bosChoch.sort((a, b) => a.time - b.time);
  return bosChoch;
}

function filterPresentMode(structure: StructurePoint[], bosChoch: BOSChoCh[], fvgs: FVG[]): { structure: StructurePoint[]; bosChoch: BOSChoCh[]; fvgs: FVG[] } {
  return {
    structure: structure.slice(-10),
    bosChoch: bosChoch.slice(-5),
    fvgs: fvgs.filter(f => !f.mitigated)
  };
}

function parsePeriodToMs(period: string): number {
  if (period.endsWith('mo')) return parseInt(period) * 30 * 24 * 60 * 60 * 1000;
  if (period.endsWith('y')) return parseInt(period) * 365 * 24 * 60 * 60 * 1000;
  if (period.endsWith('d')) return parseInt(period) * 24 * 60 * 60 * 1000;
  if (period.endsWith('wk')) return parseInt(period) * 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function convertInterval(interval: string): string {
  const map: { [key: string]: string } = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d', '1wk': '1w', '1mo': '1M'
  };
  return map[interval] || '15m';
}
