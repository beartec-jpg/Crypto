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

function detectMarketPattern(
  priceUp: boolean,
  cvdScore: number,
  oiScore: number,
  fundingScore: number,
  premiumScore: number,
  fundingRate: number | undefined,
  coinbasePremium: number | undefined,
  oiChange: number | undefined
): MarketPattern {
  const cvdStrong = cvdScore > CVD_WEIGHT * 0.5;
  const oiDown = typeof oiChange === 'number' && oiChange < -1;
  const fundingNeg = typeof fundingRate === 'number' && fundingRate < -0.0005;
  const fundingPos = typeof fundingRate === 'number' && fundingRate > 0.0005;
  const fundingNeutral = typeof fundingRate === 'number' && Math.abs(fundingRate) <= 0.0005;
  const premiumPos = typeof coinbasePremium === 'number' && coinbasePremium > 0.05;
  const premiumNeg = typeof coinbasePremium === 'number' && coinbasePremium < -0.05;

  // Pattern 1: Healthy Bottom (Original Target)
  if (priceUp && cvdStrong && oiDown && fundingNeg && premiumPos) {
    return {
      name: 'Healthy Bottom',
      confidence: 'High',
      description: 'Post-capitulation rally with genuine demand',
      emoji: '🚀',
      bullishSignals: [
        'Strong spot buying pressure',
        'Leverage flushed out (OI down)',
        'Negative funding (shorts paying)',
        'US retail entering (premium positive)'
      ],
      bearishSignals: [],
      neutralSignals: [],
      recommendation: 'Strong buy signal - all conditions aligned for sustained rally'
    };
  }

  // Pattern 2: Distribution / Top Forming
  if (priceUp && !cvdStrong && !oiDown && fundingPos && premiumNeg) {
    return {
      name: 'Distribution',
      confidence: 'High',
      description: 'Smart money exiting, retail buying futures',
      emoji: '🔴',
      bullishSignals: [],
      bearishSignals: [
        'Weak or negative spot CVD',
        'OI expanding (new leveraged longs)',
        'Positive funding (longs overheated)',
        'Negative premium (no US demand)'
      ],
      neutralSignals: [],
      recommendation: 'High risk of reversal - avoid longs, consider scaling out'
    };
  }

  // Pattern 3: Leveraged Pump (Low Quality Rally)
  if (priceUp && !cvdStrong && !oiDown && (fundingPos || fundingNeutral) && !premiumPos) {
    return {
      name: 'Leveraged Pump',
      confidence: 'Medium',
      description: 'Futures-driven move without spot confirmation',
      emoji: '⚠️',
      bullishSignals: priceUp ? ['Price momentum'] : [],
      bearishSignals: [
        'Weak spot buying',
        'Leverage-driven (OI not contracting)',
        premiumNeg ? 'No US retail interest' : 'Premium neutral or negative'
      ],
      neutralSignals: [fundingNeutral ? 'Funding neutral' : 'Funding slightly positive'],
      recommendation: 'Fakeout risk high - wait for spot confirmation before entering'
    };
  }

  // Pattern 4: Mixed Signals with Strong CVD
  if (priceUp && cvdStrong && !fundingNeg && !premiumPos) {
    const bullish = ['Strong spot buying (CVD positive)', 'Price momentum'];
    const bearish: string[] = [];
    const neutral: string[] = [];

    if (premiumNeg) bearish.push('Negative premium (US retail not participating)');
    else neutral.push('Premium neutral');

    if (fundingNeutral) neutral.push('Funding neutral (balanced positioning)');
    else if (fundingPos) bearish.push('Positive funding (slight overheating)');

    if (!oiDown && typeof oiChange === 'number' && oiChange > 1) {
      bearish.push('OI expanding (leverage increasing)');
    } else {
      neutral.push(`OI change minimal (${oiChange?.toFixed(2)}%)`);
    }

    return {
      name: 'Mixed Signals',
      confidence: 'Medium',
      description: 'Good spot buying but missing key confirmation signals',
      emoji: '🟡',
      bullishSignals: bullish,
      bearishSignals: bearish,
      neutralSignals: neutral,
      recommendation: 'Spot strength encouraging but wait for funding to go negative OR premium to turn positive'
    };
  }

  // Pattern 5: Quiet Accumulation
  if (!priceUp && cvdStrong && fundingNeutral && !premiumPos) {
    return {
      name: 'Quiet Accumulation',
      confidence: 'Medium',
      description: 'Smart money accumulating without price movement',
      emoji: '🤫',
      bullishSignals: [
        'Spot buying despite flat price',
        'Low leverage (funding neutral)'
      ],
      bearishSignals: [],
      neutralSignals: ['Price consolidating', 'No retail FOMO yet'],
      recommendation: 'Potential base building - monitor for breakout with continued CVD strength'
    };
  }

  // Pattern 6: Capitulation
  if (!priceUp && fundingNeg && oiDown) {
    return {
      name: 'Capitulation',
      confidence: 'High',
      description: 'Extreme selling pressure and liquidations',
      emoji: '💥',
      bullishSignals: [
        'Negative funding (shorts paying)',
        'OI flushing out (liquidations)'
      ],
      bearishSignals: ['Price declining', ...(!cvdStrong ? ['Spot selling pressure'] : [])],
      neutralSignals: [],
      recommendation: 'Potential reversal zone - watch for CVD to turn positive'
    };
  }

  // Default: Neutral/Choppy
  return {
    name: 'Neutral/Choppy',
    confidence: 'Low',
    description: 'No clear pattern - mixed or weak signals',
    emoji: '😐',
    bullishSignals: cvdStrong ? ['Some spot buying'] : [],
    bearishSignals: [],
    neutralSignals: ['Insufficient conviction in any direction'],
    recommendation: 'Wait for clearer setup - avoid trading in choppy conditions'
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
      pattern: detectMarketPattern(
        false, 0, 0, 0, 0,
        externalMetrics?.fundingRate,
        externalMetrics?.coinbasePremiumPct,
        externalMetrics?.openInterestChangePct
      ),
      rawReadings: {
        fundingRate: externalMetrics?.fundingRate,
        coinbasePremium: externalMetrics?.coinbasePremiumPct,
        oiChange: externalMetrics?.openInterestChangePct,
        cvdDelta: undefined,
        priceChangePct: undefined,
      },
    };
  }

  const latestCandle = candleWindow[candleWindow.length - 1];
  const firstCandle = candleWindow[0];
  const priceUp = latestCandle.close > firstCandle.close;

  const priceChangePct = firstCandle.close > 0 ? ((latestCandle.close - firstCandle.close) / firstCandle.close) * 100 : 0;
  const priceStrength = priceUp && priceChangePct > 0 ? clamp(priceChangePct / 5, 0, 1) : 0;
  const priceScore = priceStrength * PRICE_WEIGHT;

  const cvdDelta = cvdWindow.length > 1
    ? cvdWindow[cvdWindow.length - 1].cumDelta - cvdWindow[0].cumDelta
    : 0;
  const avgAbsDelta = average(cvdWindow.map((item) => Math.abs(item.delta)));
  // More sensitive normalization - was too aggressive before
  const cvdNormalization = avgAbsDelta * Math.max(5, cvdWindow.length * 0.3);
  const cvdStrength = cvdDelta > 0 && cvdNormalization > 0
    ? clamp(cvdDelta / cvdNormalization, 0, 1)
    : 0;
  const cvdScore = cvdStrength * CVD_WEIGHT;

  const oiChange = externalMetrics?.openInterestChangePct;
  const fundingRate = externalMetrics?.fundingRate;
  const coinbasePremium = externalMetrics?.coinbasePremiumPct;

  console.log('[GDS Debug] Input values:', { fundingRate, coinbasePremium, oiChange });

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

  console.log('[GDS Debug] Funding:', { rate: fundingRate, condition: fundingRate < 0, score: fundingScore });
  console.log('[GDS Debug] Premium:', { pct: coinbasePremium, condition: coinbasePremium > 0, score: premiumScore });

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

  const pattern = detectMarketPattern(
    priceUp,
    cvdScore,
    oiScore,
    fundingScore,
    premiumScore,
    fundingRate,
    coinbasePremium,
    oiChange
  );

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
    pattern,
    rawReadings: {
      fundingRate,
      coinbasePremium,
      oiChange,
      cvdDelta: cvdWindow.length > 1 ? cvdDelta : undefined,
      priceChangePct: firstCandle.close > 0
        ? ((latestCandle.close - firstCandle.close) / firstCandle.close) * 100
        : undefined,
    },
  };
}
