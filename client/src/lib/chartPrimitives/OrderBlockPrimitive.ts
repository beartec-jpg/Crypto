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
import type { OrderBlock, OrderBlockSettings } from '@/types/orderBlock';

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

class OBRenderer implements IPrimitivePaneRenderer {
  private _obs: OrderBlock[];
  private _settings: OrderBlockSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    obs: OrderBlock[],
    settings: OrderBlockSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._obs = obs;
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

      for (const ob of this._obs) {
        // Visibility filters
        if (ob.type === 'bullish' && !this._settings.showBullish) continue;
        if (ob.type === 'bearish' && !this._settings.showBearish) continue;
        if (ob.mitigated && !this._settings.showMitigated) continue;

        // Determine base color
        let baseColor: string;
        if (ob.mitigated) {
          baseColor = this._settings.mitigatedColor;
        } else {
          baseColor = ob.type === 'bullish'
            ? this._settings.bullishColor
            : this._settings.bearishColor;
        }

        const ageFactor = Math.max(0.2, 1 - ob.age / this._settings.maxAge);

        // Price coordinates
        const yTop = this._series!.priceToCoordinate(ob.top);
        const yBottom = this._series!.priceToCoordinate(ob.bottom);
        if (yTop === null || yBottom === null) continue;

        // Time coordinates
        const xStart = timeScale.timeToCoordinate(ob.time as Time);
        if (xStart === null) continue;

        const xEnd = this._settings.extendRight && !ob.mitigated
          ? chartWidth
          : xStart + 60; // fallback width if not extending

        const rectX = Math.min(xStart, xEnd);
        const rectW = Math.abs(xEnd - xStart);
        const rectY = Math.min(yTop, yBottom);
        const rectH = Math.abs(yBottom - yTop);

        if (rectW <= 0 || rectH <= 0) continue;

        // Swept OBs: keep only a horizontal level marker and skip zone rendering.
        if (ob.swept) {
          const sweepLevel = ob.sweepPrice ?? (ob.type === 'bullish' ? ob.bottom : ob.top);
          const ySweep = this._series!.priceToCoordinate(sweepLevel);
          if (ySweep !== null) {
            ctx.strokeStyle = hexToRgba(baseColor, Math.min(1, 0.95 * ageFactor));
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(rectX, ySweep);
            ctx.lineTo(rectX + rectW, ySweep);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          continue;
        }

        // Hide mitigated portion by shrinking the rendered OB zone to only the remaining area.
        const mitigation = Math.max(0, Math.min(100, ob.mitigationPercent || 0));
        const mitigatedH = rectH * (mitigation / 100);
        let visibleY = rectY;
        let visibleH = rectH;

        if (mitigation > 0) {
          if (ob.type === 'bullish') {
            // Bullish OBs mitigate from top down.
            visibleY = rectY + mitigatedH;
            visibleH = rectH - mitigatedH;
          } else {
            // Bearish OBs mitigate from bottom up.
            visibleY = rectY;
            visibleH = rectH - mitigatedH;
          }
        }

        if (visibleH <= 0) continue;

        // Main OB zone fill
        const fillAlpha = this._settings.zoneOpacity * ageFactor;
        ctx.fillStyle = hexToRgba(baseColor, fillAlpha);
        ctx.fillRect(rectX, visibleY, rectW, visibleH);

        // Main OB border
        ctx.strokeStyle = hexToRgba(baseColor, Math.min(1, fillAlpha * 3));
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(rectX, visibleY, rectW, visibleH);

        // Extreme OB overlay (wick area)
        if (this._settings.showExtremeOB && !ob.mitigated) {
          const extremeColor = ob.type === 'bullish'
            ? this._settings.bullishExtremeColor
            : this._settings.bearishExtremeColor;

          const yExTop = this._series!.priceToCoordinate(ob.extremeTop);
          const yExBottom = this._series!.priceToCoordinate(ob.extremeBottom);

          if (yExTop !== null && yExBottom !== null) {
            const exRectY = Math.min(yExTop, yExBottom);
            const exRectH = Math.abs(yExBottom - yExTop);

            if (exRectH > 0) {
              ctx.fillStyle = hexToRgba(extremeColor, this._settings.extremeOpacity * ageFactor);
              const exTop = exRectY;
              const exBottom = exRectY + exRectH;
              const visTop = visibleY;
              const visBottom = visibleY + visibleH;
              const clippedTop = Math.max(exTop, visTop);
              const clippedBottom = Math.min(exBottom, visBottom);
              const clippedH = clippedBottom - clippedTop;
              if (clippedH > 0) {
                ctx.fillRect(rectX, clippedTop, rectW, clippedH);
              }
            }
          }
        }

        // FVG confluence highlight
        if (ob.hasFVGConfluence && this._settings.highlightFVGConfluence && !ob.mitigated) {
          ctx.fillStyle = hexToRgba(this._settings.confluenceColor, 0.25 * ageFactor);
          ctx.fillRect(rectX, visibleY, rectW, visibleH);

          ctx.strokeStyle = hexToRgba(this._settings.confluenceColor, 0.7 * ageFactor);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(rectX, visibleY, rectW, visibleH);
          ctx.setLineDash([]);
        }

        // Label with background
        if (this._settings.showLabels) {
          const label = ob.type === 'bullish' ? 'Bull OB' : 'Bear OB';

          ctx.font = '10px sans-serif';
          const textMetrics = ctx.measureText(label);
          const textWidth = textMetrics.width;
          const textHeight = 12;
          const padding = 4;

          // Dark background box
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(
            rectX + 2,
            visibleY + 2,
            textWidth + padding * 2,
            textHeight + padding
          );

          // White text
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.fillText(label, rectX + 2 + padding, visibleY + 2 + textHeight);
        }

      }
    });
  }
}

class OBPaneView implements IPrimitivePaneView {
  private _primitive: OrderBlockPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: OrderBlockPrimitive) {
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
    return new OBRenderer(
      this._primitive.getOrderBlocks(),
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class OrderBlockPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: OBPaneView[];
  private _obs: OrderBlock[];
  private _settings: OrderBlockSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(obs: OrderBlock[], settings: OrderBlockSettings) {
    this._obs = obs;
    this._settings = settings;
    this._paneViews = [new OBPaneView(this)];
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

  getOrderBlocks(): OrderBlock[] {
    return this._obs;
  }

  getSettings(): OrderBlockSettings {
    return this._settings;
  }

  update(obs: OrderBlock[], settings: OrderBlockSettings) {
    this._obs = obs;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
