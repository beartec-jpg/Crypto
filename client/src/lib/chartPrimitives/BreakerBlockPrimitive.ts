import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType,
} from 'lightweight-charts';
import type { BreakerBlock, BreakerBlockSettings } from '@/types/breakerBlock';

type RequestUpdateCallback = () => void;

function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Draw diagonal stripe pattern within a rectangular clipping region. */
function drawStripes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  spacing: number,
  lineWidth: number,
): void {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);

  // Draw diagonal lines (top-left to bottom-right) across the bounding box
  const diagonal = w + h;
  for (let offset = -h; offset < w; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + diagonal, y + diagonal);
    ctx.stroke();
  }

  ctx.restore();
}

class BBRenderer implements IPrimitivePaneRenderer {
  private _bbs: BreakerBlock[];
  private _settings: BreakerBlockSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    bbs: BreakerBlock[],
    settings: BreakerBlockSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._bbs = bbs;
    this._settings = settings;
    this._series = series;
    this._chart = chart;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;
      const timeScale = this._chart!.timeScale();

      for (const bb of this._bbs) {
        if (bb.type === 'bullish' && !this._settings.showBullish) continue;
        if (bb.type === 'bearish' && !this._settings.showBearish) continue;
        if (bb.mitigated && !this._settings.showMitigated) continue;

        const baseColor = bb.mitigated
          ? this._settings.mitigatedColor
          : bb.type === 'bullish'
            ? this._settings.bullishColor
            : this._settings.bearishColor;

        const ageFactor = Math.max(0.2, 1 - bb.age / this._settings.maxAge);

        // Price coordinates
        const yTop = this._series!.priceToCoordinate(bb.top);
        const yBottom = this._series!.priceToCoordinate(bb.bottom);
        if (yTop === null || yBottom === null) continue;

        // Time coordinate from the break candle
        const xStart = timeScale.timeToCoordinate(bb.breakTime as Time);
        if (xStart === null) continue;

        const xEnd = this._settings.extendRight && !bb.mitigated
          ? chartWidth
          : xStart + 60;

        const rectX = Math.min(xStart, xEnd);
        const rectW = Math.abs(xEnd - xStart);
        const rectY = Math.min(yTop, yBottom);
        const rectH = Math.abs(yBottom - yTop);

        if (rectW <= 0 || rectH <= 0) continue;

        const fillAlpha = this._settings.zoneOpacity * ageFactor;

        // Background fill (semi-transparent)
        ctx.fillStyle = hexToRgba(baseColor, fillAlpha);
        ctx.fillRect(rectX, rectY, rectW, rectH);

        // Diagonal stripe overlay (distinguishes from regular OBs)
        drawStripes(
          ctx,
          rectX,
          rectY,
          rectW,
          rectH,
          hexToRgba(baseColor, Math.min(1, fillAlpha * 2.5)),
          this._settings.stripeSpacing,
          this._settings.stripeWidth,
        );

        // Border
        ctx.strokeStyle = hexToRgba(baseColor, Math.min(1, fillAlpha * 4));
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.setLineDash([]);

        // Label: "BB ↑" or "BB ↓"
        if (this._settings.showLabels) {
          const label = bb.type === 'bullish' ? 'BB ↑' : 'BB ↓';
          ctx.font = 'bold 10px sans-serif';
          const textMetrics = ctx.measureText(label);
          const textWidth = textMetrics.width;
          const textHeight = 12;
          const padding = 4;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(
            rectX + 2,
            rectY + 2,
            textWidth + padding * 2,
            textHeight + padding,
          );

          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.fillText(label, rectX + 2 + padding, rectY + 2 + textHeight);
        }
      }
    });
  }
}

class BBPaneView implements IPrimitivePaneView {
  private _primitive: BreakerBlockPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: BreakerBlockPrimitive) {
    this._primitive = primitive;
  }

  update(series: ISeriesApi<SeriesType> | null, chart: IChartApi | null) {
    this._series = series;
    this._chart = chart;
  }

  zOrder(): 'normal' {
    return 'normal';
  }

  renderer() {
    return new BBRenderer(
      this._primitive.getBreakerBlocks(),
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class BreakerBlockPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: BBPaneView[];
  private _bbs: BreakerBlock[];
  private _settings: BreakerBlockSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(bbs: BreakerBlock[], settings: BreakerBlockSettings) {
    this._bbs = bbs;
    this._settings = settings;
    this._paneViews = [new BBPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._series = param.series;
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._series = null;
    this._chart = null;
    this._requestUpdate = undefined;
  }

  updateAllViews() {
    this._paneViews.forEach(pv => pv.update(this._series, this._chart));
  }

  paneViews() {
    return this._paneViews;
  }

  getBreakerBlocks(): BreakerBlock[] {
    return this._bbs;
  }

  getSettings(): BreakerBlockSettings {
    return this._settings;
  }

  update(bbs: BreakerBlock[], settings: BreakerBlockSettings) {
    this._bbs = bbs;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
