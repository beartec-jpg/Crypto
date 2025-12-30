import type { 
  ISeriesPrimitive, 
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType
} from 'lightweight-charts';

interface DrawingPoint {
  time: number;
  price: number;
  snapType?: 'high' | 'low' | 'none';
}

interface DrawingStyle {
  color: string;
  lineWidth?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
  labelPosition?: 'left' | 'right';
  hiddenLevels?: number[];
  customLabels?: Record<number, string>;
  customValues?: Record<number, number>;
}

type RequestUpdateCallback = () => void;

class TrendLineRenderer implements IPrimitivePaneRenderer {
  private _point1: DrawingPoint;
  private _point2: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    point1: DrawingPoint,
    point2: DrawingPoint,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._point1 = point1;
    this._point2 = point2;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();
    const x1Raw = timeScale.timeToCoordinate(this._point1.time as Time);
    const y1 = this._series.priceToCoordinate(this._point1.price);
    const x2Raw = timeScale.timeToCoordinate(this._point2.time as Time);
    const y2 = this._series.priceToCoordinate(this._point2.price);

    // Need at least y coordinates to calculate slope
    if (y1 === null || y2 === null) return;
    // Need at least one x coordinate unless extending both ways
    if (x1Raw === null && x2Raw === null && !this._style.extendLeft && !this._style.extendRight) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;
      
      // Handle extend left/right from style
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight ?? false;
      
      // Calculate base coordinates
      const x1 = x1Raw ?? 0;
      const x2 = x2Raw ?? chartWidth;
      
      // Calculate line extension if needed
      let drawX1 = x1;
      let drawY1 = y1;
      let drawX2 = x2;
      let drawY2 = y2;
      
      if (extendLeft || extendRight) {
        // Calculate slope
        const dx = x2 - x1;
        const dy = y2 - y1;
        
        if (dx !== 0) {
          const slope = dy / dx;
          
          if (extendLeft) {
            drawX1 = 0;
            drawY1 = y1 - slope * x1;
          }
          if (extendRight) {
            drawX2 = chartWidth;
            drawY2 = y1 + slope * (chartWidth - x1);
          }
        }
      }
      
      ctx.beginPath();
      ctx.strokeStyle = this._style.color;
      ctx.lineWidth = this._style.lineWidth || 2;
      ctx.moveTo(drawX1, drawY1);
      ctx.lineTo(drawX2, drawY2);
      ctx.stroke();

      // Draw selection handles at original points (not extended edges)
      if (this._isSelected) {
        ctx.fillStyle = '#22c55e';
        if (x1Raw !== null) {
          ctx.beginPath();
          ctx.arc(x1Raw, y1, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (x2Raw !== null) {
          ctx.beginPath();
          ctx.arc(x2Raw, y2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class TrendLinePaneView implements IPrimitivePaneView {
  private _primitive: TrendLinePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: TrendLinePrimitive) {
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
    const points = this._primitive.getPoints();
    return new TrendLineRenderer(
      points[0],
      points[1],
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: TrendLinePaneView[];
  private _points: DrawingPoint[];
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _selected: boolean = false;
  private _id: string;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(id: string, points: DrawingPoint[], style: DrawingStyle) {
    this._id = id;
    this._points = points;
    this._style = style;
    this._paneViews = [new TrendLinePaneView(this)];
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

  getId() { return this._id; }
  getPoints() { return this._points; }
  getStyle() { return this._style; }
  isSelected() { return this._selected; }

  setSelected(selected: boolean) {
    this._selected = selected;
    this._requestUpdate?.();
  }

  updatePoints(points: DrawingPoint[]) {
    this._points = points;
    this._requestUpdate?.();
  }

  updateStyle(style: DrawingStyle) {
    this._style = style;
    this._requestUpdate?.();
  }
}

class HorizontalLineRenderer implements IPrimitivePaneRenderer {
  private _price: number;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;
  private _time: number;

  constructor(
    price: number,
    time: number,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._price = price;
    this._time = time;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    const y = this._series.priceToCoordinate(this._price);
    if (y === null) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const width = scope.mediaSize.width;
      
      ctx.beginPath();
      ctx.strokeStyle = this._style.color;
      ctx.lineWidth = this._style.lineWidth || 2;
      ctx.setLineDash([5, 5]);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      if (this._isSelected) {
        const timeScale = this._chart!.timeScale();
        const x = timeScale.timeToCoordinate(this._time as Time);
        if (x !== null) {
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class HorizontalLinePaneView implements IPrimitivePaneView {
  private _primitive: HorizontalLinePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: HorizontalLinePrimitive) {
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
    const point = this._primitive.getPoint();
    return new HorizontalLineRenderer(
      point.price,
      point.time,
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class HorizontalLinePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: HorizontalLinePaneView[];
  private _point: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _selected: boolean = false;
  private _id: string;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(id: string, point: DrawingPoint, style: DrawingStyle) {
    this._id = id;
    this._point = point;
    this._style = style;
    this._paneViews = [new HorizontalLinePaneView(this)];
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

  getId() { return this._id; }
  getPoint() { return this._point; }
  getStyle() { return this._style; }
  isSelected() { return this._selected; }

  setSelected(selected: boolean) {
    this._selected = selected;
    this._requestUpdate?.();
  }

  updatePoint(point: DrawingPoint) {
    this._point = point;
    this._requestUpdate?.();
  }

  updateStyle(style: DrawingStyle) {
    this._style = style;
    this._requestUpdate?.();
  }
}

class RectangleRenderer implements IPrimitivePaneRenderer {
  private _point1: DrawingPoint;
  private _point2: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    point1: DrawingPoint,
    point2: DrawingPoint,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._point1 = point1;
    this._point2 = point2;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();
    const x1Raw = timeScale.timeToCoordinate(this._point1.time as Time);
    const y1 = this._series.priceToCoordinate(this._point1.price);
    const x2Raw = timeScale.timeToCoordinate(this._point2.time as Time);
    const y2 = this._series.priceToCoordinate(this._point2.price);

    // Need at least y coordinates to render
    if (y1 === null || y2 === null) return;
    // Need at least one x coordinate unless extending both ways
    if (x1Raw === null && x2Raw === null && !this._style.extendLeft && !this._style.extendRight) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;
      
      // Handle extend left/right from style
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight ?? false;
      
      // Calculate base coordinates
      const x1 = x1Raw ?? 0;
      const x2 = x2Raw ?? chartWidth;
      
      // Determine drawing bounds based on extension
      const rectLeft = extendLeft ? 0 : Math.min(x1, x2);
      const rectRight = extendRight ? chartWidth : Math.max(x1, x2);
      
      const top = Math.min(y1, y2);
      const width = rectRight - rectLeft;
      const height = Math.abs(y2 - y1);

      ctx.fillStyle = this._style.color.replace(')', ', 0.2)').replace('rgb', 'rgba').replace('hsl', 'hsla');
      if (this._style.color.startsWith('#')) {
        const hex = this._style.color;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
      }
      ctx.fillRect(rectLeft, top, width, height);

      ctx.strokeStyle = this._style.color;
      ctx.lineWidth = this._style.lineWidth || 2;
      ctx.strokeRect(rectLeft, top, width, height);

      // Draw selection handles at original points (not extended edges)
      if (this._isSelected) {
        ctx.fillStyle = '#22c55e';
        if (x1Raw !== null) {
          ctx.beginPath();
          ctx.arc(x1Raw, y1, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (x2Raw !== null) {
          ctx.beginPath();
          ctx.arc(x2Raw, y2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class RectanglePaneView implements IPrimitivePaneView {
  private _primitive: RectanglePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: RectanglePrimitive) {
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
    const points = this._primitive.getPoints();
    return new RectangleRenderer(
      points[0],
      points[1],
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class RectanglePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: RectanglePaneView[];
  private _points: DrawingPoint[];
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _selected: boolean = false;
  private _id: string;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(id: string, points: DrawingPoint[], style: DrawingStyle) {
    this._id = id;
    this._points = points;
    this._style = style;
    this._paneViews = [new RectanglePaneView(this)];
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

  getId() { return this._id; }
  getPoints() { return this._points; }
  getStyle() { return this._style; }
  isSelected() { return this._selected; }

  setSelected(selected: boolean) {
    this._selected = selected;
    this._requestUpdate?.();
  }

  updatePoints(points: DrawingPoint[]) {
    this._points = points;
    this._requestUpdate?.();
  }

  updateStyle(style: DrawingStyle) {
    this._style = style;
    this._requestUpdate?.();
  }
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
const FIB_COLORS: Record<number, string> = {
  0: '#787b86',
  0.236: '#f7525f',
  0.382: '#ff9800',
  0.5: '#4caf50',
  0.618: '#2196f3',
  0.786: '#9c27b0',
  1: '#787b86',
  1.272: '#00bcd4',
  1.618: '#e91e63'
};

class FibRetracementRenderer implements IPrimitivePaneRenderer {
  private _point1: DrawingPoint;
  private _point2: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    point1: DrawingPoint,
    point2: DrawingPoint,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._point1 = point1;
    this._point2 = point2;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();
    const x1Raw = timeScale.timeToCoordinate(this._point1.time as Time);
    const x2Raw = timeScale.timeToCoordinate(this._point2.time as Time);

    // Need at least one valid x coordinate to render
    if (x1Raw === null && x2Raw === null) return;

    const priceDiff = this._point2.price - this._point1.price;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;
      
      // Handle extend left/right from style
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight ?? false;
      
      // Calculate base coordinates
      const x1 = x1Raw ?? 0;
      const x2 = x2Raw ?? chartWidth;
      
      // Determine drawing bounds based on extension
      const anchorLeft = Math.min(x1, x2);
      const anchorRight = Math.max(x1, x2);
      const lineLeft = extendLeft ? 0 : anchorLeft;
      const lineRight = extendRight ? chartWidth : anchorRight;
      const isRightLabel = this._style.labelPosition === 'right';
      // Labels go on the extended line edge if extended, otherwise on anchor point
      const labelX = isRightLabel ? lineRight - 5 : lineLeft + 5;
      // Only show labels if the original anchor points are visible on chart
      const anchorsVisible = anchorLeft <= chartWidth && anchorRight >= 0;
      const showLabels = anchorsVisible;

      const hiddenLevels = this._style.hiddenLevels || [];
      const customValues = this._style.customValues || {};
      
      FIB_LEVELS.forEach((level) => {
        // Skip hidden levels - use tolerance comparison for float precision
        if (hiddenLevels.some((h: number) => Math.abs(h - level) < 0.0001)) return;
        
        // Use custom value if set, otherwise use default level
        const actualLevel = customValues[level] !== undefined ? customValues[level] : level;
        
        // For retracements: 0% at end of move (point2), 100% at start (point1)
        const levelPrice = this._point2.price - priceDiff * actualLevel;
        const y = this._series!.priceToCoordinate(levelPrice);
        if (y === null) return;

        const color = FIB_COLORS[level] || this._style.color;
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(level === 0 || level === 1 ? [] : [3, 3]);
        ctx.moveTo(lineLeft, y);
        ctx.lineTo(lineRight, y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (showLabels) {
          const customLabels = this._style.customLabels || {};
          const customLabel = customLabels[level];
          // Show actual level value used (custom or default) in label
          const displayLevel = customValues[level] !== undefined ? customValues[level] : level;
          const labelText = customLabel || `${(displayLevel * 100).toFixed(1)}% (${levelPrice.toFixed(2)})`;
          ctx.font = '11px sans-serif';
          const textMetrics = ctx.measureText(labelText);
          const textHeight = 12;
          const padding = 2;
          
          const bgX = isRightLabel ? labelX - textMetrics.width - padding : labelX - padding;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(bgX, y - textHeight + 2, textMetrics.width + padding * 2, textHeight + padding);
          
          ctx.fillStyle = color;
          ctx.textAlign = isRightLabel ? 'right' : 'left';
          ctx.fillText(labelText, labelX, y + 4);
          ctx.textAlign = 'left';
        }
      });

      // Draw the diagonal anchor line (very transparent when not selected)
      const y1 = this._series!.priceToCoordinate(this._point1.price);
      const y2 = this._series!.priceToCoordinate(this._point2.price);
      if (y1 !== null && y2 !== null && x1Raw !== null && x2Raw !== null) {
        ctx.beginPath();
        ctx.strokeStyle = this._isSelected ? '#22c55e' : 'rgba(136, 136, 136, 0.15)';
        ctx.lineWidth = this._isSelected ? 2 : 1;
        ctx.setLineDash([4, 2]);
        ctx.moveTo(x1Raw, y1);
        ctx.lineTo(x2Raw, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw selection handles
      if (this._isSelected && y1 !== null && y2 !== null) {
        ctx.fillStyle = '#22c55e';
        if (x1Raw !== null) {
          ctx.beginPath();
          ctx.arc(x1Raw, y1, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (x2Raw !== null) {
          ctx.beginPath();
          ctx.arc(x2Raw, y2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class FibRetracementPaneView implements IPrimitivePaneView {
  private _primitive: FibRetracementPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: FibRetracementPrimitive) {
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
    const points = this._primitive.getPoints();
    return new FibRetracementRenderer(
      points[0],
      points[1],
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class FibRetracementPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: FibRetracementPaneView[];
  private _points: DrawingPoint[];
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _selected: boolean = false;
  private _id: string;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(id: string, points: DrawingPoint[], style: DrawingStyle) {
    this._id = id;
    this._points = points;
    this._style = style;
    this._paneViews = [new FibRetracementPaneView(this)];
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

  getId() { return this._id; }
  getPoints() { return this._points; }
  getStyle() { return this._style; }
  isSelected() { return this._selected; }

  setSelected(selected: boolean) {
    this._selected = selected;
    this._requestUpdate?.();
  }

  updatePoints(points: DrawingPoint[]) {
    this._points = points;
    this._requestUpdate?.();
  }

  updateStyle(style: DrawingStyle) {
    this._style = style;
    this._requestUpdate?.();
  }
}

const TREND_FIB_LEVELS = [0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618, 3.618, 4.236];
const TREND_FIB_COLORS: Record<number, string> = {
  0.382: '#ff9800',
  0.5: '#8bc34a',
  0.618: '#2196f3',
  0.786: '#00bcd4',
  1.0: '#787b86',
  1.272: '#00bcd4',
  1.618: '#e91e63',
  2.0: '#9c27b0',
  3.618: '#673ab7',
  4.236: '#3f51b5',
  2.618: '#ff9800'
};

class TrendFibRenderer implements IPrimitivePaneRenderer {
  private _points: DrawingPoint[];
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    points: DrawingPoint[],
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._points = points;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart || this._points.length < 3) return;

    const timeScale = this._chart.timeScale();
    const x1Raw = timeScale.timeToCoordinate(this._points[0].time as Time);
    const x2Raw = timeScale.timeToCoordinate(this._points[1].time as Time);
    const x3Raw = timeScale.timeToCoordinate(this._points[2].time as Time);

    if (x3Raw === null) return;

    const waveDiff = this._points[1].price - this._points[0].price;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;
      
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight ?? false;
      
      const baseStartX = x3Raw;
      const baseEndX = x3Raw + 200;
      const lineLeft = extendLeft ? 0 : baseStartX;
      const lineRight = extendRight ? chartWidth : baseEndX;
      const isRightLabel = this._style.labelPosition === 'right';
      // Labels go on the extended line edge if extended, otherwise on base area
      const labelX = isRightLabel ? lineRight - 5 : lineLeft + 5;
      // Only show labels if the original anchor points are visible on chart
      const anchorsVisible = baseStartX <= chartWidth && baseEndX >= 0;
      const showLabels = anchorsVisible;

      const hiddenLevels = this._style.hiddenLevels || [];
      const customValues = this._style.customValues || {};
      
      TREND_FIB_LEVELS.forEach((level) => {
        // Skip hidden levels - use tolerance comparison for float precision
        if (hiddenLevels.some((h: number) => Math.abs(h - level) < 0.0001)) return;
        
        // Use custom value if set, otherwise use default level
        const actualLevel = customValues[level] !== undefined ? customValues[level] : level;
        
        const levelPrice = this._points[2].price + waveDiff * actualLevel;
        const y = this._series!.priceToCoordinate(levelPrice);
        if (y === null) return;

        const color = TREND_FIB_COLORS[level] || this._style.color;
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(level === 1.0 ? [] : [3, 3]);
        ctx.moveTo(lineLeft, y);
        ctx.lineTo(lineRight, y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (showLabels) {
          const customLabels = this._style.customLabels || {};
          const customLabel = customLabels[level];
          // Show actual level value used (custom or default) in label
          const displayLevel = customValues[level] !== undefined ? customValues[level] : level;
          const labelText = customLabel || `${(displayLevel * 100).toFixed(1)}% (${levelPrice.toFixed(2)})`;
          ctx.font = '11px sans-serif';
          const textMetrics = ctx.measureText(labelText);
          const textHeight = 12;
          const padding = 2;
          
          const bgX = isRightLabel ? labelX - textMetrics.width - padding : labelX - padding;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(bgX, y - textHeight + 2, textMetrics.width + padding * 2, textHeight + padding);
          
          ctx.fillStyle = color;
          ctx.textAlign = isRightLabel ? 'right' : 'left';
          ctx.fillText(labelText, labelX, y + 4);
          ctx.textAlign = 'left';
        }
      });

      const y1 = this._series!.priceToCoordinate(this._points[0].price);
      const y2 = this._series!.priceToCoordinate(this._points[1].price);
      const y3 = this._series!.priceToCoordinate(this._points[2].price);
      
      if (y1 !== null && y2 !== null && x1Raw !== null && x2Raw !== null) {
        ctx.beginPath();
        ctx.strokeStyle = this._isSelected ? '#22c55e' : 'rgba(136, 136, 136, 0.15)';
        ctx.lineWidth = this._isSelected ? 2 : 1;
        ctx.setLineDash([4, 2]);
        ctx.moveTo(x1Raw, y1);
        ctx.lineTo(x2Raw, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (this._isSelected) {
        ctx.fillStyle = '#22c55e';
        if (x1Raw !== null && y1 !== null) {
          ctx.beginPath();
          ctx.arc(x1Raw, y1, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (x2Raw !== null && y2 !== null) {
          ctx.beginPath();
          ctx.arc(x2Raw, y2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (y3 !== null) {
          ctx.beginPath();
          ctx.arc(x3Raw, y3, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class TrendFibPaneView implements IPrimitivePaneView {
  private _primitive: TrendFibPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: TrendFibPrimitive) {
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
    return new TrendFibRenderer(
      this._primitive.getPoints(),
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class TrendFibPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: TrendFibPaneView[];
  private _points: DrawingPoint[];
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;
  private _selected: boolean = false;
  private _id: string;
  private _requestUpdate?: RequestUpdateCallback;

  constructor(id: string, points: DrawingPoint[], style: DrawingStyle) {
    this._id = id;
    this._points = points;
    this._style = style;
    this._paneViews = [new TrendFibPaneView(this)];
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

  getId() { return this._id; }
  getPoints() { return this._points; }
  getStyle() { return this._style; }
  isSelected() { return this._selected; }

  setSelected(selected: boolean) {
    this._selected = selected;
    this._requestUpdate?.();
  }

  updatePoints(points: DrawingPoint[]) {
    this._points = points;
    this._requestUpdate?.();
  }

  updateStyle(style: DrawingStyle) {
    this._style = style;
    this._requestUpdate?.();
  }
}

export type DrawingPrimitive = TrendLinePrimitive | HorizontalLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | TrendFibPrimitive;

export function createDrawingPrimitive(
  id: string,
  type: 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib',
  points: DrawingPoint[],
  style: DrawingStyle
): DrawingPrimitive | null {
  switch (type) {
    case 'trendline':
      if (points.length >= 2) {
        return new TrendLinePrimitive(id, points, style);
      }
      break;
    case 'horizontal':
      if (points.length >= 1) {
        return new HorizontalLinePrimitive(id, points[0], style);
      }
      break;
    case 'rectangle':
      if (points.length >= 2) {
        return new RectanglePrimitive(id, points, style);
      }
      break;
    case 'fib_retracement':
      if (points.length >= 2) {
        return new FibRetracementPrimitive(id, points, style);
      }
      break;
    case 'trend_fib':
      if (points.length >= 3) {
        return new TrendFibPrimitive(id, points, style);
      }
      break;
  }
  return null;
}
