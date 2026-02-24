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
  /** Time of the last candle in the dataset – used for future point rendering */
  lastCandleTime?: number;
  /** Seconds between candles – used for future point rendering */
  candleInterval?: number;
  /** Total number of bars in the dataset – used for future point rendering */
  barCount?: number;
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

      // Resolve screen X for a point, extrapolating for future times
      const resolveX = (time: number): number | null => {
        let x = timeScale.timeToCoordinate(time as Time);
        if (x === null && this._data.candleInterval && this._data.lastCandleTime !== undefined && this._data.barCount !== undefined) {
          const barsFromLast = (time - this._data.lastCandleTime) / this._data.candleInterval;
          const logical = (this._data.barCount - 1) + barsFromLast;
          x = timeScale.logicalToCoordinate(logical);
        }
        return x;
      };

      const coords = this._data.points.map(p => ({
        x: resolveX(p.time),
        y: this._series!.priceToCoordinate(p.price),
        label: p.label,
        isMidAir: p.isMidAir,
      }));

      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first.x === null || first.y === null || last.x === null || last.y === null) return;

      ctx.save();

      // Zigzag lines: solid thin lines connecting consecutive points
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        if (p1.x !== null && p1.y !== null && p2.x !== null && p2.y !== null) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // Dashed diagonal trendline from point 0 to point 5 (when all 6 points placed)
      if (coords.length === 6) {
        const p0 = coords[0];
        const p5 = coords[5];
        if (p0.x !== null && p0.y !== null && p5.x !== null && p5.y !== null) {
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p5.x, p5.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Point circles and labels
      if (this._data.showPointLabels || coords.length > 0) {
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Determine trend direction for label placement
        const isUptrend = this._data.points.length >= 2 && this._data.points[1].price > this._data.points[0].price;

        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          if (c.x === null || c.y === null) continue;
          const dotColor = c.isMidAir ? '#f97316' : color;
          // Draw circle
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
          ctx.fill();
          // Draw label above for highs, below for lows
          if (c.label) {
            const isHigh = isUptrend ? (i % 2 === 1) : (i % 2 === 0);
            const labelY = isHigh ? c.y - 15 : c.y + 20;
            ctx.fillStyle = color;
            ctx.fillText(c.label, c.x, labelY);
          }
        }

        ctx.textAlign = 'left';
      }

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
