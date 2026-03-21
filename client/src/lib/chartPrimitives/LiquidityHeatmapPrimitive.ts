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

type RequestUpdateCallback = () => void;
type StackSection = 'full' | 'top' | 'bottom';

function formatUsdCompact(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
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

    const fallbackTargets = this._data.levels
      .map((level) => ({ ...level, type: level.type ?? 'secondary' as const, score: level.score ?? 50 }));
    const targetLevels = (this._data.targetLevels && this._data.targetLevels.length > 0)
      ? this._data.targetLevels
      : fallbackTargets;
    if (targetLevels.length === 0) return;

    const primaryTarget = targetLevels.find((l) => l.type === 'primary') || targetLevels[0];
    const secondaryTarget = targetLevels.find((l) => l.type === 'secondary') || targetLevels[1] || null;
    const directionScore = Number(this._data.directionScore ?? primaryTarget.score ?? 50);

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;
      const chartHeight: number = scope.mediaSize.height;
      const profileWidth = Math.max(72, Math.min(220, Math.floor(chartWidth * (this._profileWidthPercent / 100))));
      const sidebarStart = this._profileSide === 'right' ? chartWidth - profileWidth : 0;
      const isSharedSidebar = this._stackSection !== 'full';
      const laneWidth = profileWidth;
      const laneStart = sidebarStart;
      const laneEnd = laneStart + laneWidth;
      const isRightSide = this._profileSide === 'right';

      const drawPrimaryTarget = () => {
        const y = this._series!.priceToCoordinate(primaryTarget.price);
        if (y === null) return;

        const zoneRadius = 24;
        const glow = ctx.createLinearGradient(0, y - zoneRadius, 0, y + zoneRadius);
        glow.addColorStop(0, 'rgba(250, 204, 21, 0)');
        glow.addColorStop(0.35, 'rgba(250, 204, 21, 0.16)');
        glow.addColorStop(0.65, 'rgba(250, 204, 21, 0.16)');
        glow.addColorStop(1, 'rgba(250, 204, 21, 0)');

        ctx.save();
        ctx.fillStyle = glow;
        ctx.fillRect(laneStart, y - zoneRadius, laneWidth, zoneRadius * 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.94)';
        ctx.fillRect(laneStart, y - 4, laneWidth, 8);
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
        ctx.lineWidth = 1;
        ctx.strokeRect(laneStart, y - 4, laneWidth, 8);

        const arrow = primaryTarget.side === 'long' ? '▼' : '▲';
        const label = `${arrow} LIQ TARGET ${formatUsdCompact(primaryTarget.liquidationValue)}`;
        ctx.font = 'bold 9px sans-serif';
        const textWidth = ctx.measureText(label).width;
        const textPaddingX = 4;
        const textPaddingY = 2;
        const textHeight = 11;
        const rawLabelY = y - 7;
        const labelY = Math.max(textHeight + 2, Math.min(chartHeight - 4, rawLabelY));
        const textX = isRightSide ? laneEnd - 4 : laneStart + 4;
        const bgWidth = textWidth + textPaddingX * 2;
        const bgHeight = textHeight + textPaddingY * 2;
        const bgX = isRightSide ? textX - textWidth - textPaddingX : textX - textPaddingX;
        const bgY = labelY - textHeight;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(bgX, bgY - textPaddingY, bgWidth, bgHeight);
        ctx.fillStyle = 'rgba(254, 243, 199, 0.98)';
        ctx.textAlign = isRightSide ? 'right' : 'left';
        ctx.fillText(label, textX, labelY);
        ctx.restore();
      };

      const drawSecondaryTarget = () => {
        if (!secondaryTarget) return;
        const y = this._series!.priceToCoordinate(secondaryTarget.price);
        if (y === null) return;

        const width = Math.round(laneWidth * 0.75);
        const x = isRightSide ? laneEnd - width : laneStart;

        ctx.save();
        ctx.fillStyle = 'rgba(45, 212, 191, 0.58)';
        ctx.fillRect(x, y - 2, width, 4);
        ctx.strokeStyle = 'rgba(153, 246, 228, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y - 2, width, 4);

        const arrow = secondaryTarget.side === 'short' ? '▲' : '▼';
        const sideCode = secondaryTarget.side === 'short' ? 'S' : 'L';
        const label = `${arrow} ${sideCode} ${formatUsdCompact(secondaryTarget.liquidationValue)}`;
        ctx.font = 'bold 9px sans-serif';
        const textWidth = ctx.measureText(label).width;
        const rawLabelY = y - 5;
        const labelY = Math.max(11, Math.min(chartHeight - 4, rawLabelY));
        const textX = isRightSide ? laneEnd - 4 : laneStart + 4;
        const bgWidth = textWidth + 8;
        const bgHeight = 15;
        const bgX = isRightSide ? textX - textWidth - 4 : textX - 4;
        const bgY = labelY - 11;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
        ctx.fillStyle = 'rgba(153, 246, 228, 0.92)';
        ctx.textAlign = isRightSide ? 'right' : 'left';
        ctx.fillText(label, textX, labelY);
        ctx.restore();
      };

      drawPrimaryTarget();
      drawSecondaryTarget();

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
        const longPressure = directionScore >= 50;
        const pressurePct = longPressure ? directionScore : (100 - directionScore);
        const badge = `LIQ PRESSURE: ${pressurePct.toFixed(0)}% ${longPressure ? 'LONG ▼' : 'SHORT ▲'}`;
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
