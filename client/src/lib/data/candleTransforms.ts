import type { CandleData } from '@/types/chart.types';

/**
 * Data transformation utilities for chart candle data
 * Extracted from CryptoIndicators.tsx for Phase 4G-6
 */

/**
 * Convert Binance API response to CandleData format
 * Binance kline format: [time, open, high, low, close, volume, ...]
 */
export function binanceToCandleData(binanceData: any[]): CandleData[] {
  return binanceData.map(k => ({
    time: k[0] / 1000, // Convert milliseconds to seconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

/**
 * Convert a symbol by removing USDT suffix for API calls
 * Example: "XRPUSDT" -> "XRP"
 */
export function removeUSDTSuffix(symbol: string): string {
  return symbol.replace('USDT', '');
}

/**
 * Format a symbol for multi-exchange API calls
 * Example: "XRPUSDT" -> "XRPUSDT" (keeps full format)
 */
export function formatMultiExchangeSymbol(symbol: string): string {
  const baseSymbol = removeUSDTSuffix(symbol);
  return `${baseSymbol}USDT`;
}
