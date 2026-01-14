// src/utils/generateWaveEnsemble.ts
// Template-based ensemble wave generator for Elliott-style projected candles

export interface Candle {
  timeIndex: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Template = 'impulse5' | 'abc';

interface EnsembleOpts {
  template?: Template;
  startPrice: number;
  totalBars: number;
  samples?: number;
  microTicksPerBar?: number;
  sizeStd?: number;
  timeStd?: number;
  seed?: number;
  roughness?: number;
  direction?: 1 | -1;
  anchors?: { t: number; price: number }[]; // optional user anchors to respect
  patternVariant?: 'flat' | 'zigzag'; // bias sampling for corrective patterns
}

interface EnsembleResult {
  trials: Candle[][];
  median: Candle[];
  quantileHigh: number[];
  quantileLow: number[];
}

// Deterministic RNG (mulberry32) + normal sampler
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRand(seed = 1337) {
  const r = mulberry32(seed >>> 0);
  function rand() {
    return r();
  }
  function randNormal() {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  return { rand, randNormal };
}

// Simple Catmull-Rom interpolation over points {t, price}
function catmullRomInterpolate(points: { t: number; price: number }[], samples: number) {
  const out: number[] = new Array(samples);
  if (!points || points.length === 0) {
    return out.fill(0);
  }
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const t = tMin + u * (tMax - tMin);
    let j = 0;
    while (j < points.length - 1 && t > points[j + 1].t) j++;
    const p0 = points[Math.max(0, j - 1)];
    const p1 = points[Math.max(0, j)];
    const p2 = points[Math.min(points.length - 1, j + 1)];
    const p3 = points[Math.min(points.length - 1, j + 2)];
    const denom = (p2.t - p1.t) || 1e-9;
    const s = (t - p1.t) / denom;
    const s2 = s * s, s3 = s2 * s;
    const p0v = p0.price, p1v = p1.price, p2v = p2.price, p3v = p3.price;
    const a0 = -0.5 * p0v + 1.5 * p1v - 1.5 * p2v + 0.5 * p3v;
    const a1 = p0v - 2.5 * p1v + 2 * p2v - 0.5 * p3v;
    const a2 = -0.5 * p0v + 0.5 * p2v;
    const a3 = p1v;
    out[i] = a0 * s3 + a1 * s2 + a2 * s + a3;
  }
  return out;
}

function addMicroNoise(base: number[], randNormal: () => number, rand: () => number, roughness: number) {
  const len = base.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const pos = i / Math.max(1, len - 1);
    const lf = Math.sin(i * (2 * Math.PI / Math.max(1, len)) * 1) * roughness * 0.6;
    const mf = Math.sin(i * 0.02) * roughness * 0.25;
    const hf = randNormal() * roughness * 0.15;
    let price = base[i] * (1 + lf + mf) + hf;
    // small random micro jumps
    if (rand() < 0.0025) {
      const jump = Math.exp(randNormal() * 0.02);
      price *= rand() < 0.5 ? jump : 1 / jump;
    }
    out[i] = Math.max(1e-8, price);
  }
  return out;
}

function aggregateToOHLC(dense: number[], totalBars: number, microTicksPerBar: number) {
  const bars: Candle[] = [];
  for (let b = 0; b < totalBars; b++) {
    const startIdx = b * microTicksPerBar;
    const endIdx = Math.min(startIdx + microTicksPerBar, dense.length - 1);
    const seg = dense.slice(startIdx, endIdx + 1);
    const open = seg[0];
    const close = seg[seg.length - 1];
    let high = -Infinity, low = Infinity;
    for (const v of seg) {
      if (v > high) high = v;
      if (v < low) low = v;
    }
    bars.push({ timeIndex: b, open, high, low, close });
  }
  return bars;
}

// Sample pivot sets for impulse5 and abc templates
function samplePivots(opts: EnsembleOpts, randNormal: () => number, rand: () => number) {
  const { template = 'impulse5', totalBars, startPrice, sizeStd = 0.12, timeStd = 0.15, direction = 1, anchors, patternVariant = 'zigzag' } = opts as EnsembleOpts & { patternVariant?: 'flat' | 'zigzag' };
  // Fibonacci-like priors (relative amplitudes)
  const impulsePriors = [0.38, 0.24, 0.62, 0.20, 1.0];
  const abcPriors = [0.5, 0.38, 0.62];

  if (template === 'impulse5') {
    // durations and amplitudes
    let durations = impulsePriors.map(p => Math.max(0.03, p * (1 + randNormal() * timeStd)));
    const sum = durations.reduce((a, b) => a + b, 0);
    const durBars = durations.map(d => Math.max(1, Math.round((d / sum) * totalBars)));
    let amps = impulsePriors.map(p => (p * (1 + randNormal() * sizeStd)));
    // construct pivots - start at t=0 price startPrice
    const pivots: { t: number; price: number }[] = [{ t: 0, price: startPrice }];
    let t = 0;
    let price = startPrice;
    let dir = direction; // +1 up impulse by default
    for (let i = 0; i < amps.length; i++) {
      const target = price + dir * amps[i] * startPrice * 0.005; // scale factor for magnitude
      t += durBars[i];
      pivots.push({ t, price: target });
      price = target;
      // impulse waves mostly alternate in small retraces; emulate by sign change on corrective legs
      dir = i === 0 || i === 2 || i === 4 ? direction : -direction * 0.4; // weaker corrective
    }
    // anchors: simple snap for first + last
    if (anchors && anchors.length > 0) {
      pivots[0] = { t: 0, price: anchors[0].price };
      const last = anchors[anchors.length - 1];
      pivots[pivots.length - 1] = { t: totalBars, price: last.price };
    }
    return pivots;
  } else {
    // abc
    // adjust sampling based on requested pattern variant
    let durations = abcPriors.map(p => Math.max(0.03, p * (1 + randNormal() * (patternVariant === 'flat' ? timeStd * 0.6 : timeStd))));
    const sum = durations.reduce((a, b) => a + b, 0);
    const durBars = durations.map(d => Math.max(1, Math.round((d / sum) * totalBars)));

    // bias amplitudes for flat vs zigzag
    let amps: number[];
    if (patternVariant === 'flat') {
      // B leg near-equal to A (flat tends to have B ~ A), reduce variance
      amps = abcPriors.map((p, idx) => {
        if (idx === 1) return p * (1.0 + randNormal() * (sizeStd * 0.4));
        return p * (1 + randNormal() * sizeStd);
      });
    } else {
      // zigzag: B is typically smaller and C deeper -> make B smaller
      amps = abcPriors.map((p, idx) => {
        if (idx === 1) return p * (0.5 + Math.abs(randNormal()) * sizeStd); // smaller B
        return p * (1 + randNormal() * sizeStd);
      });
    }

    const pivots: { t: number; price: number }[] = [{ t: 0, price: startPrice }];
    let t = 0; let price = startPrice; let dir = direction;
    for (let i = 0; i < amps.length; i++) {
      const strength = i === 1 ? 0.8 : 1.0; // B leg typically smaller
      const target = price + dir * amps[i] * startPrice * 0.004 * strength;
      t += durBars[i];
      pivots.push({ t, price: target });
      price = target;
      dir = -dir; // alternate direction for corrective abc
    }
    if (anchors && anchors.length > 0) {
      pivots[0] = { t: 0, price: anchors[0].price };
      pivots[pivots.length - 1] = { t: totalBars, price: anchors[anchors.length - 1].price };
    }
    return pivots;
  }
}

export async function generateWaveEnsemble(opts: EnsembleOpts): Promise<EnsembleResult> {
  const samples = opts.samples ?? 200;
  const microTicksPerBar = opts.microTicksPerBar ?? 80;
  const roughness = opts.roughness ?? 0.012;
  const seed = opts.seed ?? 1337;
  const { rand, randNormal } = makeRand(seed);

  const trials: Candle[][] = [];
  const totalTicks = opts.totalBars * microTicksPerBar;

  for (let s = 0; s < samples; s++) {
    const pivots = samplePivots(opts, randNormal, rand);
    // normalize pivot times to [0, totalTicks]
    const lastPivotT = pivots[pivots.length - 1].t || 1;
    const scaledPivots = pivots.map(p => ({ t: Math.round((p.t / Math.max(1, lastPivotT)) * totalTicks), price: p.price }));
    const denseBase = catmullRomInterpolate(scaledPivots, totalTicks + 1);
    const denseNoised = addMicroNoise(denseBase, randNormal, rand, roughness);
    const bars = aggregateToOHLC(denseNoised, opts.totalBars, microTicksPerBar);
    trials.push(bars);
  }

  // compute median and quantiles per bar index
  const median: Candle[] = [];
  const quantileHigh: number[] = [];
  const quantileLow: number[] = [];
  const B = opts.totalBars;
  for (let i = 0; i < B; i++) {
    const closes = trials.map(t => t[i].close).sort((a, b) => a - b);
    const highs = trials.map(t => t[i].high).sort((a, b) => a - b);
    const lows = trials.map(t => t[i].low).sort((a, b) => a - b);
    const medianIdx = Math.floor(closes.length / 2);
    const medianClose = closes[medianIdx];
    const medianOpen = trials.map(t => t[i].open).sort((a, b) => a - b)[medianIdx];
    const qLow = lows[Math.floor(closes.length * 0.1)];
    const qHigh = highs[Math.floor(closes.length * 0.9)];
    median.push({ timeIndex: i, open: medianOpen, high: medianClose, low: medianClose, close: medianClose });
    quantileHigh.push(qHigh);
    quantileLow.push(qLow);
  }

  return { trials, median, quantileHigh, quantileLow };
}
