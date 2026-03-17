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
import type { LiquidityHeatmapData, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';

type RequestUpdateCallback = () => void;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

class LiquidityHeatmapPaneRenderer implements IPrimitivePaneRenderer {
  private _data: LiquidityHeatmapData | null;
  private _settings: LiquidityHeatmapSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    data: LiquidityHeatmapData | null,
    settings: LiquidityHeatmapSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._data = data;
    this._settings = settings;
    this._series = series;
    this._chart = chart;
  }

  draw(target: any) {
    if (!this._series || !this._chart || !this._data) return;

    const { levels, totalLongLiquidation, totalShortLiquidation } = this._data;
    if (levels.length === 0) return;

    const opacity = this._settings.opacity / 100;

    const longRgb = hexToRgb(this._settings.longLiquidationColor);
    const shortRgb = hexToRgb(this._settings.shortLiquidationColor);

    const maxLong = totalLongLiquidation;
    const maxShort = totalShortLiquidation;

    // Compute the max single-level value per side for intensity scaling
    const maxLongLevel = levels
      .filter((l) => l.side === 'long')
      .reduce((acc, l) => Math.max(acc, l.liquidationValue), 0);
    const maxShortLevel = levels
      .filter((l) => l.side === 'short')
      .reduce((acc, l) => Math.max(acc, l.liquidationValue), 0);

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;

      if (this._settings.showHeatmap && (maxLong > 0 || maxShort > 0)) {
        for (const level of levels) {
          const y = this._series!.priceToCoordinate(level.price);
          if (y === null) continue;

          const isLong = level.side === 'long';
          const rgb = isLong ? longRgb : shortRgb;
          if (!rgb) continue;

          const maxSide = isLong ? maxLongLevel : maxShortLevel;
          if (maxSide === 0) continue;

          const intensity = (level.liquidationValue / maxSide) * opacity;
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${intensity.toFixed(3)})`;
          ctx.fillRect(0, y - 2, chartWidth, 4);
        }
      }

      if (this._settings.showLiquidationLevels) {
        // Draw lines at top 5 levels per side
        const topLong = levels
          .filter((l) => l.side === 'long')
          .sort((a, b) => b.liquidationValue - a.liquidationValue)
          .slice(0, 5);

        const topShort = levels
          .filter((l) => l.side === 'short')
          .sort((a, b) => b.liquidationValue - a.liquidationValue)
          .slice(0, 5);

        const drawLine = (level: typeof levels[0], rgb: { r: number; g: number; b: number } | null) => {
          if (!rgb) return;
          const y = this._series!.priceToCoordinate(level.price);
          if (y === null) return;

          ctx.save();
          ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label with USD value
          const usd = level.liquidationValue;
          const label = usd >= 1e9
            ? `$${(usd / 1e9).toFixed(1)}B`
            : usd >= 1e6
              ? `$${(usd / 1e6).toFixed(1)}M`
              : usd >= 1e3
                ? `$${(usd / 1e3).toFixed(1)}K`
                : `$${usd.toFixed(0)}`;

          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(label, 4, y - 3);
          ctx.restore();
        };

        for (const l of topLong) drawLine(l, longRgb);
        for (const l of topShort) drawLine(l, shortRgb);
      }
    });
  }
}

class LiquidityHeatmapPaneView implements IPrimitivePaneView {
  private _primitive: LiquidityHeatmapPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: LiquidityHeatmapPrimitive) {
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
    const data = this._primitive.getData();
    return new LiquidityHeatmapPaneRenderer(
      data,
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class LiquidityHeatmapPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: LiquidityHeatmapPaneView[];
  private _data: LiquidityHeatmapData | null;
  private _settings: LiquidityHeatmapSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(data: LiquidityHeatmapData | null, settings: LiquidityHeatmapSettings) {
    this._data = data;
    this._settings = settings;
    this._paneViews = [new LiquidityHeatmapPaneView(this)];
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

  getData(): LiquidityHeatmapData | null {
    return this._data;
  }

  getSettings(): LiquidityHeatmapSettings {
    return this._settings;
  }

  update(data: LiquidityHeatmapData | null, settings: LiquidityHeatmapSettings) {
    this._data = data;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
