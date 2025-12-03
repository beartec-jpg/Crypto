import type { VercelRequest, VercelResponse } from '@vercel/node';

interface LiquidationEvent {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
  exchange: 'binance' | 'bybit';
}

interface HeatmapData {
  price: number;
  longs: number;
  shorts: number;
  totalVolume: number;
  netSide: 'long' | 'short';
  exchanges: string[];
}

async function fetchBinanceLiquidations(symbol: string, limit: number): Promise<LiquidationEvent[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Binance API error:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('Binance returned non-array data');
      return [];
    }
    
    return data.map((order: any) => ({
      symbol: order.symbol,
      side: order.side as 'BUY' | 'SELL',
      price: parseFloat(order.price),
      quantity: parseFloat(order.origQty),
      timestamp: order.time,
      exchange: 'binance' as const
    }));
  } catch (error) {
    console.error('Error fetching Binance liquidations:', error);
    return [];
  }
}

async function fetchBybitLiquidations(symbol: string): Promise<LiquidationEvent[]> {
  try {
    const bybitSymbol = symbol.replace('USDT', '');
    const url = `https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${bybitSymbol}USDT&limit=100`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Bybit API error:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list) {
      return [];
    }

    return data.result.list
      .filter((trade: any) => parseFloat(trade.size) > 0.1)
      .slice(0, 50)
      .map((trade: any) => ({
        symbol: symbol,
        side: trade.side === 'Buy' ? 'BUY' as const : 'SELL' as const,
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.size),
        timestamp: parseInt(trade.time),
        exchange: 'bybit' as const
      }));
  } catch (error) {
    console.error('Error fetching Bybit data:', error);
    return [];
  }
}

async function getCurrentPrice(symbol: string): Promise<number> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    if (!response.ok) return 0;
    const data = await response.json();
    return parseFloat(data.price) || 0;
  } catch {
    return 0;
  }
}

function buildHeatmap(events: LiquidationEvent[], currentPrice: number): HeatmapData[] {
  if (currentPrice <= 0 || events.length === 0) {
    return [];
  }

  const priceRange = currentPrice * 0.05;
  const levels = 20;
  const levelSize = (priceRange * 2) / levels;
  
  const heatmapMap: Map<number, { longs: number; shorts: number; exchanges: Set<string> }> = new Map();
  
  for (let i = 0; i < levels; i++) {
    const price = currentPrice - priceRange + (i * levelSize);
    const roundedPrice = Math.round(price * 100) / 100;
    heatmapMap.set(roundedPrice, { longs: 0, shorts: 0, exchanges: new Set() });
  }
  
  const priceKeys = Array.from(heatmapMap.keys());
  
  events.forEach(event => {
    if (priceKeys.length === 0) return;
    
    const nearestLevel = priceKeys.reduce((prev, curr) => 
      Math.abs(curr - event.price) < Math.abs(prev - event.price) ? curr : prev
    );
    
    const level = heatmapMap.get(nearestLevel);
    if (level) {
      if (event.side === 'SELL') {
        level.longs += event.quantity;
      } else {
        level.shorts += event.quantity;
      }
      level.exchanges.add(event.exchange);
    }
  });
  
  const result: HeatmapData[] = [];
  
  heatmapMap.forEach((data, price) => {
    const totalVolume = data.longs + data.shorts;
    if (totalVolume > 0) {
      result.push({
        price,
        longs: data.longs,
        shorts: data.shorts,
        totalVolume,
        netSide: data.longs >= data.shorts ? 'long' : 'short',
        exchanges: Array.from(data.exchanges)
      });
    }
  });
  
  return result.sort((a, b) => a.price - b.price);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'BTCUSDT', limit = '100', exchange = 'all' } = req.query;
    const symbolStr = String(symbol);
    const limitNum = Math.min(parseInt(String(limit)) || 100, 500);
    const exchangeFilter = String(exchange);

    console.log(`Fetching liquidations for ${symbolStr}, limit: ${limitNum}, exchange: ${exchangeFilter}`);

    let events: LiquidationEvent[] = [];

    const fetchPromises: Promise<LiquidationEvent[]>[] = [];

    if (exchangeFilter === 'all' || exchangeFilter === 'binance') {
      fetchPromises.push(fetchBinanceLiquidations(symbolStr, limitNum));
    }

    if (exchangeFilter === 'all' || exchangeFilter === 'bybit') {
      fetchPromises.push(fetchBybitLiquidations(symbolStr));
    }

    const results = await Promise.all(fetchPromises);
    events = results.flat();

    events.sort((a, b) => b.timestamp - a.timestamp);
    events = events.slice(0, limitNum);

    const binanceCount = events.filter(e => e.exchange === 'binance').length;
    const bybitCount = events.filter(e => e.exchange === 'bybit').length;

    let currentPrice = events.length > 0 ? events[0].price : 0;
    if (currentPrice === 0) {
      currentPrice = await getCurrentPrice(symbolStr);
    }

    const heatmap = buildHeatmap(events, currentPrice);

    const oneMinuteAgo = Date.now() - 60000;
    const recentCount = events.filter(e => e.timestamp > oneMinuteAgo).length;

    return res.status(200).json({
      symbol: symbolStr,
      exchange: exchangeFilter,
      timestamp: Date.now(),
      events,
      heatmap,
      totalEvents: events.length,
      recentCount,
      exchangeStats: {
        binance: binanceCount,
        bybit: bybitCount
      }
    });
  } catch (error: any) {
    console.error('Error in liquidations handler:', error);
    return res.status(200).json({ 
      symbol: String(req.query.symbol || 'BTCUSDT'),
      exchange: String(req.query.exchange || 'all'),
      timestamp: Date.now(),
      events: [],
      heatmap: [],
      totalEvents: 0,
      recentCount: 0,
      exchangeStats: { binance: 0, bybit: 0 },
      error: error.message
    });
  }
}
