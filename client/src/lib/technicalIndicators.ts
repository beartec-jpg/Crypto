function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const seed = average(values.slice(0, period));
  const result: number[] = [seed];

  for (let index = period; index < values.length; index += 1) {
    result.push((values[index] - result[result.length - 1]) * multiplier + result[result.length - 1]);
  }

  return result;
}

function findPivotIndices(values: number[], left: number = 2, right: number = 2): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let index = left; index < values.length - right; index += 1) {
    let isPivotHigh = true;
    let isPivotLow = true;

    for (let offset = 1; offset <= left; offset += 1) {
      if (values[index] <= values[index - offset]) isPivotHigh = false;
      if (values[index] >= values[index - offset]) isPivotLow = false;
    }

    for (let offset = 1; offset <= right; offset += 1) {
      if (values[index] <= values[index + offset]) isPivotHigh = false;
      if (values[index] >= values[index + offset]) isPivotLow = false;
    }

    if (isPivotHigh) highs.push(index);
    if (isPivotLow) lows.push(index);
  }

  return { highs, lows };
}

function mapRsiToPriceIndex(priceLength: number, rsi: number[]): number[] {
  const offset = Math.max(0, priceLength - rsi.length);
  return Array.from({ length: priceLength }, (_, index) => {
    if (index < offset) return Number.NaN;
    return rsi[index - offset] ?? Number.NaN;
  });
}

export function calculateSlope(values: number[], lookback: number = 6): number {
  if (values.length < 2) return 0;

  const window = values.slice(-Math.min(lookback, values.length));
  const n = window.length;
  const meanX = (n - 1) / 2;
  const meanY = average(window);

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = index - meanX;
    const dy = window[index] - meanY;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];

  const gains: number[] = [];
  const losses: number[] = [];

  for (let index = 1; index < prices.length; index += 1) {
    const change = prices[index] - prices[index - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  let avgGain = average(gains.slice(0, period));
  let avgLoss = average(losses.slice(0, period));
  const rsi: number[] = [];

  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + firstRS));

  for (let index = period; index < gains.length; index += 1) {
    avgGain = (avgGain * (period - 1) + gains[index]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[index]) / period;

    if (avgLoss === 0) {
      rsi.push(100);
      continue;
    }

    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

export function detectRSIDivergence(prices: number[], rsi: number[]): 'bullish' | 'bearish' | null {
  if (prices.length < 30 || rsi.length < 12) return null;

  const rsiAtPriceIndex = mapRsiToPriceIndex(prices.length, rsi);
  const pivots = findPivotIndices(prices, 2, 2);

  const recentLowPivots = pivots.lows.slice(-3).filter((index) => Number.isFinite(rsiAtPriceIndex[index]));
  if (recentLowPivots.length >= 2) {
    const prevIndex = recentLowPivots[recentLowPivots.length - 2];
    const lastIndex = recentLowPivots[recentLowPivots.length - 1];

    const priceLowerLow = prices[lastIndex] < prices[prevIndex] * 0.998;
    const rsiHigherLow = rsiAtPriceIndex[lastIndex] > rsiAtPriceIndex[prevIndex] + 1.5;

    if (priceLowerLow && rsiHigherLow) return 'bullish';
  }

  const recentHighPivots = pivots.highs.slice(-3).filter((index) => Number.isFinite(rsiAtPriceIndex[index]));
  if (recentHighPivots.length >= 2) {
    const prevIndex = recentHighPivots[recentHighPivots.length - 2];
    const lastIndex = recentHighPivots[recentHighPivots.length - 1];

    const priceHigherHigh = prices[lastIndex] > prices[prevIndex] * 1.002;
    const rsiLowerHigh = rsiAtPriceIndex[lastIndex] < rsiAtPriceIndex[prevIndex] - 1.5;

    if (priceHigherHigh && rsiLowerHigh) return 'bearish';
  }

  return null;
}

export function calculateMACD(prices: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  if (prices.length < 26) {
    return { macd: [], signal: [], histogram: [] };
  }

  const fast = ema(prices, 12);
  const slow = ema(prices, 26);
  const alignOffset = 26 - 12;

  const macd = slow.map((slowValue, index) => {
    const fastIndex = index + alignOffset;
    return fast[fastIndex] - slowValue;
  });

  const signal = ema(macd, 9);
  const histogram = signal.map((signalValue, index) => {
    const macdIndex = index + 8;
    return macd[macdIndex] - signalValue;
  });

  return { macd, signal, histogram };
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  std: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  if (prices.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let index = period - 1; index < prices.length; index += 1) {
    const window = prices.slice(index - period + 1, index + 1);
    const mean = average(window);
    const deviation = standardDeviation(window);

    middle.push(mean);
    upper.push(mean + std * deviation);
    lower.push(mean - std * deviation);
  }

  return { upper, middle, lower };
}

export function calculateStochRSI(prices: number[], period: number = 14): { k: number[]; d: number[] } {
  const rsi = calculateRSI(prices, period);
  if (rsi.length < period) return { k: [], d: [] };

  const k: number[] = [];
  for (let index = period - 1; index < rsi.length; index += 1) {
    const window = rsi.slice(index - period + 1, index + 1);
    const lowest = Math.min(...window);
    const highest = Math.max(...window);
    const range = highest - lowest;

    if (range === 0) {
      k.push(50);
    } else {
      k.push(((rsi[index] - lowest) / range) * 100);
    }
  }

  const d: number[] = [];
  const dPeriod = 3;
  for (let index = dPeriod - 1; index < k.length; index += 1) {
    d.push(average(k.slice(index - dPeriod + 1, index + 1)));
  }

  return { k, d };
}

export function calculateVPOC(prices: number[], volumes: number[], period: number = 30): number {
  if (prices.length === 0 || volumes.length === 0) return 0;

  const sliceSize = Math.min(period, prices.length, volumes.length);
  const recentPrices = prices.slice(-sliceSize);
  const recentVolumes = volumes.slice(-sliceSize);

  let volumeWeightedPrice = 0;
  let volumeTotal = 0;

  for (let index = 0; index < sliceSize; index += 1) {
    const volume = Math.max(0, recentVolumes[index]);
    volumeWeightedPrice += recentPrices[index] * volume;
    volumeTotal += volume;
  }

  if (volumeTotal === 0) {
    return recentPrices[recentPrices.length - 1] || 0;
  }

  return volumeWeightedPrice / volumeTotal;
}

export function calculateVolumeAverage(volumes: number[], period: number = 20): number {
  if (volumes.length === 0) return 0;
  const slice = volumes.slice(-Math.min(period, volumes.length));
  return average(slice);
}
