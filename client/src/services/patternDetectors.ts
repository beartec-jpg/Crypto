import {
  calculateBollingerBands,
  calculateMACD,
  calculateRSI,
  calculateSlope,
  calculateStochRSI,
  calculateVPOC,
  calculateVolumeAverage,
  detectRSIDivergence,
} from '@/lib/technicalIndicators';

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

const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  if (valuesList.length === 0) return TEN_MINUTES_MS;
  const sorted = [...valuesList].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function medianIntervalMs(series: Snapshot[]): number {
  if (series.length < 2) return TEN_MINUTES_MS;
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
  const bb = calculateBollingerBands(prices, 20, 2);
  const lastIndex = bb.upper.length - 1;

  return {
    upper: bb.upper[lastIndex] ?? 0,
    middle: bb.middle[lastIndex] ?? 0,
    lower: bb.lower[lastIndex] ?? 0,
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

export function detectHealthyBottom(history: Snapshot[], current: Snapshot): PatternResult {
  const series = getSeries(history, current);
  const recent48h = windowByDuration(series, 48 * HOUR_MS);
  const { prices, volumes } = values(series);

  const peak48h = recent48h.length > 0 ? Math.max(...recent48h.map((item) => item.price)) : current.price;
  const drawdownFromPeak = toPercentChange(peak48h, current.price);
  const oiMin = recent48h.length > 0 ? Math.min(...recent48h.map((item) => item.oiChangePct)) : current.oiChangePct;
  const hadFundingNeg = recent48h.some((item) => item.fundingRate < -0.008);
  const prerequisitesMet = drawdownFromPeak <= -8 && oiMin <= -4 && hadFundingNeg;

  const rsi = calculateRSI(prices, 14);
  const rsiDiv = detectRSIDivergence(prices, rsi);
  const macd = calculateMACD(prices);
  const stochRsi = calculateStochRSI(prices, 14);
  const volumeAverage = calculateVolumeAverage(volumes, 20);

  const latestMacd = macd.macd[macd.macd.length - 1] ?? 0;
  const latestSignal = macd.signal[macd.signal.length - 1] ?? 0;
  const latestHist = macd.histogram[macd.histogram.length - 1] ?? 0;
  const latestK = stochRsi.k[stochRsi.k.length - 1] ?? 0;
  const latestD = stochRsi.d[stochRsi.d.length - 1] ?? 0;

  const orderflowSignals: PatternSignal[] = [
    { name: 'CVD positive', met: current.cvdDelta > 0, points: 30 },
    { name: 'OI down', met: current.oiChangePct < 0, points: 25 },
    { name: 'Funding negative', met: current.fundingRate < 0, points: 15 },
    { name: 'Premium positive', met: current.premium > 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'RSI bullish divergence', met: rsiDiv === 'bullish', points: 15 },
    { name: 'Volume support', met: current.volume >= volumeAverage, points: 10 },
    { name: 'MACD positive', met: latestMacd > latestSignal && latestHist > 0, points: 10 },
    { name: 'StochRSI cross', met: latestK > latestD && latestK < 80, points: 5 },
  ];

  const consistency = persistenceRatio(series, 6, (item) => item.cvdDelta > 0 && item.oiChangePct <= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Post-cap', 'Forming', 'Confirming', 'Confirmed'], prerequisitesMet, consistency);
}

export function detectDistribution(history: Snapshot[], current: Snapshot): PatternResult {
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
  const prerequisitesMet = rallyPct >= 15 && hadPositiveCvd && rallyDays >= 3;

  const rsi = calculateRSI(prices, 14);
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
    { name: 'OI expanding', met: current.oiChangePct > 1, points: 25 },
    { name: 'Funding high', met: current.fundingRate > 0.008, points: 15 },
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

export function detectCapitulation(history: Snapshot[], current: Snapshot): PatternResult {
  const series = getSeries(history, current);
  const { prices, volumes, cvd } = values(series);

  const bars24h = Math.max(3, barsForDuration(series, DAY_MS));
  const start24h = prices[Math.max(0, prices.length - bars24h)] ?? current.price;
  const dropPct = toPercentChange(start24h, current.price);

  const rsi = calculateRSI(prices, 14);
  const bb = getLatestBollinger(prices);
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const cvdSlope = calculateSlope(cvd, 5);

  const latestRsi = rsi[rsi.length - 1] ?? 50;
  const lowerBounce = bb.hasData && current.price >= bb.lower;
  const prerequisitesMet = dropPct <= -4 || current.oiChangePct <= -3 || current.fundingRate <= -0.008;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price down >8%', met: dropPct <= -8, points: 20 },
    { name: 'CVD negative', met: current.cvdDelta < 0, points: 20 },
    { name: 'OI flush', met: current.oiChangePct <= -4, points: 25 },
    { name: 'Funding very negative', met: current.fundingRate < -0.01, points: 15 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'Volume spike 2x', met: current.volume >= volumeAverage * 2, points: 15 },
    { name: 'RSI <25', met: latestRsi < 25, points: 10 },
    { name: 'BB lower bounce', met: lowerBounce, points: 10 },
    { name: 'Stabilizing', met: cvdSlope > 0, points: 5 },
  ];

  const consistency = persistenceRatio(series, 4, (item) => item.cvdDelta < 0 || item.oiChangePct < 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Accelerating', 'Panic', 'Extreme', 'Exhaustion'], prerequisitesMet, consistency);
}

export function detectFakeout(history: Snapshot[], current: Snapshot): PatternResult {
  const series = getSeries(history, current);
  const { prices, volumes } = values(series);

  const rsi = calculateRSI(prices, 14);
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const recentMovePct = toPercentChange(prices[Math.max(0, prices.length - 8)] ?? current.price, current.price);

  const preBreakPrices = prices.slice(-18, -6);
  const recentPrices = prices.slice(-6);
  const preResistance = preBreakPrices.length > 0 ? Math.max(...preBreakPrices) : rollingHigh(prices, 20);
  const breakoutSeen = recentPrices.some((price) => price > preResistance * 1.002);
  const noAcceptance = breakoutSeen && current.price < preResistance;
  const prerequisitesMet = recentMovePct > 2 && breakoutSeen;

  const rsiSlope = calculateSlope(rsi, 6);

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price up but CVD flat/negative', met: recentMovePct > 2 && current.cvdDelta <= 0, points: 30 },
    { name: 'OI up', met: current.oiChangePct > 0.8, points: 25 },
    { name: 'Funding positive', met: current.fundingRate > 0, points: 15 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'No RSI confirmation', met: rsiSlope <= 0, points: 15 },
    { name: 'Low volume breakout', met: current.volume < volumeAverage * 0.85, points: 12 },
    { name: 'No acceptance', met: noAcceptance, points: 10 },
  ];

  const consistency = persistenceRatio(series, 5, (item) => item.oiChangePct > 0 && item.cvdDelta <= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Weak pump', 'Leverage building', 'Overheated', 'Confirmed fakeout'], prerequisitesMet, consistency);
}

export function detectAccumulation(history: Snapshot[], current: Snapshot): PatternResult {
  const series = getSeries(history, current);
  const window3d = windowByDuration(series, 3 * DAY_MS);
  const { prices, volumes } = values(series);

  const max3d = window3d.length > 0 ? Math.max(...window3d.map((item) => item.price)) : current.price;
  const min3d = window3d.length > 0 ? Math.min(...window3d.map((item) => item.price)) : current.price;
  const rangePct = toPercentChange(min3d, max3d);
  const duration3d = window3d.length > 0 ? window3d[window3d.length - 1].timestamp - window3d[0].timestamp : 0;
  const prerequisitesMet = rangePct <= 5 && duration3d >= (3 * DAY_MS * 0.9);

  const bb = getLatestBollinger(prices);
  const vpoc = calculateVPOC(prices, volumes, 30);
  const obv = calculateOBV(prices, volumes);

  const obvSlope = calculateSlope(obv, 8);
  const volumeSlope = calculateSlope(volumes, 10);
  const bandwidth = bb.hasData && bb.middle !== 0 ? (bb.upper - bb.lower) / bb.middle : 1;
  const nearVpoc = Math.abs(current.price - vpoc) / Math.max(1, current.price) < 0.01;

  const recentMove = Math.abs(toPercentChange(prices[Math.max(0, prices.length - 18)] ?? current.price, current.price));

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price flat but CVD positive', met: recentMove < 2 && current.cvdDelta > 0, points: 30 },
    { name: 'OI flat', met: Math.abs(current.oiChangePct) < 1.5, points: 25 },
    { name: 'Funding neutral', met: Math.abs(current.fundingRate) < 0.004, points: 15 },
    { name: 'Volume rising', met: volumeSlope > 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'OBV rising', met: obvSlope > 0, points: 15 },
    { name: 'BB squeeze', met: bandwidth < 0.045, points: 12 },
    { name: 'Volume node building', met: nearVpoc, points: 10 },
  ];

  const consistency = persistenceRatio(series, 8, (item) => Math.abs(item.oiChangePct) < 2 && item.cvdDelta >= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Early', 'Building', 'Active', 'Breakout imminent'], prerequisitesMet, consistency);
}

export function detectBearBreakdown(history: Snapshot[], current: Snapshot): PatternResult {
  const series = getSeries(history, current);
  const { prices, volumes } = values(series);

  const supportLookback = Math.max(15, barsForDuration(series, 36 * HOUR_MS));
  const support = rollingLow(prices.slice(0, -1), supportLookback);
  const brokeSupport = support > 0 && current.price < support * 0.998;

  const rsi = calculateRSI(prices, 14);
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const recentDownMove = toPercentChange(prices[Math.max(0, prices.length - 10)] ?? current.price, current.price);
  const prerequisitesMet = brokeSupport || recentDownMove <= -4;

  const latestRsi = rsi[rsi.length - 1] ?? 50;
  const rsiSlope = calculateSlope(rsi, 6);
  const weakRecovery = latestRsi < 45 && rsiSlope <= 0;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price breaking support', met: brokeSupport, points: 20 },
    { name: 'CVD negative', met: current.cvdDelta < 0, points: 30 },
    { name: 'OI expanding', met: current.oiChangePct > 0.8, points: 25 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'Volume spike', met: current.volume > volumeAverage * 1.5, points: 15 },
    { name: 'RSI weak recovery', met: weakRecovery, points: 12 },
    { name: 'Below support', met: brokeSupport, points: 10 },
  ];

  const consistency = persistenceRatio(series, 6, (item) => item.cvdDelta < 0 && item.oiChangePct >= 0);

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Weakening', 'Breaking', 'Accelerating', 'Confirmed'], prerequisitesMet, consistency);
}

export function runPatternDetectors(history: Snapshot[], current: Snapshot): PatternDetectionItem[] {
  return PATTERN_DEFINITIONS.map((definition) => {
    let result: PatternResult;

    if (definition.key === 'healthyBottom') {
      result = detectHealthyBottom(history, current);
    } else if (definition.key === 'distribution') {
      result = detectDistribution(history, current);
    } else if (definition.key === 'capitulation') {
      result = detectCapitulation(history, current);
    } else if (definition.key === 'fakeout') {
      result = detectFakeout(history, current);
    } else if (definition.key === 'accumulation') {
      result = detectAccumulation(history, current);
    } else {
      result = detectBearBreakdown(history, current);
    }

    return { definition, result };
  });
}

export function shouldUpdatePatternSnapshot(previous: Snapshot | null, nextTimestamp: number): boolean {
  if (!previous) return true;
  return nextTimestamp - previous.timestamp >= TEN_MINUTES_MS;
}
