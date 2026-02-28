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
import type { AutoFibResult, AutoFibSettings, FibSetResult, ConfluenceZone } from '@/types/autoFib';

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

function drawFibSet(
  ctx: CanvasRenderingContext2D,
  chartWidth: number,
  series: ISeriesApi<SeriesType>,
  fibSet: FibSetResult
) {
  const anchorTime = Math.min(fibSet.start.time, fibSet.end.time) as Time;

  for (const level of fibSet.levels) {
    const y = series.priceToCoordinate(level.price);
    if (y === null) continue;

    const color = level.isGolden ? hexToRgba(fibSet.color, 1) : hexToRgba(fibSet.color, 0.8);
    const lineWidth = level.isGolden ? 2 : 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(level.isExtension ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(fibSet.extendRight ? chartWidth : chartWidth * 0.7, y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (fibSet.showLabels && fibSet.labelPosition !== 'off') {
      ctx.fillStyle = color;
      ctx.font = `bold 10px sans-serif`;
      const text = `${level.percentage} • ${level.price.toFixed(2)}`;

      if (fibSet.labelPosition === 'left') {
        ctx.fillText(text, 4, y - 3);
      } else {
        // right
        const textWidth = ctx.measureText(text).width;
        ctx.fillText(text, chartWidth - textWidth - 6, y - 3);
      }
    }
  }
}

function drawConfluence(
  ctx: CanvasRenderingContext2D,
  chartWidth: number,
  series: ISeriesApi<SeriesType>,
  confluence: ConfluenceZone[]
) {
  for (const zone of confluence) {
    const y = series.priceToCoordinate(zone.price);
    if (y === null) continue;

    ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';
    ctx.fillRect(0, y - 3, chartWidth, 6);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

class AutoFibRenderer implements IPrimitivePaneRenderer {
  private _result: AutoFibResult;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    result: AutoFibResult,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null
  ) {
    this._result = result;
    this._series = series;
    this._chart = chart;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;

      if (this._result.secondary) {
        drawFibSet(ctx, chartWidth, this._series!, this._result.secondary);
      }

      if (this._result.primary) {
        drawFibSet(ctx, chartWidth, this._series!, this._result.primary);
      }

      if (this._result.confluence.length > 0) {
        drawConfluence(ctx, chartWidth, this._series!, this._result.confluence);
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
      this._primitive.getResult(),
      this._series,
      this._chart
    );
  }
}

export class AutoFibPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: AutoFibPaneView[];
  private _result: AutoFibResult;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(result: AutoFibResult) {
    this._result = result;
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

  getResult(): AutoFibResult {
    return this._result;
  }

  update(result: AutoFibResult) {
    this._result = result;
    this._requestUpdate?.();
  }
}
