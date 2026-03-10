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
import type { Breaker, BreakerSettings } from '@/types/breaker';

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

class BreakerRenderer implements IPrimitivePaneRenderer {
  private _breakers: Breaker[];
  private _settings: BreakerSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    breakers: Breaker[],
    settings: BreakerSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._breakers = breakers;
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

      for (const breaker of this._breakers) {
        // Visibility filters
        if (breaker.type === 'bullish' && !this._settings.showBullish) continue;
        if (breaker.type === 'bearish' && !this._settings.showBearish) continue;
        if (breaker.mitigated && !this._settings.showMitigated) continue;

        // Determine base color
        let baseColor: string;
        if (breaker.mitigated) {
          baseColor = this._settings.mitigatedColor;
        } else {
          baseColor = breaker.type === 'bullish'
            ? this._settings.bullishColor
            : this._settings.bearishColor;
        }

        const ageFactor = Math.max(0.2, 1 - breaker.age / this._settings.maxAge);

        // Price coordinates
        const yTop = this._series!.priceToCoordinate(breaker.top);
        const yBottom = this._series!.priceToCoordinate(breaker.bottom);
        if (yTop === null || yBottom === null) continue;

        // Time coordinates - use conversionTime as the left edge
        const xStart = timeScale.timeToCoordinate(breaker.conversionTime as Time);
        if (xStart === null) continue;

        const xEnd = this._settings.extendRight && !breaker.mitigated
          ? chartWidth
          : xStart + 60;

        const rectX = Math.min(xStart, xEnd);
        const rectW = Math.abs(xEnd - xStart);
        const rectY = Math.min(yTop, yBottom);
        const rectH = Math.abs(yBottom - yTop);

        if (rectW <= 0 || rectH <= 0) continue;

        const fillAlpha = this._settings.zoneOpacity * ageFactor;

        // Draw diagonal hatching pattern for breaker blocks
        ctx.save();
        ctx.beginPath();
        ctx.rect(rectX, rectY, rectW, rectH);
        ctx.clip();

        ctx.strokeStyle = hexToRgba(baseColor, fillAlpha * 2);
        ctx.lineWidth = 1.5;
        const step = 8;
        for (let d = -rectH; d < rectW + rectH; d += step) {
          ctx.beginPath();
          ctx.moveTo(rectX + d, rectY);
          ctx.lineTo(rectX + d + rectH, rectY + rectH);
          ctx.stroke();
        }

        ctx.restore();

        // Border
        ctx.strokeStyle = hexToRgba(baseColor, Math.min(1, fillAlpha * 4));
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.setLineDash([]);
      }
    });
  }
}

class BreakerPaneView implements IPrimitivePaneView {
  private _primitive: BreakerPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: BreakerPrimitive) {
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
    return new BreakerRenderer(
      this._primitive.getBreakers(),
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class BreakerPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: BreakerPaneView[];
  private _breakers: Breaker[];
  private _settings: BreakerSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(breakers: Breaker[], settings: BreakerSettings) {
    this._breakers = breakers;
    this._settings = settings;
    this._paneViews = [new BreakerPaneView(this)];
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

  getBreakers(): Breaker[] {
    return this._breakers;
  }

  getSettings(): BreakerSettings {
    return this._settings;
  }

  update(breakers: Breaker[], settings: BreakerSettings) {
    this._breakers = breakers;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
