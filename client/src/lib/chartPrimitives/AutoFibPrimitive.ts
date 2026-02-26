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
import type { AutoFibZone, AutoFibSettings } from '@/types/autoFib';

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

class AutoFibRenderer implements IPrimitivePaneRenderer {
  private _zones: AutoFibZone[];
  private _settings: AutoFibSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    zones: AutoFibZone[],
    settings: AutoFibSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null
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
        for (const level of zone.levels) {
          const y = this._series!.priceToCoordinate(level.price);
          if (y === null) continue;

          // Use the earlier of swingHigh/swingLow as the left anchor
          const anchorTime = Math.min(zone.swingHigh.time, zone.swingLow.time) as Time;
          const xStart = timeScale.timeToCoordinate(anchorTime);
          if (xStart === null) continue;

          const xEnd = this._settings.extendRight ? chartWidth : xStart + 200;

          const color = level.isGolden
            ? this._settings.goldenColor
            : this._settings.lineColor;

          // Draw line
          ctx.strokeStyle = hexToRgba(color, 0.8);
          ctx.lineWidth = this._settings.lineWidth;
          ctx.setLineDash(level.isExtension ? [4, 4] : []);
          ctx.beginPath();
          ctx.moveTo(xStart, y);
          ctx.lineTo(xEnd, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw label
          if (this._settings.showLabels) {
            ctx.fillStyle = hexToRgba(color, 0.9);
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(level.label, xStart + 4, y - 3);
          }
        }
      }
    });
  }
}

class AutoFibPaneView implements IPrimitivePaneView {
  private _primitive: AutoFibPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: AutoFibPrimitive) {
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
    return new AutoFibRenderer(
      this._primitive.getZones(),
      this._primitive.getSettings(),
      this._series,
      this._chart
    );
  }
}

export class AutoFibPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: AutoFibPaneView[];
  private _zones: AutoFibZone[];
  private _settings: AutoFibSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(zones: AutoFibZone[], settings: AutoFibSettings) {
    this._zones = zones;
    this._settings = settings;
    this._paneViews = [new AutoFibPaneView(this)];
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

  getZones(): AutoFibZone[] {
    return this._zones;
  }

  getSettings(): AutoFibSettings {
    return this._settings;
  }

  update(zones: AutoFibZone[], settings: AutoFibSettings) {
    this._zones = zones;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
