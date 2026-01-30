import React from 'react';

interface ChartTimeTooltipProps {
  crosshairInfo: { time: number; x: number; y: number } | null;
  chartContainerWidth?: number;
}

export const ChartTimeTooltip: React.FC<ChartTimeTooltipProps> = ({
  crosshairInfo,
  chartContainerWidth = 800
}) => {
  if (!crosshairInfo || crosshairInfo.time <= 0) {
    return null;
  }

  return (
    <div 
      className="absolute pointer-events-none z-20 bg-slate-900/90 text-white text-xs px-2 py-1 rounded border border-slate-600"
      style={{ 
        left: Math.min(crosshairInfo.x, chartContainerWidth - 120), 
        bottom: 10
      }}
    >
      {new Date(crosshairInfo.time * 1000).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    </div>
  );
};
