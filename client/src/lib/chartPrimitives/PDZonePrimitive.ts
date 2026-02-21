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
import type { PDZone, PDZoneSettings } from '@/types/liquidity';

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

class PDZoneRenderer implements IPrimitivePaneRenderer {
  private _zones: PDZone[];
  private _settings: PDZoneSettings;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;

  constructor(
    zones: PDZone[],
    settings: PDZoneSettings,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
  ) {
    this._zones = zones;
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

      for (const zone of this._zones) {
        const yHigh = this._series!.priceToCoordinate(zone.rangeHigh);
        const yEq = this._series!.priceToCoordinate(zone.equilibrium);
        const yLow = this._series!.priceToCoordinate(zone.rangeLow);
        if (yHigh === null || yEq === null || yLow === null) continue;

        // X coordinates: zone spans from startTime to current right edge
        const xStart = timeScale.timeToCoordinate(zone.startTime as Time) ?? 0;
        const xEnd = chartWidth;
        const width = Math.max(1, xEnd - xStart);

        // Premium zone: from rangeHigh down to equilibrium (upper half)
        if (this._settings.showPremium) {
          const premTop = Math.min(yHigh, yEq);
          const premH = Math.abs(yEq - yHigh);
          if (premH > 0) {
            ctx.fillStyle = hexToRgba(this._settings.premiumColor, this._settings.opacity);
            ctx.fillRect(xStart, premTop, width, premH);

            // Premium border (top line)
            ctx.strokeStyle = hexToRgba(this._settings.premiumColor, this._settings.opacity * 3);
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(xStart, yHigh);
            ctx.lineTo(xEnd, yHigh);
            ctx.stroke();

            if (this._settings.showLabels) {
              const label = 'Premium';
              ctx.font = 'bold 10px sans-serif';
              const textMetrics = ctx.measureText(label);
              const textWidth = textMetrics.width;
              const textHeight = 12;
              const padding = 4;

              // Position at right edge
              const labelX = xEnd - textWidth - padding * 2 - 4;

              // Dark background box
              ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
              ctx.fillRect(labelX, premTop + 2, textWidth + padding * 2, textHeight + padding);

              // White text
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.fillText(label, labelX + padding, premTop + 2 + textHeight);
            }
          }
        }

        // Discount zone: from equilibrium down to rangeLow (lower half)
        if (this._settings.showDiscount) {
          const discTop = Math.min(yEq, yLow);
          const discH = Math.abs(yLow - yEq);
          if (discH > 0) {
            ctx.fillStyle = hexToRgba(this._settings.discountColor, this._settings.opacity);
            ctx.fillRect(xStart, discTop, width, discH);

            // Discount border (bottom line)
            ctx.strokeStyle = hexToRgba(this._settings.discountColor, this._settings.opacity * 3);
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(xStart, yLow);
            ctx.lineTo(xEnd, yLow);
            ctx.stroke();

            if (this._settings.showLabels) {
              const label = 'Discount';
              ctx.font = 'bold 10px sans-serif';
              const textMetrics = ctx.measureText(label);
              const textWidth = textMetrics.width;
              const textHeight = 12;
              const padding = 4;

              // Position at right edge
              const labelX = xEnd - textWidth - padding * 2 - 4;
              const labelY = discTop + discH - textHeight - padding - 2;

              // Dark background box
              ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
              ctx.fillRect(labelX, labelY, textWidth + padding * 2, textHeight + padding);

              // White text
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.fillText(label, labelX + padding, labelY + textHeight);
            }
          }
        }

        // Equilibrium line at 50%
        if (this._settings.showEquilibrium) {
          ctx.strokeStyle = hexToRgba(this._settings.equilibriumColor, 0.75);
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(xStart, yEq);
          ctx.lineTo(xEnd, yEq);
          ctx.stroke();
          ctx.setLineDash([]);

          if (this._settings.showLabels) {
            const label = 'EQ 50%';
            ctx.font = '9px sans-serif';
            const textMetrics = ctx.measureText(label);
            const textWidth = textMetrics.width;
            const textHeight = 11;
            const padding = 3;

            // Position at right edge
            const labelX = xEnd - textWidth - padding * 2 - 4;
            const labelY = yEq - textHeight - 2;

            // Dark background box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fillRect(labelX, labelY, textWidth + padding * 2, textHeight + padding);

            // White text
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fillText(label, labelX + padding, labelY + textHeight - 1);
          }
        }
      }
    });
  }
}

class PDZonePaneView implements IPrimitivePaneView {
  private _primitive: PDZonePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: PDZonePrimitive) {
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
    return new PDZoneRenderer(
      this._primitive.getZones(),
      this._primitive.getSettings(),
      this._series,
      this._chart,
    );
  }
}

export class PDZonePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: PDZonePaneView[];
  private _zones: PDZone[];
  private _settings: PDZoneSettings;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(zones: PDZone[], settings: PDZoneSettings) {
    this._zones = zones;
    this._settings = settings;
    this._paneViews = [new PDZonePaneView(this)];
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

  getZones(): PDZone[] {
    return this._zones;
  }

  getSettings(): PDZoneSettings {
    return this._settings;
  }

  update(zones: PDZone[], settings: PDZoneSettings) {
    this._zones = zones;
    this._settings = settings;
    this._requestUpdate?.();
  }
}
