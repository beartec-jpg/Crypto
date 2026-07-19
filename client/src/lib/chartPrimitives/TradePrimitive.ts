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

export interface ManualTrade {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  entryTime: number;
  closeTime?: number;
  outcome?: 'win' | 'loss' | 'manual';
}

type RequestUpdateCallback = () => void;

export const OPEN_TRADE_RIGHT_PADDING = 20;
export const MIN_OPEN_TRADE_WIDTH = 48;

export function getOpenTradeXEnd(
  xStart: number,
  xCurrent: number | null,
  chartWidth: number,
): number {
  const projectedXEnd = xCurrent !== null ? xCurrent + OPEN_TRADE_RIGHT_PADDING : null;
  const fallbackXEnd = chartWidth > xStart ? chartWidth : xStart + MIN_OPEN_TRADE_WIDTH;

  if (projectedXEnd !== null && projectedXEnd > xStart) {
    return projectedXEnd;
  }

  if (fallbackXEnd > xStart) {
    return fallbackXEnd;
  }

  return xStart + MIN_OPEN_TRADE_WIDTH;
}

class TradeRenderer implements IPrimitivePaneRenderer {
  private _trades: ManualTrade[];
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _currentTime: number;

  constructor(
    trades: ManualTrade[],
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    currentTime: number,
  ) {
    this._trades = trades;
    this._series = series;
    this._chart = chart;
    this._currentTime = currentTime;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const chartWidth: number = scope.mediaSize.width;
      const timeScale = this._chart!.timeScale();

      for (const trade of this._trades) {
        const xStart = timeScale.timeToCoordinate(trade.entryTime as Time);
        if (xStart === null) continue;

        // The right edge: if trade is closed use closeTime; otherwise extend to current candle or chart edge
        let xEnd: number;
        if (trade.closeTime) {
          const xClose = timeScale.timeToCoordinate(trade.closeTime as Time);
          xEnd = xClose !== null ? xClose : chartWidth;
        } else {
          // Extend past the current candle by a small padding so the zone right edge is
          // clearly visible beyond the latest candle body. If the latest candle time
          // is missing/stale after re-hydration, fall back to the chart edge instead
          // of collapsing the open trade to its entry candle.
          const xCurrent = timeScale.timeToCoordinate(this._currentTime as Time);
          xEnd = getOpenTradeXEnd(xStart, xCurrent, chartWidth);
        }

        const yEntry = this._series!.priceToCoordinate(trade.entryPrice);
        const yTp = this._series!.priceToCoordinate(trade.tpPrice);
        const ySl = this._series!.priceToCoordinate(trade.slPrice);

        if (yEntry === null || yTp === null || ySl === null) continue;

        const rectX = Math.min(xStart, xEnd);
        const rectW = Math.max(1, Math.abs(xEnd - xStart));

        // TP zone (green)
        const tpZoneTop = Math.min(yEntry, yTp);
        const tpZoneBottom = Math.max(yEntry, yTp);
        const tpZoneH = Math.max(1, tpZoneBottom - tpZoneTop);

        ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
        ctx.fillRect(rectX, tpZoneTop, rectW, tpZoneH);
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(rectX, tpZoneTop, rectW, tpZoneH);

        // SL zone (red)
        const slZoneTop = Math.min(yEntry, ySl);
        const slZoneBottom = Math.max(yEntry, ySl);
        const slZoneH = Math.max(1, slZoneBottom - slZoneTop);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(rectX, slZoneTop, rectW, slZoneH);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rectX, slZoneTop, rectW, slZoneH);

        // Entry line (white dashed)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(rectX, yEntry);
        ctx.lineTo(rectX + rectW, yEntry);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.font = 'bold 10px sans-serif';

        // TP label with % gain
        const risk = Math.abs(trade.entryPrice - trade.slPrice);
        const reward = Math.abs(trade.tpPrice - trade.entryPrice);
        const tpPct = trade.entryPrice > 0 ? (reward / trade.entryPrice) * 100 : 0;
        const tpPctSign = trade.direction === 'LONG' ? '+' : '-';
        const tpLabel = `TP ${trade.tpPrice}  ${tpPctSign}${tpPct.toFixed(2)}%`;
        const tpLabelY = tpZoneTop + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(rectX + 2, tpLabelY - 10, ctx.measureText(tpLabel).width + 6, 13);
        ctx.fillStyle = '#22c55e';
        ctx.fillText(tpLabel, rectX + 5, tpLabelY);

        // SL label
        const slLabel = `SL ${trade.slPrice}`;
        const slLabelY = slZoneBottom - 3;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(rectX + 2, slLabelY - 10, ctx.measureText(slLabel).width + 6, 13);
        ctx.fillStyle = '#ef4444';
        ctx.fillText(slLabel, rectX + 5, slLabelY);

        // Direction label at entry – placed near the right edge of the box so it
        // doesn't overlap the candles that are anchored to the left (activation) edge.
        const rr = risk > 0 ? (reward / risk).toFixed(1) : '—';
        const dirLabel = `${trade.direction} @ ${trade.entryPrice}  R/R ${rr}`;
        const dirLabelW = ctx.measureText(dirLabel).width + 6;
        const dirLabelX = Math.max(rectX + 2, rectX + rectW - dirLabelW - 4);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(dirLabelX, yEntry - 14, dirLabelW, 13);
        ctx.fillStyle = trade.outcome === 'win' ? '#22c55e' : trade.outcome === 'loss' ? '#ef4444' : trade.outcome === 'manual' ? '#a78bfa' : '#ffffff';
        ctx.fillText(dirLabel, dirLabelX + 3, yEntry - 3);
      }
    });
  }
}

class TradePaneView implements IPrimitivePaneView {
  private _source: TradePrimitive;

  constructor(source: TradePrimitive) {
    this._source = source;
  }

  renderer(): IPrimitivePaneRenderer {
    return new TradeRenderer(
      this._source.trades,
      this._source.series,
      this._source.chart,
      this._source.currentTime,
    );
  }

  zOrder(): 'top' {
    return 'top';
  }
}

export class TradePrimitive implements ISeriesPrimitive<Time> {
  trades: ManualTrade[] = [];
  series: ISeriesApi<SeriesType> | null = null;
  chart: IChartApi | null = null;
  currentTime: number = 0;

  private _paneViews: TradePaneView[];
  private _requestUpdate?: RequestUpdateCallback;

  constructor(trades: ManualTrade[], currentTime: number) {
    this.trades = trades;
    this.currentTime = currentTime;
    this._paneViews = [new TradePaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.series = param.series as unknown as ISeriesApi<SeriesType>;
    this.chart = param.chart as unknown as IChartApi;
    this._requestUpdate = param.requestUpdate;
    this._requestUpdate?.();
  }

  detached() {
    this.series = null;
    this.chart = null;
    this._requestUpdate = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  update(trades: ManualTrade[], currentTime: number) {
    this.trades = trades;
    this.currentTime = currentTime;
    this._requestUpdate?.();
  }
}
