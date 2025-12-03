import type { VercelRequest, VercelResponse } from '@vercel/node';

interface LiquidationEvent {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
  exchange: string;
}

interface HeatmapLevel {
  price: number;
  longVolume: number;
  shortVolume: number;
  totalVolume: number;
}

async function fetchBinanceLiquidations(symbol: string, limit: number): Promise<LiquidationEvent[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Binance API error:', response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    return data.map((order: any) => ({
      symbol: order.symbol,
      side: order.side,
      price: parseFloat(order.price),
      quantity: parseFloat(order.origQty),
      timestamp: order.time,
      exchange: 'binance'
    }));
  } catch (error) {
    console.error('Error fetching Binance liquidations:', error);
    return [];
  }
}

async function fetchBybitLiquidations(symbol: string): Promise<LiquidationEvent[]> {
  try {
    const bybitSymbol = symbol.replace('USDT', '');
    const url = `https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${bybitSymbol}USDT&limit=50`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Bybit API error:', response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list) {
      return [];
    }
    
    return data.result.list
      .filter((trade: any) => trade.isBlockTrade === false)
      .slice(0, 25)
      .map((trade: any) => ({
        symbol: symbol,
        side: trade.side === 'Buy' ? 'BUY' : 'SELL',
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.size),
        timestamp: parseInt(trade.time),
        exchange: 'bybit'
      }));
  } catch (error) {
    console.error('Error fetching Bybit data:', error);
    return [];
  }
}

function buildHeatmap(events: LiquidationEvent[], currentPrice: number): HeatmapLevel[] {
  const priceRange = currentPrice * 0.05;
  const levels = 20;
  const levelSize = (priceRange * 2) / levels;
  
  const heatmap: Map<number, HeatmapLevel> = new Map();
  
  for (let i = 0; i < levels; i++) {
    const price = currentPrice - priceRange + (i * levelSize);
    const roundedPrice = Math.round(price * 100) / 100;
    heatmap.set(roundedPrice, {
      price: roundedPrice,
      longVolume: 0,
      shortVolume: 0,
      totalVolume: 0
    });
  }
  
  events.forEach(event => {
    const nearestLevel = Array.from(heatmap.keys())
      .reduce((prev, curr) => 
        Math.abs(curr - event.price) < Math.abs(prev - event.price) ? curr : prev
      );
    
    const level = heatmap.get(nearestLevel);
    if (level) {
      if (event.side === 'SELL') {
        level.longVolume += event.quantity;
      } else {
        level.shortVolume += event.quantity;
      }
      level.totalVolume = level.longVolume + level.shortVolume;
    }
  });
  
  return Array.from(heatmap.values()).filter(l => l.totalVolume > 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'BTCUSDT', limit = '100', exchange = 'all' } = req.query;
    const symbolStr = String(symbol);
    const limitNum = Math.min(parseInt(String(limit)), 500);
    const exchangeFilter = String(exchange);

    console.log(`📊 Fetching liquidations for ${symbolStr}, limit: ${limitNum}, exchange: ${exchangeFilter}`);

    let events: LiquidationEvent[] = [];

    if (exchangeFilter === 'all' || exchangeFilter === 'binance') {
      const binanceEvents = await fetchBinanceLiquidations(symbolStr, limitNum);
      events = events.concat(binanceEvents);
    }

    if (exchangeFilter === 'all' || exchangeFilter === 'bybit') {
      const bybitEvents = await fetchBybitLiquidations(symbolStr);
      events = events.concat(bybitEvents);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);
    events = events.slice(0, limitNum);

    const currentPrice = events.length > 0 ? events[0].price : 0;
    const heatmap = buildHeatmap(events, currentPrice);

    const totalLongs = events.filter(e => e.side === 'SELL').reduce((sum, e) => sum + e.quantity, 0);
    const totalShorts = events.filter(e => e.side === 'BUY').reduce((sum, e) => sum + e.quantity, 0);

    return res.status(200).json({
      symbol: symbolStr,
      events,
      heatmap,
      summary: {
        totalEvents: events.length,
        totalLongs,
        totalShorts,
        ratio: totalLongs > 0 ? totalShorts / totalLongs : 0,
        binance: events.filter(e => e.exchange === 'binance').length,
        bybit: events.filter(e => e.exchange === 'bybit').length
      }
    });
  } catch (error: any) {
    console.error('Error in liquidations handler:', error);
    return res.status(500).json({ 
      error: error.message,
      events: [],
      heatmap: [],
      summary: { totalEvents: 0, totalLongs: 0, totalShorts: 0, ratio: 0, binance: 0, bybit: 0 }
    });
  }
}
