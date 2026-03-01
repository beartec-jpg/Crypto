import type { Candle, CVDDataItem } from '@/types/chart';

const PRICE_WEIGHT = 15;
const CVD_WEIGHT = 30;
const OI_WEIGHT = 25;
const FUNDING_WEIGHT = 20;
const PREMIUM_WEIGHT = 10;

export interface GDSExternalMetrics {
  openInterestChangePct?: number;
  fundingRate?: number;
  coinbasePremiumPct?: number;
}

export interface GDSComponentScore {
  key: 'price' | 'cvd' | 'oi' | 'funding' | 'premium';
  label: string;
  score: number;
  maxScore: number;
  isPositive: boolean;
  isAvailable: boolean;
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
}

export interface CalculateGDSInput {
  candles: Candle[];
  cvdData: CVDDataItem[];
  lookbackBars?: number;
  externalMetrics?: GDSExternalMetrics;
  scoreHistory?: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateATR(candles: Candle[], period: number): number {
  if (candles.length < 2) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];

    const highLow = current.high - current.low;
    const highPrevClose = Math.abs(current.high - previous.close);
    const lowPrevClose = Math.abs(current.low - previous.close);

    trueRanges.push(Math.max(highLow, highPrevClose, lowPrevClose));
  }

  const atrWindow = trueRanges.slice(-period);
  return average(atrWindow);
}

function getVerdict(score: number): { verdict: string; emoji: GenuineDemandScoreResult['emoji'] } {
  if (score >= 80) {
    return {
      verdict: 'Strong Healthy Bottom / Genuine Push Higher',
      emoji: '🚀',
    };
  }

  if (score >= 60) {
    return {
      verdict: 'Bullish Reversal Building - Solid Demand',
      emoji: '✅',
    };
  }

  if (score >= 40) {
    return {
      verdict: 'Choppy / Neutral - Wait for More Confirmation',
      emoji: '🟡',
    };
  }

  if (score >= 20) {
    return {
      verdict: 'Weak Rally / Fakeout Risk',
      emoji: '⚠️',
    };
  }

  return {
    verdict: 'Top Forming / Distribution Risk',
    emoji: '🔴',
  };
}

export function calculateGenuineDemandScore({
  candles,
  cvdData,
  lookbackBars = 48,
  externalMetrics,
  scoreHistory = [],
}: CalculateGDSInput): GenuineDemandScoreResult {
  const minimumBars = Math.min(lookbackBars, candles.length);
  const candleWindow = candles.slice(-minimumBars);
  const cvdWindow = cvdData.slice(-minimumBars);

  const emptyComponents: GDSComponentScore[] = [
    {
      key: 'price',
      label: 'Price Momentum',
      score: 0,
      maxScore: PRICE_WEIGHT,
      isPositive: false,
      isAvailable: false,
    },
    {
      key: 'cvd',
      label: 'Spot CVD Strength',
      score: 0,
      maxScore: CVD_WEIGHT,
      isPositive: false,
      isAvailable: false,
    },
    {
      key: 'oi',
      label: 'OI Contraction',
      score: 0,
      maxScore: OI_WEIGHT,
      isPositive: false,
      isAvailable: false,
    },
    {
      key: 'funding',
      label: 'Funding Pressure',
      score: 0,
      maxScore: FUNDING_WEIGHT,
      isPositive: false,
      isAvailable: false,
    },
    {
      key: 'premium',
      label: 'Coinbase Premium',
      score: 0,
      maxScore: PREMIUM_WEIGHT,
      isPositive: false,
      isAvailable: false,
    },
  ];

  if (candleWindow.length < 2) {
    const fallbackVerdict = getVerdict(0);
    return {
      score: 0,
      verdict: fallbackVerdict.verdict,
      emoji: fallbackVerdict.emoji,
      components: emptyComponents,
      activeWeight: 0,
      totalWeight: 100,
      flags: {
        fakeBreakoutWarning: false,
        confirmationStrength: false,
      },
    };
  }

  const latestCandle = candleWindow[candleWindow.length - 1];
  const firstCandle = candleWindow[0];
  const periodLow = Math.min(...candleWindow.map((candle) => candle.low));
  const atr = calculateATR(candleWindow, 14);
  const priceUp = latestCandle.close > firstCandle.close;

  const priceRatio = atr > 0 ? (latestCandle.close - periodLow) / (atr * 3) : 0;
  const priceScore = clamp(priceRatio, 0, 1) * PRICE_WEIGHT;

  const cvdDelta = cvdWindow.length > 1
    ? cvdWindow[cvdWindow.length - 1].cumDelta - cvdWindow[0].cumDelta
    : 0;
  const avgAbsDelta = average(cvdWindow.map((item) => Math.abs(item.delta)));
  const cvdNormalization = avgAbsDelta * Math.max(1, cvdWindow.length * 0.6);
  const cvdStrength = cvdDelta > 0 && cvdNormalization > 0
    ? clamp(cvdDelta / cvdNormalization, 0, 1)
    : 0;
  const cvdScore = cvdStrength * CVD_WEIGHT;

  const oiChange = externalMetrics?.openInterestChangePct;
  const fundingRate = externalMetrics?.fundingRate;
  const coinbasePremium = externalMetrics?.coinbasePremiumPct;

  const oiStrength = typeof oiChange === 'number' && priceUp && oiChange < 0
    ? clamp(Math.abs(oiChange) / 5, 0, 1)
    : 0;
  const oiScore = oiStrength * OI_WEIGHT;

  const fundingStrength = typeof fundingRate === 'number' && fundingRate < 0
    ? clamp(Math.abs(fundingRate) / 0.03, 0, 1)
    : 0;
  const fundingScore = fundingStrength * FUNDING_WEIGHT;

  const premiumStrength = typeof coinbasePremium === 'number' && coinbasePremium > 0
    ? clamp(coinbasePremium / 0.2, 0, 1)
    : 0;
  const premiumScore = premiumStrength * PREMIUM_WEIGHT;

  const components: GDSComponentScore[] = [
    {
      key: 'price',
      label: 'Price Momentum',
      score: priceScore,
      maxScore: PRICE_WEIGHT,
      isPositive: priceScore > PRICE_WEIGHT * 0.35,
      isAvailable: true,
    },
    {
      key: 'cvd',
      label: 'Spot CVD Strength',
      score: cvdScore,
      maxScore: CVD_WEIGHT,
      isPositive: cvdScore > CVD_WEIGHT * 0.35,
      isAvailable: cvdWindow.length > 1,
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
      isAvailable: typeof fundingRate === 'number',
    },
    {
      key: 'premium',
      label: 'Coinbase Premium',
      score: premiumScore,
      maxScore: PREMIUM_WEIGHT,
      isPositive: premiumScore > PREMIUM_WEIGHT * 0.35,
      isAvailable: typeof coinbasePremium === 'number',
    },
  ];

  const activeWeight = components
    .filter((component) => component.isAvailable)
    .reduce((sum, component) => sum + component.maxScore, 0);

  const rawActiveScore = components
    .filter((component) => component.isAvailable)
    .reduce((sum, component) => sum + component.score, 0);

  const normalizedScore = activeWeight > 0
    ? clamp((rawActiveScore / activeWeight) * 100, 0, 100)
    : 0;

  const previousHigh = candleWindow.length > 2
    ? Math.max(...candleWindow.slice(0, -1).map((candle) => candle.high))
    : latestCandle.high;

  const fakeBreakoutWarning = latestCandle.close > previousHigh && normalizedScore < 45;

  const lastThree = scoreHistory.slice(-3);
  const isRisingThreeBars = lastThree.length === 3 && lastThree[0] < lastThree[1] && lastThree[1] < lastThree[2];
  const allGreen = components.filter((component) => component.isAvailable).every((component) => component.isPositive);

  const confirmationStrength = isRisingThreeBars && allGreen && normalizedScore >= 60;

  const verdictData = getVerdict(normalizedScore);

  return {
    score: normalizedScore,
    verdict: verdictData.verdict,
    emoji: verdictData.emoji,
    components,
    activeWeight,
    totalWeight: 100,
    flags: {
      fakeBreakoutWarning,
      confirmationStrength,
    },
  };
}
