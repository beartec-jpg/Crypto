// src/utils/generateWaveOHLC.js
// Generate OHLC candles from anchor points using a stylized Catmull-Rom spline
// + layered noise + micro-tick aggregation. Designed for visual quality on D3 charts.
//
// Usage:
// import { generateWaveOHLC } from './src/utils/generateWaveOHLC.js'
// const bars = generateWaveOHLC(anchors, totalBars, opts);
//
// anchors: array of { t: number, price: number } where t is monotonic (can be indices or timestamps).
// totalBars: number of OHLC bars desired
// opts (optional):
//   - seed: integer for deterministic RNG (default 1337)
//   - microTicksPerBar: 50..200 recommended (default 80)
//   - roughness: 0.1..1.0 (default 0.25) - controls noise amplitude
//   - impulseMultiplier: >1 biases trend (default 1.4)
//   - jumpRate: expected jumps per tick (default 0.01)
//   - jumpStd: jump log-normal sigma (default 0.025)
//   - startDate: JS Date -> if provided and endDate also provided, returned bars will include .date fields
//   - endDate: JS Date
//
// Returns an array of bars:
//   [{ timeIndex, date? (if startDate/endDate provided), open, high, low, close }, ...]
//
// Notes:
// - Keeps anchors visually respected while producing many micro ticks to avoid stepping artifacts.
// - Deterministic if seed is provided.
// - If you want exact statistical GBM realism later, we can add optional GBM-bridge mode.

export function generateWaveOHLC(anchors, totalBars, opts) {
  opts = opts || {};
  const seed = (opts.seed === undefined ? 1337 : (opts.seed >>> 0));
  const microTicksPerBar = opts.microTicksPerBar || 80;
  const roughness = (opts.roughness === undefined ? 0.25 : opts.roughness);
  const impulseMultiplier = (opts.impulseMultiplier === undefined ? 1.4 : opts.impulseMultiplier);
  const jumpRate = (opts.jumpRate === undefined ? 0.01 : opts.jumpRate);
  const jumpStd = (opts.jumpStd === undefined ? 0.025 : opts.jumpStd);
  const startDate = opts.startDate || null;
  const endDate = opts.endDate || null;

  if (!anchors || anchors.length < 2) {
    throw new Error('generateWaveOHLC requires at least two anchors');
  }
  // Simple deterministic RNG (mulberry32)
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(seed);
  function randNormal() {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Normalize anchors.t if all identical (spread across totalBars)
  let normalizedAnchors = anchors.slice();
  const tFirst = normalizedAnchors[0].t;
  const tLast = normalizedAnchors[normalizedAnchors.length - 1].t;
  if (tFirst === tLast) {
    normalizedAnchors = normalizedAnchors.map((a, i) => ({ t: (i / (normalizedAnchors.length - 1)) * totalBars, price: a.price }));
  }

  // Catmull-Rom interpolation (constant-parameter)
  function catmullRomInterpolate(points, samples) {
    const out = new Array(samples);
    const tMin = points[0].t;
    const tMax = points[points.length - 1].t;
    for (let i = 0; i < samples; i++) {
      const u = i / (samples - 1);
      const t = tMin + u * (tMax - tMin);
      // locate segment j where t in [p_j.t, p_{j+1}.t]
      let j = 0;
      while (j < points.length - 1 && t > points[j + 1].t) j++;
      const p0 = points[Math.max(0, j - 1)];
      const p1 = points[Math.max(0, j)];
      const p2 = points[Math.min(points.length - 1, j + 1)];
      const p3 = points[Math.min(points.length - 1, j + 2)];
      // local parameter s
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

  const totalTicks = totalBars * microTicksPerBar;
  const denseBase = catmullRomInterpolate(normalizedAnchors, totalTicks + 1);

  // Build dense tick path with layered noise + occasional jumps
  const dense = new Array(denseBase.length);
  for (let i = 0; i < denseBase.length; i++) {
    const base = denseBase[i];
    const pos = i / (denseBase.length - 1);
    const segRough = roughness * (1 + (Math.sin(pos * Math.PI * 2) * 0.1));
    const lowFreq = Math.sin(i * (2 * Math.PI / denseBase.length) * 1) * segRough * 0.6;
    const midFreq = Math.sin(i * 0.02) * segRough * 0.25;
    const highFreq = randNormal() * segRough * 0.15;
    let price = base * (1 + lowFreq + midFreq) + highFreq;
    if (rand() < jumpRate) {
      const jumpFactor = Math.exp(randNormal() * jumpStd);
      price *= rand() < 0.5 ? jumpFactor : 1 / jumpFactor;
    }
    // small trend bias factor (visually accentuate impulse regions)
    price *= 1 + (pos - 0.5) * 0.02 * (impulseMultiplier - 1);
    dense[i] = Math.max(1e-8, price);
  }

  // Aggregate micro ticks into OHLC bars
  const bars = [];
  for (let b = 0; b < totalBars; b++) {
    const startIdx = b * microTicksPerBar;
    const endIdx = Math.min(startIdx + microTicksPerBar, dense.length - 1);
    const seg = dense.slice(startIdx, endIdx + 1);
    const open = seg[0];
    const close = seg[seg.length - 1];
    let high = -Infinity, low = Infinity;
    for (let v of seg) {
      if (v > high) high = v;
      if (v < low) low = v;
    }
    const bar = { timeIndex: b, open, high, low, close };
    bars.push(bar);
  }

  // Map timeIndex -> date if startDate & endDate provided
  if (startDate && endDate) {
    const sMs = (new Date(startDate)).getTime();
    const eMs = (new Date(endDate)).getTime();
    const span = Math.max(1, eMs - sMs);
    for (let i = 0; i < bars.length; i++) {
      const t = sMs + (bars[i].timeIndex / Math.max(1, totalBars - 1)) * span;
      bars[i].date = new Date(t);
    }
  }

  return bars;
}
