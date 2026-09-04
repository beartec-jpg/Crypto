import { useEffect, useRef } from 'react';
import type { IChartApi, MouseEventParams } from 'lightweight-charts';

/** Matches lightweight-charts default vertLine: `#758696` + LargeDashed. */
const CROSSHAIR_COLOR = '#758696';

interface OscillatorVerticalCrosshairProps {
  mainChart: IChartApi | null | undefined;
}

/**
 * Continues the main chart's grey dashed vertical crosshair through the
 * docked oscillator stack. Uses screen X (not time-scale mapping) so the
 * line is a visual extension of the main pane, including rightOffset gap.
 */
export function OscillatorVerticalCrosshair({ mainChart }: OscillatorVerticalCrosshairProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainChart) return;
    const line = lineRef.current;
    const dock = dockRef.current;
    if (!line || !dock) return;

    const hide = () => {
      line.style.display = 'none';
    };

    const handleMove = (param: MouseEventParams) => {
      if (!param.point) {
        hide();
        return;
      }
      const chartEl = mainChart.chartElement();
      if (!chartEl) {
        hide();
        return;
      }
      const chartRect = chartEl.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const x = chartRect.left + param.point.x - dockRect.left;
      if (x < 0 || x > dockRect.width) {
        hide();
        return;
      }
      line.style.display = 'block';
      line.style.left = `${x}px`;
    };

    mainChart.subscribeCrosshairMove(handleMove);
    return () => {
      try {
        mainChart.unsubscribeCrosshairMove(handleMove);
      } catch {
        /* disposed */
      }
    };
  }, [mainChart]);

  return (
    <div ref={dockRef} className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <div
        ref={lineRef}
        aria-hidden
        className="absolute top-0 bottom-0"
        style={{
          display: 'none',
          width: '1px',
          marginLeft: '-0.5px',
          backgroundImage: `repeating-linear-gradient(to bottom, ${CROSSHAIR_COLOR} 0 6px, transparent 6px 12px)`,
        }}
      />
    </div>
  );
}
