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
import type { FVGDetection, FVGSettings } from '@/types/fvg';

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

class FVGRenderer implements IPrimitivePaneRenderer {
  private _fvgs: FVGDetection[];
  private _settings: FVGSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    fvgs: FVGDetection[],
    settings: FVGSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null
  ) {
    this._fvgs = fvgs;
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

      for (const fvg of this._fvgs) {
        // Visibility filter
        if (fvg.type === 'bullish' && !this._settings.showBullish) continue;
        if (fvg.type === 'bearish' && !this._settings.showBearish) continue;
        if (fvg.mitigated && !this._settings.showMitigated) continue;

        // Determine color
        let baseColor: string;
        if (fvg.isInverse) {
          baseColor = this._settings.ifvgColor;
        } else if (fvg.mitigated) {
          baseColor = this._settings.mitigatedColor;
        } else {
          baseColor = fvg.type === 'bullish'
            ? this._settings.bullishColor
            : this._settings.bearishColor;
        }

        // Fade older FVGs
        const ageFactor = Math.max(0.2, 1 - fvg.age / this._settings.maxAge);
        const fillAlpha = fvg.mitigated ? 0.1 * ageFactor : 0.2 * ageFactor;
        const borderAlpha = fvg.mitigated ? 0.3 * ageFactor : 0.6 * ageFactor;

        // Calculate coordinates
        const yTop = this._series!.priceToCoordinate(fvg.top);
        const yBottom = this._series!.priceToCoordinate(fvg.bottom);
        if (yTop === null || yBottom === null) continue;

        const xStart = timeScale.timeToCoordinate(fvg.startTime as Time);
        if (xStart === null) continue;

        const xEnd = this._settings.extendRight && !fvg.mitigated
          ? chartWidth
          : timeScale.timeToCoordinate(fvg.endTime as Time) ?? chartWidth;

        const rectX = Math.min(xStart, xEnd);
        const rectW = Math.abs(xEnd - xStart);
        const rectY = Math.min(yTop, yBottom);
        const rectH = Math.abs(yBottom - yTop);

        if (rectW <= 0 || rectH <= 0) continue;

        // Fill rectangle
        ctx.fillStyle = hexToRgba(baseColor, fillAlpha);
        ctx.fillRect(rectX, rectY, rectW, rectH);

        // Border
        ctx.strokeStyle = hexToRgba(baseColor, borderAlpha);
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(rectX, rectY, rectW, rectH);

        // Partial fill indicator
        // Bullish: price dips from above → fill the top portion (lower y = higher price)
        // Bearish: price rises from below → fill the bottom portion (higher y = lower price)
        if (fvg.mitigationPercent > 0 && fvg.mitigationPercent < 100) {
          const fillH = rectH * (fvg.mitigationPercent / 100);
          const fillY = fvg.type === 'bullish' ? rectY : rectY + rectH - fillH;
          ctx.fillStyle = hexToRgba(this._settings.mitigatedColor, 0.25);
          ctx.fillRect(rectX, fillY, rectW, fillH);
        }

        // CE line
        if (this._settings.showCELine) {
          const yCE = this._series!.priceToCoordinate(fvg.ce);
          if (yCE !== null) {
            ctx.strokeStyle = hexToRgba(this._settings.ceLineColor, borderAlpha);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(rectX, yCE);
            ctx.lineTo(rectX + rectW, yCE);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Label
        if (this._settings.showLabels) {
          const label = fvg.isInverse
            ? `IFVG ${fvg.type === 'bullish' ? '↑' : '↓'}`
            : `FVG ${fvg.type === 'bullish' ? '↑' : '↓'}`;
          ctx.fillStyle = hexToRgba(baseColor, Math.min(1, borderAlpha * 1.5));
          ctx.font = '10px sans-serif';
          ctx.fillText(label, rectX + 4, rectY + 12);
        }
      }
    });
  }
}

class FVGPaneView implements IPrimitivePaneView {
  private _primitive: FVGPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: FVGPrimitive) {
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
    return new FVGRenderer(
      this._primitive.getFVGs(),
      this._primitive.getSettings(),
      this._series,
      this._chart
    );
  }
}

export class FVGPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: FVGPaneView[];
  private _fvgs: FVGDetection[];
  private _settings: FVGSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(fvgs: FVGDetection[], settings: FVGSettings) {
    this._fvgs = fvgs;
    this._settings = settings;
    this._paneViews = [new FVGPaneView(this)];
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

  getFVGs(): FVGDetection[] {
    return this._fvgs;
  }

  getSettings(): FVGSettings {
    return this._settings;
  }

  update(fvgs: FVGDetection[], settings: FVGSettings) {
    this._fvgs = fvgs;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
