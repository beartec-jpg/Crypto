import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

export interface Drawing {
  id: string;
  type: string;
  points: { time: number; price: number }[];
  style?: any;
}

export interface HitResult {
  drawingId: string;
  drawingType: string;
  distance: number;
}

const CLICK_RADIUS = 20; // pixels

// Fibonacci and channel level constants (must match chartPrimitives.ts)
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
const TREND_FIB_LEVELS = [0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618, 3.618, 4.236];
const CHANNEL_LEVELS = [0.25, 0.5, 0.75];

/**
 * Check if a level is hidden in the hiddenLevels array
 * Uses rounding to avoid floating-point comparison issues
 */
function isLevelHidden(level: number, hiddenLevels: number[]): boolean {
  const roundedLevel = Math.round(level * 10000) / 10000;
  return hiddenLevels.some((h: number) => Math.round(h * 10000) / 10000 === roundedLevel);
}

/**
 * Calculate distance from a point to an infinite line
 * Uses perpendicular distance formula
 */
function distanceToInfiniteLine(
  clickX: number,
  clickY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  
  if (lengthSquared === 0) {
    return Math.sqrt((clickX - x1) ** 2 + (clickY - y1) ** 2);
  }
  
  // Perpendicular distance from point to infinite line
  const numerator = Math.abs(dy * clickX - dx * clickY + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(lengthSquared);
  
  return numerator / denominator;
}

/**
 * Calculate distance from a point to a ray (semi-infinite line)
 * Supports extending forward, backward, or both directions
 */
function distanceToRay(
  clickX: number,
  clickY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extendForward: boolean,
  extendBackward: boolean
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  
  if (lengthSquared === 0) {
    return Math.sqrt((clickX - x1) ** 2 + (clickY - y1) ** 2);
  }
  
  // If extending both directions, use infinite line distance
  if (extendForward && extendBackward) {
    return distanceToInfiniteLine(clickX, clickY, x1, y1, x2, y2);
  }
  
  // Project click point onto the line
  const t = ((clickX - x1) * dx + (clickY - y1) * dy) / lengthSquared;
  
  // Clamp t based on extension settings
  let clampedT = t;
  if (!extendBackward && t < 0) clampedT = 0;
  if (!extendForward && t > 1) clampedT = 1;
  
  const projX = x1 + clampedT * dx;
  const projY = y1 + clampedT * dy;
  
  return Math.sqrt((clickX - projX) ** 2 + (clickY - projY) ** 2);
}

/**
 * Calculate distance from a point to a horizontal line
 * Optionally constrained by X bounds
 */
function distanceToHorizontalLine(
  clickX: number,
  clickY: number,
  y: number,
  minX?: number,
  maxX?: number
): number {
  // Check if click is within X bounds (if specified)
  if (minX !== undefined && maxX !== undefined) {
    if (clickX < minX || clickX > maxX) {
      // Outside bounds, return distance to nearest endpoint
      const distToLeft = Math.sqrt((clickX - minX) ** 2 + (clickY - y) ** 2);
      const distToRight = Math.sqrt((clickX - maxX) ** 2 + (clickY - y) ** 2);
      return Math.min(distToLeft, distToRight);
    }
  }
  
  // Within bounds or no bounds specified - just vertical distance
  return Math.abs(clickY - y);
}

/**
 * Calculate distance from a point to a line parallel to a base line
 * Used for trend-based fibonacci extensions
 * NOTE: Currently unused as trend fibs use horizontal lines, but kept for potential future use
 * with diagonal/sloped trend fib extensions.
 */
function distanceToParallelLine(
  clickX: number,
  clickY: number,
  baseX1: number,
  baseY1: number,
  baseX2: number,
  baseY2: number,
  basePrice: number,
  waveDiff: number,
  levelRatio: number,
  series: ISeriesApi<'Candlestick'>,
  chart: IChartApi
): number {
  // Calculate the level price
  const levelPrice = basePrice + waveDiff * levelRatio;
  
  // Get the Y coordinate for this price
  const y = series.priceToCoordinate(levelPrice);
  if (y === null) return Infinity;
  
  // For trend fibs, the lines extend infinitely horizontally at the level price
  // So just return vertical distance
  return Math.abs(clickY - y);
}

export function findDrawingsNearClick(
  clickX: number,
  clickY: number,
  drawings: Drawing[],
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>
): HitResult[] {
  const hits: HitResult[] = [];

  for (const drawing of drawings) {
    const distance = getDistanceToDrawing(clickX, clickY, drawing, chart, series);
    
    if (distance !== null && distance <= CLICK_RADIUS) {
      hits.push({
        drawingId: drawing.id,
        drawingType: drawing.type,
        distance,
      });
    }
  }

  return hits.sort((a, b) => a.distance - b.distance);
}

function getDistanceToDrawing(
  clickX: number,
  clickY: number,
  drawing: Drawing,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>
): number | null {
  const timeScale = chart.timeScale();
  
  switch (drawing.type) {
    case 'trendline': {
      if (drawing.points.length < 2) return null;
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as Time);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      const x2 = timeScale.timeToCoordinate(drawing.points[1].time as Time);
      const y2 = series.priceToCoordinate(drawing.points[1].price);
      
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      
      // Check for extension settings
      const extendLeft = drawing.style?.extendLeft ?? false;
      const extendRight = drawing.style?.extendRight ?? false;
      
      // Use ray distance calculation if extended, otherwise line segment
      if (extendLeft || extendRight) {
        return distanceToRay(clickX, clickY, x1, y1, x2, y2, extendRight, extendLeft);
      } else {
        // Point-to-line-segment distance (original logic)
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) return Math.sqrt((clickX - x1) ** 2 + (clickY - y1) ** 2);
        
        const t = Math.max(0, Math.min(1, ((clickX - x1) * dx + (clickY - y1) * dy) / lengthSquared));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        
        return Math.sqrt((clickX - projX) ** 2 + (clickY - projY) ** 2);
      }
    }
    
    case 'horizontal': {
      if (drawing.points.length < 1) return null;
      const lineY = series.priceToCoordinate(drawing.points[0].price);
      return lineY === null ? null : Math.abs(clickY - lineY);
    }
    
    case 'rectangle': {
      if (drawing.points.length < 2) return null;
      const rx1 = timeScale.timeToCoordinate(drawing.points[0].time as Time);
      const ry1 = series.priceToCoordinate(drawing.points[0].price);
      const rx2 = timeScale.timeToCoordinate(drawing.points[1].time as Time);
      const ry2 = series.priceToCoordinate(drawing.points[1].price);
      
      if (rx1 === null || ry1 === null || rx2 === null || ry2 === null) return null;
      
      const left = Math.min(rx1, rx2);
      const right = Math.max(rx1, rx2);
      const top = Math.min(ry1, ry2);
      const bottom = Math.max(ry1, ry2);
      
      if (clickX >= left && clickX <= right && clickY >= top && clickY <= bottom) return 0;
      
      const rectDx = Math.max(left - clickX, 0, clickX - right);
      const rectDy = Math.max(top - clickY, 0, clickY - bottom);
      return Math.sqrt(rectDx * rectDx + rectDy * rectDy);
    }
    
    case 'fib_retracement': {
      if (drawing.points.length < 2) return null;
      
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as Time);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      const x2 = timeScale.timeToCoordinate(drawing.points[1].time as Time);
      const y2 = series.priceToCoordinate(drawing.points[1].price);
      
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      
      const priceDiff = drawing.points[1].price - drawing.points[0].price;
      const hiddenLevels = drawing.style?.hiddenLevels || [];
      
      // Check distance to each visible fib level
      let minDistance = Infinity;
      
      for (const level of FIB_LEVELS) {
        // Skip hidden levels
        if (isLevelHidden(level, hiddenLevels)) {
          continue;
        }
        
        // Calculate level price
        const levelPrice = drawing.points[1].price - priceDiff * level;
        const levelY = series.priceToCoordinate(levelPrice);
        
        if (levelY === null) continue;
        
        // Fib levels are horizontal lines within time bounds
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        
        const distance = distanceToHorizontalLine(clickX, clickY, levelY, minX, maxX);
        minDistance = Math.min(minDistance, distance);
      }
      
      return minDistance === Infinity ? null : minDistance;
    }
    
    case 'trend_fib': {
      if (drawing.points.length < 3) return null;
      
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as Time);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      const x2 = timeScale.timeToCoordinate(drawing.points[1].time as Time);
      const y2 = series.priceToCoordinate(drawing.points[1].price);
      const x3 = timeScale.timeToCoordinate(drawing.points[2].time as Time);
      const y3 = series.priceToCoordinate(drawing.points[2].price);
      
      if (x3 === null || y3 === null) return null;
      
      const waveDiff = drawing.points[1].price - drawing.points[0].price;
      const hiddenLevels = drawing.style?.hiddenLevels || [];
      
      // Check distance to each visible trend fib level
      let minDistance = Infinity;
      
      for (const level of TREND_FIB_LEVELS) {
        // Skip hidden levels
        if (isLevelHidden(level, hiddenLevels)) {
          continue;
        }
        
        // Calculate level price
        const levelPrice = drawing.points[2].price + waveDiff * level;
        const levelY = series.priceToCoordinate(levelPrice);
        
        if (levelY === null) continue;
        
        // Trend fib levels are horizontal lines extending across the chart
        const distance = distanceToHorizontalLine(clickX, clickY, levelY);
        minDistance = Math.min(minDistance, distance);
      }
      
      return minDistance === Infinity ? null : minDistance;
    }
    
    case 'channel': {
      if (drawing.points.length < 2) return null;
      
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as Time);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      const x2 = timeScale.timeToCoordinate(drawing.points[1].time as Time);
      const y2 = series.priceToCoordinate(drawing.points[1].price);
      
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      
      const topPrice = Math.max(drawing.points[0].price, drawing.points[1].price);
      const bottomPrice = Math.min(drawing.points[0].price, drawing.points[1].price);
      const hiddenLevels = drawing.style?.hiddenLevels || [];
      
      let minDistance = Infinity;
      
      // Check distance to top boundary
      const yTop = series.priceToCoordinate(topPrice);
      if (yTop !== null) {
        const distance = distanceToHorizontalLine(clickX, clickY, yTop);
        minDistance = Math.min(minDistance, distance);
      }
      
      // Check distance to bottom boundary
      const yBottom = series.priceToCoordinate(bottomPrice);
      if (yBottom !== null) {
        const distance = distanceToHorizontalLine(clickX, clickY, yBottom);
        minDistance = Math.min(minDistance, distance);
      }
      
      // Check distance to internal markers (25%, 50%, 75%)
      const priceDiff = topPrice - bottomPrice;
      for (const level of CHANNEL_LEVELS) {
        // Skip hidden levels
        if (isLevelHidden(level, hiddenLevels)) {
          continue;
        }
        
        const levelPrice = bottomPrice + priceDiff * level;
        const levelY = series.priceToCoordinate(levelPrice);
        
        if (levelY === null) continue;
        
        // Channel lines extend across the chart
        const distance = distanceToHorizontalLine(clickX, clickY, levelY);
        minDistance = Math.min(minDistance, distance);
      }
      
      return minDistance === Infinity ? null : minDistance;
    }
    
    default:
      return null;
  }
}
