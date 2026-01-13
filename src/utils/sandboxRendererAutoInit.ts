// src/utils/sandboxRendererAutoInit.ts
// Auto-inits a listener for 'sandboxEnsembleReady' events and draws them using mapping helpers exposed on window or best-effort fallbacks.

import { drawEnsembleOnCanvas } from './sandboxRenderer';

function findChartContainer() {
  return (
    document.querySelector('.chart-container') ||
    document.querySelector('#chart') ||
    document.querySelector('[data-role="chart"]') ||
    document.querySelector('.crypto-chart') ||
    document.querySelector('main')
  ) as HTMLElement | null;
}

function findOverlayCanvas(container: HTMLElement | null) {
  if (!container) return null;
  const byClass = container.querySelector('canvas.overlay');
  if (byClass) return byClass as HTMLCanvasElement;
  const firstCanvas = container.querySelector('canvas');
  return firstCanvas as HTMLCanvasElement | null;
}

export function initSandboxRendererAuto() {
  const container = findChartContainer();
  if (!container) return;
  const canvas = findOverlayCanvas(container);

  const handler = (e: Event) => {
    try {
      const detail = (e as CustomEvent).detail;
      const ensemble = detail?.ensemble;
      if (!ensemble) return;
      // mapping helpers expected on window: __SANDBOX_getXForIndex, __SANDBOX_getYForPrice
      const xForIndex = (i: number) => {
        const fn = (window as any).__SANDBOX_getXForIndex as ((i:number)=>number) | undefined;
        if (fn) return fn(i);
        // fallback: approximate spacing
        return (i + 1) * 8;
      };
      const yForPrice = (p: number) => {
        const fn = (window as any).__SANDBOX_getYForPrice as ((p:number)=>number) | undefined;
        if (fn) return fn(p);
        return p;
      };
      drawEnsembleOnCanvas(ensemble, canvas, xForIndex, yForPrice);
    } catch (err) {
      console.error('[sandboxRendererAutoInit] draw error', err);
    }
  };

  container.addEventListener('sandboxEnsembleReady', handler as EventListener);
  return () => container.removeEventListener('sandboxEnsembleReady', handler as EventListener);
}

// auto-init
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try { initSandboxRendererAuto(); } catch (e) { console.warn('sandboxRendererAutoInit failed', e); }
  }, 800);
}
