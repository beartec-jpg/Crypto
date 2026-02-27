import type { MouseEvent } from 'react';
import { Time } from 'lightweight-charts';
import type { Drawing, ChartDrawingTool } from '@/types/drawing';

interface WaveClickOverlayProps {
  chartViewVersion: number;
  drawings: Drawing[];
  chart: any;
  candleSeries: any;
  selectedWaveId: string | null;
  activeTool: ChartDrawingTool;
  onDeselect: () => void;
  onWaveClick: (waveId: string, event: MouseEvent) => void;
}

export function WaveClickOverlay({
  chartViewVersion,
  drawings,
  chart,
  candleSeries,
  selectedWaveId,
  activeTool,
  onDeselect,
  onWaveClick,
}: WaveClickOverlayProps) {
  if (chartViewVersion < 0) {
    return null;
  }

  return (
    <svg
      className="absolute top-0 left-0"
      style={{ width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }}
    >
      <rect
        x={0}
        y={0}
        width="100%"
        height="100%"
        fill="transparent"
        style={{ pointerEvents: selectedWaveId && !activeTool ? 'auto' : 'none' }}
        onClick={onDeselect}
      />
      {drawings
        .filter(drawing => drawing.type === 'elliott_wave' && drawing.points.length >= 2)
        .map(wave => {
          if (!chart || !candleSeries) return null;
          const coordinates = wave.points
            .map(point => ({
              x: chart.timeScale().timeToCoordinate(point.time as Time) as number | null,
              y: candleSeries.priceToCoordinate(point.price) as number | null,
            }))
            .filter((coordinate): coordinate is { x: number; y: number } => coordinate.x !== null && coordinate.y !== null);

          if (coordinates.length < 2) return null;

          const firstCoordinate = coordinates[0];
          const lastCoordinate = coordinates[coordinates.length - 1];
          const xDelta = lastCoordinate.x - firstCoordinate.x;
          const yDelta = lastCoordinate.y - firstCoordinate.y;
          const length = Math.sqrt(xDelta * xDelta + yDelta * yDelta);
          if (length === 0) return null;

          const normalX = (-yDelta / length) * 12;
          const normalY = (xDelta / length) * 12;
          const polygonPoints = [
            `${firstCoordinate.x + normalX},${firstCoordinate.y + normalY}`,
            `${lastCoordinate.x + normalX},${lastCoordinate.y + normalY}`,
            `${lastCoordinate.x - normalX},${lastCoordinate.y - normalY}`,
            `${firstCoordinate.x - normalX},${firstCoordinate.y - normalY}`,
          ].join(' ');

          const isInteractive = !activeTool;

          return (
            <g key={wave.id}>
              <polygon
                points={polygonPoints}
                fill="transparent"
                stroke="transparent"
                style={{
                  pointerEvents: 'auto',
                  cursor: isInteractive ? 'pointer' : 'default',
                }}
                onClick={(event) => {
                  if (!activeTool) {
                    event.stopPropagation();
                    onWaveClick(wave.id, event);
                  }
                }}
              />
              {selectedWaveId === wave.id && (
                <line
                  x1={firstCoordinate.x}
                  y1={firstCoordinate.y}
                  x2={lastCoordinate.x}
                  y2={lastCoordinate.y}
                  stroke="#22c55e"
                  strokeWidth={3}
                  pointerEvents="none"
                  opacity={0.8}
                />
              )}
            </g>
          );
        })}
    </svg>
  );
}
