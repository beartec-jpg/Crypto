import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType,
  Coordinate,
} from 'lightweight-charts';
import type { AutoTrendlineSegment } from '@/types/autoTrendline';

type RequestUpdateCallback = () => void;

function applyDash(ctx: CanvasRenderingContext2D, style: AutoTrendlineSegment['lineStyle'], width: number) {
  if (style === 'dashed') ctx.setLineDash([6 * width, 4 * width]);
  else if (style === 'dotted') ctx.setLineDash([width, 3 * width]);
  else ctx.setLineDash([]);
}

class AutoTrendlineRenderer implements IPrimitivePaneRenderer {
  private _lines: AutoTrendlineSegment[];
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _lastIndex: number;
  private _lastTime: number | null;

  constructor(
    lines: AutoTrendlineSegment[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    lastIndex: number,
    lastTime: number | null,
  ) {
    this._lines = lines;
    this._series = series;
    this._chart = chart;
    this._lastIndex = lastIndex;
    this._lastTime = lastTime;
  }

  draw(target: any) {
    if (!this._series || !this._chart || this._lines.length === 0) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const timeScale = this._chart!.timeScale();
      const chartWidth = scope.mediaSize.width;

      for (const line of this._lines) {
        const x1 = timeScale.timeToCoordinate(line.startTime as Time);
        const y1 = this._series!.priceToCoordinate(line.startPrice);
        if (x1 === null || y1 === null) continue;

        const xTouchEnd = timeScale.timeToCoordinate(line.endTime as Time);
        const yTouchEnd = this._series!.priceToCoordinate(line.endPrice);

        let x2 = xTouchEnd;
        let y2 = yTouchEnd;

        if (line.extendRight && this._lastTime != null) {
          // Project price along the bar-index model to the latest candle, then
          // continue that screen slope out to the right edge of the pane.
          const priceAtLast = line.slope * this._lastIndex + line.intercept;
          const xLast = timeScale.timeToCoordinate(this._lastTime as Time);
          const yLast = this._series!.priceToCoordinate(priceAtLast);

          if (xLast !== null && yLast !== null) {
            // Use start → latest as the slope basis so extension tracks the model
            const dx = xLast - x1;
            if (Math.abs(dx) > 0.5) {
              const screenSlope = (yLast - y1) / dx;
              x2 = chartWidth;
              y2 = (Number(y1) + screenSlope * (chartWidth - Number(x1))) as Coordinate;
            } else if (xTouchEnd !== null && yTouchEnd !== null) {
              x2 = chartWidth;
              y2 = yTouchEnd;
            }
          }
        }

        if (x2 === null || y2 === null) continue;

        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = Math.max(1, line.lineWidth);
        ctx.lineCap = 'round';
        applyDash(ctx, line.lineStyle, line.lineWidth);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }
}

class AutoTrendlinePaneView implements IPrimitivePaneView {
  private _lines: AutoTrendlineSegment[];
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _lastIndex: number;
  private _lastTime: number | null;

  constructor(
    lines: AutoTrendlineSegment[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    lastIndex: number,
    lastTime: number | null,
  ) {
    this._lines = lines;
    this._series = series;
    this._chart = chart;
    this._lastIndex = lastIndex;
    this._lastTime = lastTime;
  }

  update(
    lines: AutoTrendlineSegment[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    lastIndex: number,
    lastTime: number | null,
  ) {
    this._lines = lines;
    this._series = series;
    this._chart = chart;
    this._lastIndex = lastIndex;
    this._lastTime = lastTime;
  }

  renderer(): IPrimitivePaneRenderer {
    return new AutoTrendlineRenderer(
      this._lines,
      this._series,
      this._chart,
      this._lastIndex,
      this._lastTime,
    );
  }

  zOrder() {
    return 'normal' as const;
  }
}

export class AutoTrendlinePrimitive implements ISeriesPrimitive<Time> {
  private _lines: AutoTrendlineSegment[] = [];
  private _lastIndex = 0;
  private _lastTime: number | null = null;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: RequestUpdateCallback | null = null;
  private _paneView: AutoTrendlinePaneView;

  constructor(lines: AutoTrendlineSegment[] = [], lastIndex = 0, lastTime: number | null = null) {
    this._lines = lines;
    this._lastIndex = lastIndex;
    this._lastTime = lastTime;
    this._paneView = new AutoTrendlinePaneView(lines, null, null, lastIndex, lastTime);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._paneView.update(this._lines, this._series, this._chart, this._lastIndex, this._lastTime);
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  update(lines: AutoTrendlineSegment[], lastIndex: number, lastTime: number | null): void {
    this._lines = lines;
    this._lastIndex = lastIndex;
    this._lastTime = lastTime;
    this._paneView.update(lines, this._series, this._chart, lastIndex, lastTime);
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._paneView];
  }
}
