/**
 * TimeframeIndicator Component
 * Displays current timeframe and adaptive mode status
 */

import { TrendingUp, Clock, Loader2 } from 'lucide-react';
import type { TimeframeInterval } from '@/types/timeframes';
import { formatTimeframe } from '@/lib/timeframeUtils';

interface TimeframeIndicatorProps {
  currentTimeframe: TimeframeInterval;
  isAdaptiveMode: boolean;
  isTransitioning: boolean;
  previousTimeframe?: TimeframeInterval | null;
  suggestedTimeframe?: TimeframeInterval | null;
  onToggleAdaptive?: () => void;
  compact?: boolean;
}

export function TimeframeIndicator({
  currentTimeframe,
  isAdaptiveMode,
  isTransitioning,
  previousTimeframe,
  suggestedTimeframe,
  onToggleAdaptive,
  compact = false,
}: TimeframeIndicatorProps) {
  const handleClick = () => {
    if (onToggleAdaptive) {
      onToggleAdaptive();
    }
  };

  // Determine border color based on state
  const getBorderColor = () => {
    if (isTransitioning) return 'border-yellow-500';
    if (isAdaptiveMode) return 'border-blue-500';
    return 'border-gray-500';
  };

  // Determine background color based on state
  const getBgColor = () => {
    if (isTransitioning) return 'bg-yellow-500/10';
    if (isAdaptiveMode) return 'bg-blue-500/10';
    return 'bg-gray-500/10';
  };

  // Choose appropriate icon
  const Icon = isAdaptiveMode ? TrendingUp : Clock;

  return (
    <div
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-md border-2 transition-all cursor-pointer
        ${getBorderColor()} ${getBgColor()}
        hover:opacity-80
      `}
      title={isAdaptiveMode ? 'Adaptive mode enabled - Click to disable' : 'Adaptive mode disabled - Click to enable'}
    >
      {/* Icon */}
      <Icon className="w-4 h-4 text-white" />

      {/* Timeframe display */}
      <div className="flex items-center gap-1">
        <span className="text-white font-semibold text-sm">
          {currentTimeframe}
        </span>
        
        {/* Show transition arrow */}
        {isTransitioning && previousTimeframe && (
          <span className="text-gray-400 text-xs">
            → {currentTimeframe}
          </span>
        )}
      </div>

      {/* Adaptive badge */}
      {isAdaptiveMode && !compact && (
        <div className="flex items-center gap-1">
          <div className="h-3 w-px bg-gray-400" />
          <span className="text-xs text-blue-400 font-medium">
            Adaptive
          </span>
          {isTransitioning && (
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          )}
        </div>
      )}

      {/* Pulse indicator when transitioning */}
      {isTransitioning && (
        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
      )}
    </div>
  );
}
