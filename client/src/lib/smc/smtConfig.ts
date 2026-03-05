/**
 * @fileoverview SMT (Smart Money Technique) Configuration
 * Manages correlated asset selection and SMT-specific settings
 */

/**
 * Get the default correlated symbol for SMT divergence analysis
 * For any crypto asset, returns a dominant correlator
 * 
 * @param mainSymbol - Main trading symbol (e.g., 'XRPUSDT', 'ETHUSDT')
 * @returns Correlated symbol to compare against
 */
export function getCorrelatedSymbol(mainSymbol: string): string {
  const normalizedSymbol = mainSymbol.toUpperCase();

  // Custom correlation map for specific pairs
  const correlationMap: Record<string, string> = {
    'XRPUSDT': 'BTCUSDT',
    'ETHUSDT': 'BTCUSDT',
    'BTCUSDT': 'ETHUSDT',
    'SOLUSDT': 'ETHUSDT', // SOL correlates with ETH (chain ecosystem)
    'AVAXUSDT': 'ETHUSDT',
    'POLYUSDT': 'ETHUSDT',
    'BNBUSDT': 'BTCUSDT',
    'ADAUSDT': 'BTCUSDT',
    'DOGUSDT': 'BTCUSDT', // DOGE is retail-focused, follows BTC
    'SHIBUSDT': 'ETHUSDT', // SHIB is ERC-20, follows ETH
    'MATICUSDT': 'ETHUSDT',
    'LINKUSDT': 'ETHUSDT',
    'UNIUSDT': 'ETHUSDT',
  };

  // If a mapping exists, use it
  if (correlationMap[normalizedSymbol]) {
    return correlationMap[normalizedSymbol];
  }

  // Default behavior: BTC for alts, ETH for BTC
  if (normalizedSymbol.includes('BTC')) {
    return 'ETHUSDT';
  }

  // Default fallback: use BTC for all other alts
  return 'BTCUSDT';
}

/**
 * SMT divergence configuration
 */
export interface SMTConfig {
  enabled: boolean;
  leftBars: number; // Bars to check left of pivot (default 5)
  rightBars: number; // Bars to check right of pivot (default 5)
  minPivotCount: number; // Minimum pivots required (default 2)
  maxTimeGap: number; // Max candles between pivots (default 3)
  minChangePct: number; // Minimum % change for significance (default 0.5%)
  weight: number; // Weight in composite scoring (default 2.5)
  correlationThreshold: number; // Min correlation to consider valid (default 0.5)
}

/**
 * Default SMT configuration
 */
export const DEFAULT_SMT_CONFIG: SMTConfig = {
  enabled: true,
  leftBars: 5,
  rightBars: 5,
  minPivotCount: 2,
  maxTimeGap: 3,
  minChangePct: 0.5,
  weight: 2.5,
  correlationThreshold: 0.5,
};

/**
 * Get SMT config (allows future customization via settings)
 */
export function getSMTConfig(overrides?: Partial<SMTConfig>): SMTConfig {
  return {
    ...DEFAULT_SMT_CONFIG,
    ...overrides,
  };
}

/**
 * Calculate simple Pearson correlation coefficient between two price arrays
 * Used to validate correlation assumptions before using SMT
 * 
 * @param prices1 - First price series
 * @param prices2 - Second price series (must be same length)
 * @returns Correlation coefficient (-1 to 1)
 */
export function calculateCorrelation(prices1: number[], prices2: number[]): number {
  if (prices1.length !== prices2.length || prices1.length < 2) {
    return 0;
  }

  const n = prices1.length;
  const mean1 = prices1.reduce((a, b) => a + b) / n;
  const mean2 = prices2.reduce((a, b) => a + b) / n;

  let numerator = 0;
  let sumSq1 = 0;
  let sumSq2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = prices1[i] - mean1;
    const diff2 = prices2[i] - mean2;
    numerator += diff1 * diff2;
    sumSq1 += diff1 * diff1;
    sumSq2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(sumSq1 * sumSq2);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Map symbols to datasources (for fetching correlated data)
 * In a real app, this would map to your data provider
 */
export interface DataSourceConfig {
  provider: 'binance' | 'coingecko' | 'local'; // Where to fetch data
  apiKey?: string;
  timeout?: number; // ms
}

export const DATA_SOURCE_CONFIG: Record<string, DataSourceConfig> = {
  'default': {
    provider: 'binance',
    timeout: 5000,
  },
  'forex': {
    provider: 'coingecko', // For forex data (DXY, etc.)
  },
};

/**
 * Get data source config for a symbol
 */
export function getDataSourceConfig(symbol: string): DataSourceConfig {
  // DXY and other forex pairs would use coingecko or custom
  if (symbol.includes('DXY') || symbol.includes('USD') && !symbol.includes('USDT')) {
    return DATA_SOURCE_CONFIG['forex'];
  }
  return DATA_SOURCE_CONFIG['default'];
}
