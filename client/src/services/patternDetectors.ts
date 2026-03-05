import { calculateBollingerBands } from '@/lib/indicators/volatility';
import { calculateMACD, calculateRSI } from '@/lib/indicators/momentum';
import type { Candle, CVDDataItem } from '@/types/chart';

export interface Snapshot {
  timestamp: number;
  price: number;
  cvdDelta: number;
  oiChangePct: number;
  fundingRate: number;
  premium: number;
  volume: number;
}

export interface PatternSignal {
  name: string;
  met: boolean;
  points: number;
}

export interface GranularCondition {
  id: string;
  name: string;
  score: number;
  weight: number;
  max: number;
  value?: string;
  description?: string;
  breakdown?: string[];
}

export interface PatternResult {
  score: number;
  stage: 0 | 1 | 2 | 3 | 4;
  stageName: string;
  confidence: number;
  prerequisitesMet: boolean;
  orderflowScore: number;
  technicalScore: number;
  signals: {
    orderflow: PatternSignal[];
    technical: PatternSignal[];
  };
  breakdown?: {
    structure: number;
    orderflow: number;
    divergence: number;
  };
  granularConditions?: GranularCondition[];
}

export type PatternKey =
  | 'healthyBottom'
  | 'distribution'
  | 'capitulation'
  | 'fakeout'
  | 'accumulation'
  | 'bearBreakdown';

export interface PatternDefinition {
  key: PatternKey;
  name: string;
  emoji: string;
  borderClass: string;
  recommendation: string;
  activeMessage: string;
}

export interface PatternDetectionItem {
  definition: PatternDefinition;
  result: PatternResult;
}

export type PatternSensitivityProfile = 'tame' | 'neutral' | 'aggressive';

interface PatternDetectorThresholds {
  activationThreshold: number;
  healthyBottom: {
    drawdownFromPeakMin: number;
    oiMin: number;
    fundingNegativeMax: number;
  };
  distribution: {
    rallyMin: number;
    minRallyDays: number;
    oiExpandMin: number;
    fundingHighMin: number;
  };
  capitulation: {
    prereqDropMin: number;
    prereqOiFlushMin: number;
    prereqFundingMax: number;
    signalDropMin: number;
    signalOiFlushMin: number;
    signalFundingMax: number;
    volumeSpikeMinMultiplier: number;
    rsiMax: number;
  };
  fakeout: {
    recentMoveMin: number;
    oiUpMin: number;
    lowVolumeMaxMultiplier: number;
  };
  accumulation: {
    rangeMax: number;
    minDurationFactor: number;
    oiFlatMaxAbs: number;
    fundingNeutralMaxAbs: number;
    bandwidthMax: number;
    nearVpocMaxDistance: number;
  };
  bearBreakdown: {
    recentDownMoveMin: number;
    oiExpandMin: number;
    weakRecoveryRsiMax: number;
    volumeSpikeMinMultiplier: number;
  };
}

const PROFILE_THRESHOLDS: Record<PatternSensitivityProfile, PatternDetectorThresholds> = {
  tame: {
    activationThreshold: 78,
    healthyBottom: {
      drawdownFromPeakMin: 12,
      oiMin: 4,
      fundingNegativeMax: -0.008,
    },
    distribution: {
      rallyMin: 18,
      minRallyDays: 4,
      oiExpandMin: 1.25,
      fundingHighMin: 0.01,
    },
    capitulation: {
      prereqDropMin: 5,
      prereqOiFlushMin: 4,
      prereqFundingMax: -0.01,
      signalDropMin: 10,
      signalOiFlushMin: 5,
      signalFundingMax: -0.012,
      volumeSpikeMinMultiplier: 2.2,
      rsiMax: 22,
    },
    fakeout: {
      recentMoveMin: 2.6,
      oiUpMin: 1,
      lowVolumeMaxMultiplier: 0.75,
    },
    accumulation: {
      rangeMax: 4,
      minDurationFactor: 0.98,
      oiFlatMaxAbs: 1.2,
      fundingNeutralMaxAbs: 0.003,
      bandwidthMax: 0.04,
      nearVpocMaxDistance: 0.008,
    },
    bearBreakdown: {
      recentDownMoveMin: 5,
      oiExpandMin: 1,
      weakRecoveryRsiMax: 42,
      volumeSpikeMinMultiplier: 1.7,
    },
  },
  neutral: {
    activationThreshold: 70,
    healthyBottom: {
      drawdownFromPeakMin: 9,
      oiMin: 3,
      fundingNegativeMax: -0.006,
    },
    distribution: {
      rallyMin: 15,
      minRallyDays: 3,
      oiExpandMin: 1,
      fundingHighMin: 0.008,
    },
    capitulation: {
      prereqDropMin: 4,
      prereqOiFlushMin: 3,
      prereqFundingMax: -0.008,
      signalDropMin: 8,
      signalOiFlushMin: 4,
      signalFundingMax: -0.01,
      volumeSpikeMinMultiplier: 2,
      rsiMax: 25,
    },
    fakeout: {
      recentMoveMin: 2,
      oiUpMin: 0.8,
      lowVolumeMaxMultiplier: 0.85,
    },
    accumulation: {
      rangeMax: 5,
      minDurationFactor: 0.9,
      oiFlatMaxAbs: 1.5,
      fundingNeutralMaxAbs: 0.004,
      bandwidthMax: 0.045,
      nearVpocMaxDistance: 0.01,
    },
    bearBreakdown: {
      recentDownMoveMin: 4,
      oiExpandMin: 0.8,
      weakRecoveryRsiMax: 45,
      volumeSpikeMinMultiplier: 1.5,
    },
  },
  aggressive: {
    activationThreshold: 62,
    healthyBottom: {
      drawdownFromPeakMin: 6,
      oiMin: 2,
      fundingNegativeMax: -0.004,
    },
    distribution: {
      rallyMin: 12,
      minRallyDays: 2,
      oiExpandMin: 0.75,
      fundingHighMin: 0.006,
    },
    capitulation: {
      prereqDropMin: 3,
      prereqOiFlushMin: 2,
      prereqFundingMax: -0.006,
      signalDropMin: 6,
      signalOiFlushMin: 3,
      signalFundingMax: -0.008,
      volumeSpikeMinMultiplier: 1.6,
      rsiMax: 30,
    },
    fakeout: {
      recentMoveMin: 1.5,
      oiUpMin: 0.5,
      lowVolumeMaxMultiplier: 0.95,
    },
    accumulation: {
      rangeMax: 6.5,
      minDurationFactor: 0.75,
      oiFlatMaxAbs: 2,
      fundingNeutralMaxAbs: 0.005,
      bandwidthMax: 0.055,
      nearVpocMaxDistance: 0.013,
    },
    bearBreakdown: {
      recentDownMoveMin: 3,
      oiExpandMin: 0.5,
      weakRecoveryRsiMax: 48,
      volumeSpikeMinMultiplier: 1.3,
    },
  },
};

function getProfileThresholds(profile: PatternSensitivityProfile): PatternDetectorThresholds {
  return PROFILE_THRESHOLDS[profile] ?? PROFILE_THRESHOLDS.neutral;
}

export function getDefaultActivationThreshold(profile: PatternSensitivityProfile = 'neutral'): number {
  return getProfileThresholds(profile).activationThreshold;
}

const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    key: 'healthyBottom',
    name: 'Healthy Bottom',
    emoji: '🚀',
    borderClass: 'border-green-500/60',
    recommendation: 'Confirmed rally - strong entry signal',
    activeMessage: 'Spot demand + leverage reset support upside continuation.',
  },
  {
    key: 'distribution',
    name: 'Distribution Top',
    emoji: '🔴',
    borderClass: 'border-red-500/60',
    recommendation: 'Distribution risk - reduce long exposure',
    activeMessage: 'Rally is losing quality while leverage builds overhead.',
  },
  {
    key: 'capitulation',
    name: 'Capitulation',
    emoji: '💥',
    borderClass: 'border-orange-500/60',
    recommendation: 'Liquidation event - watch for reversal confirmation',
    activeMessage: 'Panic conditions are extreme; monitor for exhaustion bounce.',
  },
  {
    key: 'fakeout',
    name: 'Fakeout',
    emoji: '⚠️',
    borderClass: 'border-yellow-500/60',
    recommendation: 'Breakout quality low - avoid chasing',
    activeMessage: 'Price moved first, but orderflow and participation lag.',
  },
  {
    key: 'accumulation',
    name: 'Accumulation',
    emoji: '🤫',
    borderClass: 'border-green-500/60',
    recommendation: 'Base building - prepare for breakout',
    activeMessage: 'Steady buying without price expansion suggests absorption.',
  },
  {
    key: 'bearBreakdown',
    name: 'Bear Breakdown',
    emoji: '📉',
    borderClass: 'border-red-500/60',
    recommendation: 'Support break confirmed - trend risk remains down',
    activeMessage: 'Support failed with negative flow and expanding leverage.',
  },
];

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const HEALTHY_BOTTOM_LOOKBACK_MS: Record<PatternSensitivityProfile, number> = {
  tame: 336 * HOUR_MS,
  neutral: 168 * HOUR_MS,
  aggressive: 72 * HOUR_MS,
};

function toCandles(prices: number[]) {
  return prices.map((price, index) => ({
    time: index,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 0,
  }));
}

function calculateSlope(valuesList: number[], period: number): number {
  if (valuesList.length < 2) return 0;
  const window = valuesList.slice(-Math.max(2, period));
  const first = window[0];
  const last = window[window.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return (last - first) / Math.max(1, window.length - 1);
}

function calculateVolumeAverage(volumes: number[], period: number): number {
  if (volumes.length === 0) return 0;
  const window = volumes.slice(-Math.max(1, period));
  return window.reduce((sum, value) => sum + value, 0) / window.length;
}

function calculateStochRSI(prices: number[], period: number) {
  const candles = toCandles(prices);
  const rsiValues = calculateRSI(candles, period).map((point) => point.value);
  const stochValues: number[] = [];

  for (let index = 0; index < rsiValues.length; index += 1) {
    const start = Math.max(0, index - period + 1);
    const window = rsiValues.slice(start, index + 1);
    const minRsi = Math.min(...window);
    const maxRsi = Math.max(...window);
    const denominator = maxRsi - minRsi;
    stochValues.push(denominator === 0 ? 50 : ((rsiValues[index] - minRsi) / denominator) * 100);
  }

  const k = stochValues.map((_, index) => {
    const start = Math.max(0, index - 2);
    const window = stochValues.slice(start, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });

  const d = k.map((_, index) => {
    const start = Math.max(0, index - 2);
    const window = k.slice(start, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });

  return { k, d };
}

function calculateVPOC(prices: number[], volumes: number[], bins: number): number {
  if (prices.length === 0 || volumes.length === 0) return 0;

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  if (minPrice === maxPrice) return prices[prices.length - 1] ?? 0;

  const bucketCount = Math.max(4, bins);
  const bucketSize = (maxPrice - minPrice) / bucketCount;
  const buckets = new Array(bucketCount).fill(0);

  for (let index = 0; index < prices.length; index += 1) {
    const normalized = (prices[index] - minPrice) / bucketSize;
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor(normalized)));
    buckets[bucketIndex] += volumes[index] ?? 0;
  }

  let maxVolume = -Infinity;
  let maxIndex = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    if (buckets[index] > maxVolume) {
      maxVolume = buckets[index];
      maxIndex = index;
    }
  }

  return minPrice + (maxIndex + 0.5) * bucketSize;
}

function detectRSIDivergence(prices: number[], rsiValues: number[]): 'bullish' | 'bearish' | 'none' {
  if (prices.length < 8 || rsiValues.length < 8) return 'none';

  const recent = prices.slice(-8);
  const recentRsi = rsiValues.slice(-8);

  const firstHalfPrices = recent.slice(0, 4);
  const secondHalfPrices = recent.slice(4);
  const firstHalfRsi = recentRsi.slice(0, 4);
  const secondHalfRsi = recentRsi.slice(4);

  const priceLow1 = Math.min(...firstHalfPrices);
  const priceLow2 = Math.min(...secondHalfPrices);
  const rsiLow1 = Math.min(...firstHalfRsi);
  const rsiLow2 = Math.min(...secondHalfRsi);

  const priceHigh1 = Math.max(...firstHalfPrices);
  const priceHigh2 = Math.max(...secondHalfPrices);
  const rsiHigh1 = Math.max(...firstHalfRsi);
  const rsiHigh2 = Math.max(...secondHalfRsi);

  if (priceLow2 < priceLow1 && rsiLow2 > rsiLow1) return 'bullish';
  if (priceHigh2 > priceHigh1 && rsiHigh2 < rsiHigh1) return 'bearish';
  return 'none';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercentChange(first: number, last: number): number {
  if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return 0;
  return ((last - first) / first) * 100;
}

function sortSnapshots(data: Snapshot[]): Snapshot[] {
  return [...data].sort((a, b) => a.timestamp - b.timestamp);
}

function getSeries(history: Snapshot[], current: Snapshot): Snapshot[] {
  return sortSnapshots([...history, current]);
}

function values(series: Snapshot[]): { prices: number[]; volumes: number[]; cvd: number[] } {
  return {
    prices: series.map((item) => item.price),
    volumes: series.map((item) => item.volume),
    cvd: series.map((item) => item.cvdDelta),
  };
}

function median(valuesList: number[]): number {
  if (valuesList.length === 0) return FOUR_HOURS_MS;
  const sorted = [...valuesList].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function medianIntervalMs(series: Snapshot[]): number {
  if (series.length < 2) return FOUR_HOURS_MS;
  const gaps: number[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const gap = series[index].timestamp - series[index - 1].timestamp;
    if (gap > 0) gaps.push(gap);
  }
  return Math.max(60_000, median(gaps));
}

function barsForDuration(series: Snapshot[], durationMs: number): number {
  const interval = medianIntervalMs(series);
  return Math.max(1, Math.round(durationMs / interval));
}

function windowByDuration(series: Snapshot[], durationMs: number): Snapshot[] {
  if (series.length === 0) return [];
  const latest = series[series.length - 1].timestamp;
  return series.filter((item) => item.timestamp >= latest - durationMs);
}

function rollingHigh(prices: number[], lookback: number): number {
  const slice = prices.slice(-Math.min(lookback, prices.length));
  return slice.length > 0 ? Math.max(...slice) : 0;
}

function rollingLow(prices: number[], lookback: number): number {
  const slice = prices.slice(-Math.min(lookback, prices.length));
  return slice.length > 0 ? Math.min(...slice) : 0;
}

function normalizeSignals(signals: PatternSignal[], maxScore: number): number {
  const rawScore = signals.filter((signal) => signal.met).reduce((sum, signal) => sum + signal.points, 0);
  const maxRaw = signals.reduce((sum, signal) => sum + signal.points, 0);
  if (maxRaw <= 0) return 0;
  return clamp((rawScore / maxRaw) * maxScore, 0, maxScore);
}

function persistenceRatio(series: Snapshot[], bars: number, condition: (item: Snapshot) => boolean): number {
  if (series.length === 0 || bars <= 0) return 0;
  const window = series.slice(-Math.min(bars, series.length));
  const met = window.reduce((count, item) => count + (condition(item) ? 1 : 0), 0);
  return met / window.length;
}

function buildResult(
  orderflowSignals: PatternSignal[],
  technicalSignals: PatternSignal[],
  stageNames: string[],
  prerequisitesMet: boolean,
  consistency: number
): PatternResult {
  const orderflowScore = normalizeSignals(orderflowSignals, 60);
  const technicalScore = normalizeSignals(technicalSignals, 40);
  const combinedScore = orderflowScore + technicalScore;
  const effectiveScore = prerequisitesMet ? combinedScore : Math.min(combinedScore, 45);

  let stage: 0 | 1 | 2 | 3 | 4 = 0;
  if (prerequisitesMet) {
    if (effectiveScore >= 80 && consistency >= 0.66) stage = 4;
    else if (effectiveScore >= 65 && consistency >= 0.5) stage = 3;
    else if (effectiveScore >= 50 && consistency >= 0.35) stage = 2;
    else if (effectiveScore >= 35) stage = 1;
  }

  const confidence = clamp(
    Math.round((effectiveScore * 0.7) + (consistency * 25) + (prerequisitesMet ? 5 : 0)),
    0,
    100
  );

  return {
    score: Math.round(clamp(effectiveScore, 0, 100)),
    stage,
    stageName: stageNames[stage] || stageNames[0] || 'Inactive',
    confidence,
    prerequisitesMet,
    orderflowScore: Math.round(orderflowScore),
    technicalScore: Math.round(technicalScore),
    signals: {
      orderflow: orderflowSignals,
      technical: technicalSignals,
    },
  };
}

function getLatestBollinger(prices: number[]) {
  const bb = calculateBollingerBands(toCandles(prices), 20, 2);
  const lastIndex = bb.upper.length - 1;

  return {
    upper: bb.upper[lastIndex]?.value ?? 0,
    middle: bb.middle[lastIndex]?.value ?? 0,
    lower: bb.lower[lastIndex]?.value ?? 0,
    hasData: lastIndex >= 0,
  };
}

function calculateOBV(prices: number[], volumes: number[]): number[] {
  if (prices.length === 0 || volumes.length === 0) return [];
  const size = Math.min(prices.length, volumes.length);
  const obv: number[] = [0];

  for (let index = 1; index < size; index += 1) {
    const previous = obv[index - 1];
    if (prices[index] > prices[index - 1]) obv.push(previous + volumes[index]);
    else if (prices[index] < prices[index - 1]) obv.push(previous - volumes[index]);
    else obv.push(previous);
  }

  return obv;
}

function detectHigherLow(prices: number[]): boolean {
  if (prices.length < 10) return false;
  const half = Math.floor(prices.length / 2);
  const earlierLow = Math.min(...prices.slice(0, half));
  const recentLow = Math.min(...prices.slice(half));
  return recentLow > earlierLow;
}

function buildResultWithPrereqScore(
  orderflowSignals: PatternSignal[],
  technicalSignals: PatternSignal[],
  stageNames: string[],
  prerequisitesMet: boolean,
  consistency: number,
  prereqScore: number
): PatternResult {
  const orderflowScore = normalizeSignals(orderflowSignals, 60);
  const technicalScore = normalizeSignals(technicalSignals, 40);
  const combinedScore = orderflowScore + technicalScore;
  const effectiveScore = prerequisitesMet ? combinedScore : combinedScore * (prereqScore / 100);

  let stage: 0 | 1 | 2 | 3 | 4 = 0;
  if (prerequisitesMet || prereqScore >= 40) {
    if (effectiveScore >= 80 && consistency >= 0.66) stage = 4;
    else if (effectiveScore >= 65 && consistency >= 0.5) stage = 3;
    else if (effectiveScore >= 50 && consistency >= 0.35) stage = 2;
    else if (effectiveScore >= 35) stage = 1;
  }

  const confidence = clamp(
    Math.round((effectiveScore * 0.7) + (consistency * 25) + (prerequisitesMet ? 5 : 0) + (prereqScore * 0.05)),
    0,
    100
  );

  return {
    score: Math.round(clamp(effectiveScore, 0, 100)),
    stage,
    stageName: stageNames[stage] || stageNames[0] || 'Inactive',
    confidence,
    prerequisitesMet,
    orderflowScore: Math.round(orderflowScore),
    technicalScore: Math.round(technicalScore),
    signals: {
      orderflow: orderflowSignals,
      technical: technicalSignals,
    },
  };
}

// ─── Scaled Scoring Helpers for Healthy Bottom ───────────────────────────────

interface DivergenceDetail {
  present: boolean;
  strength: number;
  priceSwingLow1: number;
  priceSwingLow2: number;
  indicatorValue1: number;
  indicatorValue2: number;
}

interface TimeframeDivergence {
  timeframe: '15m' | '1h' | '4h' | '1d';
  indicators: {
    rsi: DivergenceDetail | null;
    macd: DivergenceDetail | null;
    cvd: DivergenceDetail | null;
    obv: DivergenceDetail | null;
  };
  confirmedCount: number;
  avgStrength: number;
  score: number;
}

function detectSwings(prices: number[]): { lows: number[]; lowIndices: number[]; highs: number[]; highIndices: number[] } {
  const lows: number[] = [];
  const lowIndices: number[] = [];
  const highs: number[] = [];
  const highIndices: number[] = [];
  for (let i = 1; i < prices.length - 1; i++) {
    if (prices[i] < prices[i - 1] && prices[i] <= prices[i + 1]) {
      lows.push(prices[i]);
      lowIndices.push(i);
    }
    if (prices[i] > prices[i - 1] && prices[i] >= prices[i + 1]) {
      highs.push(prices[i]);
      highIndices.push(i);
    }
  }
  return { lows, lowIndices, highs, highIndices };
}

function calculatePatternWeightedScore(conditions: GranularCondition[], maxPoints: number): number {
  const total = conditions.reduce((sum, c) => sum + (c.score / 100) * c.weight, 0);
  return Math.min(maxPoints, total);
}

function getCVDDataFromHistory(history: Snapshot[]): CVDDataItem[] {
  let cumDelta = 0;
  return history.map((s) => {
    cumDelta += s.cvdDelta;
    return {
      time: new Date(s.timestamp).toISOString(),
      timestamp: s.timestamp,
      delta: s.cvdDelta,
      cumDelta,
      isBull: s.cvdDelta > 0,
      volume: s.volume,
    };
  });
}

function scorePostDrawdown(drawdownPct: number, profile: PatternSensitivityProfile): number {
  const thresholds = {
    aggressive: { min: 3, max: 15 },
    neutral: { min: 5, max: 18 },
    tame: { min: 8, max: 25 },
  }[profile];
  const absDrawdown = Math.abs(drawdownPct);
  if (absDrawdown < thresholds.min) return 0;
  if (absDrawdown >= thresholds.max) return 100;
  const normalized = (absDrawdown - thresholds.min) / (thresholds.max - thresholds.min);
  return Math.round(normalized * 100);
}

function scoreDownsideDeceleration(recentPrices: number[]): number {
  if (recentPrices.length < 6) return 0;
  const half = Math.floor(recentPrices.length / 2);
  const firstHalf = recentPrices.slice(0, half);
  const secondHalf = recentPrices.slice(half);
  const firstSlope = calculateSlope(firstHalf, firstHalf.length);
  const secondSlope = calculateSlope(secondHalf, secondHalf.length);
  if (firstSlope < 0 && secondSlope >= 0) return 100;
  if (firstSlope < 0 && secondSlope < 0) {
    const deceleration = Math.abs(firstSlope) - Math.abs(secondSlope);
    return Math.min(100, Math.round((deceleration / 0.05) * 100));
  }
  return 0;
}

function scoreHigherLows(prices: number[]): number {
  const swings = detectSwings(prices);
  const lows = swings.lows;
  if (lows.length < 2) return 0;
  const recentLows = lows.slice(-4);
  let higherLowCount = 0;
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] > recentLows[i - 1]) higherLowCount++;
  }
  const ratio = higherLowCount / (recentLows.length - 1);
  return Math.round(ratio * 100);
}

function scoreAdaptivePriceAction(prices: number[]): {
  score: number;
  type: 'deceleration' | 'higherLows';
  description: string;
} {
  if (prices.length < 6) return { score: 0, type: 'deceleration', description: 'Insufficient data' };
  const swings = detectSwings(prices);
  const lows = swings.lows;
  const isInDivergenceZone = lows.length >= 2 && lows[lows.length - 1] < lows[lows.length - 2];
  if (isInDivergenceZone) {
    const score = scoreDownsideDeceleration(prices);
    return { score, type: 'deceleration', description: 'Rate of decline slowing - exhaustion forming' };
  }
  const score = scoreHigherLows(prices);
  return { score, type: 'higherLows', description: 'Price making higher lows - reversal confirmed' };
}

function scoreNearVPOC(currentPrice: number, vpoc: number): number {
  if (vpoc === 0) return 0;
  const distance = Math.abs(currentPrice - vpoc) / Math.max(1, currentPrice);
  if (distance <= 0.01) return 100;
  if (distance <= 0.03) {
    const normalized = 1 - (distance - 0.01) / (0.03 - 0.01);
    return Math.round(normalized * 100);
  }
  return 0;
}

function scoreVolumeSupport(recentWindow: Snapshot[]): number {
  if (recentWindow.length < 3) return 0;
  let buyVolume = 0;
  let sellVolume = 0;
  recentWindow.forEach((snap) => {
    if (snap.cvdDelta > 0) buyVolume += snap.volume;
    else sellVolume += snap.volume;
  });
  const totalVolume = buyVolume + sellVolume;
  if (totalVolume === 0) return 0;
  const buyPercent = (buyVolume / totalVolume) * 100;
  if (buyPercent <= 50) return 0;
  return Math.round(((buyPercent - 50) / 50) * 100);
}

function scoreCVDAverage(recentWindow: Snapshot[]): number {
  if (recentWindow.length === 0) return 0;
  const avgDelta = recentWindow.reduce((sum, s) => sum + s.cvdDelta, 0) / recentWindow.length;
  if (avgDelta <= 0) return 0;
  return Math.min(100, Math.round((avgDelta / 2000) * 100));
}

function scoreCVDMomentum(recentWindow: Snapshot[]): number {
  if (recentWindow.length < 3) return 0;
  let cum = 0;
  const cvdValues = recentWindow.map((s) => {
    cum += s.cvdDelta;
    return cum;
  });
  const slope = calculateSlope(cvdValues, cvdValues.length);
  if (slope <= 0) return 0;
  return Math.min(100, Math.round(slope * 5));
}

function scoreOIStability(recentWindow: Snapshot[]): number {
  if (recentWindow.length === 0) return 0;
  const avgChange = recentWindow.reduce((sum, s) => sum + Math.abs(s.oiChangePct), 0) / recentWindow.length;
  if (avgChange >= 3) return 0;
  if (avgChange <= 0.5) return 100;
  return Math.round((1 - (avgChange - 0.5) / (3 - 0.5)) * 100);
}

function scoreFundingNormalized(fundingRate: number): number {
  const absRate = Math.abs(fundingRate);
  if (absRate <= 0.005) return 100;
  if (absRate >= 0.02) return 0;
  return Math.round((1 - (absRate - 0.005) / (0.02 - 0.005)) * 100);
}

function scorePremium(premium: number): number {
  if (premium <= 0) return 0;
  if (premium >= 0.005) return 100;
  return Math.round((premium / 0.005) * 100);
}

function detectSingleIndicatorDivergence(
  prices: number[],
  indicatorValues: number[],
  _indicatorName: string
): DivergenceDetail | null {
  const swings = detectSwings(prices);
  const lows = swings.lows;
  const lowIndices = swings.lowIndices;
  if (lows.length < 2) return null;

  const idx1 = lowIndices[lowIndices.length - 2];
  const idx2 = lowIndices[lowIndices.length - 1];
  if (idx1 === undefined || idx2 === undefined || idx1 >= idx2) return null;

  const priceLowerLow = prices[idx2] < prices[idx1];
  if (!priceLowerLow) return null;

  const ind1 = indicatorValues[idx1];
  const ind2 = indicatorValues[idx2];
  if (ind1 === undefined || ind2 === undefined || !Number.isFinite(ind1) || !Number.isFinite(ind2)) return null;

  const indicatorHigherLow = ind2 > ind1;
  if (!indicatorHigherLow) return null;

  const magnitude = ind2 - ind1;
  const percentChange = ind1 !== 0 ? (magnitude / Math.abs(ind1)) * 100 : 0;
  const strength = Math.min(100, (Math.abs(percentChange) / 20) * 100);
  if (strength < 20) return null;

  return {
    present: true,
    strength: Math.round(strength),
    priceSwingLow1: prices[idx1],
    priceSwingLow2: prices[idx2],
    indicatorValue1: ind1,
    indicatorValue2: ind2,
  };
}

function detectDivergenceForTimeframe(
  candles: Candle[],
  cvdData: CVDDataItem[],
  timeframe: '15m' | '1h' | '4h' | '1d'
): TimeframeDivergence {
  const lookbackBars = { '15m': 96, '1h': 168, '4h': 180, '1d': 90 }[timeframe];
  const recentCandles = candles.slice(-lookbackBars);
  const prices = recentCandles.map((c) => c.close);

  const rsiArr = calculateRSI(toCandles(prices), 14).map((p) => p.value);
  const macdResult = calculateMACD(toCandles(prices));
  const macdHist = macdResult.hist.map((h) => h.value);
  const volumes = recentCandles.map((c) => c.volume);
  const obv = calculateOBV(prices, volumes);
  const cvdSlice = cvdData.slice(-lookbackBars).map((d) => d.cumDelta);

  const rsiDiv = detectSingleIndicatorDivergence(prices, rsiArr, 'RSI');
  const macdDiv = detectSingleIndicatorDivergence(prices, macdHist, 'MACD');
  const cvdDiv = cvdSlice.length >= prices.length
    ? detectSingleIndicatorDivergence(prices, cvdSlice, 'CVD')
    : null;
  const obvDiv = detectSingleIndicatorDivergence(prices, obv, 'OBV');

  const allDivs = [rsiDiv, macdDiv, cvdDiv, obvDiv];
  const confirmedCount = allDivs.filter((d) => d?.present).length;
  const strengths = allDivs.filter((d) => d?.present).map((d) => d!.strength);
  const avgStrength = strengths.length > 0
    ? strengths.reduce((sum, s) => sum + s, 0) / strengths.length
    : 0;

  const baseScore = (confirmedCount / 4) * 100;
  const tfMultiplier = { '15m': 0.6, '1h': 0.8, '4h': 1.0, '1d': 1.2 }[timeframe];
  const score = Math.min(100, Math.round(baseScore * (avgStrength / 100) * tfMultiplier));

  return {
    timeframe,
    indicators: { rsi: rsiDiv, macd: macdDiv, cvd: cvdDiv, obv: obvDiv },
    confirmedCount,
    avgStrength,
    score,
  };
}

function calculateMultiTimeframeDivergenceScore(
  candles15m: Candle[],
  candles1h: Candle[],
  candles4h: Candle[],
  candles1d: Candle[],
  cvdData: CVDDataItem[]
): { totalScore: number; breakdown: string[] } {
  const tf15m = detectDivergenceForTimeframe(candles15m, cvdData, '15m');
  const tf1h = detectDivergenceForTimeframe(candles1h, cvdData, '1h');
  const tf4h = detectDivergenceForTimeframe(candles4h, cvdData, '4h');
  const tf1d = detectDivergenceForTimeframe(candles1d, cvdData, '1d');
  const timeframes = [tf15m, tf1h, tf4h, tf1d];

  const weights: Record<string, number> = { '15m': 1, '1h': 2, '4h': 4, '1d': 8 };
  let weightedSum = 0;
  let totalWeight = 0;
  timeframes.forEach((tf) => {
    if (tf.confirmedCount >= 1) {
      const weight = weights[tf.timeframe];
      weightedSum += tf.score * weight;
      totalWeight += weight;
    }
  });

  const avgScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const tfWithDiv = timeframes.filter((tf) => tf.confirmedCount >= 2).length;
  const confluenceBonus = tfWithDiv >= 4 ? 20 : tfWithDiv === 3 ? 15 : tfWithDiv === 2 ? 10 : 0;
  const totalScore = Math.min(100, avgScore + confluenceBonus);

  const breakdown = timeframes
    .filter((tf) => tf.confirmedCount > 0)
    .map((tf) => {
      const indicators = Object.entries(tf.indicators)
        .filter(([, div]) => div?.present)
        .map(([name]) => name.toUpperCase())
        .join(', ');
      return `${tf.timeframe.toUpperCase()}: ${tf.confirmedCount}/4 (${indicators})`;
    });

  return { totalScore, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────

export function detectHealthyBottom(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral',
  candles15m?: Candle[],
  candles1h?: Candle[],
  candles4h?: Candle[],
  candles1d?: Candle[]
): PatternResult {
  const series = getSeries(history, current);
  const lookbackMs = HEALTHY_BOTTOM_LOOKBACK_MS[profile] ?? (168 * HOUR_MS);
  const recentWindow = windowByDuration(series, lookbackMs);
  const { prices, volumes } = values(series);

  // === PILLAR 1: MARKET STRUCTURE (35 pts) ===

  const peakInWindow = recentWindow.length > 0
    ? Math.max(...recentWindow.map((item) => item.price))
    : current.price;
  const drawdownFromPeak = toPercentChange(peakInWindow, current.price);
  const postDrawdownScore = scorePostDrawdown(drawdownFromPeak, profile);

  const priceAction = scoreAdaptivePriceAction(prices);

  const vpoc = calculateVPOC(prices, volumes, 30);
  const vpocScore = scoreNearVPOC(current.price, vpoc);

  const volumeSupportScore = scoreVolumeSupport(recentWindow);

  const structureConditions: GranularCondition[] = [
    {
      id: 'postDrawdown',
      name: 'Post-Drawdown Zone',
      score: postDrawdownScore,
      weight: 10,
      max: 10,
      value: `${Math.abs(drawdownFromPeak).toFixed(1)}% from peak`,
    },
    {
      id: priceAction.type,
      name: priceAction.type === 'deceleration' ? '⚠️ Downside Decelerating' : '✅ Higher Low Structure',
      score: priceAction.score,
      weight: 7,
      max: 7,
      description: priceAction.description,
    },
    { id: 'vpoc', name: 'Near VPOC', score: vpocScore, weight: 10, max: 10 },
    { id: 'volumeSupport', name: 'Buy Volume > Sell', score: volumeSupportScore, weight: 8, max: 8 },
  ];

  const structureScore = calculatePatternWeightedScore(structureConditions, 35);

  // === PILLAR 2: ORDERFLOW (40 pts) ===

  const cvdAvgScore = scoreCVDAverage(recentWindow);
  const cvdMomentumScore = scoreCVDMomentum(recentWindow);
  const oiStableScore = scoreOIStability(recentWindow);
  const fundingNormScore = scoreFundingNormalized(current.fundingRate);
  const premiumScore = scorePremium(current.premium);

  const orderflowConditions: GranularCondition[] = [
    { id: 'cvdAvg', name: 'CVD Avg Positive', score: cvdAvgScore, weight: 12, max: 12 },
    { id: 'cvdMomentum', name: 'CVD Rising', score: cvdMomentumScore, weight: 10, max: 10 },
    { id: 'oiStable', name: 'OI Stabilized', score: oiStableScore, weight: 10, max: 10 },
    { id: 'fundingNorm', name: 'Funding Normalized', score: fundingNormScore, weight: 5, max: 5 },
    { id: 'premium', name: 'Premium Positive', score: premiumScore, weight: 3, max: 3 },
  ];

  const orderflowScore = calculatePatternWeightedScore(orderflowConditions, 40);

  // === PILLAR 3: DIVERGENCE (25 pts) ===

  let divergenceScore = 0;
  let divergenceBreakdown: string[] = [];

  if (candles15m && candles1h && candles4h && candles1d) {
    const mtfDiv = calculateMultiTimeframeDivergenceScore(
      candles15m,
      candles1h,
      candles4h,
      candles1d,
      getCVDDataFromHistory(history)
    );
    divergenceScore = mtfDiv.totalScore;
    divergenceBreakdown = mtfDiv.breakdown;
  }

  const divergenceConditions: GranularCondition[] = [
    {
      id: 'mtfDivergence',
      name: 'Multi-TF Divergence',
      score: divergenceScore,
      weight: 25,
      max: 25,
      breakdown: divergenceBreakdown,
    },
  ];

  const finalDivergenceScore = calculatePatternWeightedScore(divergenceConditions, 25);
  
  // === COMBINE ===

  const allConditions = [...structureConditions, ...orderflowConditions, ...divergenceConditions];
  const totalScore = structureScore + orderflowScore + finalDivergenceScore;

  const consistency = persistenceRatio(
    recentWindow,
    6,
    (item) => item.cvdDelta > 0 && Math.abs(item.oiChangePct) < 3
  );

  let stage: 0 | 1 | 2 | 3 | 4 = 0;
  if (totalScore >= 80 && consistency >= 0.66) stage = 4;
  else if (totalScore >= 65 && consistency >= 0.5) stage = 3;
  else if (totalScore >= 50 && consistency >= 0.35) stage = 2;
  else if (totalScore >= 35) stage = 1;

  const stageNames = ['Inactive', 'Post-cap', 'Forming', 'Confirming', 'Confirmed'];

  return {
    score: Math.round(totalScore),
    stage,
    stageName: stageNames[stage],
    confidence: clamp(Math.round((totalScore * 0.7) + (consistency * 30)), 0, 100),
    prerequisitesMet: true,
    orderflowScore: Math.round(orderflowScore),
    technicalScore: Math.round(structureScore + finalDivergenceScore),
    signals: {
      orderflow: orderflowConditions.map((c) => ({
        name: c.name,
        met: c.score >= 40,
        points: Math.round((c.score / 100) * c.weight),
      })),
      technical: [...structureConditions, ...divergenceConditions].map((c) => ({
        name: c.name,
        met: c.score >= 40,
        points: Math.round((c.score / 100) * c.weight),
      })),
    },
    breakdown: {
      structure: Math.round(structureScore),
      orderflow: Math.round(orderflowScore),
      divergence: Math.round(finalDivergenceScore),
    },
    granularConditions: allConditions,
  };
}

export function detectDistribution(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral'
): PatternResult {
  const thresholds = getProfileThresholds(profile).distribution;
  const series = getSeries(history, current);
  const window14d = windowByDuration(series, 14 * DAY_MS);
  const { prices, volumes } = values(series);

  const minPoint = window14d.reduce<Snapshot | null>((lowest, item) => {
    if (!lowest || item.price < lowest.price) return item;
    return lowest;
  }, null);

  const rallyPct = minPoint ? toPercentChange(minPoint.price, current.price) : 0;
  const rallyDays = minPoint ? (current.timestamp - minPoint.timestamp) / DAY_MS : 0;
  const hadPositiveCvd = window14d.some((item) => item.cvdDelta > 0);
  const prerequisitesMet =
    rallyPct >= thresholds.rallyMin &&
    hadPositiveCvd &&
    rallyDays >= thresholds.minRallyDays;

  const rsi = calculateRSI(toCandles(prices), 14).map((point) => point.value);
  const rsiDiv = detectRSIDivergence(prices, rsi);
  const bb = getLatestBollinger(prices);
  const resistance = rollingHigh(prices, Math.max(20, barsForDuration(series, 5 * DAY_MS)));
  const volumeSlope = calculateSlope(volumes, 10);

  const touchedUpperRecently = bb.hasData && prices.slice(-4).some((price) => price >= bb.upper * 0.997);
  const bbRejection = bb.hasData && touchedUpperRecently && current.price < bb.upper * 0.995;
  const atResistance = current.price >= resistance * 0.985;
  const priceUp = toPercentChange(prices[Math.max(0, prices.length - 10)] ?? current.price, current.price) > 2;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price up but CVD negative', met: priceUp && current.cvdDelta < 0, points: 30 },
    { name: 'OI expanding', met: current.oiChangePct > thresholds.oiExpandMin, points: 25 },
    { name: 'Funding high', met: current.fundingRate > thresholds.fundingHighMin, points: 15 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'RSI bearish divergence', met: rsiDiv === 'bearish', points: 15 },
    { name: 'Volume declining', met: volumeSlope < 0, points: 12 },
    { name: 'At resistance', met: atResistance, points: 10 },
    { name: 'BB rejection', met: bbRejection, points: 8 },
  ];

  const consistency = persistenceRatio(series, 6, (item) => item.cvdDelta < 0 && item.oiChangePct > 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Early', 'Building', 'Active', 'Confirmed'], prerequisitesMet, consistency);
}


function scorePriceDrop(dropPct: number, profile: PatternSensitivityProfile): number {
  const thresholds = {
    aggressive: { min: 3, max: 25 },
    neutral: { min: 5, max: 35 },
    tame: { min: 8, max: 50 },
  }[profile];

  const absDropPct = Math.abs(dropPct);

  if (absDropPct < thresholds.min) return 0;
  if (absDropPct >= thresholds.max) return 100;

  const normalized = (absDropPct - thresholds.min) / (thresholds.max - thresholds.min);
  return Math.round(normalized * 100);
}

function scoreOIFlush(oiChangePct: number, profile: PatternSensitivityProfile): number {
  const thresholds = {
    aggressive: { min: 2, max: 12 },
    neutral: { min: 3, max: 15 },
    tame: { min: 5, max: 20 },
  }[profile];

  const absChange = Math.abs(oiChangePct);

  if (absChange < thresholds.min) return 0;
  if (absChange >= thresholds.max) return 100;

  const normalized = (absChange - thresholds.min) / (thresholds.max - thresholds.min);
  return Math.round(normalized * 100);
}

function scoreCVDVelocity(recentWindow: Snapshot[]): number {
  if (recentWindow.length === 0) return 0;

  const avgDelta = recentWindow.reduce((sum, s) => sum + s.cvdDelta, 0) / recentWindow.length;

  const cvdValues = recentWindow.map((s) => s.cvdDelta);
  const slope = calculateSlope(cvdValues, Math.min(10, cvdValues.length));

  if (avgDelta >= 0 || slope >= 0) return 0;

  const deltaScore = Math.min(100, Math.abs(avgDelta) / 50);
  const slopeScore = Math.min(100, Math.abs(slope) * 10);

  return Math.round((deltaScore + slopeScore) / 2);
}

function scoreFundingPanic(currentFunding: number, recentWindow: Snapshot[]): number {
  const currentScore = (() => {
    const absFunding = Math.abs(currentFunding);
    if (currentFunding >= -0.005) return 0;
    if (currentFunding <= -0.025) return 100;

    const normalized = (absFunding - 0.005) / (0.025 - 0.005);
    return Math.round(normalized * 100);
  })();

  const fundingValues = recentWindow.map((s) => s.fundingRate);
  const slope = calculateSlope(fundingValues, Math.min(6, fundingValues.length));

  const velocityScore = slope < 0 ? Math.min(50, Math.abs(slope) * 1000) : 0;

  return Math.round((currentScore * 0.7) + (velocityScore * 0.3));
}

function scoreVolumeSpike(currentVol: number, avgVol: number): number {
  if (avgVol === 0) return 0;

  const ratio = currentVol / avgVol;

  if (ratio < 1.5) return 0;
  if (ratio >= 5.0) return 100;

  const normalized = (ratio - 1.5) / (5.0 - 1.5);
  return Math.round(normalized * 100);
}

function scoreRSIExtreme(rsi: number): number {
  if (rsi >= 30) return 0;
  if (rsi <= 15) return 100;

  const normalized = (30 - rsi) / (30 - 15);
  return Math.round(normalized * 100);
}

function scoreBBBounce(currentPrice: number, bb: { lower: number; middle: number; upper: number; hasData: boolean }): number {
  if (!bb.hasData || bb.lower === 0) return 0;

  const distancePct = ((currentPrice - bb.lower) / bb.lower) * 100;

  if (distancePct >= 0) return 100;
  if (distancePct <= -5) return 0;
  if (distancePct >= -2) return 100;

  const normalized = 1 - ((Math.abs(distancePct) - 2) / (5 - 2));
  return Math.round(normalized * 100);
}

function scoreCVDStabilizing(recentWindow: Snapshot[]): number {
  if (recentWindow.length < 5) return 0;

  const recentCVD = recentWindow.slice(-5).map((s) => s.cvdDelta);
  const slope = calculateSlope(recentCVD, recentCVD.length);

  if (slope <= 0) return 0;

  return Math.round(Math.min(100, slope * 20));
}

const CONDITION_MET_THRESHOLD = 40;

export function detectCapitulation(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral'
): PatternResult {
  const series = getSeries(history, current);
  const recentWindow = windowByDuration(series, 24 * HOUR_MS);
  const { prices, volumes } = values(series);

  const bars24h = Math.max(3, barsForDuration(series, DAY_MS));
  const start24h = prices[Math.max(0, prices.length - bars24h)] ?? current.price;
  const dropPct = toPercentChange(start24h, current.price);

  const priceDropScore = scorePriceDrop(dropPct, profile);
  const oiFlushScore = scoreOIFlush(current.oiChangePct, profile);
  const cvdVelocityScore = scoreCVDVelocity(recentWindow);
  const fundingPanicScore = scoreFundingPanic(current.fundingRate, recentWindow);

  const rsi = calculateRSI(toCandles(prices), 14);
  const latestRsi = rsi[rsi.length - 1]?.value ?? 50;
  const rsiScore = scoreRSIExtreme(latestRsi);

  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const volumeSpikeScore = scoreVolumeSpike(current.volume, volumeAverage);

  const bb = getLatestBollinger(prices);
  const bbScore = scoreBBBounce(current.price, bb);

  const cvdStabilizingScore = scoreCVDStabilizing(recentWindow);

  const granularConditions: GranularCondition[] = [
    {
      id: 'priceDrop',
      name: 'Price Drop Severity',
      score: priceDropScore,
      weight: 20,
      max: 20,
      value: `${dropPct.toFixed(1)}%`,
      description: 'Magnitude of price decline in 24h',
    },
    {
      id: 'oiFlush',
      name: 'OI Flush Magnitude',
      score: oiFlushScore,
      weight: 25,
      max: 25,
      value: `${current.oiChangePct.toFixed(1)}%`,
      description: 'Degree of leverage deleveraging',
    },
    {
      id: 'cvdVelocity',
      name: 'CVD Selling Velocity',
      score: cvdVelocityScore,
      weight: 20,
      max: 20,
      description: 'Rate and magnitude of panic selling',
    },
    {
      id: 'fundingPanic',
      name: 'Funding Panic',
      score: fundingPanicScore,
      weight: 15,
      max: 15,
      value: `${(current.fundingRate * 100).toFixed(3)}%`,
      description: 'Funding rate extremity and velocity',
    },
    {
      id: 'volumeSpike',
      name: 'Volume Spike',
      score: volumeSpikeScore,
      weight: 15,
      max: 15,
      value: `${(current.volume / (volumeAverage || 1)).toFixed(1)}x`,
      description: 'Volume relative to average',
    },
    {
      id: 'rsiExtreme',
      name: 'RSI Oversold',
      score: rsiScore,
      weight: 10,
      max: 10,
      value: `RSI ${latestRsi.toFixed(0)}`,
      description: 'Momentum exhaustion level',
    },
    {
      id: 'bbBounce',
      name: 'BB Lower Bounce',
      score: bbScore,
      weight: 10,
      max: 10,
      description: 'Position relative to lower Bollinger Band',
    },
    {
      id: 'cvdStabilizing',
      name: 'CVD Stabilizing',
      score: cvdStabilizingScore,
      weight: 5,
      max: 5,
      description: 'CVD turning positive (panic ending)',
    },
  ];

  const orderflowConditions = granularConditions.slice(0, 4);
  const technicalConditions = granularConditions.slice(4);

  const orderflowScore = calculatePatternWeightedScore(orderflowConditions, 80);
const technicalScore = calculatePatternWeightedScore(technicalConditions, 20);
  const totalScore = orderflowScore + technicalScore;

  const consistency = persistenceRatio(
    recentWindow,
    4,
    (item) => item.cvdDelta < 0 || item.oiChangePct < 0
  );

  let stage: 0 | 1 | 2 | 3 | 4 = 0;
  if (totalScore >= 80 && consistency >= 0.66) stage = 4;
  else if (totalScore >= 65 && consistency >= 0.5) stage = 3;
  else if (totalScore >= 50 && consistency >= 0.35) stage = 2;
  else if (totalScore >= 35) stage = 1;

  const stageNames = ['Inactive', 'Accelerating', 'Panic', 'Extreme', 'Exhaustion'];

  const confidence = clamp(
    Math.round((totalScore * 0.7) + (consistency * 30)),
    0,
    100
  );

  return {
    score: Math.round(totalScore),
    stage,
    stageName: stageNames[stage],
    confidence,
    prerequisitesMet: totalScore >= 35,
    orderflowScore: Math.round(orderflowScore),
    technicalScore: Math.round(technicalScore),
    signals: {
      orderflow: orderflowConditions.map((c) => ({
        name: c.name,
        met: c.score >= CONDITION_MET_THRESHOLD,
        points: Math.round((c.score / 100) * c.weight),
      })),
      technical: technicalConditions.map((c) => ({
        name: c.name,
        met: c.score >= CONDITION_MET_THRESHOLD,
        points: Math.round((c.score / 100) * c.weight),
      })),
    },
    granularConditions,
  };
}

export function detectFakeout(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral'
): PatternResult {
  const thresholds = getProfileThresholds(profile).fakeout;
  const series = getSeries(history, current);
  const { prices, volumes } = values(series);

  const rsi = calculateRSI(toCandles(prices), 14).map((point) => point.value);
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const recentMovePct = toPercentChange(prices[Math.max(0, prices.length - 8)] ?? current.price, current.price);

  const preBreakPrices = prices.slice(-18, -6);
  const recentPrices = prices.slice(-6);
  const preResistance = preBreakPrices.length > 0 ? Math.max(...preBreakPrices) : rollingHigh(prices, 20);
  const breakoutSeen = recentPrices.some((price) => price > preResistance * 1.002);
  const noAcceptance = breakoutSeen && current.price < preResistance;
  const prerequisitesMet = recentMovePct > thresholds.recentMoveMin && breakoutSeen;

  const rsiSlope = calculateSlope(rsi, 6);

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price up but CVD flat/negative', met: recentMovePct > thresholds.recentMoveMin && current.cvdDelta <= 0, points: 30 },
    { name: 'OI up', met: current.oiChangePct > thresholds.oiUpMin, points: 25 },
    { name: 'Funding positive', met: current.fundingRate > 0, points: 15 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'No RSI confirmation', met: rsiSlope <= 0, points: 15 },
    { name: 'Low volume breakout', met: current.volume < volumeAverage * thresholds.lowVolumeMaxMultiplier, points: 12 },
    { name: 'No acceptance', met: noAcceptance, points: 10 },
  ];

  const consistency = persistenceRatio(series, 5, (item) => item.oiChangePct > 0 && item.cvdDelta <= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Weak pump', 'Leverage building', 'Overheated', 'Confirmed fakeout'], prerequisitesMet, consistency);
}

export function detectAccumulation(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral'
): PatternResult {
  const thresholds = getProfileThresholds(profile).accumulation;
  const series = getSeries(history, current);
  const window3d = windowByDuration(series, 3 * DAY_MS);
  const { prices, volumes } = values(series);

  const max3d = window3d.length > 0 ? Math.max(...window3d.map((item) => item.price)) : current.price;
  const min3d = window3d.length > 0 ? Math.min(...window3d.map((item) => item.price)) : current.price;
  const rangePct = toPercentChange(min3d, max3d);
  const duration3d = window3d.length > 0 ? window3d[window3d.length - 1].timestamp - window3d[0].timestamp : 0;
  const prerequisitesMet =
    rangePct <= thresholds.rangeMax &&
    duration3d >= (3 * DAY_MS * thresholds.minDurationFactor);

  const bb = getLatestBollinger(prices);
  const vpoc = calculateVPOC(prices, volumes, 30);
  const obv = calculateOBV(prices, volumes);

  const obvSlope = calculateSlope(obv, 8);
  const volumeSlope = calculateSlope(volumes, 10);
  const bandwidth = bb.hasData && bb.middle !== 0 ? (bb.upper - bb.lower) / bb.middle : 1;
  const nearVpoc =
    Math.abs(current.price - vpoc) / Math.max(1, current.price) < thresholds.nearVpocMaxDistance;

  const recentMove = Math.abs(toPercentChange(prices[Math.max(0, prices.length - 18)] ?? current.price, current.price));

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price flat but CVD positive', met: recentMove < 2 && current.cvdDelta > 0, points: 30 },
    { name: 'OI flat', met: Math.abs(current.oiChangePct) < thresholds.oiFlatMaxAbs, points: 25 },
    { name: 'Funding neutral', met: Math.abs(current.fundingRate) < thresholds.fundingNeutralMaxAbs, points: 15 },
    { name: 'Volume rising', met: volumeSlope > 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'OBV rising', met: obvSlope > 0, points: 15 },
    { name: 'BB squeeze', met: bandwidth < thresholds.bandwidthMax, points: 12 },
    { name: 'Volume node building', met: nearVpoc, points: 10 },
  ];

  const consistency = persistenceRatio(series, 8, (item) => Math.abs(item.oiChangePct) < 2 && item.cvdDelta >= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Early', 'Building', 'Active', 'Breakout imminent'], prerequisitesMet, consistency);
}

export function detectBearBreakdown(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral'
): PatternResult {
  const thresholds = getProfileThresholds(profile).bearBreakdown;
  const series = getSeries(history, current);
  const { prices, volumes } = values(series);

  const supportLookback = Math.max(15, barsForDuration(series, 36 * HOUR_MS));
  const support = rollingLow(prices.slice(0, -1), supportLookback);
  const brokeSupport = support > 0 && current.price < support * 0.998;

  const rsi = calculateRSI(toCandles(prices), 14).map((point) => point.value);
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const recentDownMove = toPercentChange(prices[Math.max(0, prices.length - 10)] ?? current.price, current.price);
  const prerequisitesMet = brokeSupport || recentDownMove <= -thresholds.recentDownMoveMin;

  const latestRsi = rsi[rsi.length - 1] ?? 50;
  const rsiSlope = calculateSlope(rsi, 6);
  const weakRecovery = latestRsi < thresholds.weakRecoveryRsiMax && rsiSlope <= 0;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price breaking support', met: brokeSupport, points: 20 },
    { name: 'CVD negative', met: current.cvdDelta < 0, points: 30 },
    { name: 'OI expanding', met: current.oiChangePct > thresholds.oiExpandMin, points: 25 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'Volume spike', met: current.volume > volumeAverage * thresholds.volumeSpikeMinMultiplier, points: 15 },
    { name: 'RSI weak recovery', met: weakRecovery, points: 12 },
    { name: 'Below support', met: brokeSupport, points: 10 },
  ];

  const consistency = persistenceRatio(series, 6, (item) => item.cvdDelta < 0 && item.oiChangePct >= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Weakening', 'Breaking', 'Accelerating', 'Confirmed'], prerequisitesMet, consistency);
}

export function runPatternDetectors(
  history: Snapshot[],
  current: Snapshot,
  profile: PatternSensitivityProfile = 'neutral'
): PatternDetectionItem[] {
  return PATTERN_DEFINITIONS.map((definition) => {
    let result: PatternResult;

    if (definition.key === 'healthyBottom') {
      result = detectHealthyBottom(history, current, profile);
    } else if (definition.key === 'distribution') {
      result = detectDistribution(history, current, profile);
    } else if (definition.key === 'capitulation') {
      result = detectCapitulation(history, current, profile);
    } else if (definition.key === 'fakeout') {
      result = detectFakeout(history, current, profile);
    } else if (definition.key === 'accumulation') {
      result = detectAccumulation(history, current, profile);
    } else {
      result = detectBearBreakdown(history, current, profile);
    }

    return { definition, result };
  });
}

export function shouldUpdatePatternSnapshot(previous: Snapshot | null, nextTimestamp: number): boolean {
  if (!previous) return true;
  return nextTimestamp - previous.timestamp >= FOUR_HOURS_MS;
}
