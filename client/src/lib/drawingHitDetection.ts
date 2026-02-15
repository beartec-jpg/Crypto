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
    case 'trendline':
      if (drawing.points.length < 2) return null;
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as Time);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      const x2 = timeScale.timeToCoordinate(drawing.points[1].time as Time);
      const y2 = series.priceToCoordinate(drawing.points[1].price);
      
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      
      // Point-to-line-segment distance
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSquared = dx * dx + dy * dy;
      
      if (lengthSquared === 0) return Math.sqrt((clickX - x1) ** 2 + (clickY - y1) ** 2);
      
      const t = Math.max(0, Math.min(1, ((clickX - x1) * dx + (clickY - y1) * dy) / lengthSquared));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      
      return Math.sqrt((clickX - projX) ** 2 + (clickY - projY) ** 2);
    
    case 'horizontal':
      if (drawing.points.length < 1) return null;
      const lineY = series.priceToCoordinate(drawing.points[0].price);
      return lineY === null ? null : Math.abs(clickY - lineY);
    
    case 'rectangle':
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
      
      const dx = Math.max(left - clickX, 0, clickX - right);
      const dy = Math.max(top - clickY, 0, clickY - bottom);
      return Math.sqrt(dx * dx + dy * dy);
    
    default:
      return null;
  }
}
