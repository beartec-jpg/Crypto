import { useState, useEffect, useRef } from 'react';
import type { Bias } from '@/types/candle';
import type { HTFBiasEntry } from '@/types/htfBias';
import { convertTimeframe } from '@/lib/utils/binance';

/** A single Binance kline entry: [openTime, open, high, low, close, volume, ...] */
type BinanceKline = [
  number,  // 0: open time
  string,  // 1: open
  string,  // 2: high
  string,  // 3: low
  string,  // 4: close
  string,  // 5: volume
  ...unknown[]
];

/** Timeframe label map from internal value to display label */
const TIMEFRAME_LABELS: Record<string, string> = {
  '1d': '1D',
  '4h': '4H',
  '1h': '1H',
  '15m': '15m',
};

/** Simple EMA calculation for a series of closes */
function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(prev);
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

/** Determine bias from last close vs EMA-20 */
function determineBias(closes: number[]): Bias {
  const EMA_PERIOD = 20;
  if (closes.length < EMA_PERIOD + 1) return 'neutral';
  const ema = calcEMA(closes, EMA_PERIOD);
  if (ema.length === 0) return 'neutral';
  const lastClose = closes[closes.length - 1];
  const lastEMA = ema[ema.length - 1];
  const threshold = lastEMA * 0.001; // 0.1% dead-zone for neutral
  if (lastClose > lastEMA + threshold) return 'bullish';
  if (lastClose < lastEMA - threshold) return 'bearish';
  return 'neutral';
}

interface UseHTFBiasOptions {
  symbol: string;
  timeframes: string[];
  enabled: boolean;
}

export function useHTFBias({ symbol, timeframes, enabled }: UseHTFBiasOptions): HTFBiasEntry[] {
  const [entries, setEntries] = useState<HTFBiasEntry[]>(() =>
    timeframes.map(tf => ({
      timeframe: tf,
      label: TIMEFRAME_LABELS[tf] ?? tf.toUpperCase(),
      bias: 'neutral' as Bias,
      isLoading: true,
    }))
  );

  // Track symbol/timeframes to avoid stale updates
  const abortRef = useRef<AbortController | null>(null);

  // Use stable string key to avoid re-fetching on every render due to array reference changes
  const timeframesKey = timeframes.join(',');

  useEffect(() => {
    const tfs = timeframesKey.split(',');

    if (!enabled || !symbol) {
      setEntries(tfs.map(tf => ({
        timeframe: tf,
        label: TIMEFRAME_LABELS[tf] ?? tf.toUpperCase(),
        bias: 'neutral',
        isLoading: false,
      })));
      return;
    }

    // Mark all as loading
    setEntries(tfs.map(tf => ({
      timeframe: tf,
      label: TIMEFRAME_LABELS[tf] ?? tf.toUpperCase(),
      bias: 'neutral',
      isLoading: true,
    })));

    // Cancel any pending fetches
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchAll = async () => {
      await Promise.all(
        tfs.map(async (tf) => {
          try {
            const interval = convertTimeframe(tf);
            const response = await fetch(
              `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=50`,
              { signal: controller.signal }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const klines: BinanceKline[] = await response.json();
            const closes = klines.map((k) => parseFloat(k[4]));
            const bias = determineBias(closes);
            setEntries(prev =>
              prev.map(e =>
                e.timeframe === tf ? { ...e, bias, isLoading: false } : e
              )
            );
          } catch (err: any) {
            if (err?.name === 'AbortError') return;
            console.warn(`[HTFBias] Failed to fetch ${tf} for ${symbol}:`, err);
            setEntries(prev =>
              prev.map(e =>
                e.timeframe === tf ? { ...e, bias: 'neutral', isLoading: false } : e
              )
            );
          }
        })
      );
    };

    fetchAll();

    return () => {
      controller.abort();
    };
  }, [symbol, timeframesKey, enabled]);

  return entries;
}
