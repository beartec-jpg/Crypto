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
import type { CoinglassRange, LiquidityHeatmapData, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';
import { getRangeLabel } from '@/lib/liquidityTimeframeMapping';

type RequestUpdateCallback = () => void;
type StackSection = 'full' | 'top' | 'bottom';

function formatUsdCompact(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

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
  private _effectiveRange: CoinglassRange;
  private _stackSection: StackSection;
  private _profileSide: 'left' | 'right';
  private _profileWidthPercent: number;

  constructor(
    data: LiquidityHeatmapData | null,
    settings: LiquidityHeatmapSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    effectiveRange: CoinglassRange,
    stackSection: StackSection,
    profileSide: 'left' | 'right',
    profileWidthPercent: number,
  ) {
    this._data = data;
    this._settings = settings;
    this._series = series;
    this._chart = chart;
    this._effectiveRange = effectiveRange;
    this._stackSection = stackSection;
    this._profileSide = profileSide;
    this._profileWidthPercent = profileWidthPercent;
  }

  draw(target: any) {
    if (!this._series || !this._chart || !this._data) return;

    const { levels, totalLongLiquidation, totalShortLiquidation } = this._data;
    if (levels.length === 0) return;

    const aggregatedByPrice = new Map<number, { price: number; longValue: number; shortValue: number; totalValue: number }>();
    for (const level of levels) {
      const decimals = level.price >= 1000 ? 2 : 4;
      const key = Number(level.price.toFixed(decimals));
      const existing = aggregatedByPrice.get(key) ?? { price: key, longValue: 0, shortValue: 0, totalValue: 0 };
      if (level.side === 'long') {
        existing.longValue += level.liquidationValue;
      } else {
        existing.shortValue += level.liquidationValue;
      }
      existing.totalValue = existing.longValue + existing.shortValue;
      aggregatedByPrice.set(key, existing);
    }

    const profileLevels = Array.from(aggregatedByPrice.values()).sort((a, b) => a.price - b.price);
    if (profileLevels.length === 0) return;

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
      const profileWidth = Math.max(72, Math.min(220, Math.floor(chartWidth * (this._profileWidthPercent / 100))));
      const sidebarStart = this._profileSide === 'right' ? chartWidth - profileWidth : 0;
      const isSharedSidebar = this._stackSection !== 'full';
      const laneWidth = profileWidth;
      const laneStart = sidebarStart;
      const laneEnd = laneStart + laneWidth;
      const isRightSide = this._profileSide === 'right';

      const shouldDrawLevel = (levelIndex: number): boolean => {
        if (!isSharedSidebar) return true;
        const isEven = levelIndex % 2 === 0;
        return this._stackSection === 'top' ? isEven : !isEven;
      };

      if (this._settings.showHeatmap && (maxLong > 0 || maxShort > 0)) {
        const maxCombined = profileLevels.reduce((acc, level) => Math.max(acc, level.totalValue), 0);

        for (let levelIndex = 0; levelIndex < profileLevels.length; levelIndex++) {
          if (!shouldDrawLevel(levelIndex)) continue;
          const level = profileLevels[levelIndex];
          if (maxCombined <= 0 || level.totalValue <= 0) continue;

          const y = this._series!.priceToCoordinate(level.price);
          if (y === null) continue;

          const barHeight = 5;
          const totalRatio = level.totalValue / maxCombined;
          const barWidth = Math.max(1, Math.round(totalRatio * laneWidth));
          const barStartX = isRightSide ? laneEnd - barWidth : laneStart;

          const bearishRatio = level.totalValue > 0 ? level.longValue / level.totalValue : 0;
          const bullishRatio = level.totalValue > 0 ? level.shortValue / level.totalValue : 0;

          const bearishWidth = Math.round(barWidth * bearishRatio);
          const bullishWidth = Math.round(barWidth * bullishRatio);

          if (bearishWidth > 0 && longRgb) {
            ctx.fillStyle = `rgba(${longRgb.r}, ${longRgb.g}, ${longRgb.b}, ${(0.2 + totalRatio * opacity).toFixed(3)})`;
            ctx.fillRect(barStartX, y - barHeight / 2, bearishWidth, barHeight);
          }

          if (bullishWidth > 0 && shortRgb) {
            const bullishX = barStartX + bearishWidth;
            ctx.fillStyle = `rgba(${shortRgb.r}, ${shortRgb.g}, ${shortRgb.b}, ${(0.2 + totalRatio * opacity).toFixed(3)})`;
            ctx.fillRect(bullishX, y - barHeight / 2, bullishWidth, barHeight);
          }

          // Keep a subtle guide edge so bars feel like a profile column.
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(laneStart, y);
          ctx.lineTo(laneEnd, y);
          ctx.stroke();
        }

        const maxLevel = profileLevels.reduce((best, next) => (
          next.totalValue > best.totalValue ? next : best
        ));

        if (maxLevel && maxLevel.totalValue > 0) {
          const y = this._series!.priceToCoordinate(maxLevel.price);
          if (y !== null) {
            const markerWidth = Math.max(10, Math.round((maxLevel.totalValue / maxCombined) * laneWidth));
            const markerX = isRightSide ? laneEnd - markerWidth : laneStart;

            ctx.save();
            ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
            ctx.fillRect(markerX, y - 3, markerWidth, 6);

            const label = `MAX ${formatUsdCompact(maxLevel.totalValue)}`;
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = 'rgba(250, 204, 21, 1)';
            ctx.textAlign = isRightSide ? 'right' : 'left';
            const labelX = isRightSide ? laneEnd - 4 : laneStart + 4;
            ctx.fillText(label, labelX, y + 3);
            ctx.restore();
          }
        }
      }

      if (this._settings.showLiquidationLevels && !isSharedSidebar) {
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
          const tickWidth = Math.min(18, Math.max(8, Math.round(laneWidth * 0.08)));
          const tickX = isRightSide ? laneStart : laneEnd - tickWidth;
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`;
          ctx.fillRect(tickX, y - 1, tickWidth, 2);

          const sidePrefix = level.side === 'long' ? 'L' : 'S';
          const label = `${sidePrefix} ${formatUsdCompact(level.liquidationValue)}`;

          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = isRightSide ? 'right' : 'left';
          const labelX = isRightSide ? laneEnd - 4 : laneStart + 4;
          ctx.fillText(label, labelX, y + 3);
          ctx.restore();
        };

        for (const l of topLong) drawLine(l, longRgb);
        for (const l of topShort) drawLine(l, shortRgb);
      }

      if (isSharedSidebar) {
        ctx.save();
        const label = 'LIQ';
        const labelY = this._stackSection === 'bottom' ? 24 : 12;
        ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(label, laneStart + 4, labelY);
        ctx.restore();
      }

      // Range indicator badge in top-right corner
      if (this._settings.showRangeIndicator) {
        const badge = `PRED LIQ: ${getRangeLabel(this._effectiveRange)}`;
        ctx.save();
        ctx.font = 'bold 10px sans-serif';
        const textWidth = ctx.measureText(badge).width;
        const padding = 4;
        const badgeWidth = textWidth + padding * 2;
        const badgeHeight = 16;
        const x = isRightSide ? chartWidth - badgeWidth - 6 : 6;
        const y = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.roundRect(x, y, badgeWidth, badgeHeight, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(badge, x + padding, y + badgeHeight - 4);
        ctx.restore();
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
      this._primitive.getEffectiveRange(),
      this._primitive.getStackSection(),
      this._primitive.getProfileSide(),
      this._primitive.getProfileWidthPercent(),
    );
  }
}

export class LiquidityHeatmapPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: LiquidityHeatmapPaneView[];
  private _data: LiquidityHeatmapData | null;
  private _settings: LiquidityHeatmapSettings;
  private _effectiveRange: CoinglassRange;
  private _stackSection: StackSection;
  private _profileSide: 'left' | 'right';
  private _profileWidthPercent: number;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(
    data: LiquidityHeatmapData | null,
    settings: LiquidityHeatmapSettings,
    effectiveRange: CoinglassRange = '7d',
    stackSection: StackSection = 'full',
    profileSide: 'left' | 'right' = 'right',
    profileWidthPercent = 22,
  ) {
    this._data = data;
    this._settings = settings;
    this._effectiveRange = effectiveRange;
    this._stackSection = stackSection;
    this._profileSide = profileSide;
    this._profileWidthPercent = profileWidthPercent;
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

  getEffectiveRange(): CoinglassRange {
    return this._effectiveRange;
  }

  getStackSection(): StackSection {
    return this._stackSection;
  }

  getProfileSide(): 'left' | 'right' {
    return this._profileSide;
  }

  getProfileWidthPercent(): number {
    return this._profileWidthPercent;
  }

  update(
    data: LiquidityHeatmapData | null,
    settings: LiquidityHeatmapSettings,
    effectiveRange: CoinglassRange = '7d',
    stackSection: StackSection = 'full',
    profileSide: 'left' | 'right' = 'right',
    profileWidthPercent = 22,
  ) {
    this._data = data;
    this._settings = settings;
    this._effectiveRange = effectiveRange;
    this._stackSection = stackSection;
    this._profileSide = profileSide;
    this._profileWidthPercent = profileWidthPercent;
    this._requestUpdate?.();
  }
}
