/**
 * Live coaching copy for oscillator cards.
 * Turns raw values + price action + divergence into a newbie-friendly readout
 * of what the indicator is saying, what that means vs price, and what pros watch.
 */

export type CoachDivergence = { strength: number; type: string };

export type IndicatorCoachReport = {
  /** Short badge in the card header, e.g. "Oversold" */
  headline: string;
  color: string;
  /** Full lesson — also assigned to `text` for older callers */
  text: string;
  /** What the print is saying, compared to price */
  meaning: string;
  /** What professionals typically look for */
  lookFor: string;
};

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

function priceSnapshot(candles: Candle[]) {
  if (!candles.length) {
    return {
      last: 0,
      prev: 0,
      chgPct: 0,
      structure: 'unclear' as const,
      lastBar: 'flat' as const,
    };
  }
  const n = candles.length;
  const lastC = candles[n - 1];
  const prev = candles[Math.max(0, n - 2)];
  const lookback = candles.slice(Math.max(0, n - 8));
  const first = lookback[0];
  const chgPct = first && first.close ? ((lastC.close - first.close) / first.close) * 100 : 0;

  const mid = Math.floor(lookback.length / 2) || 1;
  const early = lookback.slice(0, mid);
  const late = lookback.slice(mid);
  const earlyHigh = Math.max(...early.map((c) => c.high));
  const earlyLow = Math.min(...early.map((c) => c.low));
  const lateHigh = Math.max(...late.map((c) => c.high));
  const lateLow = Math.min(...late.map((c) => c.low));

  let structure: 'higher-highs / higher-lows' | 'lower-highs / lower-lows' | 'range / chop' = 'range / chop';
  if (lateHigh > earlyHigh && lateLow > earlyLow) structure = 'higher-highs / higher-lows';
  else if (lateHigh < earlyHigh && lateLow < earlyLow) structure = 'lower-highs / lower-lows';

  const lastBar =
    lastC.close > lastC.open ? ('bullish' as const) : lastC.close < lastC.open ? ('bearish' as const) : ('flat' as const);

  return { last: lastC.close, prev: prev.close, chgPct, structure, lastBar };
}

function divPhrase(div?: CoachDivergence): string {
  if (!div || !div.type || div.type === 'none' || !div.strength) return '';
  const n = Math.abs(div.strength);
  const grade = n >= 3 ? 'strong (triple-count)' : n === 2 ? 'double' : 'mild';
  return `${grade} ${div.type} divergence vs price`;
}

function priceVsOsc(structure: string, chgPct: string, lastBar: string): string {
  return `Price recently printed ${structure} (${chgPct} over the last few bars; last candle ${lastBar}).`;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function buildIndicatorCoach(opts: {
  indicator: string;
  candles: Candle[];
  divergence?: CoachDivergence;
  values: Record<string, number | undefined>;
}): IndicatorCoachReport | null {
  const { indicator, candles, divergence, values } = opts;
  if (!candles || candles.length < 8) {
    return {
      headline: 'Warming up',
      color: 'text-gray-400',
      text: 'Need more candles before this readout is reliable.',
      meaning: 'Need more candles before this readout is reliable.',
      lookFor: 'Wait until the chart has enough history for swings and oscillator memory.',
    };
  }

  const px = priceSnapshot(candles);
  const pxLine = priceVsOsc(px.structure, fmtPct(px.chgPct), px.lastBar);
  const div = divPhrase(divergence);
  const key = indicator.toLowerCase().replace(/[^a-z]/g, '');

  const pack = (
    headline: string,
    color: string,
    meaning: string,
    lookFor: string,
  ): IndicatorCoachReport => ({
    headline,
    color,
    meaning,
    lookFor,
    text: meaning,
  });

  switch (key) {
    case 'rsi': {
      const v = values.value;
      if (v == null) return null;
      const slope = values.slope ?? 0;
      const slopeTxt = slope > 5 ? 'rising' : slope < -5 ? 'falling' : 'flat';
      if (v >= 70) {
        return pack(
          `Overbought ${v.toFixed(0)}`,
          'text-red-400',
          `RSI is ${v.toFixed(0)} and ${slopeTxt}. That means recent closes have been strong vs the last ~14 bars — buyers have been winning. ${pxLine}${div ? ` Also: ${div} — price making new highs while RSI does not is a classic fade warning.` : ' RSI in a strong uptrend can stay overbought; do not short just because it is high.'}`,
          'Pros treat 70 as a warning, not an auto-short. They want a failed high, a bearish candle at resistance, or RSI rolling over / crossing back under 70. Hidden bullish divergence (higher RSI low while price makes a higher low) is continuation, not reversal.',
        );
      }
      if (v <= 30) {
        return pack(
          `Oversold ${v.toFixed(0)}`,
          'text-green-400',
          `RSI is ${v.toFixed(0)} and ${slopeTxt}. Sellers have dominated recent closes. ${pxLine}${div ? ` Plus ${div} — if price made a lower low but RSI made a higher low, that is the bounce setup textbooks show.` : ' Oversold can persist in a dump; wait for a reclaim of 30 or a bullish candle at support.'}`,
          'Look for RSI to hook up through 30, bullish divergence at a swing low, and price holding a level. Do not blindly buy every sub-30 print in a waterfall.',
        );
      }
      return pack(
        `Neutral ${v.toFixed(0)}`,
        'text-gray-400',
        `RSI is mid-range at ${v.toFixed(0)} (${slopeTxt}) — no stretch either way. ${pxLine} Mid-50s usually means the tape is rotating or trending without exhaustion.`,
        'In trends, RSI 40–60 is “healthy pullback / pause.” Pros wait for a break of 50 with the trend, or a trip to 70/30. Divergence here is weaker than at extremes.',
      );
    }
    case 'stochrsi': {
      const k = values.k ?? values.value;
      if (k == null) return null;
      const slope = values.slope ?? 0;
      const slopeTxt = slope > 10 ? 'rising' : slope < -10 ? 'falling' : 'flat';
      if (k >= 80) {
        return pack(
          `Overbought ${k.toFixed(0)}`,
          'text-red-400',
          `Stoch RSI %K is ${k.toFixed(0)} (${slopeTxt}) — a fast oscillator of RSI, so it hits extremes often. ${pxLine}${div ? ` ${div} on this tool is a timing hint, not a trend call.` : ''} Fast overbought = stretched short-term momentum, not “must dump.”`,
          'Pros wait for %K to cross back under 80 (or under %D) after a push into resistance. In a strong trend they ignore most 80+ prints and only fade when price fails a high.',
        );
      }
      if (k <= 20) {
        return pack(
          `Oversold ${k.toFixed(0)}`,
          'text-green-400',
          `Stoch RSI %K is ${k.toFixed(0)} (${slopeTxt}). Short-term momentum is washed out. ${pxLine}${div ? ` ${div}.` : ''} This is a timing tool for bounces, not a reason to catch a falling knife.`,
          'Look for %K crossing up through 20 / %D, plus a bullish candle or support. Double bullish divergence (two higher Stoch lows vs two lower price lows) is the higher-quality reversal.',
        );
      }
      return pack(
        `Neutral ${k.toFixed(0)}`,
        'text-gray-400',
        `Stoch RSI is mid-range (${k.toFixed(0)}, ${slopeTxt}). ${pxLine} No extreme — wait for a trip to the rails.`,
        'Use it to time entries inside a larger bias (e.g. buy oversold Stoch only if higher-TF is still bullish).',
      );
    }
    case 'macd': {
      const macd = values.macd;
      const signal = values.signal;
      const hist = values.hist;
      if (macd == null || signal == null) return null;
      const crossedUp = values.crossedUp === 1;
      const crossedDown = values.crossedDown === 1;
      const above = macd > signal;
      const histTxt =
        hist == null
          ? ''
          : hist > 0
            ? `Histogram is positive (${hist.toFixed(4)}) — momentum still with bulls.`
            : `Histogram is negative (${hist.toFixed(4)}) — momentum still with bears.`;
      if (crossedUp) {
        return pack(
          'Bullish cross',
          'text-green-400',
          `MACD just crossed above its signal line. That is a momentum flip to the upside. ${pxLine} ${histTxt}${div ? ` ${div}.` : ''} A cross into rising price / HH-HL structure is a continuation; a cross against lower-lows is more often a dead-cat bounce.`,
          'Pros want the cross *and* histogram expanding, ideally above zero for a stronger trend signal. Crosses below zero are weaker. Bearish divergence into a cross-down is the short they actually take.',
        );
      }
      if (crossedDown) {
        return pack(
          'Bearish cross',
          'text-red-400',
          `MACD just crossed below signal — momentum flipped down. ${pxLine} ${histTxt}${div ? ` ${div}.` : ''}`,
          'Best shorts: cross after a higher high in price with a lower high in MACD (regular bearish divergence). Ignore lone crosses in a tight range.',
        );
      }
      if (above) {
        return pack(
          'Bullish',
          'text-green-400',
          `MACD is still above signal (${histTxt || 'bulls have the tape'}). ${pxLine}${div ? ` Watch: ${div}.` : ' If lines squeeze together, momentum is dying even before a cross.'}`,
          'Stay with longs while histogram expands. Take profits / trail when histogram shrinks or price diverges.',
        );
      }
      return pack(
        'Bearish',
        'text-red-400',
        `MACD is below signal. ${histTxt} ${pxLine}${div ? ` ${div}.` : ''}`,
        'Trend traders stay short while MACD & histogram stay negative. Mean-reverters wait for a hook up + bullish divergence at support.',
      );
    }
    case 'obv': {
      const slope = values.slope ?? 0;
      const headline = slope > 0 ? 'Rising (accumulation)' : slope < 0 ? 'Falling (distribution)' : 'Flat';
      const color = slope > 0 ? 'text-green-400' : slope < 0 ? 'text-red-400' : 'text-gray-400';
      return pack(
        headline,
        color,
        `On-Balance Volume adds volume on up days and subtracts it on down days. Right now OBV is ${slope > 0 ? 'rising — more volume on up bars (accumulation)' : slope < 0 ? 'falling — more volume on down bars (distribution)' : 'flat — no side is winning the volume war'}. ${pxLine}${div ? ` ${div}: if price makes a new high and OBV does not, that is distribution under the highs.` : ''}`,
        'Pros treat OBV as a confirmation tool. They want price and OBV to agree. Regular bearish divergence (price HH, OBV LH) is a distribution tell. Hidden bullish (price HL, OBV LL) is trend continuation. Never trade OBV alone.',
      );
    }
    case 'mfi': {
      const v = values.value;
      if (v == null) return null;
      const slope = values.slope ?? 0;
      const slopeTxt = slope > 5 ? 'rising' : slope < -5 ? 'falling' : 'flat';
      if (v >= 80) {
        return pack(
          `Overbought ${v.toFixed(0)}`,
          'text-red-400',
          `MFI (volume-weighted RSI) is ${v.toFixed(0)} and ${slopeTxt}. Money is flooding in — not just price stretching, but *volume* confirming the stretch. ${pxLine}${div ? ` ${div}.` : ''} High MFI in an uptrend can persist; it is a warning, not a short signal.`,
          'Look for MFI rolling over from 80+ with a volume dry-up or bearish candle at resistance. MFI/price divergence is stronger than RSI-only because it includes volume.',
        );
      }
      if (v <= 20) {
        return pack(
          `Oversold ${v.toFixed(0)}`,
          'text-green-400',
          `MFI is ${v.toFixed(0)} (${slopeTxt}) — selling pressure plus volume has flushed the tape. ${pxLine}${div ? ` ${div} is the bounce professionals wait for.` : ' Wait for MFI to hook up through 20 with a support hold.'}`,
          'Buy the reclaim of 20 at a known demand zone, preferably with bullish divergence. Avoid catching knives while MFI is still falling through 20.',
        );
      }
      return pack(
        `Neutral ${v.toFixed(0)}`,
        'text-gray-400',
        `MFI mid-range at ${v.toFixed(0)} (${slopeTxt}). Money flow is not extreme. ${pxLine}`,
        'Use 50 as a tide line: above 50 + rising price = healthy bid. Below 50 in a downtrend = stay patient.',
      );
    }
    case 'williamsr': {
      const v = values.value;
      if (v == null) return null;
      const slope = values.slope ?? 0;
      const slopeTxt = slope > 5 ? 'rising (less sold)' : slope < -5 ? 'falling (more sold)' : 'flat';
      if (v >= -20) {
        return pack(
          `Overbought ${v.toFixed(0)}`,
          'text-red-400',
          `Williams %R is ${v.toFixed(0)} (${slopeTxt}) — price is hugging the top of its recent range. ${pxLine}${div ? ` ${div}.` : ''} Same family as Stochastic: extremes mark stretch, not automatic reversals.`,
          'Pros fade only after %R leaves the -20 zone (crosses back down) at resistance. In strong trends, %R can “walk the rails” near 0.',
        );
      }
      if (v <= -80) {
        return pack(
          `Oversold ${v.toFixed(0)}`,
          'text-green-400',
          `Williams %R is ${v.toFixed(0)} (${slopeTxt}) — price is at the bottom of its recent range. ${pxLine}${div ? ` ${div}.` : ''}`,
          'Look for a cross back above -80 plus a bullish close. Double bullish divergence here is a high-quality bounce tell.',
        );
      }
      return pack(
        `Neutral ${v.toFixed(0)}`,
        'text-gray-400',
        `%R mid-range (${v.toFixed(0)}). ${pxLine} No range extreme.`,
        'Wait for a trip to -20 or -80, then a turn, rather than trading the middle.',
      );
    }
    case 'cci': {
      const v = values.value;
      if (v == null) return null;
      const slope = values.slope ?? 0;
      const slopeTxt = slope > 10 ? 'rising' : slope < -10 ? 'falling' : 'flat';
      if (v >= 100) {
        return pack(
          `Overbought ${v.toFixed(0)}`,
          'text-red-400',
          `CCI is ${v.toFixed(0)} and ${slopeTxt}. Price is well above its typical range (Lambert’s ±100 bands). ${pxLine}${div ? ` ${div}.` : ''} Above +100 in a trend = “strong, not necessarily done.”`,
          'Pros buy zero-line crosses *with* trend, and fade +100 only after CCI rolls back under +100 at supply. Watch for bearish divergence at a swing high.',
        );
      }
      if (v <= -100) {
        return pack(
          `Oversold ${v.toFixed(0)}`,
          'text-green-400',
          `CCI is ${v.toFixed(0)} (${slopeTxt}) — price is stretched below its average range. ${pxLine}${div ? ` ${div} — e.g. oversold CCI with double bullish divergence is the textbook bounce.` : ' A cross back above −100 is the first repair signal.'}`,
          'Look for CCI reclaiming −100, then the zero line, at a demand zone. Do not buy every −100 print in a cascade.',
        );
      }
      return pack(
        `Neutral ${v.toFixed(0)}`,
        'text-gray-400',
        `CCI is ${v.toFixed(0)} (${slopeTxt}) — inside the normal ±100 channel. ${pxLine} No stretch.`,
        'Zero-line cross is the pro trigger for trend continuation. Extremes (±100 / ±200) are for mean-reversion *only* with structure.',
      );
    }
    case 'adx': {
      const adx = values.adx;
      const plusDI = values.plusDI;
      const minusDI = values.minusDI;
      if (adx == null) return null;
      const slope = values.slope ?? 0;
      const slopeTxt = slope > 2 ? 'rising (trend building)' : slope < -2 ? 'falling (trend dying)' : 'stable';
      const dir =
        plusDI != null && minusDI != null
          ? plusDI > minusDI
            ? 'bullish (+DI > −DI)'
            : 'bearish (−DI > +DI)'
          : 'unknown';
      const dirWord = plusDI != null && minusDI != null && plusDI > minusDI ? 'bullish' : 'bearish';
      if (adx >= 40) {
        return pack(
          `Strong ${dirWord} trend ${adx.toFixed(0)}`,
          dirWord === 'bullish' ? 'text-green-400' : 'text-red-400',
          `ADX is ${adx.toFixed(0)} and ${slopeTxt}. ADX measures *strength*, not direction — this is a powerful trend. Direction comes from DI: currently ${dir}. ${pxLine} Strong ADX + ${px.structure} means do not fade the tape; trade pullbacks with it.`,
          'Pros only fade when ADX rolls over from a high (exhaustion) *and* price fails a swing. Rising ADX after a range = breakout confirmation. Never use ADX alone to pick long vs short.',
        );
      }
      if (adx >= 25) {
        return pack(
          `Trending ${dirWord} ${adx.toFixed(0)}`,
          dirWord === 'bullish' ? 'text-cyan-400' : 'text-orange-400',
          `ADX ${adx.toFixed(0)} (${slopeTxt}) = a real trend is on, direction ${dir}. ${pxLine} This is the “trade with the trend” zone (ADX > 25).`,
          'Take pullbacks in the DI direction. If +DI and −DI are tangled, wait. ADX still rising = trend not done.',
        );
      }
      return pack(
        `Weak trend ${adx.toFixed(0)}`,
        'text-gray-400',
        `ADX is ${adx.toFixed(0)} (${slopeTxt}) — below 25 so there is no durable trend. Direction from DI is ${dir}, but that is just the last little tilt, not a trend you must follow. ${pxLine} Current lean is ${dirWord} only because ${plusDI != null && minusDI != null ? (plusDI > minusDI ? '+DI is slightly above −DI' : '−DI is above +DI') : 'DI is mixed'} — in a range that flips often.`,
        'When ADX < 20–25, professionals switch to mean-reversion (fade edges, play range). They do *not* run trend-following systems. Wait for ADX to rise through 25 after a breakout to trust direction.',
      );
    }
    default:
      return null;
  }
}
