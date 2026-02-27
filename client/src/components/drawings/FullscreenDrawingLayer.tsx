import { Time } from 'lightweight-charts';
import { DrawingQuickMenu } from '@/components/drawings/DrawingQuickMenu';

interface FullscreenDrawingLayerProps {
  tempDrawing: { points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null;
  chart: any;
  candleSeries: any;
  quickMenuPosition: { x: number; y: number } | null;
  selectedDrawingId: string | null;
  onSettings: () => void;
  onDelete: () => void;
  onCloseQuickMenu: () => void;
}

export function FullscreenDrawingLayer({
  tempDrawing,
  chart,
  candleSeries,
  quickMenuPosition,
  selectedDrawingId,
  onSettings,
  onDelete,
  onCloseQuickMenu,
}: FullscreenDrawingLayerProps) {
  return (
    <>
      <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 10 }}>
        {tempDrawing && tempDrawing.points.length > 0 && chart && tempDrawing.points.map((point, index) => {
          const x = chart?.timeScale().timeToCoordinate(point.time as Time);
          const y = candleSeries?.priceToCoordinate(point.price);
          return (
            <circle
              key={index}
              cx={x ?? 0}
              cy={y ?? 0}
              r={6}
              fill={point.snapType === 'high' ? '#ef4444' : point.snapType === 'low' ? '#22c55e' : '#3b82f6'}
              stroke="#fff"
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {quickMenuPosition && selectedDrawingId && (
        <DrawingQuickMenu
          x={quickMenuPosition.x}
          y={quickMenuPosition.y}
          onSettings={onSettings}
          onDelete={onDelete}
          onClose={onCloseQuickMenu}
        />
      )}
    </>
  );
}
