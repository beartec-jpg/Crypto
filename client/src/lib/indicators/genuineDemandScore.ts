import type { Candle, CVDDataItem } from '@/types/chart';
import { PatternHistoryManager } from '@/services/PatternHistoryManager';
import {
  runPatternDetectors,
  type PatternDetectionItem,
  type Snapshot,
} from '@/services/patternDetectors';

const PRICE_WEIGHT = 15;
const CVD_WEIGHT = 30;
const OI_WEIGHT = 25;
const FUNDING_WEIGHT = 20;
const PREMIUM_WEIGHT = 10;

export interface GDSExternalMetrics {
  openInterestChangePct?: number;
  fundingRate?: number;
  coinbasePremiumPct?: number;
  symbol?: string;
}

export interface GDSComponentScore {
  key: 'price' | 'cvd' | 'oi' | 'funding' | 'premium';
  label: string;
  score: number;
  maxScore: number;
  isPositive: boolean;
  isAvailable: boolean;
}

export interface MarketPattern {
  name: string;
  confidence: 'High' | 'Medium' | 'Low';
  description: string;
  emoji: string;
  bullishSignals: string[];
  bearishSignals: string[];
  neutralSignals: string[];
  recommendation: string;
}

export interface GenuineDemandScoreResult {
  score: number;
  verdict: string;
  emoji: '🚀' | '✅' | '🟡' | '⚠️' | '🔴';
  components: GDSComponentScore[];
  activeWeight: number;
  totalWeight: number;
  flags: {
    fakeBreakoutWarning: boolean;
    confirmationStrength: boolean;
  };
  pattern: MarketPattern;
  patterns: PatternDetectionItem[];
  rawReadings: {
    fundingRate: number | undefined;
    coinbasePremium: number | undefined;
    oiChange: number | undefined;
    cvdDelta: number | undefined;
    priceChangePct: number | undefined;
  };
}

export interface CalculateGDSInput {
  candles: Candle[];
  cvdData: CVDDataItem[];
  lookbackBars?: number;
  externalMetrics?: GDSExternalMetrics;
  scoreHistory?: number[];
  persistHistory?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getConfidenceLabel(confidence: number): MarketPattern['confidence'] {
  if (confidence >= 75) return 'High';
  if (confidence >= 45) return 'Medium';
  return 'Low';
}

function getEmojiFromScore(score: number): GenuineDemandScoreResult['emoji'] {
  if (score >= 80) return '🚀';
  if (score >= 60) return '✅';
  if (score >= 40) return '🟡';
  if (score >= 20) return '⚠️';
  return '🔴';
}

function buildFallbackComponents(): GDSComponentScore[] {
  return [
    { key: 'price', label: 'Price Momentum', score: 0, maxScore: PRICE_WEIGHT, isPositive: false, isAvailable: false },
    { key: 'cvd', label: 'Spot CVD Strength', score: 0, maxScore: CVD_WEIGHT, isPositive: false, isAvailable: false },
    { key: 'oi', label: 'OI Contraction', score: 0, maxScore: OI_WEIGHT, isPositive: false, isAvailable: false },
    { key: 'funding', label: 'Funding Pressure', score: 0, maxScore: FUNDING_WEIGHT, isPositive: false, isAvailable: false },
    { key: 'premium', label: 'Coinbase Premium', score: 0, maxScore: PREMIUM_WEIGHT, isPositive: false, isAvailable: false },
  ];
}

function buildSnapshot(candles: Candle[], cvdData: CVDDataItem[], externalMetrics?: GDSExternalMetrics): Snapshot | null {
  const latestCandle = candles[candles.length - 1];
  if (!latestCandle) return null;

  const latestCvd = cvdData[cvdData.length - 1];
  const previousCvd = cvdData[cvdData.length - 2];
  const cvdDelta = latestCvd
    ? typeof previousCvd?.cumDelta === 'number'
      ? latestCvd.cumDelta - previousCvd.cumDelta
      : latestCvd.delta
    : 0;

  return {
    timestamp: Date.now(),
    price: latestCandle.close,
    cvdDelta: Number.isFinite(cvdDelta) ? cvdDelta : 0,
    oiChangePct: externalMetrics?.openInterestChangePct ?? 0,
    fundingRate: externalMetrics?.fundingRate ?? 0,
    premium: externalMetrics?.coinbasePremiumPct ?? 0,
    volume: latestCandle.volume,
  };
}

function buildLegacyPattern(topPattern: PatternDetectionItem | null): MarketPattern {
  if (!topPattern) {
    return {
      name: 'Neutral/Choppy',
      confidence: 'Low',
      description: 'No clear high-confidence structure detected.',
      emoji: '😐',
      bullishSignals: [],
      bearishSignals: [],
      neutralSignals: ['Insufficient data or conflicting signals'],
      recommendation: 'Wait for stronger confluence before acting.',
    };
  }

  const bullishSignals = topPattern.result.signals.orderflow
    .filter((signal) => signal.met)
    .slice(0, 2)
    .map((signal) => signal.name);

  const technicalSignals = topPattern.result.signals.technical
    .filter((signal) => signal.met)
    .slice(0, 2)
    .map((signal) => signal.name);

  const missedSignals = [
    ...topPattern.result.signals.orderflow,
    ...topPattern.result.signals.technical,
  ]
    .filter((signal) => !signal.met)
    .slice(0, 2)
    .map((signal) => signal.name);

  return {
    name: topPattern.definition.name,
    confidence: getConfidenceLabel(topPattern.result.confidence),
    description: `${topPattern.result.stageName} stage with ${topPattern.result.score}/100 structure score.`,
    emoji: topPattern.definition.emoji,
    bullishSignals,
    bearishSignals: missedSignals,
    neutralSignals: technicalSignals,
    recommendation: topPattern.definition.recommendation,
  };
}

function toLegacyComponents(
  priceChangePct: number | undefined,
  cvdDelta: number | undefined,
  metrics: GDSExternalMetrics | undefined
): GDSComponentScore[] {
  const oiChange = metrics?.openInterestChangePct;
  const funding = metrics?.fundingRate;
  const premium = metrics?.coinbasePremiumPct;

  const priceScore = typeof priceChangePct === 'number' ? clamp((priceChangePct + 10) / 20, 0, 1) * PRICE_WEIGHT : 0;
  const cvdScore = typeof cvdDelta === 'number' ? clamp(cvdDelta > 0 ? 1 : 0, 0, 1) * CVD_WEIGHT : 0;
  const oiScore = typeof oiChange === 'number' ? clamp(oiChange < 0 ? Math.min(Math.abs(oiChange) / 5, 1) : 0, 0, 1) * OI_WEIGHT : 0;
  const fundingScore = typeof funding === 'number' ? clamp(funding < 0 ? Math.min(Math.abs(funding) / 0.03, 1) : 0, 0, 1) * FUNDING_WEIGHT : 0;
  const premiumScore = typeof premium === 'number' ? clamp(premium > 0 ? Math.min(premium / 0.2, 1) : 0, 0, 1) * PREMIUM_WEIGHT : 0;

  return [
    {
      key: 'price',
      label: 'Price Momentum',
      score: priceScore,
      maxScore: PRICE_WEIGHT,
      isPositive: priceScore > PRICE_WEIGHT * 0.35,
      isAvailable: typeof priceChangePct === 'number',
    },
    {
      key: 'cvd',
      label: 'Spot CVD Strength',
      score: cvdScore,
      maxScore: CVD_WEIGHT,
      isPositive: cvdScore > CVD_WEIGHT * 0.35,
      isAvailable: typeof cvdDelta === 'number',
    },
    {
      key: 'oi',
      label: 'OI Contraction',
      score: oiScore,
      maxScore: OI_WEIGHT,
      isPositive: oiScore > OI_WEIGHT * 0.35,
      isAvailable: typeof oiChange === 'number',
    },
    {
      key: 'funding',
      label: 'Funding Pressure',
      score: fundingScore,
      maxScore: FUNDING_WEIGHT,
      isPositive: fundingScore > FUNDING_WEIGHT * 0.35,
      isAvailable: typeof funding === 'number',
    },
    {
      key: 'premium',
      label: 'Coinbase Premium',
      score: premiumScore,
      maxScore: PREMIUM_WEIGHT,
      isPositive: premiumScore > PREMIUM_WEIGHT * 0.35,
      isAvailable: typeof premium === 'number',
    },
  ];
}

function getTopPattern(patterns: PatternDetectionItem[]): PatternDetectionItem | null {
  if (patterns.length === 0) return null;
  return patterns.reduce<PatternDetectionItem>((best, current) => {
    if (current.result.score > best.result.score) return current;
    return best;
  }, patterns[0]);
}

function getVerdict(topPattern: PatternDetectionItem | null): string {
  if (!topPattern) return 'Insufficient data for pattern detection';
  return `${topPattern.definition.name} - ${topPattern.result.stageName}`;
}

function applyPatternEmoji(topPattern: PatternDetectionItem | null): GenuineDemandScoreResult['emoji'] {
  if (!topPattern) return '🟡';
  return getEmojiFromScore(topPattern.result.score);
}

function getPatternFlags(patterns: PatternDetectionItem[]): { fakeBreakoutWarning: boolean; confirmationStrength: boolean } {
  const fakeout = patterns.find((item) => item.definition.key === 'fakeout');
  const healthyBottom = patterns.find((item) => item.definition.key === 'healthyBottom');
  const accumulation = patterns.find((item) => item.definition.key === 'accumulation');

  return {
    fakeBreakoutWarning: (fakeout?.result.score ?? 0) >= 70,
    confirmationStrength: Math.max(healthyBottom?.result.score ?? 0, accumulation?.result.score ?? 0) >= 70,
  };
}

export function calculateGenuineDemandScore({
  candles,
  cvdData,
  lookbackBars = 48,
  externalMetrics,
  persistHistory = true,
}: CalculateGDSInput): GenuineDemandScoreResult {
  if (candles.length < 2) {
    const components = buildFallbackComponents();
    return {
      score: 0,
      verdict: 'Insufficient data for pattern detection',
      emoji: '🟡',
      components,
      activeWeight: 0,
      totalWeight: 100,
      flags: {
        fakeBreakoutWarning: false,
        confirmationStrength: false,
      },
      pattern: buildLegacyPattern(null),
      patterns: [],
      rawReadings: {
        fundingRate: externalMetrics?.fundingRate,
        coinbasePremium: externalMetrics?.coinbasePremiumPct,
        oiChange: externalMetrics?.openInterestChangePct,
        cvdDelta: undefined,
        priceChangePct: undefined,
      },
    };
  }

  const windowSize = Math.min(lookbackBars, candles.length);
  const candleWindow = candles.slice(-windowSize);
  const cvdWindow = cvdData.slice(-windowSize);

  const latestCandle = candleWindow[candleWindow.length - 1];
  const firstCandle = candleWindow[0];

  const snapshot = buildSnapshot(candleWindow, cvdWindow, externalMetrics);
  const symbol = externalMetrics?.symbol || 'default';

  let history = PatternHistoryManager.getHistory(symbol);
  if (snapshot && persistHistory) {
    history = PatternHistoryManager.appendSnapshot(symbol, snapshot);
  }

  const effectiveCurrent = snapshot ?? {
    timestamp: Date.now(),
    price: latestCandle.close,
    cvdDelta: cvdWindow[cvdWindow.length - 1]?.delta ?? 0,
    oiChangePct: externalMetrics?.openInterestChangePct ?? 0,
    fundingRate: externalMetrics?.fundingRate ?? 0,
    premium: externalMetrics?.coinbasePremiumPct ?? 0,
    volume: latestCandle.volume,
  };

  const recentHistory = history.slice(-288);
  const baselineHistory = recentHistory.filter((item) => item.timestamp < effectiveCurrent.timestamp);
  const patternResults = runPatternDetectors(baselineHistory, effectiveCurrent);

  const strongest = getTopPattern(patternResults);
  const finalScore = strongest?.result.score ?? 0;

  const priceChangePct = firstCandle.close > 0
    ? ((latestCandle.close - firstCandle.close) / firstCandle.close) * 100
    : undefined;

  const cvdDelta = cvdWindow.length > 1
    ? cvdWindow[cvdWindow.length - 1].cumDelta - cvdWindow[0].cumDelta
    : undefined;

  const components = toLegacyComponents(priceChangePct, cvdDelta, externalMetrics);
  const activeWeight = components.filter((component) => component.isAvailable).reduce((sum, component) => sum + component.maxScore, 0);

  const flags = getPatternFlags(patternResults);

  return {
    score: finalScore,
    verdict: getVerdict(strongest),
    emoji: applyPatternEmoji(strongest),
    components,
    activeWeight,
    totalWeight: 100,
    flags,
    pattern: buildLegacyPattern(strongest),
    patterns: patternResults,
    rawReadings: {
      fundingRate: externalMetrics?.fundingRate,
      coinbasePremium: externalMetrics?.coinbasePremiumPct,
      oiChange: externalMetrics?.openInterestChangePct,
      cvdDelta,
      priceChangePct,
    },
  };
}
