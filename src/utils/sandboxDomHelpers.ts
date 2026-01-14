// src/utils/sandboxDomHelpers.ts
// Shared DOM helper utilities for sandbox modules.

export function findChartContainer(): HTMLElement | null {
  return (
    document.querySelector('.chart-container') ||
    document.querySelector('#chart') ||
    document.querySelector('[data-role="chart"]') ||
    document.querySelector('.crypto-chart') ||
    document.querySelector('main')
  ) as HTMLElement | null;
}

export function findOverlayCanvas(container: HTMLElement | null): HTMLCanvasElement | null {
  if (!container) return null;
  const byClass = container.querySelector('canvas.overlay');
  if (byClass) return byClass as HTMLCanvasElement;
  const firstCanvas = container.querySelector('canvas');
  return firstCanvas as HTMLCanvasElement | null;
}
