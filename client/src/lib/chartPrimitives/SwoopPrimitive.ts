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
import type { SwoopDrawSegment, SwoopLineStyle } from '@/types/swoop';

type RequestUpdateCallback = () => void;

function applyDash(ctx: CanvasRenderingContext2D, style: SwoopLineStyle, width: number) {
  if (style === 'dashed') ctx.setLineDash([6 * width, 4 * width]);
  else if (style === 'dotted') ctx.setLineDash([width, 3 * width]);
  else ctx.setLineDash([]);
}

function hexWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

class SwoopRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _segments: SwoopDrawSegment[],
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  draw(target: any) {
    if (!this._series || !this._chart || this._segments.length === 0) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const timeScale = this._chart!.timeScale();

      for (const seg of this._segments) {
        const x1 = timeScale.timeToCoordinate(seg.startTime as Time);
        const y1 = this._series!.priceToCoordinate(seg.startPrice);
        const x2 = timeScale.timeToCoordinate(seg.endTime as Time);
        const y2 = this._series!.priceToCoordinate(seg.endPrice);
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        ctx.beginPath();
        ctx.strokeStyle = seg.role === 'fan' ? hexWithAlpha(seg.color, 0.55) : seg.color;
        ctx.lineWidth = Math.max(1, seg.lineWidth);
        ctx.lineCap = 'round';
        applyDash(ctx, seg.lineStyle, seg.lineWidth);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }
}

class SwoopPaneView implements IPrimitivePaneView {
  constructor(
    private _segments: SwoopDrawSegment[],
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  update(
    segments: SwoopDrawSegment[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._segments = segments;
    this._series = series;
    this._chart = chart;
  }

  renderer(): IPrimitivePaneRenderer {
    return new SwoopRenderer(this._segments, this._series, this._chart);
  }

  zOrder() {
    return 'normal' as const;
  }
}

export class SwoopPrimitive implements ISeriesPrimitive<Time> {
  private _segments: SwoopDrawSegment[] = [];
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: RequestUpdateCallback | null = null;
  private _paneView: SwoopPaneView;

  constructor(segments: SwoopDrawSegment[] = []) {
    this._segments = segments;
    this._paneView = new SwoopPaneView(segments, null, null);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._paneView.update(this._segments, this._series, this._chart);
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  update(segments: SwoopDrawSegment[]): void {
    this._segments = segments;
    this._paneView.update(segments, this._series, this._chart);
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._paneView];
  }
}
