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
import type { BOSSettings, StructureBreak, SwingPoint } from '@/types/structureBreak';

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

class BOSRenderer implements IPrimitivePaneRenderer {
  private _breaks: StructureBreak[];
  private _swings: SwingPoint[];
  private _settings: BOSSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    breaks: StructureBreak[],
    swings: SwingPoint[],
    settings: BOSSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._breaks = breaks;
    this._swings = swings;
    this._settings = settings;
    this._series = series;
    this._chart = chart;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;
      const timeScale = this._chart!.timeScale();

      // Draw BOS/CHoCH lines
      if (this._settings.drawLines) {
        for (const sb of this._breaks) {
          if (sb.type === 'bos' && !this._settings.showBOS) continue;
          if (sb.type === 'choch' && !this._settings.showCHoCH) continue;
          if (sb.swept && this._settings.hideSwept) continue;

          const color = this._getBreakColor(sb);
          const yLevel = this._series!.priceToCoordinate(sb.brokenLevel);
          if (yLevel === null) continue;

          const xStart = timeScale.timeToCoordinate(sb.brokenSwing.time as Time);
          if (xStart === null) continue;

          const xEnd = this._settings.extendLines
            ? chartWidth
            : timeScale.timeToCoordinate(sb.breakTime as Time) ?? chartWidth;

          ctx.strokeStyle = hexToRgba(color, sb.confirmed ? 0.85 : 0.45);
          ctx.lineWidth = sb.type === 'choch' ? 2 : 1.5;
          ctx.setLineDash(sb.swept ? [4, 4] : []);
          ctx.beginPath();
          ctx.moveTo(xStart, yLevel);
          ctx.lineTo(xEnd, yLevel);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label
          if (this._settings.showLabels) {
            const label = sb.type === 'bos' ? 'BOS' : 'CHoCH';
            const arrow = sb.direction === 'bullish' ? ' ↑' : ' ↓';
            ctx.fillStyle = hexToRgba(color, 0.9);
            ctx.font = `bold 10px sans-serif`;
            ctx.fillText(label + arrow, xStart + 4, yLevel - 3);
          }
        }
      }

      // Draw swing point markers
      if (this._settings.showSwingPoints) {
        for (const swing of this._swings) {
          const color = swing.type === 'high'
            ? this._settings.swingHighColor
            : this._settings.swingLowColor;

          const y = this._series!.priceToCoordinate(swing.price);
          if (y === null) continue;

          const x = timeScale.timeToCoordinate(swing.time as Time);
          if (x === null) continue;

          // Dot
          ctx.fillStyle = hexToRgba(color, 0.8);
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();

          // Label (HH/HL/LH/LL)
          ctx.fillStyle = hexToRgba(color, 0.9);
          ctx.font = '9px sans-serif';
          const labelY = swing.type === 'high' ? y - 6 : y + 12;
          ctx.fillText(swing.label, x - 6, labelY);
        }
      }
    });
  }

  private _getBreakColor(sb: StructureBreak): string {
    if (sb.type === 'bos') {
      return sb.direction === 'bullish'
        ? this._settings.bullishBOSColor
        : this._settings.bearishBOSColor;
    } else {
      return sb.direction === 'bullish'
        ? this._settings.bullishCHoCHColor
        : this._settings.bearishCHoCHColor;
    }
  }
}

class BOSPaneView implements IPrimitivePaneView {
  private _primitive: BOSPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: BOSPrimitive) {
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
    return new BOSRenderer(
      this._primitive.getBreaks(),
      this._primitive.getSwings(),
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class BOSPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: BOSPaneView[];
  private _breaks: StructureBreak[];
  private _swings: SwingPoint[];
  private _settings: BOSSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(breaks: StructureBreak[], swings: SwingPoint[], settings: BOSSettings) {
    this._breaks = breaks;
    this._swings = swings;
    this._settings = settings;
    this._paneViews = [new BOSPaneView(this)];
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

  getBreaks(): StructureBreak[] {
    return this._breaks;
  }

  getSwings(): SwingPoint[] {
    return this._swings;
  }

  getSettings(): BOSSettings {
    return this._settings;
  }

  update(breaks: StructureBreak[], swings: SwingPoint[], settings: BOSSettings) {
    this._breaks = breaks;
    this._swings = swings;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
