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
  /** Line / label color (legacy fallback) */
  color?: string;
  /** Color for impulse / main-wave legs (even-indexed segments) */
  impulseColor?: string;
  /** Opacity for impulse legs (0–1) */
  impulseOpacity?: number;
  /** Stroke width for impulse legs in pixels */
  impulseWidth?: number;
  /** Dash style for impulse legs */
  impulseStyle?: 'solid' | 'dashed' | 'dotted';
  /** Color for correction / retracement legs (odd-indexed segments) */
  zigzagColor?: string;
  /** Opacity for correction legs (0–1) */
  zigzagOpacity?: number;
  /** Dash style for correction legs */
  zigzagStyle?: 'solid' | 'dashed' | 'dotted';
  /** Font size for point labels, e.g. "12px" */
  fontSize?: string;
  /** When true the wave is an internal sub-wave drawn at a smaller, more translucent style */
  isInternal?: boolean;
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
  /**
   * Stack index for the final-point label when multiple waves share the same
   * endpoint. Index 0 = closest to the candle; higher values push the label
   * progressively further away (up for highs, down for lows).
   */
  labelOffset?: number;
  /** Custom label text overrides keyed by point index */
  customPointLabels?: Record<number, string>;
  /** Point indices whose labels should not be rendered */
  hiddenPointLabels?: number[];
}

// Final point label rendering constants
const LABEL_STROKE_COLOR = '#000';
const LABEL_STROKE_WIDTH = 3;

/** Translate a line-style value to a canvas dash pattern */
function getLineDash(style: string | undefined): number[] {
  if (style === 'dashed') return [5, 5];
  if (style === 'dotted') return [2, 4];
  return [];
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

      const isSelected = this._data.isSelected;

      // Resolve per-leg style values (selected state overrides all colors to yellow)
      const impulseColor   = isSelected ? '#facc15' : (this._data.impulseColor  ?? this._data.color ?? '#00CED1');
      const zigzagColor    = isSelected ? '#facc15' : (this._data.zigzagColor   ?? this._data.color ?? '#808080');
      const impulseOpacity = this._data.impulseOpacity ?? 1;
      const zigzagOpacity  = this._data.zigzagOpacity  ?? 1;
      const impulseWidth   = this._data.impulseWidth   ?? 2;
      const fontSize       = this._data.fontSize       ?? '12px';

      // Resolve screen X for a point, extrapolating for future times
      const resolveX = (time: number): number | null => {
        let x = timeScale.timeToCoordinate(time as Time);
        if (x === null && this._data.candleInterval && this._data.lastCandleTime !== undefined && this._data.barCount !== undefined) {
          const barsFromLast = (time - this._data.lastCandleTime) / this._data.candleInterval;
          const logical = (this._data.barCount - 1) + barsFromLast;
          x = timeScale.logicalToCoordinate(logical as any);
        }
        return x;
      };

      const hiddenSet = new Set<number>(this._data.hiddenPointLabels ?? []);
      const customLabels = this._data.customPointLabels ?? {};

      const coords = this._data.points.map((p, i) => ({
        x: resolveX(p.time),
        y: this._series!.priceToCoordinate(p.price),
        label: hiddenSet.has(i) ? undefined : (customLabels[i] ?? p.label),
        isMidAir: p.isMidAir,
      }));

      ctx.save();

      // Determine trend direction from first two points
      const isUptrend = this._data.points.length >= 2 &&
        this._data.points[1].price > this._data.points[0].price;

      // Draw a single uniform zigzag line through all consecutive points.
      // All legs use the "Zigzag Line" (impulse*) settings from the settings panel.
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) continue;

        ctx.globalAlpha = impulseOpacity;
        ctx.strokeStyle = impulseColor;
        ctx.lineWidth = impulseWidth;
        ctx.setLineDash(getLineDash(this._data.impulseStyle ?? 'solid'));

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Reset state before drawing overlays
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // Draw a straight "marker" line from point 0 to the last point when ≥3 points
      // placed.  Uses the "Marker" (zigzag*) settings so it is visually distinct
      // from the zigzag segments above.
      if (coords.length >= 3) {
        const p0 = coords[0];
        const pN = coords[coords.length - 1];
        if (p0.x !== null && p0.y !== null && pN.x !== null && pN.y !== null) {
          ctx.globalAlpha = zigzagOpacity;
          ctx.strokeStyle = zigzagColor;
          ctx.lineWidth = 1;
          ctx.setLineDash(getLineDash(this._data.zigzagStyle ?? 'dashed'));
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(pN.x, pN.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Point labels
      const labelFont = `bold ${fontSize} sans-serif`;
      if (this._data.showPointLabels && coords.length > 0) {
        ctx.textAlign = 'center';
        ctx.font = labelFont;

        for (let i = 0; i < coords.length; i++) {
          const c = coords[i];
          if (c.x === null || c.y === null || !c.label) continue;

          const dotColor = c.isMidAir ? '#f97316' : impulseColor;

          const isHigh = isUptrend ? (i % 2 === 1) : (i % 2 === 0);

          ctx.fillStyle = dotColor;
          ctx.strokeStyle = LABEL_STROKE_COLOR;
          ctx.lineWidth = LABEL_STROKE_WIDTH;

          if (isHigh) {
            ctx.textBaseline = 'bottom';
            ctx.strokeText(c.label, c.x, c.y - 16);
            ctx.fillText(c.label, c.x, c.y - 16);
          } else {
            ctx.textBaseline = 'top';
            ctx.strokeText(c.label, c.x, c.y + 16);
            ctx.fillText(c.label, c.x, c.y + 16);
          }
        }
        
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
      }

      if (!this._data.showPointLabels && coords.length > 0) {
        const finalIndex = coords.length - 1;
        const c = coords[finalIndex];
        
        if (c.x !== null && c.y !== null && c.label) {
          ctx.textAlign = 'center';
          ctx.font = labelFont;
          
          const dotColor = c.isMidAir ? '#f97316' : impulseColor;
          const isHigh = isUptrend ? (finalIndex % 2 === 1) : (finalIndex % 2 === 0);

          // Each stack level is 16 px apart so stacked labels don't overlap.
          const stackOffsetPx = (this._data.labelOffset ?? 0) * 16;

          ctx.fillStyle = dotColor;
          ctx.strokeStyle = LABEL_STROKE_COLOR;
          ctx.lineWidth = LABEL_STROKE_WIDTH;
          
          if (isHigh) {
            ctx.textBaseline = 'bottom';
            ctx.strokeText(c.label, c.x, c.y - 16 - stackOffsetPx);
            ctx.fillText(c.label, c.x, c.y - 16 - stackOffsetPx);
          } else {
            ctx.textBaseline = 'top';
            ctx.strokeText(c.label, c.x, c.y + 16 + stackOffsetPx);
            ctx.fillText(c.label, c.x, c.y + 16 + stackOffsetPx);
          }
          
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
        }
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
