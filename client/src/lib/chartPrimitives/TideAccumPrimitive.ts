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
import type { TideAccumZone } from '@/lib/indicators/tideZone';

type RequestUpdateCallback = () => void;

class TideAccumRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _zones: TideAccumZone[],
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  draw(target: { useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D }) => void) => void }) {
    if (!this._series || !this._chart) return;
    const series = this._series;
    const chart = this._chart;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const ts = chart.timeScale();
      for (const z of this._zones) {
        const x1 = ts.timeToCoordinate(z.t1 as Time);
        const x2 = ts.timeToCoordinate(z.t2 as Time);
        const y1 = series.priceToCoordinate(z.price1);
        const y2 = series.priceToCoordinate(z.price2);
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        const left = Math.min(x1, x2);
        const width = Math.max(4, Math.abs(x2 - x1));
        const top = Math.min(y1, y2) - 8;
        const height = Math.max(10, Math.abs(y2 - y1) + 16);
        const forming = z.status === 'forming';
        ctx.fillStyle = forming ? 'rgba(34, 211, 238, 0.08)' : 'rgba(34, 211, 238, 0.14)';
        ctx.fillRect(left, top, width, height);
        ctx.strokeStyle = forming ? 'rgba(34, 211, 238, 0.55)' : 'rgba(34, 211, 238, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash(forming ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.95)';
        ctx.beginPath();
        ctx.arc(x1, y1, 3, 0, Math.PI * 2);
        ctx.arc(x2, y2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '10px sans-serif';
        ctx.fillText(forming ? 'accum…' : 'ACCUM', x2 + 4, y2 + 12);
      }
    });
  }
}

class TideAccumPaneView implements IPrimitivePaneView {
  constructor(
    private _zones: TideAccumZone[],
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  update(zones: TideAccumZone[], series: ISeriesApi<SeriesType> | null, chart: IChartApi | null) {
    this._zones = zones;
    this._series = series;
    this._chart = chart;
  }

  renderer() {
    return new TideAccumRenderer(this._zones, this._series, this._chart);
  }
}

export class TideAccumPrimitive implements ISeriesPrimitive<Time> {
  private _view: TideAccumPaneView;
  private _requestUpdate?: RequestUpdateCallback;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _zones: TideAccumZone[];

  constructor(zones: TideAccumZone[]) {
    this._zones = zones;
    this._view = new TideAccumPaneView(zones, null, null);
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._view.update(this._zones, this._series, this._chart);
    this._requestUpdate?.();
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }

  update(zones: TideAccumZone[]) {
    this._zones = zones;
    this._view.update(zones, this._series, this._chart);
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._view];
  }
}
