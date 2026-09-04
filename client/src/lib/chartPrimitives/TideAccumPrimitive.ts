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
import type { TidePrintZone } from '@/lib/indicators/tideZone';

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

export interface TidePrintStyle {
  divColor: string;
  absorbColor: string;
}

class TidePrintCanvas implements IPrimitivePaneRenderer {
  constructor(
    private _zones: TidePrintZone[],
    private _style: TidePrintStyle,
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  draw(target: { useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D }) => void) => void }) {
    if (!this._series || !this._chart) return;
    const series = this._series;
    const chart = this._chart;
    const style = this._style;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const ts = chart.timeScale();
      for (const z of this._zones) {
        const color = z.kind === 'absorb' ? style.absorbColor : style.divColor;
        const x1 = ts.timeToCoordinate(z.t1 as Time);
        const x2 = ts.timeToCoordinate(z.t2 as Time);
        const y1 = series.priceToCoordinate(z.price1);
        const y2 = series.priceToCoordinate(z.price2);
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        const left = Math.min(x1, x2);
        const width = Math.max(8, Math.abs(x2 - x1));
        const top = Math.min(y1, y2) - 8;
        const height = Math.max(10, Math.abs(y2 - y1) + 16);
        const forming = z.status === 'forming';
        ctx.fillStyle = hexToRgba(color, forming ? 0.08 : 0.16);
        ctx.fillRect(left, top, width, height);
        ctx.strokeStyle = hexToRgba(color, forming ? 0.55 : 0.9);
        ctx.lineWidth = 1.5;
        ctx.setLineDash(forming ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hexToRgba(color, 0.95);
        ctx.beginPath();
        ctx.arc(x1, y1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x2, y2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '10px sans-serif';
        const label = z.kind === 'absorb' ? 'ABSORB' : forming ? 'div…' : 'DIV';
        ctx.fillText(label, x2 + 4, y2 + 12);
      }
    });
  }
}

class TidePrintPaneView implements IPrimitivePaneView {
  constructor(
    private _zones: TidePrintZone[],
    private _style: TidePrintStyle,
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  update(
    zones: TidePrintZone[],
    style: TidePrintStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._zones = zones;
    this._style = style;
    this._series = series;
    this._chart = chart;
  }

  renderer() {
    return new TidePrintCanvas(this._zones, this._style, this._series, this._chart);
  }
}

export class TideAccumPrimitive implements ISeriesPrimitive<Time> {
  private _view: TidePrintPaneView;
  private _requestUpdate?: RequestUpdateCallback;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _zones: TidePrintZone[];
  private _style: TidePrintStyle;

  constructor(zones: TidePrintZone[], style: TidePrintStyle) {
    this._zones = zones;
    this._style = style;
    this._view = new TidePrintPaneView(zones, style, null, null);
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._view.update(this._zones, this._style, this._series, this._chart);
    this._requestUpdate?.();
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }

  update(zones: TidePrintZone[], style?: TidePrintStyle) {
    this._zones = zones;
    if (style) this._style = style;
    this._view.update(this._zones, this._style, this._series, this._chart);
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._view];
  }
}
