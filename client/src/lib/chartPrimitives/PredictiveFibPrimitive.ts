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
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

type RequestUpdateCallback = () => void;

/** Color coding for fib levels */
function fibLineColor(level: FibLevel, colorOverride?: string): { line: string; alpha: number } {
  if (colorOverride) {
    return { line: colorOverride, alpha: 0.85 };
  }
  if (level.color) {
    return { line: level.color, alpha: 0.85 };
  }
  const r = level.ratio;
  // High-probability targets: 50%, 61.8%, 1.0, 1.272, 1.618
  if (r === 0.5 || r === 0.618 || r === 1.0 || r === 1.272 || r === 1.618) {
    return { line: '#00CED1', alpha: 0.85 }; // cyan
  }
  // Secondary targets
  return { line: '#f59e0b', alpha: 0.75 }; // amber
}

class PredictiveFibPaneRenderer implements IPrimitivePaneRenderer {
  private _levels: FibLevel[];
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _colorOverride?: string;

  constructor(
    levels: FibLevel[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    colorOverride?: string,
  ) {
    this._levels = levels;
    this._series = series;
    this._chart = chart;
    this._colorOverride = colorOverride;
  }

  draw(target: any) {
    if (!this._series || !this._chart || this._levels.length === 0) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;

      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      ctx.textBaseline = 'bottom';

      for (const level of this._levels) {
        const y = this._series!.priceToCoordinate(level.price);
        if (y === null) continue;

        const { line, alpha } = fibLineColor(level, this._colorOverride);

        // Apply per-level style and width
        ctx.lineWidth = level.width || 1.5;
        ctx.setLineDash(level.style === 'solid' ? [] : [6, 4]);

        // Draw line from left to right edge
        ctx.strokeStyle = `${line}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();

        // Label background pill on the right side
        const label = `${level.label}  ${level.price.toFixed(2)}`;
        const textWidth = ctx.measureText(label).width;
        const padding = 4;
        const pillW = textWidth + padding * 2;
        const pillH = 14;
        const pillX = chartWidth - pillW - 6;
        const pillY = y - pillH;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3);
        ctx.fill();

        ctx.fillStyle = line;
        ctx.fillText(label, pillX + padding, y - 1);
      }

      ctx.restore();
    });
  }
}

class PredictiveFibPaneView implements IPrimitivePaneView {
  private _primitive: PredictiveFibPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: PredictiveFibPrimitive) {
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
    return new PredictiveFibPaneRenderer(
      this._primitive.getLevels(),
      this._series,
      this._chart,
      this._primitive.getColor(),
    );
  }
}

export class PredictiveFibPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: PredictiveFibPaneView[];
  private _levels: FibLevel[];
  private _color?: string;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(levels: FibLevel[], color?: string) {
    this._levels = levels;
    this._color = color;
    this._paneViews = [new PredictiveFibPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._series = param.series;
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    this.updateAllViews();
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

  getLevels(): FibLevel[] {
    return this._levels;
  }

  getColor(): string | undefined {
    return this._color;
  }

  update(levels: FibLevel[], color?: string) {
    this._levels = levels;
    if (color !== undefined) this._color = color;
    this._requestUpdate?.();
  }
}
