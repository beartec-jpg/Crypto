import { CandleData } from '@/types/chart.types';
import { SqueezeMomentumValue } from '@/types/squeezeMomentum';

/**
 * Calculate Squeeze Momentum Indicator (LazyBear)
 *
 * Logic:
 * 1. Calculate Bollinger Bands (SMA ± mult * StdDev)
 * 2. Calculate Keltner Channels (SMA ± multKC * ATR)
 * 3. Squeeze ON when BB is inside KC
 * 4. Momentum = Linear Regression of (close - avg(avg(highest(high), lowest(low)), sma(close)))
 */
export function calculateSqueezeMomentum(
  candles: CandleData[],
  length: number = 20,
  mult: number = 2.0,
  lengthKC: number = 20,
  multKC: number = 1.5
): SqueezeMomentumValue[] {
  if (candles.length < Math.max(length, lengthKC)) return [];

  const result: SqueezeMomentumValue[] = [];

  const sma = (data: number[], period: number, index: number): number => {
    if (index < period - 1) return 0;
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[index - i];
    }
    return sum / period;
  };

  const stdDev = (data: number[], period: number, index: number, mean: number): number => {
    if (index < period - 1) return 0;
    let sum = 0;
    for (let i = 0; i < period; i++) {
      const diff = data[index - i] - mean;
      sum += diff * diff;
    }
    return Math.sqrt(sum / period);
  };

  const calculateATR = (index: number): number => {
    if (index < 1) return 0;

    if (index < lengthKC) {
      let sum = 0;
      for (let i = 1; i <= index; i++) {
        const tr_i = Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        );
        sum += tr_i;
      }
      return sum / index;
    }

    let sum = 0;
    for (let i = 0; i < lengthKC; i++) {
      const idx = index - i;
      const tr_i = Math.max(
        candles[idx].high - candles[idx].low,
        Math.abs(candles[idx].high - candles[idx - 1].close),
        Math.abs(candles[idx].low - candles[idx - 1].close)
      );
      sum += tr_i;
    }
    return sum / lengthKC;
  };

  const linReg = (data: number[], period: number, index: number): number => {
    if (index < period - 1) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < period; i++) {
      const x = i;
      const y = data[index - period + 1 + i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denom = period * sumX2 - sumX * sumX;
    if (denom === 0) return sumY / period;
    const slope = (period * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / period;

    return intercept + slope * (period - 1);
  };

  const closes = candles.map(c => c.close);

  for (let i = Math.max(length, lengthKC); i < candles.length; i++) {
    const basis = sma(closes, length, i);
    const dev = stdDev(closes, length, i, basis);
    const upperBB = basis + mult * dev;
    const lowerBB = basis - mult * dev;

    const basisKC = sma(closes, lengthKC, i);
    const atr = calculateATR(i);
    const upperKC = basisKC + multKC * atr;
    const lowerKC = basisKC - multKC * atr;

    const sqzOn = lowerBB > lowerKC && upperBB < upperKC;
    const sqzOff = lowerBB < lowerKC && upperBB > upperKC;

    const momentumData: number[] = [];
    for (let j = i - lengthKC + 1; j <= i; j++) {
      if (j < 0) continue;
      const b = sma(closes, lengthKC, j);
      let hh = candles[j].high;
      let ll = candles[j].low;
      for (let k = 0; k < lengthKC && j - k >= 0; k++) {
        hh = Math.max(hh, candles[j - k].high);
        ll = Math.min(ll, candles[j - k].low);
      }
      const avg = ((hh + ll) / 2 + b) / 2;
      momentumData.push(candles[j].close - avg);
    }

    const momentum = linReg(momentumData, lengthKC, momentumData.length - 1);

    const prevMomentum = result.length > 0 ? result[result.length - 1].value : 0;

    let color: 'cyan' | 'blue' | 'red' | 'yellow';
    if (momentum > 0) {
      color = momentum > prevMomentum ? 'cyan' : 'blue';
    } else {
      color = momentum < prevMomentum ? 'red' : 'yellow';
    }

    result.push({
      time: candles[i].time as number,
      value: momentum,
      sqzOn,
      sqzOff,
      color,
    });
  }

  return result;
}
