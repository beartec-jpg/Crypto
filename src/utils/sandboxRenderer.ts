// src/utils/sandboxRenderer.ts
// Canvas helpers to draw simulated candles with optional trial/envelope rendering.

import type { Candle } from './generateWaveEnsemble';

export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
}

/**
 * Draw a single candle primitive with proper OHLC geometry.
 * @param ctx - Canvas rendering context
 * @param x - X position (pixel, rounded)
 * @param open - Open price (already scaled to Y)
 * @param high - High price (already scaled to Y)
 * @param low - Low price (already scaled to Y)
 * @param close - Close price (already scaled to Y)
 * @param candleWidth - Width of candle body in pixels
 * @param color - Fill/stroke color
 * @param opacity - Opacity (0-1)
 */
export function drawCandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  open: number,
  high: number,
  low: number,
  close: number,
  candleWidth: number,
  color: string,
  opacity: number = 1
) {
  // Round pixel positions for crisp rendering
  const xRounded = Math.round(x);
  const openRounded = Math.round(open);
  const closeRounded = Math.round(close);
  const highRounded = Math.round(high);
  const lowRounded = Math.round(low);
  
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  
  // Draw wick (high-low line)
  ctx.beginPath();
  ctx.moveTo(xRounded, highRounded);
  ctx.lineTo(xRounded, lowRounded);
  ctx.stroke();
  
  // Draw body (open-close rect)
  const top = Math.min(openRounded, closeRounded);
  const bodyHeight = Math.max(1, Math.abs(closeRounded - openRounded));
  ctx.fillRect(xRounded - candleWidth / 2, top, candleWidth, bodyHeight);
  ctx.strokeRect(xRounded - candleWidth / 2, top, candleWidth, bodyHeight);
  
  ctx.restore();
}

/**
 * Draw simulated candles (single series, replaces median rendering).
 * Uses consistent geometry with real candles - same as drawCandle primitive.
 */
export function drawSimulatedCandles(
  ctx: CanvasRenderingContext2D,
  candles: Candle[],
  xForIndex: (i: number) => number,
  yForPrice: (p: number) => number,
  candlePxWidth: number = 8
) {
  ctx.save();
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const x = xForIndex(c.timeIndex);
    const openY = yForPrice(c.open);
    const closeY = yForPrice(c.close);
    const highY = yForPrice(c.high);
    const lowY = yForPrice(c.low);
    const isUp = c.close >= c.open;
    const color = isUp ? '#06b6d4' : '#ef4444';
    
    drawCandle(ctx, x, openY, highY, lowY, closeY, candlePxWidth, color, 1);
  }
  ctx.restore();
}

/**
 * Draw trial candles (optional debug feature, disabled by default).
 * Renders ensemble trials as translucent overlay.
 */
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
      const x = Math.round(xForIndex(c.timeIndex));
      const openY = Math.round(yForPrice(c.open));
      const closeY = Math.round(yForPrice(c.close));
      const highY = Math.round(yForPrice(c.high));
      const lowY = Math.round(yForPrice(c.low));
      
      // Draw wick
      ctx.strokeStyle = 'rgba(6,182,212,0.08)';
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // Draw body
      const top = Math.min(openY, closeY);
      const height = Math.max(1, Math.abs(closeY - openY));
      ctx.fillStyle = 'rgba(6,182,212,0.03)';
      ctx.fillRect(x - candlePxWidth / 2, top, candlePxWidth, height);
    }
  }
  ctx.restore();
}

/**
 * Legacy compatibility: drawMedianCandles now calls drawSimulatedCandles.
 * This function is maintained for backward compatibility with existing code
 * that may reference the "median" terminology from the old trial-based system.
 * New code should use drawSimulatedCandles directly.
 * 
 * @deprecated Use drawSimulatedCandles instead
 */
export function drawMedianCandles(
  ctx: CanvasRenderingContext2D,
  median: Candle[],
  xForIndex: (i: number) => number,
  yForPrice: (p: number) => number,
  candlePxWidth: number = 8
) {
  drawSimulatedCandles(ctx, median, xForIndex, yForPrice, candlePxWidth);
}

/**
 * Draw ensemble on canvas.
 * By default, draws only the single simulated series (median).
 * Optionally draws trials and envelope for debugging.
 */
export function drawEnsembleOnCanvas(
  ensemble: { trials: Candle[][]; median: Candle[] },
  canvas: HTMLCanvasElement | null,
  xForIndex: (i: number) => number,
  yForPrice: (p: number) => number,
  options?: { 
    trialAlpha?: number; 
    trialCandleWidth?: number; 
    medianCandleWidth?: number;
    showTrials?: boolean;  // Debug option, default false
    showEnvelope?: boolean; // Debug option, default false
  }
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  
  // Guard against zero or negative canvas dimensions to avoid unexpected drawing behavior.
  if (width <= 0 || height <= 0) return;
  
  clearCanvas(ctx, width, height);
  
  // Optional: draw trials (disabled by default)
  if (options?.showTrials && ensemble.trials.length > 0) {
    drawTrialCandles(ctx, ensemble.trials, xForIndex, yForPrice, options?.trialCandleWidth ?? 4, options?.trialAlpha ?? 0.03);
  }
  
  // Always draw the main simulated series (median)
  drawSimulatedCandles(ctx, ensemble.median, xForIndex, yForPrice, options?.medianCandleWidth ?? 8);
  
  // Optional: draw envelope (quantile bands) - could be implemented here for debug
  // if (options?.showEnvelope) { ... }
}
