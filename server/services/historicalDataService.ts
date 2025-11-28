import { storage } from "../storage";
import type { InsertCachedCandles, CachedCandles } from "@shared/schema";

interface OHLCCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BinanceKline {
  0: number;   // Open time
  1: string;   // Open
  2: string;   // High
  3: string;   // Low
  4: string;   // Close
  5: string;   // Volume
  6: number;   // Close time
  7: string;   // Quote asset volume
  8: number;   // Number of trades
  9: string;   // Taker buy base asset volume
  10: string;  // Taker buy quote asset volume
  11: string;  // Ignore
}

const BINANCE_KLINES_ENDPOINT = "https://api.binance.us/api/v3/klines";
const MAX_CANDLES_PER_REQUEST = 1000;
const RATE_LIMIT_DELAY_MS = 200;

const TARGET_HISTORY_CANDLES: Record<string, number> = {
  '1M': 300,    // ~25 years (monthly: 20+ years target)
  '1w': 520,    // ~10 years (weekly: 5-10 years target)
  '1d': 1825,   // ~5 years (daily: 2-5 years target)
  '4h': 2190,   // ~1 year (4h: reasonable history)
  '1h': 2160,   // ~90 days
  '15m': 2880,  // ~30 days
  '5m': 2880,   // ~10 days
  '1m': 1440,   // ~1 day
};

const TIMEFRAME_TO_MS: Record<string, number> = {
  '1M': 30 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '1m': 60 * 1000,
};

const TIMEFRAME_TO_BINANCE: Record<string, string> = {
  '1M': '1M',
  '1w': '1w',
  '1d': '1d',
  '4h': '4h',
  '1h': '1h',
  '15m': '15m',
  '5m': '5m',
  '1m': '1m',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  endTime?: number,
  limit: number = MAX_CANDLES_PER_REQUEST
): Promise<OHLCCandle[]> {
  const params = new URLSearchParams({
    symbol: symbol.replace('-', '').toUpperCase(),
    interval,
    limit: limit.toString(),
  });

  if (endTime) {
    params.append('endTime', endTime.toString());
  }

  const url = `${BINANCE_KLINES_ENDPOINT}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines: BinanceKline[] = await response.json();

    return klines.map((k: BinanceKline) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (error) {
    console.error(`Failed to fetch Binance klines for ${symbol} ${interval}:`, error);
    throw error;
  }
}

export async function fetchExtendedHistory(
  symbol: string,
  timeframe: string,
  forceRefresh: boolean = false
): Promise<OHLCCandle[]> {
  const binanceInterval = TIMEFRAME_TO_BINANCE[timeframe];
  if (!binanceInterval) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const normalizedSymbol = symbol.toUpperCase();
  const targetCandles = TARGET_HISTORY_CANDLES[timeframe] || 2000;
  const timeframeMs = TIMEFRAME_TO_MS[timeframe];

  if (!forceRefresh) {
    const cached = await storage.getCachedCandles(normalizedSymbol, timeframe);
    if (cached) {
      const cacheAgeMs = Date.now() - new Date(cached.updatedAt!).getTime();
      const maxCacheAgeMs = Math.max(timeframeMs, 60 * 60 * 1000);

      if (cacheAgeMs < maxCacheAgeMs && cached.candleCount >= targetCandles * 0.9) {
        console.log(`Using cached data for ${normalizedSymbol} ${timeframe}: ${cached.candleCount} candles`);
        return cached.candles as OHLCCandle[];
      }
    }
  }

  console.log(`Fetching extended history for ${normalizedSymbol} ${timeframe} (target: ${targetCandles} candles)`);

  const allCandles: OHLCCandle[] = [];
  let endTime: number | undefined = undefined;
  let requestCount = 0;
  const maxRequests = Math.ceil(targetCandles / MAX_CANDLES_PER_REQUEST) + 1;

  while (allCandles.length < targetCandles && requestCount < maxRequests) {
    try {
      const candles = await fetchBinanceKlines(normalizedSymbol, binanceInterval, endTime);

      if (candles.length === 0) {
        console.log(`No more data available for ${normalizedSymbol} ${timeframe}`);
        break;
      }

      candles.sort((a, b) => a.time - b.time);

      if (allCandles.length > 0) {
        const oldestExisting = allCandles[0].time;
        const newCandles = candles.filter(c => c.time < oldestExisting);
        allCandles.unshift(...newCandles);

        if (newCandles.length === 0) {
          console.log(`No new unique candles for ${normalizedSymbol} ${timeframe}`);
          break;
        }
      } else {
        allCandles.push(...candles);
      }

      endTime = (candles[0].time * 1000) - 1;
      requestCount++;

      console.log(`Fetched ${candles.length} candles, total: ${allCandles.length} (request ${requestCount}/${maxRequests})`);

      if (requestCount < maxRequests && allCandles.length < targetCandles) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    } catch (error) {
      console.error(`Error fetching batch ${requestCount} for ${normalizedSymbol} ${timeframe}:`, error);
      break;
    }
  }

  if (allCandles.length > 0) {
    allCandles.sort((a, b) => a.time - b.time);

    const uniqueCandles = allCandles.filter((candle, index, arr) => {
      if (index === 0) return true;
      return candle.time !== arr[index - 1].time;
    });

    try {
      const candleData: InsertCachedCandles = {
        symbol: normalizedSymbol,
        timeframe,
        startTime: new Date(uniqueCandles[0].time * 1000),
        endTime: new Date(uniqueCandles[uniqueCandles.length - 1].time * 1000),
        candles: uniqueCandles,
        candleCount: uniqueCandles.length,
      };

      await storage.upsertCachedCandles(candleData);
      console.log(`Cached ${uniqueCandles.length} candles for ${normalizedSymbol} ${timeframe}`);
    } catch (error) {
      console.error(`Failed to cache candles for ${normalizedSymbol} ${timeframe}:`, error);
    }

    return uniqueCandles;
  }

  return [];
}

export async function getHistoricalDataStats(symbol: string, timeframe: string): Promise<{
  candleCount: number;
  startDate: Date | null;
  endDate: Date | null;
  lastUpdated: Date | null;
} | null> {
  const normalizedSymbol = symbol.toUpperCase();
  const cached = await storage.getCachedCandles(normalizedSymbol, timeframe);

  if (!cached) {
    return null;
  }

  return {
    candleCount: cached.candleCount,
    startDate: cached.startTime,
    endDate: cached.endTime,
    lastUpdated: cached.updatedAt || null,
  };
}

export async function clearCachedData(symbol: string, timeframe: string): Promise<void> {
  console.log(`Cache clearing not implemented yet for ${symbol} ${timeframe}`);
}
