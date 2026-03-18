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

interface SourceDiagnostic {
  source: 'binance' | 'bybit';
  ok: boolean;
  status: number | null;
  count: number;
  error?: string;
}

async function fetchBinanceLiquidations(
  symbol: string,
  limit: number,
): Promise<{ events: LiquidationEvent[]; diagnostic: SourceDiagnostic }> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errText = await response.text().catch(() => 'binance_non_200');
      const error = errText.includes('out of maintenance')
        ? 'binance_force_orders_endpoint_maintenance'
        : `binance_http_${response.status}`;
      console.error('Binance API error:', response.status, response.statusText, error);
      return {
        events: [],
        diagnostic: {
          source: 'binance',
          ok: false,
          status: response.status,
          count: 0,
          error,
        },
      };
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('Binance returned non-array data');
      return {
        events: [],
        diagnostic: {
          source: 'binance',
          ok: false,
          status: response.status,
          count: 0,
          error: 'binance_invalid_payload',
        },
      };
    }

    const events = data.map((order: any) => ({
      symbol: order.symbol,
      side: order.side as 'BUY' | 'SELL',
      price: parseFloat(order.price),
      quantity: parseFloat(order.origQty),
      timestamp: order.time,
      exchange: 'binance' as const
    }));

    return {
      events,
      diagnostic: {
        source: 'binance',
        ok: true,
        status: response.status,
        count: events.length,
      },
    };
  } catch (error) {
    console.error('Error fetching Binance liquidations:', error);
    return {
      events: [],
      diagnostic: {
        source: 'binance',
        ok: false,
        status: null,
        count: 0,
        error: error instanceof Error ? error.message : 'binance_network_error',
      },
    };
  }
}

async function fetchBybitLiquidations(symbol: string): Promise<{ events: LiquidationEvent[]; diagnostic: SourceDiagnostic }> {
  try {
    const bybitSymbol = symbol.replace('USDT', '');
    const primaryUrl = `https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${bybitSymbol}USDT&limit=100`;
    const fallbackUrl = `https://api.bytick.com/v5/market/recent-trade?category=linear&symbol=${bybitSymbol}USDT&limit=100`;
    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://www.bybit.com/',
    };

    let response = await fetch(primaryUrl, {
      headers: {
        ...requestHeaders,
      },
    });

    // Some server IP ranges are blocked on api.bybit.com; retry on the official mirror host.
    if (!response.ok && (response.status === 403 || response.status === 451 || response.status >= 500)) {
      response = await fetch(fallbackUrl, {
        headers: {
          ...requestHeaders,
        },
      });
    }
    
    if (!response.ok) {
      console.error('Bybit API error:', response.status, response.statusText);
      return {
        events: [],
        diagnostic: {
          source: 'bybit',
          ok: false,
          status: response.status,
          count: 0,
          error: `bybit_http_${response.status}`,
        },
      };
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list) {
      return {
        events: [],
        diagnostic: {
          source: 'bybit',
          ok: false,
          status: response.status,
          count: 0,
          error: `bybit_retcode_${String(data.retCode)}`,
        },
      };
    }

    const events = data.result.list
      .filter((trade: any) => Number.isFinite(parseFloat(trade.size)) && parseFloat(trade.size) > 0)
      .slice(0, 50)
      .map((trade: any) => ({
        symbol: symbol,
        side: trade.side === 'Buy' ? 'BUY' as const : 'SELL' as const,
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.size),
        timestamp: parseInt(trade.time),
        exchange: 'bybit' as const
      }));

    return {
      events,
      diagnostic: {
        source: 'bybit',
        ok: true,
        status: response.status,
        count: events.length,
      },
    };
  } catch (error) {
    console.error('Error fetching Bybit data:', error);
    return {
      events: [],
      diagnostic: {
        source: 'bybit',
        ok: false,
        status: null,
        count: 0,
        error: error instanceof Error ? error.message : 'bybit_network_error',
      },
    };
  }
}

async function getCurrentPrice(symbol: string): Promise<number> {
  // Try Bybit first (primary, almost never geo-blocked)
  try {
    const url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = await response.json();
      const lastPrice = parseFloat(data?.result?.list?.[0]?.lastPrice || '0');
      if (lastPrice > 0) return lastPrice;
    }
  } catch {
    // fall through to Binance
  }

  // Binance as fallback
  try {
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
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

    const sourceFetches: Promise<{ events: LiquidationEvent[]; diagnostic: SourceDiagnostic }>[] = [];

    if (exchangeFilter === 'all' || exchangeFilter === 'binance') {
      sourceFetches.push(fetchBinanceLiquidations(symbolStr, limitNum));
    }

    if (exchangeFilter === 'all' || exchangeFilter === 'bybit') {
      sourceFetches.push(fetchBybitLiquidations(symbolStr));
    }

    const results = await Promise.all(sourceFetches);
    const sourceDiagnostics = results.map((r) => r.diagnostic);
    events = results.flatMap((r) => r.events);

    console.log(`Aggregated events: ${events.length} total`);
    if (events.length === 0) {
      console.warn(`⚠️ No liquidation events found for ${symbolStr} from any exchange`);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);
    events = events.slice(0, limitNum);

    const binanceCount = events.filter(e => e.exchange === 'binance').length;
    const bybitCount = events.filter(e => e.exchange === 'bybit').length;

    console.log(`Breakdown: Binance=${binanceCount}, Bybit=${bybitCount}`);

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
      },
      sourceDiagnostics,
      _diagnostic: {
        sourcesQueried: exchangeFilter === 'all' ? ['binance', 'bybit'] : [exchangeFilter],
        binanceQueried: exchangeFilter === 'all' || exchangeFilter === 'binance',
        bybitQueried: exchangeFilter === 'all' || exchangeFilter === 'bybit',
        note: events.length === 0 ? 'No liquidations found - normal if none occurred in requested timeframe' : undefined
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
