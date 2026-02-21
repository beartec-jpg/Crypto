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
import type { LiquidityZone, LiquiditySettings } from '@/types/liquidity';

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

class LiquidityRenderer implements IPrimitivePaneRenderer {
  private _zones: LiquidityZone[];
  private _settings: LiquiditySettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    zones: LiquidityZone[],
    settings: LiquiditySettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._zones = zones;
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

      for (const zone of this._zones) {
        let color: string;
        if (zone.invalidated) {
          color = this._settings.invalidatedColor;
        } else if (zone.swept) {
          color = this._settings.sweptColor;
        } else {
          color = this._settings.lineColor;
        }

        const yLevel = this._series!.priceToCoordinate(zone.price);
        if (yLevel === null) continue;

        // Draw the line from the first touch to the right edge (or resolved point)
        const firstTouchTime = zone.touchTimes[0];
        const xStart = timeScale.timeToCoordinate(firstTouchTime as Time);
        if (xStart === null) continue;

        let xEnd = chartWidth;
        if (zone.invalidated && zone.invalidationTime) {
          const xInvalidation = timeScale.timeToCoordinate(zone.invalidationTime as Time);
          if (xInvalidation !== null) xEnd = xInvalidation;
        } else if (zone.swept && zone.sweepTime) {
          const xSweep = timeScale.timeToCoordinate(zone.sweepTime as Time);
          if (xSweep !== null) xEnd = xSweep;
        }

        const opacity = zone.invalidated ? 0.6 : 0.85;
        ctx.strokeStyle = hexToRgba(color, opacity);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(xStart, yLevel);
        ctx.lineTo(xEnd, yLevel);
        ctx.stroke();

        // Touch count dots
        for (const touchTime of zone.touchTimes) {
          const xTouch = timeScale.timeToCoordinate(touchTime as Time);
          if (xTouch === null) continue;
          ctx.fillStyle = hexToRgba(color, 0.8);
          ctx.beginPath();
          ctx.arc(xTouch, yLevel, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Sweep marker ⚡ when swept (but not invalidated)
        if (zone.swept && !zone.invalidated && zone.sweepTime) {
          const xSweep = timeScale.timeToCoordinate(zone.sweepTime as Time);
          if (xSweep !== null) {
            ctx.fillStyle = this._settings.sweepMarkerColor;
            ctx.font = '13px sans-serif';
            const labelY = zone.type === 'high' ? yLevel - 6 : yLevel + 14;
            ctx.fillText('⚡', xSweep - 6, labelY);
          }
        }

        // Zone type label on the left
        ctx.fillStyle = hexToRgba(color, 0.7);
        ctx.font = 'bold 9px sans-serif';
        const label = zone.type === 'high' ? 'EQH' : 'EQL';
        ctx.fillText(label, xStart + 4, yLevel - 3);
      }
    });
  }
}

class LiquidityPaneView implements IPrimitivePaneView {
  private _primitive: LiquidityPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: LiquidityPrimitive) {
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
    return new LiquidityRenderer(
      this._primitive.getZones(),
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class LiquidityPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: LiquidityPaneView[];
  private _zones: LiquidityZone[];
  private _settings: LiquiditySettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(zones: LiquidityZone[], settings: LiquiditySettings) {
    this._zones = zones;
    this._settings = settings;
    this._paneViews = [new LiquidityPaneView(this)];
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

  getZones(): LiquidityZone[] {
    return this._zones;
  }

  getSettings(): LiquiditySettings {
    return this._settings;
  }

  update(zones: LiquidityZone[], settings: LiquiditySettings) {
    this._zones = zones;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
