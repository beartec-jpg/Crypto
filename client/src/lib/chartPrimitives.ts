import type { 
  ISeriesPrimitive, 
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType,
  Coordinate
} from 'lightweight-charts';

interface DrawingPoint {
  time: number;
  price: number;
  snapType?: 'high' | 'low' | 'none';
}

interface DrawingStyle {
  color: string;
  opacity?: number;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  internalLineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  /** When true, fib lines extend to the current (latest) candle's x position */
  autoTrack?: boolean;
  /** Injected at render time: the timestamp of the latest candle for autoTrack */
  _trackToTime?: number;
  labelPosition?: 'left' | 'right';
  hiddenLevels?: number[];
  customLabels?: Record<number | string, string>;
  customValues?: Record<number, number>;
  label?: string;
  autoColor?: boolean;
  hideLabels?: boolean;
  levelColors?: Record<number, string>;
  boundaryColors?: Record<string, string>;
  fillOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  backgroundColor?: string;
  showBackground?: boolean;
  __openColorPicker?: string | null;
}

type RequestUpdateCallback = () => void;

// Helper function to apply opacity to hex colors
function applyOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  // If already rgba, replace alpha value
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/g, `${opacity})`);
  }
  
  // If rgb, convert to rgba
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }
  
  return color;
}

// Helper function to apply line style dash patterns
function applyLineStyle(ctx: CanvasRenderingContext2D, lineStyle?: 'solid' | 'dashed' | 'dotted') {
  const style = lineStyle || 'solid';
  if (style === 'solid') {
    ctx.setLineDash([]);
  } else if (style === 'dotted') {
    ctx.setLineDash([2, 2]);
  } else if (style === 'dashed') {
    ctx.setLineDash([5, 5]);
  }
}

/**
 * Extrapolate a timestamp to an x-coordinate using the visible time range.
 * Returns null if the time scale boundaries cannot be determined.
 */
function extrapolateTimeToX(
  timestamp: number,
  timeScale: ReturnType<IChartApi['timeScale']>,
  chartWidth: number
): number | null {
  const leftTime = timeScale.coordinateToTime(0);
  const rightTime = timeScale.coordinateToTime(chartWidth);
  if (leftTime === null || rightTime === null) return null;
  const timeRange = (rightTime as number) - (leftTime as number);
  if (timeRange === 0) return null;
  return ((timestamp - (leftTime as number)) / timeRange) * chartWidth;
}

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

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;

      // Extrapolate x coordinate for off-chart timestamps using visible time range
      const extrapolateX = (timestamp: number): number | null => {
        const leftTime = timeScale.coordinateToTime(0);
        const rightTime = timeScale.coordinateToTime(chartWidth);
        if (leftTime === null || rightTime === null) return null;
        const timeRange = (rightTime as number) - (leftTime as number);
        if (timeRange === 0) return null;
        return ((timestamp - (leftTime as number)) / timeRange) * chartWidth;
      };

      // Handle extend left/right from style
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight ?? false;

      // Calculate base coordinates with extrapolation for off-chart points
      const x1 = x1Raw !== null ? x1Raw : extrapolateX(this._point1.time);
      const x2 = x2Raw !== null ? x2Raw : extrapolateX(this._point2.time);

      // Skip if we can't determine coordinates (extrapolation requires a visible time range)
      if (x1 === null || x2 === null) return;

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
            drawY1 = (y1 - slope * x1) as Coordinate;
          }
          if (extendRight) {
            drawX2 = chartWidth;
            drawY2 = (y1 + slope * (chartWidth - x1)) as Coordinate;
          }
        }
      }

      // Apply opacity to color
      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      const colorWithOpacity = applyOpacity(this._style.color, opacity);

      // Apply line style
      applyLineStyle(ctx, this._style.lineStyle);

      ctx.beginPath();
      ctx.strokeStyle = colorWithOpacity;
      ctx.lineWidth = this._style.lineWidth || 2;
      ctx.moveTo(drawX1, drawY1);
      ctx.lineTo(drawX2, drawY2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw selection handles at original or extrapolated points
      if (this._isSelected) {
        ctx.fillStyle = '#22c55e';
        const handleX1 = x1Raw !== null ? x1Raw : x1;
        ctx.beginPath();
        ctx.arc(handleX1, y1, 6, 0, Math.PI * 2);
        ctx.fill();
        const handleX2 = x2Raw !== null ? x2Raw : x2;
        ctx.beginPath();
        ctx.arc(handleX2, y2, 6, 0, Math.PI * 2);
        ctx.fill();
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
      
      // Apply opacity to color
      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      const colorWithOpacity = applyOpacity(this._style.color, opacity);
      
      // Apply line style
      applyLineStyle(ctx, this._style.lineStyle);
      
      ctx.beginPath();
      ctx.strokeStyle = colorWithOpacity;
      ctx.lineWidth = this._style.lineWidth || 2;
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

class TextLabelRenderer implements IPrimitivePaneRenderer {
  private _point: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    point: DrawingPoint,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._point = point;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();
    const x = timeScale.timeToCoordinate(this._point.time as Time);
    const y = this._series.priceToCoordinate(this._point.price);
    if (x === null || y === null) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const text = this._style.text || 'Text';
      const fontSize = this._style.fontSize || 14;
      const fontWeight = this._style.fontWeight || 'normal';
      const showBackground = this._style.showBackground ?? true;
      const backgroundColor = this._style.backgroundColor || 'rgba(15, 23, 42, 0.8)';
      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      const colorWithOpacity = applyOpacity(this._style.color, opacity);
      const paddingX = 6;
      const paddingY = 4;

      ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = fontSize;

      const drawX = x;
      const drawY = y;

      if (showBackground) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(
          drawX - paddingX,
          drawY - textHeight,
          textWidth + paddingX * 2,
          textHeight + paddingY * 2
        );
      }

      ctx.fillStyle = colorWithOpacity;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, drawX, drawY + paddingY);

      if (this._isSelected) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

class TextLabelPaneView implements IPrimitivePaneView {
  private _primitive: TextLabelPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: TextLabelPrimitive) {
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
    return new TextLabelRenderer(
      this._primitive.getPoint(),
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class TextLabelPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: TextLabelPaneView[];
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
    this._paneViews = [new TextLabelPaneView(this)];
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

      // Apply opacity to fill
      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      const fillOpacity = this._style.fillOpacity !== undefined ? this._style.fillOpacity : 0.1;
      
      if (this._style.color.startsWith('#')) {
        const hex = this._style.color;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillOpacity * opacity})`;
      } else {
        // For non-hex colors (rgb, rgba, hsl, etc.), use string replacement
        ctx.fillStyle = this._style.color.replace(')', `, ${fillOpacity})`)
          .replace('rgb', 'rgba')
          .replace('hsl', 'hsla');
      }
      ctx.fillRect(rectLeft, top, width, height);

      // Apply opacity to stroke
      const colorWithOpacity = applyOpacity(this._style.color, opacity);
      ctx.strokeStyle = colorWithOpacity;
      ctx.lineWidth = this._style.lineWidth || 2;
      ctx.strokeRect(rectLeft, top, width, height);

      // Draw label if present
      const labelText = this._style.label;
      if (labelText) {
        ctx.font = '11px sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const textHeight = 12;
        const padding = 3;
        
        const isRightLabel = this._style.labelPosition === 'right';
        const labelX = isRightLabel ? rectRight - 5 : rectLeft + 5;
        const labelY = top + 15;
        
        const bgX = isRightLabel ? labelX - textMetrics.width - padding : labelX - padding;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(bgX, labelY - textHeight + 2, textMetrics.width + padding * 2, textHeight + padding);
        
        ctx.fillStyle = colorWithOpacity;
        ctx.textAlign = isRightLabel ? 'right' : 'left';
        ctx.fillText(labelText, labelX, labelY + 4);
        ctx.textAlign = 'left';
      }

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
  0: '#787B86',
  0.236: '#F7525F',
  0.382: '#FF9800',
  0.5: '#4CAF50',
  0.618: '#089981',
  0.786: '#9C27B0',
  1: '#787B86',
  1.272: '#3179F5',
  1.618: '#E91E63'
};

class FibRetracementRenderer implements IPrimitivePaneRenderer {
  private _point1: DrawingPoint;
  private _point2: DrawingPoint;
  private _point3: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    point1: DrawingPoint,
    point2: DrawingPoint,
    point3: DrawingPoint,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._point1 = point1;
    this._point2 = point2;
    this._point3 = point3;
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
    const x3Raw = timeScale.timeToCoordinate(this._point3.time as Time);

    const priceDiff = this._point2.price - this._point1.price;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;

      // Extrapolate x coordinate for off-chart timestamps using visible time range
      const extrapolateX = (timestamp: number): number | null =>
        extrapolateTimeToX(timestamp, timeScale, chartWidth);

      // Handle extend left/right from style
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight ?? false;
      // autoTrack: extend right edge to the latest candle's x position
      const autoTrack = this._style.autoTrack ?? true;

      // Calculate base coordinates with extrapolation for off-chart points
      const x1 = x1Raw !== null ? x1Raw : extrapolateX(this._point1.time);
      const x2 = x2Raw !== null ? x2Raw : extrapolateX(this._point2.time);
      const x3 = x3Raw !== null ? x3Raw : extrapolateX(this._point3.time);

      // Skip if we can't determine all anchor coordinates
      if (x1 === null || x2 === null || x3 === null) return;

      // Resolve autoTrack right edge: use latest candle coordinate when available
      let autoTrackRight: number | null = null;
      if (autoTrack && !extendRight && this._style._trackToTime !== undefined) {
        const trackX = timeScale.timeToCoordinate(this._style._trackToTime as Time);
        autoTrackRight = trackX !== null ? trackX : extrapolateX(this._style._trackToTime);
      }
      
      // Determine drawing bounds based on extension and 3 points
      // Lines draw from min(point1.time, point2.time) to point3.time
      const anchorLeft = Math.min(x1, x2);
      const anchorRight = autoTrackRight !== null ? Math.max(x3, autoTrackRight) : x3;
      const lineLeft = extendLeft ? 0 : anchorLeft;
      const lineRight = extendRight ? chartWidth : anchorRight;
      const isRightLabel = this._style.labelPosition !== 'left';
      // Labels go on the extended line edge if extended, otherwise on anchor point
      const labelX = isRightLabel ? lineRight - 5 : lineLeft + 5;
      // Only show labels if the original anchor points are visible on chart
      const anchorsVisible = anchorLeft <= chartWidth && anchorRight >= 0;
      const showLabels = anchorsVisible && !this._style.hideLabels;

      const hiddenLevels = this._style.hiddenLevels || [];
      const customValues = this._style.customValues || {};
      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      
      FIB_LEVELS.forEach((level) => {
        // Skip hidden levels - round both to avoid float precision issues
        const roundedLevel = Math.round(level * 10000) / 10000;
        if (hiddenLevels.some((h: number) => Math.round(h * 10000) / 10000 === roundedLevel)) return;
        
        // Use custom value if set, otherwise use default level
        const actualLevel = customValues[level] !== undefined ? customValues[level] : level;
        
        // For retracements: 0% at end of move (point2), 100% at start (point1)
        const levelPrice = this._point2.price - priceDiff * actualLevel;
        const y = this._series!.priceToCoordinate(levelPrice);
        if (y === null) return;

        // Check for per-level color from style, then fall back to default FIB_COLORS, then global color
        const levelColors = this._style.levelColors || {};
        const baseColor = levelColors[level] || FIB_COLORS[level] || this._style.color;
        const color = applyOpacity(baseColor, opacity);
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        
        // Apply line style from data (not hardcoded)
        const lineStyle = this._style.lineStyle || 'dashed';
        if (lineStyle === 'solid') {
          ctx.setLineDash([]);
        } else if (lineStyle === 'dotted') {
          ctx.setLineDash([2, 2]);
        } else {
          ctx.setLineDash([5, 5]); // dashed
        }
        
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
      const y3 = this._series!.priceToCoordinate(this._point3.price);
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

      // Draw selection handles for all three points
      if (this._isSelected && y1 !== null && y2 !== null && y3 !== null) {
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
        if (x3Raw !== null) {
          ctx.beginPath();
          ctx.arc(x3Raw, y3, 6, 0, Math.PI * 2);
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
      points[2],
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
  0.382: '#FF9800',
  0.5: '#4CAF50',
  0.618: '#089981',
  0.786: '#9C27B0',
  1.0: '#787B86',
  1.272: '#3179F5',
  1.618: '#E91E63',
  2.0: '#F7525F',
  3.618: '#FF9800',
  4.236: '#9C27B0',
  2.618: '#3179F5'
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
      // autoTrack: extend right edge to the latest candle's x position
      const autoTrack = this._style.autoTrack ?? true;

      // Resolve autoTrack right edge: use latest candle coordinate when available
      let autoTrackRight: number | null = null;
      if (autoTrack && !extendRight && this._style._trackToTime !== undefined) {
        const trackX = timeScale.timeToCoordinate(this._style._trackToTime as Time);
        autoTrackRight = trackX !== null ? trackX : extrapolateTimeToX(this._style._trackToTime, timeScale, chartWidth);
      }
      
      const baseStartX = x3Raw;
      const baseEndX = autoTrackRight !== null
        ? Math.max(x3Raw, autoTrackRight)
        : extendRight ? chartWidth : Math.min(x3Raw + (chartWidth - x3Raw) * 0.5, chartWidth);
      const lineLeft = extendLeft ? 0 : baseStartX;
      const lineRight = extendRight ? chartWidth : baseEndX;
      const isRightLabel = this._style.labelPosition !== 'left';
      // Labels go on the extended line edge if extended, otherwise on base area
      const labelX = isRightLabel ? lineRight - 5 : lineLeft + 5;
      // Only show labels if the original anchor points are visible on chart
      const anchorsVisible = baseStartX <= chartWidth && baseEndX >= 0;
      const showLabels = anchorsVisible && !this._style.hideLabels;

      const hiddenLevels = this._style.hiddenLevels || [];
      const customValues = this._style.customValues || {};
      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      
      TREND_FIB_LEVELS.forEach((level) => {
        // Skip hidden levels - round both to avoid float precision issues
        const roundedLevel = Math.round(level * 10000) / 10000;
        if (hiddenLevels.some((h: number) => Math.round(h * 10000) / 10000 === roundedLevel)) return;
        
        // Use custom value if set, otherwise use default level
        const actualLevel = customValues[level] !== undefined ? customValues[level] : level;
        
        const levelPrice = this._points[2].price + waveDiff * actualLevel;
        const y = this._series!.priceToCoordinate(levelPrice);
        if (y === null) return;

        const levelColors = this._style.levelColors || {};
        const baseColor = levelColors[level] || TREND_FIB_COLORS[level] || this._style.color;
        const color = applyOpacity(baseColor, opacity);
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        applyLineStyle(ctx, this._style.lineStyle);
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

// Channel levels: 25%, 50%, 75% internal markers
const CHANNEL_LEVELS = [0.25, 0.5, 0.75];

class ChannelRenderer implements IPrimitivePaneRenderer {
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

    if (x1Raw === null && x2Raw === null) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;
      
      const extendLeft = this._style.extendLeft ?? false;
      const extendRight = this._style.extendRight !== false; // Default true for channels
      
      const x1 = x1Raw ?? 0;
      const x2 = x2Raw ?? chartWidth;
      
      const anchorLeft = Math.min(x1, x2);
      const anchorRight = Math.max(x1, x2);
      const lineLeft = extendLeft ? 0 : anchorLeft;
      const lineRight = extendRight ? chartWidth : anchorRight;
      const isRightLabel = this._style.labelPosition === 'right';
      const labelX = isRightLabel ? lineRight - 5 : lineLeft + 5;
      const anchorsVisible = anchorLeft <= chartWidth && anchorRight >= 0;
      const showLabels = anchorsVisible && !this._style.hideLabels;

      const y1 = this._series!.priceToCoordinate(this._point1.price);
      const y2 = this._series!.priceToCoordinate(this._point2.price);
      if (y1 === null || y2 === null) return;

      const topPrice = Math.max(this._point1.price, this._point2.price);
      const bottomPrice = Math.min(this._point1.price, this._point2.price);
      const yTop = this._series!.priceToCoordinate(topPrice);
      const yBottom = this._series!.priceToCoordinate(bottomPrice);
      if (yTop === null || yBottom === null) return;

      const autoColor = this._style.autoColor ?? true;
      const boundaryColors = this._style.boundaryColors || {};
      const topColor = boundaryColors.top || (autoColor ? '#ef4444' : (this._style.color || '#3b82f6'));
      const bottomColor = boundaryColors.bottom || (autoColor ? '#22c55e' : (this._style.color || '#3b82f6'));

      // Apply boundary line style
      applyLineStyle(ctx, this._style.lineStyle);

      // Draw top horizontal line
      ctx.beginPath();
      ctx.strokeStyle = topColor;
      ctx.lineWidth = 2;
      ctx.moveTo(lineLeft, yTop);
      ctx.lineTo(lineRight, yTop);
      ctx.stroke();

      // Draw bottom horizontal line
      ctx.beginPath();
      ctx.strokeStyle = bottomColor;
      ctx.lineWidth = 2;
      ctx.moveTo(lineLeft, yBottom);
      ctx.lineTo(lineRight, yBottom);
      ctx.stroke();
      
      // Reset line dash after boundary lines
      ctx.setLineDash([]);

      // Draw top and bottom labels
      if (showLabels) {
        const customLabels = this._style.customLabels || {};
        ctx.font = '11px sans-serif';
        
        const topLabel = customLabels['top'] || `Top (${topPrice.toFixed(2)})`;
        const bottomLabel = customLabels['bottom'] || `Bottom (${bottomPrice.toFixed(2)})`;
        
        const topMetrics = ctx.measureText(topLabel);
        const bottomMetrics = ctx.measureText(bottomLabel);
        const textHeight = 12;
        const padding = 2;

        // Top label
        const topBgX = isRightLabel ? labelX - topMetrics.width - padding : labelX - padding;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(topBgX, yTop - textHeight + 2, topMetrics.width + padding * 2, textHeight + padding);
        ctx.fillStyle = topColor;
        ctx.textAlign = isRightLabel ? 'right' : 'left';
        ctx.fillText(topLabel, labelX, yTop + 4);

        // Bottom label
        const bottomBgX = isRightLabel ? labelX - bottomMetrics.width - padding : labelX - padding;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(bottomBgX, yBottom - textHeight + 2, bottomMetrics.width + padding * 2, textHeight + padding);
        ctx.fillStyle = bottomColor;
        ctx.fillText(bottomLabel, labelX, yBottom + 4);
        ctx.textAlign = 'left';
      }

      // Draw internal level lines (25%, 50%, 75%)
      const hiddenLevels = this._style.hiddenLevels || [];
      const levelColors = this._style.levelColors || {};
      const priceDiff = topPrice - bottomPrice;
      
      // Apply internal line style
      applyLineStyle(ctx, this._style.internalLineStyle || 'dashed');
      
      CHANNEL_LEVELS.forEach((level) => {
        const roundedLevel = Math.round(level * 10000) / 10000;
        if (hiddenLevels.some((h: number) => Math.round(h * 10000) / 10000 === roundedLevel)) return;
        
        const levelPrice = bottomPrice + priceDiff * level;
        const y = this._series!.priceToCoordinate(levelPrice);
        if (y === null) return;

        const levelColor = levelColors[level] || 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.strokeStyle = levelColor;
        ctx.lineWidth = 1;
        ctx.moveTo(lineLeft, y);
        ctx.lineTo(lineRight, y);
        ctx.stroke();

        if (showLabels) {
          const customLabels = this._style.customLabels || {};
          const customLabel = customLabels[level];
          const labelText = customLabel || `${(level * 100).toFixed(0)}% (${levelPrice.toFixed(2)})`;
          ctx.font = '11px sans-serif';
          const textMetrics = ctx.measureText(labelText);
          const textHeight = 12;
          const padding = 2;
          
          const bgX = isRightLabel ? labelX - textMetrics.width - padding : labelX - padding;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(bgX, y - textHeight + 2, textMetrics.width + padding * 2, textHeight + padding);
          
          // Use same color as line for label
          ctx.fillStyle = levelColor;
          ctx.textAlign = isRightLabel ? 'right' : 'left';
          ctx.fillText(labelText, labelX, y + 4);
          ctx.textAlign = 'left';
        }
      });
      
      // Reset line dash after internal lines
      ctx.setLineDash([]);

      // Fill channel area with subtle background
      const fillOpacity = this._style.fillOpacity !== undefined ? this._style.fillOpacity : 0.1;
      ctx.fillStyle = autoColor ? `rgba(100, 100, 100, ${fillOpacity})` : `rgba(59, 130, 246, ${fillOpacity})`;
      ctx.fillRect(lineLeft, yTop, lineRight - lineLeft, yBottom - yTop);

      // Draw selection handles
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

class ChannelPaneView implements IPrimitivePaneView {
  private _primitive: ChannelPrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: ChannelPrimitive) {
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
    return new ChannelRenderer(
      points[0],
      points[1],
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class ChannelPrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: ChannelPaneView[];
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
    this._paneViews = [new ChannelPaneView(this)];
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

export type DrawingPrimitive = TrendLinePrimitive | HorizontalLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | TrendFibPrimitive | ChannelPrimitive | TextLabelPrimitive | VerticalLinePrimitive;

// ── Vertical Line ─────────────────────────────────────────────────────────────

class VerticalLineRenderer implements IPrimitivePaneRenderer {
  private _point: DrawingPoint;
  private _style: DrawingStyle;
  private _series: ISeriesApi<SeriesType> | null;
  private _chart: IChartApi | null;
  private _isSelected: boolean;

  constructor(
    point: DrawingPoint,
    style: DrawingStyle,
    series: ISeriesApi<SeriesType> | null,
    chart: IChartApi | null,
    isSelected: boolean
  ) {
    this._point = point;
    this._style = style;
    this._series = series;
    this._chart = chart;
    this._isSelected = isSelected;
  }

  draw(target: any) {
    if (!this._series || !this._chart) return;

    const timeScale = this._chart.timeScale();
    const xRaw = timeScale.timeToCoordinate(this._point.time as Time);
    if (xRaw === null) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const height = scope.mediaSize.height;

      const opacity = this._style.opacity !== undefined ? this._style.opacity : 1;
      const colorWithOpacity = applyOpacity(this._style.color, opacity);
      applyLineStyle(ctx, this._style.lineStyle);

      ctx.beginPath();
      ctx.strokeStyle = colorWithOpacity;
      ctx.lineWidth = this._style.lineWidth || 1;
      ctx.moveTo(xRaw, 0);
      ctx.lineTo(xRaw, height);
      ctx.stroke();
      ctx.setLineDash([]);

      if (this._isSelected) {
        const y = this._series!.priceToCoordinate(this._point.price);
        if (y !== null) {
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(xRaw, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class VerticalLinePaneView implements IPrimitivePaneView {
  private _primitive: VerticalLinePrimitive;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _chart: IChartApi | null = null;

  constructor(primitive: VerticalLinePrimitive) {
    this._primitive = primitive;
  }

  update(series: ISeriesApi<SeriesType> | null, chart: IChartApi | null) {
    this._series = series;
    this._chart = chart;
  }

  zOrder(): 'normal' { return 'normal'; }

  renderer() {
    return new VerticalLineRenderer(
      this._primitive.getPoint(),
      this._primitive.getStyle(),
      this._series,
      this._chart,
      this._primitive.isSelected()
    );
  }
}

export class VerticalLinePrimitive implements ISeriesPrimitive<Time> {
  private _paneViews: VerticalLinePaneView[];
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
    this._paneViews = [new VerticalLinePaneView(this)];
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

  paneViews() { return this._paneViews; }

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

export function createDrawingPrimitive(
  id: string,
  type: 'trendline' | 'horizontal' | 'vertical' | 'text' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel',
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
    case 'vertical':
      if (points.length >= 1) {
        return new VerticalLinePrimitive(id, points[0], style);
      }
      break;
    case 'text':
      if (points.length >= 1) {
        return new TextLabelPrimitive(id, points[0], style);
      }
      break;
    case 'rectangle':
      if (points.length >= 2) {
        return new RectanglePrimitive(id, points, style);
      }
      break;
    case 'fib_retracement':
      if (points.length >= 2) {
        // For backward compatibility, if only 2 points exist, duplicate point2 as point3
        // so the lines extend to the same position as point2
        const fibPoints = points.length === 2 
          ? [...points, points[1]] 
          : points;
        return new FibRetracementPrimitive(id, fibPoints, style);
      }
      break;
    case 'trend_fib':
      if (points.length >= 3) {
        return new TrendFibPrimitive(id, points, style);
      }
      break;
    case 'channel':
      if (points.length >= 2) {
        return new ChannelPrimitive(id, points, style);
      }
      break;
  }
  return null;
}
