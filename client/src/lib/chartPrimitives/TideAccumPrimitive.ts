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

/** Tide-out marker at its confirmation bar (never moved or removed once shown). */
export interface TideOutMark {
  time: number;
  /** Low of the confirmation bar — marker sits under it. */
  barLow: number;
  plus: boolean;
  pivotTime: number;
  pivotPrice: number;
  pivot1Time: number;
  pivot1Price: number;
}

/** Tide-in (exit) marker at the peak confirmation bar. */
export interface TideInMark {
  time: number;
  barHigh: number;
}

export interface TideStopMark {
  startTime: number;
  endTime: number;
  price: number;
  outcome: 'open' | 'tide_in' | 'stop';
}

export interface TideOverlay {
  tideOut: TideOutMark[];
  tideIn: TideInMark[];
  stops: TideStopMark[];
  absorb: TidePrintZone[];
}

export interface TidePrintStyle {
  tideOutColor: string;
  tideOutPlusColor: string;
  tideInColor: string;
  stopColor: string;
  absorbColor: string;
}

export const EMPTY_TIDE_OVERLAY: TideOverlay = { tideOut: [], tideIn: [], stops: [], absorb: [] };

type Ctx = CanvasRenderingContext2D;

function triangle(ctx: Ctx, x: number, y: number, size: number, up: boolean) {
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y + size * 1.4);
    ctx.lineTo(x + size, y + size * 1.4);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y - size * 1.4);
    ctx.lineTo(x + size, y - size * 1.4);
  }
  ctx.closePath();
  ctx.fill();
}

function pill(ctx: Ctx, text: string, x: number, y: number, color: string, above: boolean) {
  ctx.font = 'bold 10px sans-serif';
  const w = ctx.measureText(text).width + 8;
  const h = 14;
  const left = x - w / 2;
  const top = above ? y - h : y;
  ctx.fillStyle = hexToRgba(color, 0.9);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(left, top, w, h, 3);
  else ctx.rect(left, top, w, h);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, top + h / 2 + 0.5);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

class TidePrintCanvas implements IPrimitivePaneRenderer {
  constructor(
    private _overlay: TideOverlay,
    private _style: TidePrintStyle,
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  draw(target: { useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D }) => void) => void }) {
    if (!this._series || !this._chart) return;
    const series = this._series;
    const chart = this._chart;
    const style = this._style;
    const ov = this._overlay;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const ts = chart.timeScale();
      const X = (t: number) => ts.timeToCoordinate(t as Time);
      const Y = (p: number) => series.priceToCoordinate(p);

      // Absorb boxes (legacy watch).
      for (const z of ov.absorb) {
        const x1 = X(z.t1);
        const x2 = X(z.t2);
        const y1 = Y(z.price1);
        const y2 = Y(z.price2);
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        ctx.fillStyle = hexToRgba(style.absorbColor, 0.12);
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2) - 8, Math.max(8, Math.abs(x2 - x1)), Math.max(10, Math.abs(y2 - y1) + 16));
        ctx.font = '10px sans-serif';
        ctx.fillStyle = hexToRgba(style.absorbColor, 0.95);
        ctx.fillText('ABSORB', x2 + 4, y2 + 12);
      }

      // Stop levels: signal bar → Tide-in exit / stop hit / newest bar.
      for (const s of ov.stops) {
        const x1 = X(s.startTime);
        const x2 = X(s.endTime);
        const y = Y(s.price);
        if (x1 == null || x2 == null || y == null) continue;
        const open = s.outcome === 'open';
        ctx.strokeStyle = hexToRgba(style.stopColor, open ? 0.95 : 0.6);
        ctx.lineWidth = open ? 1.5 : 1.2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(Math.max(x2, x1 + 6), y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = hexToRgba(style.stopColor, 0.95);
        ctx.fillText('SL', x1 - 13, y + 3);
        if (s.outcome === 'stop') {
          ctx.strokeStyle = style.stopColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x2 - 4, y - 4);
          ctx.lineTo(x2 + 4, y + 4);
          ctx.moveTo(x2 + 4, y - 4);
          ctx.lineTo(x2 - 4, y + 4);
          ctx.stroke();
          ctx.fillText('stop hit', x2 + 7, y - 5);
        } else if (open) {
          const txt = `SL ${s.price >= 100 ? s.price.toFixed(1) : s.price.toPrecision(5)}`;
          ctx.fillText(txt, x2 + 6, y + 3);
        }
      }

      // Tide-out: divergence leg (pivot → pivot) + marker on the confirmation bar.
      for (const m of ov.tideOut) {
        const color = m.plus ? style.tideOutPlusColor : style.tideOutColor;
        const px1 = X(m.pivot1Time);
        const px2 = X(m.pivotTime);
        const py1 = Y(m.pivot1Price);
        const py2 = Y(m.pivotPrice);
        if (px1 != null && px2 != null && py1 != null && py2 != null) {
          ctx.strokeStyle = hexToRgba(color, 0.55);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = hexToRgba(color, 0.8);
          for (const [x, y] of [
            [px1, py1],
            [px2, py2],
          ]) {
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        const x = X(m.time);
        const y = Y(m.barLow);
        if (x == null || y == null) continue;
        ctx.fillStyle = color;
        triangle(ctx, x, y + 5, 5, true);
        pill(ctx, m.plus ? 'Tide out +' : 'Tide out', x, y + 14, color, false);
      }

      // Tide-in exit markers.
      for (const m of ov.tideIn) {
        const x = X(m.time);
        const y = Y(m.barHigh);
        if (x == null || y == null) continue;
        ctx.fillStyle = style.tideInColor;
        triangle(ctx, x, y - 5, 5, false);
        pill(ctx, 'Tide in', x, y - 14, style.tideInColor, true);
      }
    });
  }
}

class TidePrintPaneView implements IPrimitivePaneView {
  constructor(
    private _overlay: TideOverlay,
    private _style: TidePrintStyle,
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  update(overlay: TideOverlay, style: TidePrintStyle, series: ISeriesApi<SeriesType> | null, chart: IChartApi | null) {
    this._overlay = overlay;
    this._style = style;
    this._series = series;
    this._chart = chart;
  }

  renderer() {
    return new TidePrintCanvas(this._overlay, this._style, this._series, this._chart);
  }
}

export class TideAccumPrimitive implements ISeriesPrimitive<Time> {
  private _view: TidePrintPaneView;
  private _requestUpdate?: RequestUpdateCallback;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _overlay: TideOverlay;
  private _style: TidePrintStyle;

  constructor(overlay: TideOverlay, style: TidePrintStyle) {
    this._overlay = overlay;
    this._style = style;
    this._view = new TidePrintPaneView(overlay, style, null, null);
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._view.update(this._overlay, this._style, this._series, this._chart);
    this._requestUpdate?.();
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }

  update(overlay: TideOverlay, style?: TidePrintStyle) {
    this._overlay = overlay;
    if (style) this._style = style;
    this._view.update(this._overlay, this._style, this._series, this._chart);
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._view];
  }
}
