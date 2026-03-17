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
import type { VolumeProfileData, VolumeProfileSettings } from '@/types/volumeProfile';

type RequestUpdateCallback = () => void;

type StackSection = 'full' | 'top' | 'bottom';

class VolumeProfileRenderer implements IPrimitivePaneRenderer {
  private _data: VolumeProfileData;
  private _settings: VolumeProfileSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _stackSection: StackSection;

  constructor(
    data: VolumeProfileData,
    settings: VolumeProfileSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    stackSection: StackSection,
  ) {
    this._data = data;
    this._settings = settings;
    this._series = series;
    this._chart = chart;
    this._stackSection = stackSection;
  }

  draw(target: any) {
    if (!this._series || !this._chart || !this._data) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;

      const vpWidth = chartWidth * (this._settings.width / 100);
      const isSharedSidebar = this._stackSection !== 'full';
      const laneWidth = vpWidth;
      const effectivePosition = this._settings.position;
      const sidebarStart = effectivePosition === 'right' ? chartWidth - vpWidth : 0;
      const xStart = sidebarStart;

      const shouldDrawRow = (rowIndex: number): boolean => {
        if (!isSharedSidebar) return true;
        const isEven = rowIndex % 2 === 0;
        return this._stackSection === 'top' ? isEven : !isEven;
      };

      const maxVolume = Math.max(...this._data.rows.map(r => r.volume));
      if (maxVolume === 0) return;

      const priceStep = this._data.rows.length > 1
        ? this._data.rows[1].price - this._data.rows[0].price
        : 0;

      // Helper function to format volume numbers
      const formatVolume = (vol: number): string => {
        if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        return vol.toFixed(0);
      };

      // Draw histogram bars
      for (let rowIndex = 0; rowIndex < this._data.rows.length; rowIndex++) {
        if (!shouldDrawRow(rowIndex)) continue;
        const row = this._data.rows[rowIndex];
        const yBottom = this._series!.priceToCoordinate(row.price);
        const yTop = priceStep > 0
          ? this._series!.priceToCoordinate(row.price + priceStep)
          : null;

        if (yBottom === null) continue;
        const barHeight = yTop !== null ? Math.abs(yTop - yBottom) : 4;
        const yDraw = yTop !== null ? Math.min(yTop, yBottom) : yBottom - 2;

        const barWidth = (row.volume / maxVolume) * laneWidth;

        // Determine color
        let color = this._settings.volumeColor;
        if (this._settings.showDelta) {
          color = row.delta >= 0 ? this._settings.buyColor : this._settings.sellColor;
        }

        // Highlight POC row
        const isPOC = row.price === this._data.poc || (priceStep > 0 && Math.abs(row.price - this._data.poc) < priceStep * 0.1);
        if (isPOC) {
          color = this._settings.pocColor;
        }

        const barStartX = effectivePosition === 'right'
          ? xStart + laneWidth - barWidth
          : xStart;

        ctx.fillStyle = color;
        ctx.fillRect(barStartX, yDraw, barWidth, Math.max(barHeight - 1, 1));

        // Draw volume text label
        if (barWidth > 30 && barHeight > 10) {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = '9px sans-serif';
          ctx.textAlign = effectivePosition === 'right' ? 'right' : 'left';
          const textX = effectivePosition === 'right'
            ? barStartX + barWidth - 3
            : barStartX + 3;
          const textY = yDraw + barHeight / 2 + 3;
          ctx.fillText(formatVolume(row.volume), textX, textY);
          ctx.restore();
        }
      }

      // Draw POC line
      if (this._settings.showPOC) {
        const pocY = this._series!.priceToCoordinate(this._data.poc);
        if (pocY !== null) {
          ctx.save();
          ctx.strokeStyle = this._settings.pocColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, pocY);
          ctx.lineTo(chartWidth, pocY);
          ctx.stroke();
          ctx.setLineDash([]);

          if (this._settings.showLabels) {
            ctx.fillStyle = this._settings.pocColor;
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('POC', xStart + 4, pocY - 4);
          }
          ctx.restore();
        }
      }

      // Draw Value Area lines
      if (this._settings.showValueArea) {
        const vahY = this._series!.priceToCoordinate(this._data.vahPrice);
        const valY = this._series!.priceToCoordinate(this._data.valPrice);

        if (vahY !== null) {
          ctx.save();
          ctx.strokeStyle = this._settings.vahColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(0, vahY);
          ctx.lineTo(chartWidth, vahY);
          ctx.stroke();
          ctx.setLineDash([]);
          if (this._settings.showLabels) {
            ctx.fillStyle = this._settings.vahColor;
            ctx.font = '9px sans-serif';
            ctx.fillText('VAH', xStart + 4, vahY - 3);
          }
          ctx.restore();
        }

        if (valY !== null) {
          ctx.save();
          ctx.strokeStyle = this._settings.valColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(0, valY);
          ctx.lineTo(chartWidth, valY);
          ctx.stroke();
          ctx.setLineDash([]);
          if (this._settings.showLabels) {
            ctx.fillStyle = this._settings.valColor;
            ctx.font = '9px sans-serif';
            ctx.fillText('VAL', xStart + 4, valY + 10);
          }
          ctx.restore();
        }
      }

      if (isSharedSidebar) {
        ctx.save();
        const label = 'VOL';
        const labelY = this._stackSection === 'top' ? 12 : 24;
        ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(label, xStart + 4, labelY);
        ctx.restore();
      }
    });
  }
}

class VolumeProfilePaneView implements IPrimitivePaneView {
  private _primitive: VolumeProfilePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: VolumeProfilePrimitive) {
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
    if (!data) return null;
    return new VolumeProfileRenderer(
      data,
      this._primitive.getSettings(),
      this._series,
      this._chart,
      this._primitive.getStackSection(),
    );
  }
}

export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: VolumeProfilePaneView[];
  private _data: VolumeProfileData | null;
  private _settings: VolumeProfileSettings;
  private _stackSection: StackSection;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(data: VolumeProfileData | null, settings: VolumeProfileSettings, stackSection: StackSection = 'full') {
    this._data = data;
    this._settings = settings;
    this._stackSection = stackSection;
    this._paneViews = [new VolumeProfilePaneView(this)];
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

  getData(): VolumeProfileData | null {
    return this._data;
  }

  getSettings(): VolumeProfileSettings {
    return this._settings;
  }

  getStackSection(): StackSection {
    return this._stackSection;
  }

  update(data: VolumeProfileData | null, settings: VolumeProfileSettings, stackSection: StackSection = 'full') {
    this._data = data;
    this._settings = settings;
    this._stackSection = stackSection;
    this._requestUpdate?.();
  }
}
