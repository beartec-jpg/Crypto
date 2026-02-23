/**
 * ElliottWavePrimitive
 *
 * Custom chart primitive that renders an Elliott Wave trendline from the
 * first placed point to the last, with the wave-degree label (e.g. "W1", "C")
 * displayed in a pill at the endpoint.
 */
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

export interface ElliottWaveData {
  /** All placed wave points (first → last) */
  points: { time: number; price: number; label?: string; isMidAir?: boolean }[];
  /** Higher-degree label drawn at the last point, e.g. "W1", "C" */
  waveType: string;
  /** Line / label color */
  color?: string;
  /** When true, render individual point labels (for saved/reloaded drawings) */
  showPointLabels?: boolean;
  /** When true, highlight the wave in yellow to indicate selection */
  isSelected?: boolean;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

class ElliottWaveRenderer implements IPrimitivePaneRenderer {
  private _data: ElliottWaveData;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    data: ElliottWaveData,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._data = data;
    this._series = series;
    this._chart = chart;
  }

  draw(target: any) {
    if (!this._series || !this._chart || this._data.points.length < 2) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const timeScale = this._chart!.timeScale();
      const color = this._data.isSelected ? '#facc15' : (this._data.color ?? '#00CED1');

      const coords = this._data.points.map(p => ({
        x: timeScale.timeToCoordinate(p.time as Time),
        y: this._series!.priceToCoordinate(p.price),
        label: p.label,
        isMidAir: p.isMidAir,
      }));

      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first.x === null || first.y === null || last.x === null || last.y === null) return;

      ctx.save();

      // Trendline: dashed line from first to last point
      ctx.strokeStyle = color;
      ctx.lineWidth = this._data.isSelected ? 3 : 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point labels (for saved/reloaded drawings)
      if (this._data.showPointLabels) {
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const c of coords) {
          if (c.x === null || c.y === null || !c.label) continue;
          const dotColor = c.isMidAir ? '#f97316' : color;
          // Draw circle
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
          ctx.fill();
          // Draw label text inside circle
          ctx.fillStyle = 'rgba(0,0,0,0.9)';
          ctx.fillText(c.label, c.x, c.y);
        }

        ctx.textAlign = 'left';
      }

      // Degree label pill at the last point
      const label = this._data.waveType;
      ctx.font = 'bold 11px sans-serif';
      ctx.textBaseline = 'bottom';

      const textWidth = ctx.measureText(label).width;
      const padding = 4;
      const pillW = textWidth + padding * 2;
      const pillH = 16;
      // Place pill slightly above/right of the last point
      const pillX = last.x + 4;
      const pillY = last.y - pillH - 2;

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 3);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(label, pillX + padding, last.y - 3);

      ctx.restore();
    });
  }
}

// ─── Pane view ────────────────────────────────────────────────────────────────

class ElliottWavePaneView implements IPrimitivePaneView {
  private _primitive: ElliottWavePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: ElliottWavePrimitive) {
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
    return new ElliottWaveRenderer(this._primitive.getData(), this._series, this._chart);
  }
}

// ─── Public primitive class ────────────────────────────────────────────────────

export class ElliottWavePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: ElliottWavePaneView[];
  private _data: ElliottWaveData;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: () => void;

  constructor(data: ElliottWaveData) {
    this._data = data;
    this._paneViews = [new ElliottWavePaneView(this)];
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

  getData(): ElliottWaveData {
    return this._data;
  }

  update(data: ElliottWaveData) {
    this._data = data;
    this._requestUpdate?.();
  }
}
