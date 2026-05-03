import { useState, useEffect, useRef } from 'react';
import { Time } from 'lightweight-charts';
import { DrawingQuickMenu } from '@/components/drawings/DrawingQuickMenu';

interface FullscreenDrawingLayerProps {
  tempDrawing: { points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null;
  activeTool: string | null;
  chart: any;
  candleSeries: any;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  quickMenuPosition: { x: number; y: number } | null;
  selectedDrawingId: string | null;
  onSettings: () => void;
  onAlert?: () => void;
  onMove?: () => void;
  onDelete: () => void;
  onCloseQuickMenu: () => void;
  /** The timeframe currently displayed on the chart. */
  currentTimeframe?: string;
  /** Timeframe of the currently selected drawing (if from a different TF). */
  selectedDrawingTimeframe?: string;
}

export function FullscreenDrawingLayer({
  tempDrawing,
  activeTool,
  chart,
  candleSeries,
  chartContainerRef,
  quickMenuPosition,
  selectedDrawingId,
  onSettings,
  onAlert,
  onMove,
  onDelete,
  onCloseQuickMenu,
  currentTimeframe,
  selectedDrawingTimeframe,
}: FullscreenDrawingLayerProps) {
  const isHigherTF = !!(selectedDrawingTimeframe && currentTimeframe && selectedDrawingTimeframe !== currentTimeframe);
  // Track cursor position for rubber-band preview
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = chartContainerRef?.current;
    if (!container || !activeTool || !tempDrawing || tempDrawing.points.length === 0) {
      setCursorPos(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [activeTool, tempDrawing, chartContainerRef]);

  // Convert tempDrawing points to SVG coordinates
  const placedPoints = tempDrawing && chart && candleSeries
    ? tempDrawing.points.map(p => ({
        x: chart.timeScale().timeToCoordinate(p.time as Time) ?? null,
        y: candleSeries.priceToCoordinate(p.price) ?? null,
        snapType: p.snapType,
      })).filter(p => p.x !== null && p.y !== null) as { x: number; y: number; snapType?: string }[]
    : [];

  // Build rubber-band preview lines
  const previewLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (cursorPos && placedPoints.length > 0 && activeTool) {
    const last = placedPoints[placedPoints.length - 1];
    previewLines.push({ x1: last.x, y1: last.y, x2: cursorPos.x, y2: cursorPos.y });
    // For channel (2nd point already placed, show 3rd segment):
    // handled naturally since we push from last point
  }

  return (
    <>
      <svg
        className="absolute top-0 left-0 pointer-events-none"
        style={{ width: '100%', height: '100%', zIndex: 10 }}
      >
        {/* Rubber-band preview */}
        {previewLines.map((line, i) => (
          <line
            key={`preview-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="5,4"
            opacity={0.7}
          />
        ))}

        {/* Placed anchor dots */}
        {placedPoints.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={6}
            fill={point.snapType === 'high' ? '#ef4444' : point.snapType === 'low' ? '#22c55e' : '#3b82f6'}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}

        {/* Cursor crosshair dot */}
        {cursorPos && placedPoints.length > 0 && (
          <circle
            cx={cursorPos.x}
            cy={cursorPos.y}
            r={4}
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth={1.5}
            opacity={0.8}
          />
        )}
      </svg>

      {quickMenuPosition && selectedDrawingId && (
        <DrawingQuickMenu
          x={quickMenuPosition.x}
          y={quickMenuPosition.y}
          onMove={onMove}
          onSettings={onSettings}
          onAlert={onAlert}
          onDelete={onDelete}
          onClose={onCloseQuickMenu}
          isHigherTimeframe={isHigherTF}
          sourceTimeframe={selectedDrawingTimeframe}
        />
      )}
    </>
  );
}
