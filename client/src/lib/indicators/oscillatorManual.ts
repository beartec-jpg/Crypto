import { buildIndicatorCoach, type IndicatorCoachReport } from '@/lib/indicators/indicatorCoach';
import { tideZoneLabel } from '@/lib/indicators/tideZone';
import type { OscillatorData } from '@/hooks/useOscillatorData';

export type OscillatorManual = {
  title: string;
  how: string;
  levels: string;
};

const MANUAL: Record<string, OscillatorManual> = {
  rsi: {
    title: 'RSI (14)',
    how: 'Relative Strength Index compares average up-closes to down-closes over 14 bars. It is a momentum stretch meter, not a buy/sell switch. In a strong trend it can stay overbought or oversold for a long time.',
    levels: '70+ = stretched up (warning, not an auto-short). 30− = stretched down. 40–60 in a trend is often a healthy pause. Best tells: RSI hook back through 70/30, or divergence at a swing (price new extreme, RSI not).',
  },
  macd: {
    title: 'MACD (12, 26, 9)',
    how: 'MACD is the gap between a fast and slow EMA; the signal line is an EMA of that gap; the histogram is the gap vs signal. It measures whether momentum is expanding or dying, not whether price is cheap.',
    levels: 'MACD above signal = bullish momentum. Below = bearish. Histogram growing = move is accelerating; shrinking = stalling. Crosses below zero are weaker than crosses above zero. Fade only with a failed high/low plus a cross.',
  },
  stochrsi: {
    title: 'Stochastic RSI',
    how: 'Stoch RSI is a fast oscillator of RSI, so it hits 0/100 often. Use it for timing inside a larger bias, not as a trend call.',
    levels: '80+ stretched short-term up; 20− stretched down. The trade is the cross back out of the extreme (%K through 80/20 or through %D), preferably at a level. Ignore most rail-walks in a strong trend.',
  },
  volume: {
    title: 'Volume',
    how: 'Volume is participation. Rising price on rising volume is a real bid; rising price on dying volume is a thin rally. Spikes at highs can be climax (exhaustion) or continuation — the next bar decides.',
    levels: 'Compare this bar to the recent average. Quiet grind = low conviction. Volume dry-up into a level then a burst the other way is a common reversal tell. Do not read a single green/red bar as a signal.',
  },
  williamsr: {
    title: 'Williams %R (14)',
    how: 'Williams %R is where the close sits in the last 14-bar high–low range. 0 is the high of the range, −100 is the low. Same family as Stochastic.',
    levels: 'Above −20 = hugging the highs. Below −80 = hugging the lows. The tell is leaving the zone (cross back through −20/−80), not the first print at the rail. Can walk the rails in a trend.',
  },
  cci: {
    title: 'CCI (20)',
    how: 'CCI measures how far typical price is from its average, in units of mean deviation. ±100 is “outside the usual range,” not a mandatory reverse.',
    levels: 'Zero-line cross with the trend is the continuation trigger. +100/−100 is stretch. Fade an extreme only after CCI rolls back through the band at a real high/low.',
  },
  adx: {
    title: 'ADX (14)',
    how: 'ADX is trend *strength*, not direction. +DI vs −DI is direction. High ADX means “do not fade”; low ADX means “there is no trend to follow.”',
    levels: 'ADX < 20–25 = range, use mean-reversion. ADX > 25 = a real trend; trade pullbacks with +DI/−DI. ADX rolling over from a high is exhaustion, not an entry by itself.',
  },
  obv: {
    title: 'On-Balance Volume',
    how: 'OBV adds volume on up closes and subtracts it on down closes. It is a running vote of which side is getting the volume. Slope matters more than the number.',
    levels: 'Rising OBV with rising price = confirmed bid. Price up, OBV down = thin rally / possible distribution at highs. Price down, OBV up = possible absorption at lows. Hidden divergence is continuation.',
  },
  mfi: {
    title: 'Money Flow Index (14)',
    how: 'MFI is RSI with volume. Extremes mean money actually moved, not just price stretched.',
    levels: '80+ inflow stretch; 20− outflow flush. 50 is a tide line. Divergence on MFI is usually cleaner than RSI-only because volume is in the formula.',
  },
  cmf: {
    title: 'Chaikin Money Flow (20)',
    how: 'CMF asks whether closes are in the high or low of the bar, then weights that by volume over 20 bars. It is “are they closing strong on volume?”',
    levels: 'Above 0 = net buying pressure. Below 0 = net selling. Crosses of zero with price structure matter more than the exact value. Persistent CMF < 0 while price grinds up is a warning.',
  },
  tsi: {
    title: 'True Strength Index',
    how: 'TSI is a double-smoothed momentum of price change. It is slower than RSI and less noisy. Signal-line crosses are the usual trigger.',
    levels: 'TSI above signal = upside momentum. Below = downside. Zero is the bias line. Extremes depend on the market; use crosses and divergence at swings rather than a fixed 25/−25 as gospel.',
  },
  klinger: {
    title: 'Klinger Volume Oscillator',
    how: 'Klinger tries to catch long-term money flow using volume and high–low range, then a signal line. Treat it like a slow volume-MACD.',
    levels: 'Klinger above signal = accumulation pressure. Below = distribution pressure. Best as confirmation of a level, not a standalone entry. Whipsaws in chop.',
  },
  waddah: {
    title: 'Waddah Attar Explosion',
    how: 'Waddah is MACD-style momentum vs a Bollinger “explosion” line. When the histogram is big and above the explosion line, a real burst is on. Dead histogram = no fuel.',
    levels: 'Green burst above explosion = strong upside impulse. Red burst above explosion = strong downside impulse. Histogram below the explosion line = move is not “explosive” even if it is green/red. Do not fade a live explosion.',
  },
  tideZone: {
    title: 'Tide Zone',
    how: 'Tide Zone is a location score from 4h RSI/EMA50 (the tide), local energy (ATR/BB), and tape (signed volume). Green +40 is “with the 4h,” not a buy for the whole trend. The sky line is an EMA of the hist to ignore 1–2 bar flips.',
    levels: 'DIV = price zigzag lower low vs Tide-EMA zigzag higher low (below the below-score line). Absorb = price flat/down between two price zigzag lows while Tide EMA is rising. Distro/Reacc need open interest. Exit longs toward 0, not −40.',
  },
  smartMoney: {
    title: 'Smart Money Tracker',
    how: 'A weighted score of SMC-style conditions (structure, imbalances, liquidity). Positive leans long, negative leans short. It is a dashboard, not a market order.',
    levels: 'Read the top conditions: what is actually scoring. High confidence + aligned structure is more useful than a naked number. Fade the score when the conditions are leftover from an old swing.',
  },
  smcTrendEngine: {
    title: 'SMC Trend Engine',
    how: 'Engineered read of market structure (swings, breaks, bias). Use it as the higher-timeframe lean for the oscillators below.',
    levels: 'With-trend pullbacks are the default. Counter-trend only when the engine has actually flipped, not because an oscillator is oversold.',
  },
};

function slope(series: Array<{ value?: number; k?: number; adx?: number } | number>, pick?: (d: any) => number): number {
  const xs = series.slice(-5).map((d) => (typeof d === 'number' ? d : pick ? pick(d) : (d as { value: number }).value));
  if (xs.length < 2 || xs.some((x) => x == null || !Number.isFinite(x))) return 0;
  return (xs[xs.length - 1] as number) - (xs[0] as number);
}

export function getOscillatorManual(id: string): OscillatorManual {
  return (
    MANUAL[id] || {
      title: id,
      how: 'No training card written for this pane yet.',
      levels: 'Read the live state below against price structure.',
    }
  );
}

export function getOscillatorLiveReport(
  id: string,
  data: OscillatorData,
  candles: Array<{ open: number; high: number; low: number; close: number }>,
): IndicatorCoachReport | null {
  const values: Record<string, number | undefined> = {};
  const key = id.toLowerCase().replace(/[^a-z]/g, '');
  switch (id) {
    case 'rsi': {
      const s = data.rsi;
      values.value = s[s.length - 1]?.value;
      values.slope = slope(s);
      break;
    }
    case 'stochRsi': {
      const s = data.stochRsi;
      values.k = s[s.length - 1]?.k;
      values.slope = slope(s, (d) => d.k);
      break;
    }
    case 'macd': {
      const { macd, signal, hist } = data.macd;
      const lastM = macd[macd.length - 1]?.value;
      const lastS = signal[signal.length - 1]?.value;
      const prevM = macd[macd.length - 2]?.value;
      const prevS = signal[signal.length - 2]?.value;
      values.macd = lastM;
      values.signal = lastS;
      values.hist = hist[hist.length - 1]?.value;
      if (lastM != null && lastS != null && prevM != null && prevS != null) {
        values.crossedUp = prevM < prevS && lastM > lastS ? 1 : 0;
        values.crossedDown = prevM > prevS && lastM < lastS ? 1 : 0;
      }
      break;
    }
    case 'obv':
      values.slope = slope(data.obv);
      break;
    case 'mfi':
      values.value = data.mfi[data.mfi.length - 1]?.value;
      values.slope = slope(data.mfi);
      break;
    case 'williamsR':
      values.value = data.williamsR[data.williamsR.length - 1]?.value;
      values.slope = slope(data.williamsR);
      break;
    case 'cci':
      values.value = data.cci[data.cci.length - 1]?.value;
      values.slope = slope(data.cci);
      break;
    case 'adx': {
      const last = data.adx[data.adx.length - 1];
      values.adx = last?.adx;
      values.plusDI = last?.plusDI;
      values.minusDI = last?.minusDI;
      values.slope = slope(data.adx, (d) => d.adx);
      break;
    }
    case 'cmf': {
      const v = data.cmf[data.cmf.length - 1]?.value;
      const sl = slope(data.cmf);
      const side = v == null ? 'flat' : v > 0.05 ? 'buying' : v < -0.05 ? 'selling' : 'neutral';
      return {
        headline: v == null ? 'No CMF' : `CMF ${v.toFixed(2)} (${side})`,
        color: v == null ? 'text-slate-400' : v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-slate-400',
        text: '',
        meaning:
          v == null
            ? 'Waiting on data.'
            : `CMF is ${v.toFixed(2)} and ${sl > 0 ? 'rising' : sl < 0 ? 'falling' : 'flat'}. ${
                v > 0 ? 'Closes are in the upper part of bars on volume (bid).' : v < 0 ? 'Closes are in the lower part of bars on volume (offer).' : 'No side is winning the close-location war.'
              }`,
        lookFor: 'Zero-line cross with structure. Persistent CMF against price is the warning.',
      };
    }
    case 'volume': {
      const last = data.volume[data.volume.length - 1];
      const avg = data.avgVolume || 0;
      const ratio = last && avg ? last.value / avg : 0;
      return {
        headline: last ? `${ratio >= 1.5 ? 'Heavy' : ratio <= 0.6 ? 'Quiet' : 'Average'} vol` : 'No volume',
        color: ratio >= 1.5 ? 'text-amber-400' : 'text-slate-300',
        text: '',
        meaning: last
          ? `This bar is ${ratio.toFixed(1)}× the recent average. ${ratio >= 1.5 ? 'Participation is elevated — climax or continuation; wait one bar.' : ratio <= 0.6 ? 'Thin tape — moves can reverse easily.' : 'Normal participation.'}`
          : 'Waiting on data.',
        lookFor: 'Dry-up into a level then a burst the other way. Do not treat one spike as a signal.',
      };
    }
    case 'tsi': {
      const t = data.tsi.tsi[data.tsi.tsi.length - 1]?.value;
      const s = data.tsi.signal[data.tsi.signal.length - 1]?.value;
      if (t == null || s == null) return null;
      const above = t > s;
      return {
        headline: above ? 'TSI above signal' : 'TSI below signal',
        color: above ? 'text-green-400' : 'text-red-400',
        text: '',
        meaning: `TSI ${t.toFixed(1)} vs signal ${s.toFixed(1)} — ${above ? 'upside' : 'downside'} momentum on the slow oscillator.`,
        lookFor: 'Signal-line crosses at swings. Zero-line is bias. Divergence on TSI is slower and often cleaner than RSI.',
      };
    }
    case 'klinger': {
      const k = data.klinger.klinger[data.klinger.klinger.length - 1]?.value;
      const s = data.klinger.signal[data.klinger.signal.length - 1]?.value;
      if (k == null || s == null) return null;
      const above = k > s;
      return {
        headline: above ? 'Klinger above signal' : 'Klinger below signal',
        color: above ? 'text-green-400' : 'text-red-400',
        text: '',
        meaning: `Volume oscillator is ${above ? 'in accumulation' : 'in distribution'} vs its signal.`,
        lookFor: 'Use as confirmation of a level, not a standalone entry. Crosses in chop will fake you.',
      };
    }
    case 'waddah': {
      const h = data.waddah.histogram[data.waddah.histogram.length - 1];
      const e = data.waddah.explosion[data.waddah.explosion.length - 1]?.value;
      if (!h || e == null) return null;
      const exploding = Math.abs(h.value) > e;
      return {
        headline: exploding ? (h.value > 0 ? 'Upside explosion' : 'Downside explosion') : 'No explosion',
        color: exploding ? (h.value > 0 ? 'text-green-400' : 'text-red-400') : 'text-slate-400',
        text: '',
        meaning: exploding
          ? `Histogram is beyond the explosion line — a real burst is on (${h.value > 0 ? 'up' : 'down'}).`
          : 'Histogram is under the explosion line. Color without explosion is just a mild MACD lean.',
        lookFor: 'Trade with a live explosion. Fade only after it dies (histogram back under the line) at a level.',
      };
    }
    case 'tideZone': {
      const last = data.tideZone[data.tideZone.length - 1];
      if (!last) return null;
      return {
        headline: tideZoneLabel(last.kind),
        color:
          last.kind === 'follow_buy'
            ? 'text-emerald-400'
            : last.kind === 'bounce_buy'
              ? 'text-amber-400'
              : last.kind === 'sell'
                ? 'text-red-400'
                : 'text-slate-400',
        text: '',
        meaning: `Score ${last.score.toFixed(0)}. Tide ${Math.round(last.tide * 100)} · Energy ${Math.round(last.energy * 100)} · Tape ${Math.round(last.tape * 100)}. ${
          last.tell ? `Tell: ${last.tell}.` : 'No absorb/distro/reacc tell on this bar.'
        }`,
        lookFor: 'DIV = price LL vs EMA HL. Absorb = price flat/down, Tide EMA up. Distro needs OI flush at a high. Location is not a buy.',
      };
    }
    case 'smartMoney':
      return {
        headline: 'See panel score',
        color: 'text-slate-300',
        text: '',
        meaning: 'The number is a weighted SMC dashboard. Read which conditions are actually scoring.',
        lookFor: 'Aligned structure + high confidence. Ignore leftover scores from an old swing.',
      };
    case 'smcTrendEngine':
      return {
        headline: 'See engine bias',
        color: 'text-slate-300',
        text: '',
        meaning: 'This pane is the structure lean for the oscillators. Trade pullbacks with it until it flips.',
        lookFor: 'A real break of structure, not an oversold oscillator against the engine.',
      };
    default:
      break;
  }
  return buildIndicatorCoach({ indicator: key, candles, values });
}
