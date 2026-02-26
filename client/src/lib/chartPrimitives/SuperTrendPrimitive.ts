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
import type { SuperTrendPoint } from '@/hooks/useSuperTrendCalculation';
import type { SuperTrendConfig, SuperTrendType } from '@/types/supertrend';

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

const LABEL_MAP: Record<SuperTrendType, string> = {
  standard: 'ST',
  adx: 'ADX-ST',
  keltner: 'K-ST',
};

class SuperTrendRenderer implements IPrimitivePaneRenderer {
  private _data: SuperTrendPoint[];
  private _config: SuperTrendConfig;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    data: SuperTrendPoint[],
    config: SuperTrendConfig,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._data = data;
    this._config = config;
    this._series = series;
    this._chart = chart;
  }

  draw(target: any) {
    if (!this._series || !this._chart || this._data.length === 0) return;
    if (!this._config.showLine && !this._config.showSignals) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const timeScale = this._chart!.timeScale();

      if (this._config.showLine) {
        this._drawLine(ctx, timeScale);
      }

      if (this._config.showSignals) {
        this._drawSignals(ctx, timeScale);
      }

      this._drawLabel(ctx, timeScale);
    });
  }

  private _drawLine(ctx: CanvasRenderingContext2D, timeScale: any) {
    const data = this._data;
    let i = 0;

    while (i < data.length) {
      // Find a contiguous segment of same trend
      const segTrend = data[i].trend;
      const segStart = i;
      while (i < data.length && data[i].trend === segTrend) {
        i++;
      }
      const segEnd = i - 1;

      const color =
        segTrend === 'bullish' ? this._config.bullishColor : this._config.bearishColor;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = this._config.lineWidth;
      ctx.setLineDash([]);

      let started = false;
      for (let j = segStart; j <= segEnd; j++) {
        const point = data[j];
        const x = timeScale.timeToCoordinate(point.time as Time);
        const y = this._series!.priceToCoordinate(point.value);
        if (x === null || y === null) continue;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (started) ctx.stroke();
    }
  }

  private _drawSignals(ctx: CanvasRenderingContext2D, timeScale: any) {
    const ARROW_SIZE = 8;
    const OFFSET_PX = 12;

    for (const point of this._data) {
      if (!point.signal) continue;

      const x = timeScale.timeToCoordinate(point.time as Time);
      if (x === null) continue;

      if (point.signal === 'buy') {
        // Buy: green triangle pointing up, below the candle (below SuperTrend line)
        const y = this._series!.priceToCoordinate(point.value);
        if (y === null) continue;
        const tipY = y + OFFSET_PX;

        ctx.beginPath();
        ctx.moveTo(x, tipY - ARROW_SIZE);
        ctx.lineTo(x - ARROW_SIZE, tipY);
        ctx.lineTo(x + ARROW_SIZE, tipY);
        ctx.closePath();
        ctx.fillStyle = this._config.signalColor;
        ctx.fill();
      } else {
        // Sell: red triangle pointing down, above the candle (above SuperTrend line)
        const y = this._series!.priceToCoordinate(point.value);
        if (y === null) continue;
        const tipY = y - OFFSET_PX;

        ctx.beginPath();
        ctx.moveTo(x, tipY + ARROW_SIZE);
        ctx.lineTo(x - ARROW_SIZE, tipY);
        ctx.lineTo(x + ARROW_SIZE, tipY);
        ctx.closePath();
        ctx.fillStyle = this._config.signalColor;
        ctx.fill();
      }
    }
  }

  private _drawLabel(ctx: CanvasRenderingContext2D, timeScale: any) {
    // Find the first visible point to place the label
    for (const point of this._data) {
      const x = timeScale.timeToCoordinate(point.time as Time);
      const y = this._series!.priceToCoordinate(point.value);
      if (x === null || y === null) continue;

      const label = LABEL_MAP[this._config.type];
      ctx.font = '10px sans-serif';
      const textWidth = ctx.measureText(label).width;
      const padding = 3;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(x + 2, y - 12, textWidth + padding * 2, 14);

      const color =
        point.trend === 'bullish' ? this._config.bullishColor : this._config.bearishColor;
      ctx.fillStyle = color;
      ctx.fillText(label, x + 2 + padding, y - 1);
      break;
    }
  }
}

class SuperTrendPaneView implements IPrimitivePaneView {
  private _primitive: SuperTrendPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: SuperTrendPrimitive) {
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
    return new SuperTrendRenderer(
      this._primitive.getData(),
      this._primitive.getConfig(),
      this._series,
      this._chart,
    );
  }
}

export class SuperTrendPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: SuperTrendPaneView[];
  private _data: SuperTrendPoint[];
  private _config: SuperTrendConfig;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(data: SuperTrendPoint[], config: SuperTrendConfig) {
    this._data = data;
    this._config = config;
    this._paneViews = [new SuperTrendPaneView(this)];
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
    this._paneViews.forEach((pv) => pv.update(this._series, this._chart));
  }

  paneViews() {
    return this._paneViews;
  }

  getData(): SuperTrendPoint[] {
    return this._data;
  }

  getConfig(): SuperTrendConfig {
    return this._config;
  }

  update(data: SuperTrendPoint[], config: SuperTrendConfig) {
    this._data = data;
    this._config = config;
    this._requestUpdate?.();
  }
}
