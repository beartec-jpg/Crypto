/**
 * Per-gap accumulation read for Swoop (each LH–LH or LL–LL section).
 *
 * Aim: catch absorption before an upside breakout while price is still
 * printing lower highs / coiling.
 *
 * What the tape should show (Wyckoff effort vs result + order-flow):
 *
 *  markdown     Price and CVD both fall; down-bar volume dominates.
 *               Selling is still in control — not accumulation.
 *
 *  absorption   Price goes nowhere or still eases, but CVD rises (or fails
 *               to fall with price). High volume, small net progress =
 *               supply being taken. Classic "CVD up, price flat/down".
 *
 *  test         Same area retested on lighter volume than the prior gap
 *               (secondary test). Supply drying up.
 *
 *  divergence   Lower high (or lower low) in price, higher high/low in
 *               RSI and/or CVD. Momentum is not confirming the dump.
 *
 *  coil         Slope flattening and in-gap range shrinking. Cause is
 *               building; direction not yet proven.
 *
 *  demand       Flattening plus CVD up and up-bar volume > down-bar volume.
 *               Closest to a sign of strength inside the envelope.
 */
import type { SwoopCandle } from '@/lib/indicators/swoop';
import type {
  SwoopBookPattern,
  SwoopBuyTrigger,
  SwoopGapStat,
  SwoopGapStatus,
  SwoopPoint,
  SwoopSegment,
} from '@/types/swoop';

export function barDelta(c: SwoopCandle): number {
  const vol = Number.isFinite(c.volume) && (c.volume as number) > 0 ? (c.volume as number) : 0;
  if (vol <= 0) return 0;
  const taker = (c as SwoopCandle & { takerBuyVolume?: number }).takerBuyVolume;
  if (taker != null && Number.isFinite(taker)) return 2 * taker - vol;
  const range = c.high - c.low;
  if (range <= 0) return c.close >= c.open ? vol : -vol;
  return vol * ((2 * (c.close - c.low)) / range - 1);
}

export function wilderRsi(closes: number[], period = 14): number[] {
  const out = Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function classify(args: {
  priceChangePct: number;
  cvdChange: number;
  volRatio: number | null;
  rangeRatio: number | null;
  upVolShare: number;
  rsiDelta: number | null;
  slopeFlattening: boolean;
}): { status: SwoopGapStatus; score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  const priceDownOrFlat = args.priceChangePct <= 0.001;
  const priceFlat = Math.abs(args.priceChangePct) <= 0.0035;
  const cvdUp = args.cvdChange > 0;
  const cvdDown = args.cvdChange < 0;

  // Primary tells from the Aug-19 XRP swoop: RSI vs LH, vol dry-up,
  // range squeeze, last highs almost equal. CVD up is a bonus.
  // CVD down must not veto those four.
  if (args.rsiDelta != null && args.priceChangePct < -0.001 && args.rsiDelta > 1) {
    flags.push('rsi_div');
    score += 26;
  } else if (args.rsiDelta != null && priceDownOrFlat && args.rsiDelta > -0.5) {
    flags.push('rsi_hold');
    score += 16;
  }
  if (args.volRatio != null && args.volRatio < 0.85 && priceDownOrFlat) {
    flags.push('vol_dry');
    score += 18;
  }
  if (args.rangeRatio != null && args.rangeRatio < 0.85) {
    flags.push('range_shrink');
    score += 14;
  }
  if (args.slopeFlattening) {
    flags.push('flattening');
    score += 12;
  }
  if (priceFlat) {
    flags.push('equal_high');
    score += 18;
  }
  if (priceDownOrFlat && cvdUp) {
    flags.push('cvd_vs_price');
    score += 12;
  }
  if (args.upVolShare >= 0.55 && cvdUp) {
    flags.push('up_bar_vol');
    score += 10;
  }

  const bullishTape =
    flags.includes('rsi_div') ||
    flags.includes('rsi_hold') ||
    flags.includes('vol_dry') ||
    flags.includes('range_shrink') ||
    flags.includes('equal_high');
  if (priceDownOrFlat && cvdDown && args.upVolShare < 0.45 && !bullishTape) {
    score = Math.min(score, 24);
  }

  score = Math.max(0, Math.min(100, score));

  let status: SwoopGapStatus = 'neutral';
  if (flags.includes('equal_high') && bullishTape) status = 'coil';
  else if (args.upVolShare >= 0.55 && cvdUp && args.slopeFlattening) status = 'demand';
  else if (flags.includes('rsi_div')) status = 'divergence';
  else if (flags.includes('cvd_vs_price')) status = 'absorption';
  else if (flags.includes('vol_dry') && priceDownOrFlat) status = 'test';
  else if (args.slopeFlattening && flags.includes('range_shrink')) status = 'coil';
  else if (!priceDownOrFlat && cvdUp) status = 'demand';
  else if (priceDownOrFlat && cvdDown && !bullishTape) status = 'markdown';
  else if (bullishTape) status = 'coil';

  return { status, score, flags };
}

function stochK(candles: SwoopCandle[], i: number, period = 14): number | null {
  if (i < period - 1 || i >= candles.length) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let j = i - period + 1; j <= i; j++) {
    if (candles[j].high > hh) hh = candles[j].high;
    if (candles[j].low < ll) ll = candles[j].low;
  }
  if (!(hh > ll)) return 50;
  return (100 * (candles[i].close - ll)) / (hh - ll);
}

function analyzeOne(
  candles: SwoopCandle[],
  seg: SwoopSegment,
  prev: SwoopGapStat | null,
  side: 'top' | 'bottom',
  index: number,
  rsi: number[],
  cvd: number[],
): SwoopGapStat {
  const a = Math.max(0, seg.start.index);
  const b = Math.min(candles.length - 1, seg.end.index);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let vol = 0;
  let upVol = 0;
  let downVol = 0;
  let rangeSum = 0;
  const closes: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const c = candles[i];
    const v = Number.isFinite(c.volume) ? (c.volume as number) : 0;
    vol += v;
    if (c.close >= c.open) upVol += v;
    else downVol += v;
    rangeSum += Math.max(c.high - c.low, 0);
    closes.push(c.close);
  }
  const bars = Math.max(1, hi - lo);
  const startPx = seg.start.price;
  const endPx = seg.end.price;
  const priceChangePct = startPx !== 0 ? (endPx - startPx) / startPx : 0;
  const cvdStart = cvd[lo] ?? 0;
  const cvdEnd = cvd[hi] ?? cvdStart;
  const cvdChange = cvdEnd - cvdStart;
  const rsiA = rsi[lo];
  const rsiB = rsi[hi];
  const rsiDelta = Number.isFinite(rsiA) && Number.isFinite(rsiB) ? rsiB - rsiA : null;
  const avgRange = rangeSum / Math.max(1, hi - lo + 1);
  const volRatio = prev && prev.volume > 0 ? vol / prev.volume : null;
  const rangeRatio = prev && prev.avgRange > 0 ? avgRange / prev.avgRange : null;
  const slopeFlattening =
    prev != null && Math.abs(seg.slope) + 1e-12 < Math.abs(prev.slope);
  const upVolShare = vol > 0 ? upVol / vol : 0.5;
  const { status, score, flags } = classify({
    priceChangePct,
    cvdChange,
    volRatio,
    rangeRatio,
    upVolShare,
    rsiDelta,
    slopeFlattening,
  });
  const rsiEnd = Number.isFinite(rsiB) ? rsiB : null;
  const stochEnd = stochK(candles, hi);
  if (rsiEnd != null && rsiEnd <= 50) flags.push('oversold');
  if (stochEnd != null && stochEnd <= 20) flags.push('stoch_os');

  return {
    side,
    gapIndex: index,
    startTime: seg.start.time,
    endTime: seg.end.time,
    startPrice: seg.start.price,
    endPrice: seg.end.price,
    status,
    score,
    priceChangePct,
    slope: seg.slope,
    cvdChange,
    volume: vol,
    volumeRatio: volRatio,
    avgRange,
    rsiDelta,
    rsiEnd,
    stochEnd,
    upVolShare,
    bars,
    flags,
    meanClose: mean(closes),
    downVol,
  };
}

export function analyzeSwoopGaps(
  candles: SwoopCandle[],
  topSegments: SwoopSegment[],
  bottomSegments: SwoopSegment[],
): SwoopGapStat[] {
  if (!candles.length) return [];
  const closes = candles.map((c) => c.close);
  const rsi = wilderRsi(closes, 14);
  const cvd: number[] = new Array(candles.length);
  let acc = 0;
  for (let i = 0; i < candles.length; i++) {
    acc += barDelta(candles[i]);
    cvd[i] = acc;
  }
  const out: SwoopGapStat[] = [];
  let prevTop: SwoopGapStat | null = null;
  topSegments.forEach((seg, i) => {
    const stat = analyzeOne(candles, seg, prevTop, 'top', i, rsi, cvd);
    out.push(stat);
    prevTop = stat;
  });
  let prevBot: SwoopGapStat | null = null;
  bottomSegments.forEach((seg, i) => {
    const stat = analyzeOne(candles, seg, prevBot, 'bottom', i, rsi, cvd);
    out.push(stat);
    prevBot = stat;
  });
  return out;
}

/**
 * Two BUY paths, same trigger (close through last confirmed LH):
 *  A) Completing swoop — RSI vs LH, vol dry, squeeze, last highs equal.
 *  B) Oversold reclaim — last LH with RSI ≤ 50 and/or stoch ≤ 20 (flushed),
 *     then price reclaims that high. May–Jun relief rally.
 * CVD cannot veto either path.
 */
export function detectSwoopBuy(
  pattern: SwoopBookPattern,
  highs: SwoopPoint[],
  topStats: SwoopGapStat[],
  lastClose: number,
  lastTime: number,
): SwoopBuyTrigger | null {
  if (pattern === 'none' || pattern === 'channel') return null;
  if (highs.length < 2 || topStats.length < 1) return null;
  const lastH = highs[highs.length - 1];
  const prevH = highs[highs.length - 2];
  const recent = topStats.slice(-3);
  const flags = new Set(recent.flatMap((g) => g.flags));
  const lastGap = topStats[topStats.length - 1];
  const broken = lastClose > lastH.price * 1.001;

  const completingTells: string[] = [];
  if (flags.has('rsi_div') || flags.has('rsi_hold')) completingTells.push('RSI vs LH');
  if (flags.has('vol_dry')) completingTells.push('vol dry');
  if (flags.has('range_shrink')) completingTells.push('squeeze');
  const equalHigh =
    flags.has('equal_high') ||
    Math.abs(lastH.price - prevH.price) / Math.max(Math.abs(prevH.price), 1e-12) <= 0.004;
  if (equalHigh || flags.has('flattening')) completingTells.push('LH flat');
  const completing =
    completingTells.length >= 2 &&
    (flags.has('rsi_div') || flags.has('rsi_hold') || flags.has('vol_dry'));

  const rsiOs = lastGap.rsiEnd != null && lastGap.rsiEnd <= 50;
  const stochOs = lastGap.stochEnd != null && lastGap.stochEnd <= 20;
  const stillDumping = lastH.price < prevH.price * 0.997;
  const oversold = stillDumping && (rsiOs || stochOs);
  const oversoldTells: string[] = [];
  if (rsiOs) oversoldTells.push(`RSI ${lastGap.rsiEnd!.toFixed(0)}`);
  if (stochOs) oversoldTells.push(`stoch ${lastGap.stochEnd!.toFixed(0)}`);
  oversoldTells.push('reclaim LH');

  if (completing) {
    return {
      armed: true,
      triggered: broken,
      time: lastTime,
      price: lastH.price,
      reason: completingTells.join(' + '),
      tells: completingTells,
    };
  }
  if (oversold) {
    return {
      armed: true,
      triggered: broken,
      time: lastTime,
      price: lastH.price,
      reason: `oversold reclaim · ${oversoldTells.join(' + ')}`,
      tells: oversoldTells,
    };
  }
  return {
    armed: false,
    triggered: false,
    time: lastTime,
    price: lastH.price,
    reason: lastGap.status,
    tells: [],
  };
}
