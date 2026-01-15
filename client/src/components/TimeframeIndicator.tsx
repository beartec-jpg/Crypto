/**
 * TimeframeIndicator - displays current timeframe with visual feedback
 */

import { memo } from 'react';
import type { TimeframeInterval } from '@/types/timeframes';
import { formatTimeframe } from '@/lib/timeframeUtils';
import { TrendingUp, Clock } from 'lucide-react';

interface TimeframeIndicatorProps {
  /** Current timeframe */
  currentTimeframe: TimeframeInterval;
  /** Whether adaptive mode is active */
  isAdaptiveMode: boolean;
  /** Whether transitioning between timeframes */
  isTransitioning?: boolean;
  /** Previous timeframe (during transition) */
  previousTimeframe?: TimeframeInterval | null;
  /** Suggested timeframe */
  suggestedTimeframe?: TimeframeInterval | null;
  /** Click handler to toggle adaptive mode */
  onToggleAdaptive?: () => void;
  /** Compact display mode */
  compact?: boolean;
}

/**
 * Component to display current timeframe and adaptive mode status
 */
export const TimeframeIndicator = memo<TimeframeIndicatorProps>(({
  currentTimeframe,
  isAdaptiveMode,
  isTransitioning = false,
  previousTimeframe = null,
  suggestedTimeframe = null,
  onToggleAdaptive,
  compact = false
}) => {
  const displayName = formatTimeframe(currentTimeframe);
  const showTransition = isTransitioning && previousTimeframe;

  return (
    <div 
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg
        ${isAdaptiveMode ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-800 border border-slate-600'}
        ${onToggleAdaptive ? 'cursor-pointer hover:opacity-80' : ''}
        transition-all duration-200
      `}
      onClick={onToggleAdaptive}
      title={isAdaptiveMode ? 'Adaptive mode enabled - Click to disable' : 'Click to enable adaptive mode'}
    >
      {/* Icon */}
      <div className="flex items-center justify-center">
        {isAdaptiveMode ? (
          <TrendingUp className="w-4 h-4 text-blue-400" />
        ) : (
          <Clock className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Timeframe Display */}
      {!compact && (
        <div className="flex flex-col gap-0.5">
          {showTransition ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-400 line-through">
                {formatTimeframe(previousTimeframe)}
              </span>
              <span className="text-gray-500">→</span>
              <span className={`text-white font-medium ${isTransitioning ? 'animate-pulse' : ''}`}>
                {displayName}
              </span>
            </div>
          ) : (
            <span className="text-sm text-white font-medium">
              {displayName}
            </span>
          )}
          
          {isAdaptiveMode && (
            <span className="text-[10px] text-blue-400">
              Adaptive
            </span>
          )}
        </div>
      )}

      {/* Compact Mode */}
      {compact && (
        <span className={`text-sm font-medium ${isAdaptiveMode ? 'text-blue-400' : 'text-gray-300'}`}>
          {currentTimeframe}
        </span>
      )}

      {/* Transition Indicator */}
      {isTransitioning && (
        <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
      )}

      {/* Suggested Timeframe Badge */}
      {!isTransitioning && suggestedTimeframe && suggestedTimeframe !== currentTimeframe && isAdaptiveMode && (
        <div 
          className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
          title={`Suggested: ${formatTimeframe(suggestedTimeframe)}`}
        >
          !
        </div>
      )}
    </div>
  );
});

TimeframeIndicator.displayName = 'TimeframeIndicator';
