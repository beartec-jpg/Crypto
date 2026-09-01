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
import type { SwoopDrawSegment, SwoopLineStyle, SwoopPivotLabel } from '@/types/swoop';

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
    private _labels: SwoopPivotLabel[],
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  draw(target: any) {
    if (!this._series || !this._chart) return;

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

      ctx.font = 'bold 10px sans-serif';
      ctx.textBaseline = 'middle';
      for (const lab of this._labels) {
        const x = timeScale.timeToCoordinate(lab.time as Time);
        const y = this._series!.priceToCoordinate(lab.price);
        if (x === null || y === null) continue;
        const color = lab.kind === 'high' ? '#f87171' : '#fb7185';
        ctx.fillStyle = hexWithAlpha(color, 0.9);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        const textY = lab.kind === 'high' ? y - 10 : y + 12;
        const width = ctx.measureText(lab.text).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(x + 5, textY - 7, width + 6, 14);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(lab.text, x + 8, textY);
      }
    });
  }
}

class SwoopPaneView implements IPrimitivePaneView {
  constructor(
    private _segments: SwoopDrawSegment[],
    private _labels: SwoopPivotLabel[],
    private _series: ISeriesApi<SeriesType> | null,
    private _chart: IChartApi | null,
  ) {}

  update(
    segments: SwoopDrawSegment[],
    labels: SwoopPivotLabel[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._segments = segments;
    this._labels = labels;
    this._series = series;
    this._chart = chart;
  }

  renderer(): IPrimitivePaneRenderer {
    return new SwoopRenderer(this._segments, this._labels, this._series, this._chart);
  }

  zOrder() {
    return 'normal' as const;
  }
}

export class SwoopPrimitive implements ISeriesPrimitive<Time> {
  private _segments: SwoopDrawSegment[] = [];
  private _labels: SwoopPivotLabel[] = [];
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: RequestUpdateCallback | null = null;
  private _paneView: SwoopPaneView;

  constructor(segments: SwoopDrawSegment[] = [], labels: SwoopPivotLabel[] = []) {
    this._segments = segments;
    this._labels = labels;
    this._paneView = new SwoopPaneView(segments, labels, null, null);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._paneView.update(this._segments, this._labels, this._series, this._chart);
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  update(segments: SwoopDrawSegment[], labels: SwoopPivotLabel[] = []): void {
    this._segments = segments;
    this._labels = labels;
    this._paneView.update(segments, labels, this._series, this._chart);
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._paneView];
  }
}
