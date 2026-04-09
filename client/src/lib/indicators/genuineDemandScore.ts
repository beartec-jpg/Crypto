import type { Candle, CVDDataItem } from '@/types/chart';
import {
  runPatternDetectors,
  type PatternDetectionItem,
  type Snapshot,
} from '@/services/patternDetectors';

// Component weights (must sum to 100)
const PRICE_WEIGHT = 15;
const CVD_WEIGHT = 30;
const OI_WEIGHT = 25;
const FUNDING_WEIGHT = 20;
const PREMIUM_WEIGHT = 10;

const TOTAL_WEIGHT = PRICE_WEIGHT + CVD_WEIGHT + OI_WEIGHT + FUNDING_WEIGHT + PREMIUM_WEIGHT;

// Divisors for normalising external metrics to [0, 1]
const OI_DIVISOR = 5;
const FUNDING_DIVISOR = 0.03;
const PREMIUM_DIVISOR = 0.2;

export interface GDSExternalMetrics {
  openInterestChangePct?: number;
  fundingRate?: number;
  coinbasePremiumPct?: number;
  symbol?: string;
}

export interface GDSComponent {
  name: string;
  score: number;
  weight: number;
  isAvailable: boolean;
  rawValue?: number;
  label: string;
}

export interface GDSFlags {
  fakeBreakoutWarning: boolean;
  lowLiquidity: boolean;
  fundingExtreme: boolean;
}

export interface GenuineDemandScoreResult {
  score: number;
  emoji: string;
  verdict: string;
  flags: GDSFlags;
  activeWeight: number;
  totalWeight: number;
  components: GDSComponent[];
  patterns: PatternDetectionItem[];
}

export interface CalculateGenuineDemandScoreOptions {
  candles: Candle[];
  cvdData: CVDDataItem[];
  lookbackBars?: number;
  externalMetrics?: GDSExternalMetrics;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreToEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  if (score >= 20) return '🔴';
  return '⚫';
}

function scoreToVerdict(score: number, flags: GDSFlags): string {
  if (flags.fakeBreakoutWarning) return 'Potential fake breakout — demand not confirmed';
  if (score >= 80) return 'Strong genuine demand — high-conviction long bias';
  if (score >= 60) return 'Moderate demand — bullish lean with some caveats';
  if (score >= 40) return 'Mixed signals — neutral / wait for confirmation';
  if (score >= 20) return 'Weak demand — bearish lean, caution advised';
  return 'No genuine demand — avoid longs';
}

// Build snapshot history directly from candles so patterns always reflect the
// currently selected symbol and timeframe, with one data point per bar.
function buildSnapshotHistory(
  candles: Candle[],
  cvdData: CVDDataItem[],
  externalMetrics: GDSExternalMetrics,
): Snapshot[] {
  const hasCvd = cvdData.length > 0;
  return candles.map((candle, i) => {
    // Align CVD by position; fall back to 0 delta when data is absent or sparse
    const cvdItem = hasCvd ? cvdData[Math.min(i, cvdData.length - 1)] : undefined;
    return {
      timestamp: candle.time * 1000,
      price: candle.close,
      cvdDelta: cvdItem?.delta ?? 0,
      oiChangePct: externalMetrics.openInterestChangePct ?? 0,
      fundingRate: externalMetrics.fundingRate ?? 0,
      premium: externalMetrics.coinbasePremiumPct ?? 0,
      volume: candle.volume,
    };
  });
}

function toLegacyComponents(params: {
  priceScore: number;
  priceChangePct: number | undefined;
  cvdScore: number;
  cvdDelta: number | undefined;
  oiScore: number;
  openInterestChangePct: number | undefined;
  fundingScore: number;
  fundingRate: number | undefined;
  premiumScore: number;
  coinbasePremiumPct: number | undefined;
}): GDSComponent[] {
  return [
    {
      name: 'Price Action',
      score: params.priceScore,
      weight: PRICE_WEIGHT,
      isAvailable: params.priceChangePct !== undefined,
      rawValue: params.priceChangePct,
      label: params.priceChangePct !== undefined
        ? `${params.priceChangePct.toFixed(2)}%`
        : 'N/A',
    },
    {
      name: 'CVD',
      score: params.cvdScore,
      weight: CVD_WEIGHT,
      isAvailable: params.cvdDelta !== undefined,
      rawValue: params.cvdDelta,
      label: params.cvdDelta !== undefined
        ? params.cvdDelta.toFixed(0)
        : 'N/A',
    },
    {
      name: 'Open Interest',
      score: params.oiScore,
      weight: OI_WEIGHT,
      isAvailable: params.openInterestChangePct !== undefined,
      rawValue: params.openInterestChangePct,
      label: params.openInterestChangePct !== undefined
        ? `${params.openInterestChangePct.toFixed(2)}%`
        : 'N/A',
    },
    {
      name: 'Funding Rate',
      score: params.fundingScore,
      weight: FUNDING_WEIGHT,
      isAvailable: params.fundingRate !== undefined,
      rawValue: params.fundingRate,
      label: params.fundingRate !== undefined
        ? `${(params.fundingRate * 100).toFixed(4)}%`
        : 'N/A',
    },
    {
      name: 'Coinbase Premium',
      score: params.premiumScore,
      weight: PREMIUM_WEIGHT,
      isAvailable: params.coinbasePremiumPct !== undefined,
      rawValue: params.coinbasePremiumPct,
      label: params.coinbasePremiumPct !== undefined
        ? `${params.coinbasePremiumPct.toFixed(4)}%`
        : 'N/A',
    },
  ];
}

export function calculateGenuineDemandScore({
  candles,
  cvdData,
  lookbackBars = 48,
  externalMetrics = {},
}: CalculateGenuineDemandScoreOptions): GenuineDemandScoreResult {
  const emptyResult: GenuineDemandScoreResult = {
    score: 0,
    emoji: '⚫',
    verdict: 'Insufficient data',
    flags: { fakeBreakoutWarning: false, lowLiquidity: false, fundingExtreme: false },
    activeWeight: 0,
    totalWeight: TOTAL_WEIGHT,
    components: [],
    patterns: [],
  };

  if (candles.length < 2) return emptyResult;

  // --- Windowed candles & CVD --------------------------------------------------
  const candleWindow = candles.slice(-lookbackBars);
  const firstCandle = candleWindow[0];
  const latestCandle = candleWindow[candleWindow.length - 1];

  const cvdWindow = cvdData.slice(-lookbackBars);

  // --- Price direction ---------------------------------------------------------
  const priceUp = latestCandle.close > firstCandle.close;

  // --- Price change percentage (undefined when base price is invalid) -----------
  const priceChangePct = firstCandle.close > 0
    ? ((latestCandle.close - firstCandle.close) / firstCandle.close) * 100
    : undefined;

  const priceChangePctValue = priceChangePct ?? 0;
  const priceStrength = priceUp && priceChangePctValue > 0 ? clamp(priceChangePctValue / 5, 0, 1) : 0;
  const priceScore = priceStrength * PRICE_WEIGHT;

  // --- CVD delta (undefined when not enough CVD data) --------------------------
  const cvdDelta = cvdWindow.length > 1
    ? cvdWindow[cvdWindow.length - 1].cumDelta - cvdWindow[0].cumDelta
    : undefined;

  // Average absolute delta — inline calculation (no separate helper needed)
  const avgAbsDelta = cvdWindow.length > 0
    ? cvdWindow.reduce((sum, item) => sum + Math.abs(item.delta), 0) / cvdWindow.length
    : 0;

  const cvdDeltaValue = cvdDelta ?? 0;
  const cvdIsPositive = cvdDeltaValue > 0;
  const cvdStrength = avgAbsDelta > 0 && cvdWindow.length > 0
    ? clamp(cvdDeltaValue / (avgAbsDelta * cvdWindow.length), 0, 1)
    : 0;
  const cvdScore = cvdIsPositive ? cvdStrength * CVD_WEIGHT : 0;

  // --- External metrics --------------------------------------------------------
  const { openInterestChangePct, fundingRate, coinbasePremiumPct } = externalMetrics;

  // OI score: rewards deleveraging rally (OI falling while price rises)
  const oiAvailable = typeof openInterestChangePct === 'number';
  const oiScore = oiAvailable && (openInterestChangePct as number) < 0 && priceUp
    ? clamp(Math.abs(openInterestChangePct as number) / OI_DIVISOR, 0, 1) * OI_WEIGHT
    : 0;

  // Funding score: negative funding during price rise = spot-driven move
  const fundingAvailable = typeof fundingRate === 'number';
  const fundingScore = fundingAvailable && (fundingRate as number) < 0
    ? clamp(Math.abs(fundingRate as number) / FUNDING_DIVISOR, 0, 1) * FUNDING_WEIGHT
    : 0;

  // Premium score: positive Coinbase premium = genuine spot demand
  const premiumAvailable = typeof coinbasePremiumPct === 'number';
  const premiumScore = premiumAvailable && (coinbasePremiumPct as number) > 0
    ? clamp((coinbasePremiumPct as number) / PREMIUM_DIVISOR, 0, 1) * PREMIUM_WEIGHT
    : 0;

  // --- Active weight (weight of components with data) --------------------------
  let activeWeight = PRICE_WEIGHT + CVD_WEIGHT;
  if (oiAvailable) activeWeight += OI_WEIGHT;
  if (fundingAvailable) activeWeight += FUNDING_WEIGHT;
  if (premiumAvailable) activeWeight += PREMIUM_WEIGHT;

  // --- Normalised score --------------------------------------------------------
  const rawScore = priceScore + cvdScore + oiScore + fundingScore + premiumScore;
  const score = activeWeight > 0 ? Math.round(clamp((rawScore / activeWeight) * 100, 0, 100)) : 0;

  // --- Components array --------------------------------------------------------
  const components = toLegacyComponents({
    priceScore,
    priceChangePct,
    cvdScore,
    cvdDelta,
    oiScore,
    openInterestChangePct,
    fundingScore,
    fundingRate,
    premiumScore,
    coinbasePremiumPct,
  });

  // --- Flags -------------------------------------------------------------------
  const fakeBreakoutWarning =
    priceUp && priceChangePctValue > 2 && cvdDeltaValue <= 0;
  const fundingExtreme =
    typeof fundingRate === 'number' && Math.abs(fundingRate) > FUNDING_DIVISOR * 1.5;
  const lowLiquidity = cvdWindow.length < 5;

  const flags: GDSFlags = { fakeBreakoutWarning, lowLiquidity, fundingExtreme };

  // --- Pattern detection -------------------------------------------------------
  // Build one snapshot per candle so patterns are always aligned to the selected
  // timeframe and symbol — no stale singleton history leaking between sessions.
  const snapshotHistory = buildSnapshotHistory(candleWindow, cvdWindow, externalMetrics);
  const currentSnapshot = snapshotHistory[snapshotHistory.length - 1]!;
  const patterns = runPatternDetectors(snapshotHistory.slice(0, -1), currentSnapshot);

  // --- Result ------------------------------------------------------------------
  return {
    score,
    emoji: scoreToEmoji(score),
    verdict: scoreToVerdict(score, flags),
    flags,
    activeWeight,
    totalWeight: TOTAL_WEIGHT,
    components,
    patterns,
  };
}
