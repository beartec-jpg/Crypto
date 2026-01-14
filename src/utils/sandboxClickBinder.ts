// src/utils/sandboxClickBinder.ts
// Lightweight sandbox click binder — auto-inits when imported. Does NOT modify Sandbox page directly.
// It finds the chart container and overlay canvas, attaches a click handler that decides whether
// to draw a simple trendline (when clicking an existing candle) or to request an ensemble prediction
// (when clicking a future/FIB endpoint). The binder emits CustomEvents:
//  - 'sandboxTrendlineRequested'  -> detail: { mode: 'trendline', to: { time, price } }
//  - 'sandboxEnsembleReady'       -> detail: { ensemble, patternVariant, startPrice }

import { generateWaveEnsemble } from './generateWaveEnsemble';
import { findChartContainer, findOverlayCanvas } from './sandboxDomHelpers';

type EnsembleEventDetail = {
  ensemble: any;
  patternVariant: 'flat' | 'zigzag';
  startPrice: number;
};

export async function initSandboxClickBinderAuto() {
  const container = findChartContainer();
  if (!container) return;
  const canvas = findOverlayCanvas(container);

  const flag = '__sandboxClickBinderInstalled__';
  if ((container as any)[flag]) return;
  (container as any)[flag] = true;

  const handler = async (ev: MouseEvent) => {
    try {
      const rect = container.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;

      const getTimeForX = (window as any).__SANDBOX_getTimeForX as ((x:number)=>number) | undefined;
      const getPriceForY = (window as any).__SANDBOX_getPriceForY as ((y:number)=>number) | undefined;

      const clickedTime = getTimeForX ? getTimeForX(cx) : Date.now();
      const clickedPrice = getPriceForY ? getPriceForY(cy) : (window as any).__SANDBOX_LAST_CLOSE__ ?? 0;

      const candle = (function findNearestCandleFromGlobal(time: number, price: number, radiusPx = 30) {
        const arr = (window as any).__SANDBOX_CANDLES__ as Array<any> | undefined;
        if (!arr || !arr.length) return null;
        let best = null as any;
        let bestScore = Infinity;
        for (const c of arr) {
          const ct = c.time ?? c.t ?? 0;
          const cp = c.close ?? c.c ?? c.price ?? (c.high + c.low) / 2;
          const dt = Math.abs(ct - time);
          const dp = Math.abs(cp - price);
          const score = dt + dp * 1000;
          if (score < bestScore) {
            bestScore = score;
            best = { time: ct, price: cp, raw: c, score };
          }
        }
        if (bestScore < 1e12) return best;
        return null;
      })(clickedTime, clickedPrice, 30);

      if (candle) {
        const evDetail = { mode: 'trendline', to: { time: candle.time, price: candle.price } };
        container.dispatchEvent(new CustomEvent('sandboxTrendlineRequested', { detail: evDetail }));
        return;
      }

      const lastAnchor = (window as any).__SANDBOX_LAST_ANCHOR__ as { price?: number } | undefined;
      const startPrice = lastAnchor?.price ?? (window as any).__SANDBOX_LAST_CLOSE__ ?? clickedPrice ?? 1;

      let patternVariant: 'flat' | 'zigzag' = 'zigzag';
      if (startPrice && Math.abs(clickedPrice - startPrice) / Math.max(1, Math.abs(startPrice)) > 0.9 && Math.abs(clickedPrice - startPrice) / Math.max(1, Math.abs(startPrice)) < 1.1) {
        patternVariant = 'flat';
      }

      const totalBars = 200;
      const ensemble = await generateWaveEnsemble({
        template: 'abc',
        patternVariant,
        startPrice: startPrice || clickedPrice || 1,
        totalBars,
        samples: 120,
        microTicksPerBar: 80,
        seed: (Date.now() % 2**31),
      });

      const detail: EnsembleEventDetail = { ensemble, patternVariant, startPrice };
      container.dispatchEvent(new CustomEvent('sandboxEnsembleReady', { detail }));
    } catch (err) {
      console.error('[sandboxClickBinder] handler error', err);
    }
  };

  container.addEventListener('click', handler, { capture: true });

  return () => container.removeEventListener('click', handler, { capture: true });
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    initSandboxClickBinderAuto().catch((e) => console.warn('sandboxClickBinder init failed', e));
  }, 600);
}
