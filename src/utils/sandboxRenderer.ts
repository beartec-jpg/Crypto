// src/utils/sandboxRenderer.ts
// Canvas helpers to draw ensemble trials and median on an overlay canvas.

import type { Candle } from './generateWaveEnsemble';

export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
}

export function drawTrialCandles(
  ctx: CanvasRenderingContext2D,
  trials: Candle[][],
  xForIndex: (i: number) => number,
  yForPrice: (p: number) => number,
  candlePxWidth: number = 4,
  trialAlpha: number = 0.03
) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let t = 0; t < trials.length; t++) {
    const trial = trials[t];
    ctx.globalAlpha = trialAlpha;
    for (let i = 0; i < trial.length; i++) {
      const c = trial[i];
      const x = xForIndex(c.timeIndex);
      const openY = yForPrice(c.open);
      const closeY = yForPrice(c.close);
      const highY = yForPrice(c.high);
      const lowY = yForPrice(c.low);
      ctx.strokeStyle = 'rgba(6,182,212,0.08)';
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      const top = Math.min(openY, closeY);
      const height = Math.max(1, Math.abs(closeY - openY));
      ctx.fillStyle = 'rgba(6,182,212,0.03)';
      ctx.fillRect(x - candlePxWidth / 2, top, candlePxWidth, height);
    }
  }
  ctx.restore();
}

export function drawMedianCandles(
  ctx: CanvasRenderingContext2D,
  median: Candle[],
  xForIndex: (i: number) => number,
  yForPrice: (p: number) => number,
  candlePxWidth: number = 8
) {
  ctx.save();
  ctx.lineWidth = 1.2;
  for (let i = 0; i < median.length; i++) {
    const c = median[i];
    const x = xForIndex(c.timeIndex);
    const openY = yForPrice(c.open);
    const closeY = yForPrice(c.close);
    const highY = yForPrice(c.high);
    const lowY = yForPrice(c.low);
    const isUp = c.close >= c.open;
    ctx.fillStyle = isUp ? '#06b6d4' : '#ef4444';
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    const top = Math.min(openY, closeY);
    const height = Math.max(1, Math.abs(closeY - openY));
    ctx.fillRect(x - candlePxWidth / 2, top, candlePxWidth, height);
    ctx.strokeRect(x - candlePxWidth / 2, top, candlePxWidth, height);
  }
  ctx.restore();
}

export function drawEnsembleOnCanvas(
  ensemble: { trials: Candle[][]; median: Candle[] },
  canvas: HTMLCanvasElement | null,
  xForIndex: (i: number) => number,
  yForPrice: (p: number) => number,
  options?: { trialAlpha?: number; trialCandleWidth?: number; medianCandleWidth?: number }
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, width, height);
  drawTrialCandles(ctx, ensemble.trials, xForIndex, yForPrice, options?.trialCandleWidth ?? 4, options?.trialAlpha ?? 0.03);
  drawMedianCandles(ctx, ensemble.median, xForIndex, yForPrice, options?.medianCandleWidth ?? 8);
}
