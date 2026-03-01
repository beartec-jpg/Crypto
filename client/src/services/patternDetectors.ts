import {
  calculateBollingerBands,
  calculateMACD,
  calculateRSI,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercentChange(first: number, last: number): number {
  if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return 0;
  return ((last - first) / first) * 100;
}

function getWindow(history: Snapshot[], hours: number): Snapshot[] {
  if (history.length === 0) return [];
  const latest = history[history.length - 1];
  const minTimestamp = latest.timestamp - hours * 60 * 60 * 1000;
  return history.filter((item) => item.timestamp >= minTimestamp);
}

function getRecentCount(history: Snapshot[], hours: number): number {
  return getWindow(history, hours).length;
}

function normalizeSignals(signals: PatternSignal[], maxScore: number): number {
  const rawScore = signals.filter((signal) => signal.met).reduce((sum, signal) => sum + signal.points, 0);
  const maxRaw = signals.reduce((sum, signal) => sum + signal.points, 0);
  if (maxRaw <= 0) return 0;
  return clamp((rawScore / maxRaw) * maxScore, 0, maxScore);
}

function buildResult(
  orderflowSignals: PatternSignal[],
  technicalSignals: PatternSignal[],
  stageNames: string[],
  prerequisitesMet: boolean
): PatternResult {
  const orderflowScore = normalizeSignals(orderflowSignals, 60);
  const technicalScore = normalizeSignals(technicalSignals, 40);
  const combinedScore = orderflowScore + technicalScore;
  const effectiveScore = prerequisitesMet ? combinedScore : Math.min(combinedScore, 45);

  let stage: 0 | 1 | 2 | 3 | 4 = 0;
  if (effectiveScore >= 80) stage = 4;
  else if (effectiveScore >= 65) stage = 3;
  else if (effectiveScore >= 50) stage = 2;
  else if (effectiveScore >= 35) stage = 1;

  if (!prerequisitesMet && effectiveScore < 35) {
    stage = 0;
  }

  const confidence = clamp(Math.round((effectiveScore * 0.8) + (prerequisitesMet ? 20 : 0)), 0, 100);

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

function getSeries(history: Snapshot[], current: Snapshot): { prices: number[]; volumes: number[]; cvd: number[] } {
  const combined = [...history, current].sort((a, b) => a.timestamp - b.timestamp);
  return {
    prices: combined.map((item) => item.price),
    volumes: combined.map((item) => item.volume),
    cvd: combined.map((item) => item.cvdDelta),
  };
}

function calculateOBV(prices: number[], volumes: number[]): number[] {
  if (prices.length === 0) return [];
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

function priceBreaksSupport(history: Snapshot[], current: Snapshot): boolean {
  if (history.length < 10) return false;
  const support = Math.min(...history.slice(-10).map((item) => item.price));
  return current.price < support;
}

function isRecentPriceUp(history: Snapshot[], current: Snapshot, bars: number = 12): boolean {
  if (history.length === 0) return false;
  const start = history[Math.max(0, history.length - bars)].price;
  return toPercentChange(start, current.price) > 0;
}

function isRecentPriceDown(history: Snapshot[], current: Snapshot, bars: number = 12): boolean {
  if (history.length === 0) return false;
  const start = history[Math.max(0, history.length - bars)].price;
  return toPercentChange(start, current.price) < 0;
}

export function detectHealthyBottom(history: Snapshot[], current: Snapshot): PatternResult {
  const window48h = getWindow(history, 48);
  const firstPrice = window48h[0]?.price ?? current.price;
  const priceDropPct = toPercentChange(firstPrice, current.price);
  const oiMin = Math.min(...window48h.map((item) => item.oiChangePct), current.oiChangePct);
  const prerequisitesMet = priceDropPct <= -8 && oiMin <= -4 && current.fundingRate < -0.008;

  const { prices, volumes } = getSeries(history, current);
  const rsi = calculateRSI(prices);
  const rsiDiv = detectRSIDivergence(prices, rsi);
  const macd = calculateMACD(prices);
  const stochRsi = calculateStochRSI(prices);
  const volumeAverage = calculateVolumeAverage(volumes, 20);

  const latestMacd = macd.macd[macd.macd.length - 1] ?? 0;
  const latestSignal = macd.signal[macd.signal.length - 1] ?? 0;
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
    { name: 'Volume support', met: current.volume >= volumeAverage * 0.9, points: 10 },
    { name: 'MACD positive', met: latestMacd > latestSignal, points: 10 },
    { name: 'StochRSI cross', met: latestK > latestD, points: 5 },
  ];

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Post-cap', 'Forming', 'Confirming', 'Confirmed'], prerequisitesMet);
}

export function detectDistribution(history: Snapshot[], current: Snapshot): PatternResult {
  const window14d = getWindow(history, 14 * 24);
  const window7d = getWindow(history, 7 * 24);
  const first7d = window7d[0]?.price ?? current.price;
  const rally7dPct = toPercentChange(first7d, current.price);
  const rallyDays = getRecentCount(history, 24 * 4) >= 72 ? 3 : Math.max(1, getRecentCount(history, 24) / 6);
  const hadPositiveCvd = window14d.some((item) => item.cvdDelta > 0);
  const prerequisitesMet = rally7dPct >= 15 && hadPositiveCvd && rallyDays >= 3;

  const { prices, volumes } = getSeries(history, current);
  const rsi = calculateRSI(prices);
  const rsiDiv = detectRSIDivergence(prices, rsi);
  const bb = calculateBollingerBands(prices);
  const volumeAverage = calculateVolumeAverage(volumes, 20);

  const latestMiddle = bb.middle[bb.middle.length - 1] ?? current.price;
  const latestUpper = bb.upper[bb.upper.length - 1] ?? current.price;
  const nearResistance = current.price >= latestMiddle * 1.01;
  const bbRejection = current.price < latestUpper && current.price > latestMiddle;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price up but CVD negative', met: isRecentPriceUp(history, current) && current.cvdDelta < 0, points: 30 },
    { name: 'OI expanding', met: current.oiChangePct > 0.8, points: 25 },
    { name: 'Funding high', met: current.fundingRate > 0.008, points: 15 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'RSI bearish divergence', met: rsiDiv === 'bearish', points: 15 },
    { name: 'Volume declining', met: current.volume < volumeAverage * 0.9, points: 12 },
    { name: 'At resistance', met: nearResistance, points: 10 },
    { name: 'BB rejection', met: bbRejection, points: 8 },
  ];

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Early', 'Building', 'Active', 'Confirmed'], prerequisitesMet);
}

export function detectCapitulation(history: Snapshot[], current: Snapshot): PatternResult {
  const { prices, volumes } = getSeries(history, current);
  const rsi = calculateRSI(prices);
  const bb = calculateBollingerBands(prices);
  const volumeAverage = calculateVolumeAverage(volumes, 20);

  const lookbackFirst = history[Math.max(0, history.length - 30)]?.price ?? current.price;
  const dropPct = toPercentChange(lookbackFirst, current.price);
  const oIFlush = current.oiChangePct <= -4;
  const prerequisitesMet = dropPct <= -6 || oIFlush;

  const latestRsi = rsi[rsi.length - 1] ?? 50;
  const latestLower = bb.lower[bb.lower.length - 1] ?? current.price;
  const lowerBounce = current.price >= latestLower;

  const cvdRecent = history.slice(-3).map((item) => item.cvdDelta);
  const cvdTurningPositive = cvdRecent.length >= 2 && cvdRecent[cvdRecent.length - 1] > cvdRecent[0];

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price down >8%', met: dropPct <= -8, points: 20 },
    { name: 'CVD negative', met: current.cvdDelta < 0, points: 20 },
    { name: 'OI flush', met: oIFlush, points: 25 },
    { name: 'Funding very negative', met: current.fundingRate < -0.01, points: 15 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'Volume spike 2x', met: current.volume >= volumeAverage * 2, points: 15 },
    { name: 'RSI <25', met: latestRsi < 25, points: 10 },
    { name: 'BB lower bounce', met: lowerBounce, points: 10 },
    { name: 'Stabilizing', met: cvdTurningPositive, points: 5 },
  ];

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Accelerating', 'Panic', 'Extreme', 'Exhaustion'], prerequisitesMet);
}

export function detectFakeout(history: Snapshot[], current: Snapshot): PatternResult {
  const { prices, volumes } = getSeries(history, current);
  const rsi = calculateRSI(prices);
  const rsiDiv = detectRSIDivergence(prices, rsi);
  const volumeAverage = calculateVolumeAverage(volumes, 20);

  const prerequisitesMet = isRecentPriceUp(history, current) && current.oiChangePct > 0;
  const lowVolumeBreakout = current.volume < volumeAverage * 0.85;
  const noAcceptance = history.length > 4 && current.price < Math.max(...history.slice(-4).map((item) => item.price));

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price up but CVD flat/negative', met: isRecentPriceUp(history, current) && current.cvdDelta <= 0, points: 30 },
    { name: 'OI up', met: current.oiChangePct > 0.8, points: 25 },
    { name: 'Funding positive', met: current.fundingRate > 0, points: 15 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'No RSI confirmation', met: rsiDiv !== 'bullish', points: 15 },
    { name: 'Low volume breakout', met: lowVolumeBreakout, points: 12 },
    { name: 'No acceptance', met: noAcceptance, points: 10 },
  ];

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Weak pump', 'Leverage building', 'Overheated', 'Confirmed fakeout'], prerequisitesMet);
}

export function detectAccumulation(history: Snapshot[], current: Snapshot): PatternResult {
  const { prices, volumes } = getSeries(history, current);
  const bb = calculateBollingerBands(prices);
  const vpoc = calculateVPOC(prices, volumes, 30);
  const obv = calculateOBV(prices, volumes);

  const window72h = getWindow(history, 72);
  const maxPrice = Math.max(...window72h.map((item) => item.price), current.price);
  const minPrice = Math.min(...window72h.map((item) => item.price), current.price);
  const rangePct = toPercentChange(minPrice, maxPrice);
  const prerequisitesMet = rangePct <= 5 && window72h.length >= Math.floor((3 * 24 * 60) / 10);

  const latestMiddle = bb.middle[bb.middle.length - 1] ?? current.price;
  const latestUpper = bb.upper[bb.upper.length - 1] ?? current.price;
  const latestLower = bb.lower[bb.lower.length - 1] ?? current.price;
  const squeeze = (latestUpper - latestLower) / Math.max(1, latestMiddle) < 0.05;

  const obvUp = obv.length > 4 && obv[obv.length - 1] > obv[obv.length - 4];
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const volumeRising = current.volume >= volumeAverage;
  const nearVpoc = Math.abs(current.price - vpoc) / Math.max(1, current.price) < 0.015;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price flat but CVD positive', met: Math.abs(toPercentChange(history[Math.max(0, history.length - 18)]?.price ?? current.price, current.price)) < 2 && current.cvdDelta > 0, points: 30 },
    { name: 'OI flat', met: Math.abs(current.oiChangePct) < 1.5, points: 25 },
    { name: 'Funding neutral', met: Math.abs(current.fundingRate) < 0.004, points: 15 },
    { name: 'Volume rising', met: volumeRising, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'OBV rising', met: obvUp, points: 15 },
    { name: 'BB squeeze', met: squeeze, points: 12 },
    { name: 'Volume node building', met: nearVpoc, points: 10 },
  ];

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Early', 'Building', 'Active', 'Breakout imminent'], prerequisitesMet);
}

export function detectBearBreakdown(history: Snapshot[], current: Snapshot): PatternResult {
  const { prices, volumes } = getSeries(history, current);
  const rsi = calculateRSI(prices);
  const volumeAverage = calculateVolumeAverage(volumes, 20);
  const prerequisitesMet = priceBreaksSupport(history, current) || isRecentPriceDown(history, current);

  const latestRsi = rsi[rsi.length - 1] ?? 50;
  const weakRecovery = latestRsi < 45;

  const orderflowSignals: PatternSignal[] = [
    { name: 'Price breaking support', met: priceBreaksSupport(history, current), points: 20 },
    { name: 'CVD negative', met: current.cvdDelta < 0, points: 30 },
    { name: 'OI expanding', met: current.oiChangePct > 0.8, points: 25 },
    { name: 'Premium negative', met: current.premium < 0, points: 10 },
  ];

  const technicalSignals: PatternSignal[] = [
    { name: 'Volume spike', met: current.volume > volumeAverage * 1.5, points: 15 },
    { name: 'RSI weak recovery', met: weakRecovery, points: 12 },
    { name: 'Below support', met: priceBreaksSupport(history, current), points: 10 },
  ];

  return buildResult(orderflowSignals, technicalSignals, ['Inactive', 'Weakening', 'Breaking', 'Accelerating', 'Confirmed'], prerequisitesMet);
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
