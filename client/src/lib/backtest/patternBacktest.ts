import type { Candle, CVDDataItem } from '@/types/chart';
import type { Snapshot, PatternDetectionItem, PatternKey } from '@/services/patternDetectors';
import { runPatternDetectors } from '@/services/patternDetectors';

export interface PatternBacktestConfig {
  candles: Candle[];
  cvdData: CVDDataItem[];
  startDate: Date;
  endDate: Date;
  activationThreshold: number; // Score threshold to consider pattern "active" (default 70)
  forwardLookPeriods: number[]; // Hours to look forward (e.g., [4, 8, 12, 24, 48])
}

export interface PatternActivation {
  patternKey: PatternKey;
  timestamp: number;
  candleIndex: number;
  score: number;
  price: number;
  stageName: string;
  prerequisitesMet: boolean;
}

export interface ForwardPerformance {
  hoursAhead: number;
  priceChange: number;
  priceChangePercent: number;
  highestPrice: number;
  lowestPrice: number;
  highestChangePercent: number;
  lowestChangePercent: number;
}

export interface PatternBacktestResult {
  patternKey: PatternKey;
  patternName: string;
  totalActivations: number;
  avgScore: number;

  // Performance by forward-look period
  performance: {
    [hours: number]: {
      avgPriceChange: number;
      avgPriceChangePercent: number;
      winRate: number; // % of times price moved in predicted direction
      avgWinSize: number;
      avgLossSize: number;
      bestMove: number;
      worstMove: number;
      profitFactor: number;
    };
  };

  // All activations for detailed analysis
  activations: Array<PatternActivation & { forward: ForwardPerformance[] }>;
}

export interface PatternBacktestReport {
  startDate: Date;
  endDate: Date;
  totalCandles: number;
  totalSnapshots: number;
  results: PatternBacktestResult[];
}

/**
 * Create snapshots from historical candle + CVD data at 4-hour intervals
 */
function createHistoricalSnapshots(
  candles: Candle[],
  cvdData: CVDDataItem[],
  startDate: Date,
  endDate: Date
): Snapshot[] {
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const snapshots: Snapshot[] = [];

  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  // Create map of CVD data for quick lookup by timestamp
  const cvdMap = new Map<number, CVDDataItem>();
  cvdData.forEach(item => {
    cvdMap.set(item.timestamp, item);
  });

  // Iterate through candles at 4-hour intervals
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const candleTime = candle.time * 1000;

    if (candleTime < startTime || candleTime > endTime) continue;

    // Check if this is a 4-hour boundary
    if (i === 0 || snapshots.length === 0 || candleTime - snapshots[snapshots.length - 1].timestamp >= FOUR_HOURS_MS) {
      // Look up CVD by millisecond timestamp (candle.time is in seconds, CVDDataItem.timestamp is in ms)
      const cvd = cvdMap.get(candle.time * 1000);

      snapshots.push({
        timestamp: candleTime,
        price: candle.close,
        cvdDelta: cvd?.delta ?? 0,
        oiChangePct: 0,
        fundingRate: 0,
        premium: 0,
        volume: candle.volume,
      });
    }
  }

  return snapshots;
}

/**
 * Calculate forward-looking performance from a given point
 */
function calculateForwardPerformance(
  candles: Candle[],
  startIndex: number,
  startPrice: number,
  forwardLookPeriods: number[]
): ForwardPerformance[] {
  const results: ForwardPerformance[] = [];

  for (const hours of forwardLookPeriods) {
    const targetTime = candles[startIndex].time * 1000 + hours * 60 * 60 * 1000;

    // Find candles within the forward period
    const forwardCandles: Candle[] = [];
    for (let i = startIndex + 1; i < candles.length; i++) {
      const candleTime = candles[i].time * 1000;
      if (candleTime <= targetTime) {
        forwardCandles.push(candles[i]);
      } else {
        break;
      }
    }

    if (forwardCandles.length === 0) {
      results.push({
        hoursAhead: hours,
        priceChange: 0,
        priceChangePercent: 0,
        highestPrice: startPrice,
        lowestPrice: startPrice,
        highestChangePercent: 0,
        lowestChangePercent: 0,
      });
      continue;
    }

    const endPrice = forwardCandles[forwardCandles.length - 1].close;
    const highestPrice = Math.max(...forwardCandles.map(c => c.high));
    const lowestPrice = Math.min(...forwardCandles.map(c => c.low));

    results.push({
      hoursAhead: hours,
      priceChange: endPrice - startPrice,
      priceChangePercent: ((endPrice - startPrice) / startPrice) * 100,
      highestPrice,
      lowestPrice,
      highestChangePercent: ((highestPrice - startPrice) / startPrice) * 100,
      lowestChangePercent: ((lowestPrice - startPrice) / startPrice) * 100,
    });
  }

  return results;
}

/**
 * Determine if a pattern's forward performance was a "win"
 */
function isWin(patternKey: PatternKey, forward: ForwardPerformance): boolean {
  // Bullish patterns
  if (patternKey === 'healthyBottom' || patternKey === 'accumulation') {
    return forward.priceChangePercent > 0;
  }

  // Bearish patterns
  if (patternKey === 'distribution' || patternKey === 'bearBreakdown') {
    return forward.priceChangePercent < 0;
  }

  // Volatile patterns (capitulation, fakeout) - consider any significant move a win
  if (patternKey === 'capitulation' || patternKey === 'fakeout') {
    return Math.abs(forward.priceChangePercent) > 2;
  }

  return false;
}

/**
 * Run pattern detection backtest
 */
export async function runPatternBacktest(
  config: PatternBacktestConfig,
  onProgress?: (current: number, total: number) => void
): Promise<PatternBacktestReport> {
  const { candles, cvdData, startDate, endDate, activationThreshold = 70, forwardLookPeriods = [4, 8, 12, 24, 48] } = config;

  console.log(`🧪 Starting pattern backtest from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Step 1: Create historical snapshots
  const snapshots = createHistoricalSnapshots(candles, cvdData, startDate, endDate);
  console.log(`📊 Generated ${snapshots.length} snapshots at 4-hour intervals`);

  if (snapshots.length < 2) {
    throw new Error('Not enough data for backtest - need at least 2 snapshots');
  }

  // Step 2: Track pattern activations by pattern key
  const activationsByPattern = new Map<PatternKey, Array<PatternActivation & { forward: ForwardPerformance[] }>>();

  // Initialize maps for all patterns
  const patternKeys: PatternKey[] = ['healthyBottom', 'distribution', 'capitulation', 'fakeout', 'accumulation', 'bearBreakdown'];
  patternKeys.forEach(key => activationsByPattern.set(key, []));

  // Step 3: Run pattern detection on each snapshot with rolling history
  for (let i = 0; i < snapshots.length; i++) {
    const current = snapshots[i];
    const history = snapshots.slice(0, i); // All previous snapshots

    // Find corresponding candle index
    const candleIndex = candles.findIndex(c => c.time * 1000 === current.timestamp);

    if (candleIndex === -1) continue;

    // Run pattern detectors
    const patterns: PatternDetectionItem[] = runPatternDetectors(history, current);

    // Check for activations (score >= threshold)
    for (const pattern of patterns) {
      if (pattern.result.score >= activationThreshold) {
        const forward = calculateForwardPerformance(candles, candleIndex, current.price, forwardLookPeriods);

        const activation: PatternActivation & { forward: ForwardPerformance[] } = {
          patternKey: pattern.definition.key,
          timestamp: current.timestamp,
          candleIndex,
          score: pattern.result.score,
          price: current.price,
          stageName: pattern.result.stageName,
          prerequisitesMet: pattern.result.prerequisitesMet,
          forward,
        };

        activationsByPattern.get(pattern.definition.key)!.push(activation);
      }
    }

    if (onProgress && i % 10 === 0) {
      onProgress(i + 1, snapshots.length);
    }
  }

  // Step 4: Calculate performance metrics for each pattern
  const results: PatternBacktestResult[] = [];

  const patternDefinitions = [
    { key: 'healthyBottom' as PatternKey, name: 'Healthy Bottom' },
    { key: 'distribution' as PatternKey, name: 'Distribution Top' },
    { key: 'capitulation' as PatternKey, name: 'Capitulation' },
    { key: 'fakeout' as PatternKey, name: 'Fakeout' },
    { key: 'accumulation' as PatternKey, name: 'Accumulation' },
    { key: 'bearBreakdown' as PatternKey, name: 'Bear Breakdown' },
  ];

  for (const { key, name } of patternDefinitions) {
    const activations = activationsByPattern.get(key)!;

    if (activations.length === 0) {
      results.push({
        patternKey: key,
        patternName: name,
        totalActivations: 0,
        avgScore: 0,
        performance: {},
        activations: [],
      });
      continue;
    }

    const avgScore = activations.reduce((sum, a) => sum + a.score, 0) / activations.length;
    const performance: PatternBacktestResult['performance'] = {};

    // Calculate metrics for each forward-look period
    for (const hours of forwardLookPeriods) {
      const moves = activations.map(a => {
        const fwd = a.forward.find(f => f.hoursAhead === hours);
        return fwd ? fwd.priceChangePercent : 0;
      });

      const winActivations = activations.filter(a => {
        const fwd = a.forward.find(f => f.hoursAhead === hours);
        if (!fwd) return false;
        return isWin(key, fwd);
      });
      const lossActivations = activations.filter(a => {
        const fwd = a.forward.find(f => f.hoursAhead === hours);
        if (!fwd) return true;
        return !isWin(key, fwd);
      });

      const wins = winActivations.length;
      const winRate = (wins / activations.length) * 100;
      const avgMove = moves.reduce((sum, m) => sum + m, 0) / moves.length;

      // Win/loss sizes based on actual pattern direction (using isWin to classify)
      const winMoves = winActivations.map(a => {
        const fwd = a.forward.find(f => f.hoursAhead === hours);
        return fwd ? Math.abs(fwd.priceChangePercent) : 0;
      });
      const lossMoves = lossActivations.map(a => {
        const fwd = a.forward.find(f => f.hoursAhead === hours);
        return fwd ? Math.abs(fwd.priceChangePercent) : 0;
      });

      const avgWin = winMoves.length > 0 ? winMoves.reduce((sum, m) => sum + m, 0) / winMoves.length : 0;
      const avgLoss = lossMoves.length > 0 ? lossMoves.reduce((sum, m) => sum + m, 0) / lossMoves.length : 0;
      const profitFactor = avgLoss > 0 ? (avgWin * winMoves.length) / (avgLoss * lossMoves.length) : 0;

      performance[hours] = {
        avgPriceChange: activations.reduce((sum, a) => {
          const fwd = a.forward.find(f => f.hoursAhead === hours);
          return sum + (fwd ? fwd.priceChange : 0);
        }, 0) / activations.length,
        avgPriceChangePercent: avgMove,
        winRate,
        avgWinSize: avgWin,
        avgLossSize: avgLoss,
        bestMove: Math.max(...moves),
        worstMove: Math.min(...moves),
        profitFactor,
      };
    }

    results.push({
      patternKey: key,
      patternName: name,
      totalActivations: activations.length,
      avgScore,
      performance,
      activations,
    });
  }

  console.log(`✅ Backtest complete - analyzed ${snapshots.length} snapshots`);

  return {
    startDate,
    endDate,
    totalCandles: candles.length,
    totalSnapshots: snapshots.length,
    results,
  };
}

/**
 * Generate a summary report string
 */
export function generateBacktestReport(report: PatternBacktestReport): string {
  let output = `\n${'='.repeat(80)}\n`;
  output += `PATTERN DETECTION BACKTEST REPORT\n`;
  output += `${report.startDate.toLocaleDateString()} to ${report.endDate.toLocaleDateString()}\n`;
  output += `Total Snapshots: ${report.totalSnapshots} | Total Candles: ${report.totalCandles}\n`;
  output += `${'='.repeat(80)}\n\n`;

  for (const result of report.results) {
    output += `📊 ${result.patternName}\n`;
    output += `   Activations: ${result.totalActivations} | Avg Score: ${result.avgScore.toFixed(1)}\n`;

    if (result.totalActivations > 0) {
      output += `\n   Forward Performance:\n`;
      for (const [hours, perf] of Object.entries(result.performance)) {
        output += `   ${hours}h: ${perf.avgPriceChangePercent.toFixed(2)}% avg | `;
        output += `${perf.winRate.toFixed(1)}% win rate | `;
        output += `PF: ${perf.profitFactor.toFixed(2)}\n`;
      }
    }

    output += `\n`;
  }

  return output;
}
