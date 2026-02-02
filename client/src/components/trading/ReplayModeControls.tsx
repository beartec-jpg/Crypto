import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Props for the ReplayModeControls component
 */
export interface ReplayModeControlsProps {
  /** Whether replay mode is currently active */
  isReplayMode: boolean;
  /** Current replay index (candle position) */
  replayIndex: number;
  /** Replay speed multiplier (1x, 2x, 5x, 10x) */
  replaySpeed: number;
  /** Whether replay is currently playing */
  isReplayPlaying: boolean;
  /** Maximum number of candles available */
  maxCandles: number;
  /** Callback to toggle replay mode on/off */
  onToggleReplayMode: () => void;
  /** Callback to set replay index */
  onSetReplayIndex: (index: number) => void;
  /** Callback to set replay speed */
  onSetReplaySpeed: (speed: number) => void;
  /** Callback to toggle playback (play/pause) */
  onTogglePlayback: () => void;
  /** Callback to step backward by N candles */
  onStepBackward: (steps: number) => void;
  /** Callback to step forward by N candles */
  onStepForward: (steps: number) => void;
  /** Callback to reset to beginning */
  onReset: () => void;
}

/**
 * ReplayModeControls Component
 * 
 * Provides controls for replay mode functionality including:
 * - Toggle replay mode on/off
 * - Play/pause playback
 * - Speed control (1x, 2x, 5x, 10x)
 * - Step forward/backward (1 or 10 candles)
 * - Progress indicator
 * - Reset button
 */
export function ReplayModeControls({
  isReplayMode,
  replayIndex,
  replaySpeed,
  isReplayPlaying,
  maxCandles,
  onToggleReplayMode,
  onSetReplayIndex,
  onSetReplaySpeed,
  onTogglePlayback,
  onStepBackward,
  onStepForward,
  onReset,
}: ReplayModeControlsProps) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardContent className="p-3">
        <div className="space-y-2">
          {/* Row 1: Toggle, Reset, and Playback Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded">
              <Label className="text-white font-semibold text-sm">Replay Mode</Label>
              <Switch 
                checked={isReplayMode} 
                onCheckedChange={onToggleReplayMode}
              />
            </div>

            {isReplayMode && (
              <>
                <button
                  onClick={onReset}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-semibold transition-colors"
                  data-testid="button-replay-reset"
                >
                  🔄 Reset
                </button>
                
                <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1.5 rounded">
                  <button
                    onClick={() => onStepBackward(10)}
                    disabled={replayIndex <= 100}
                    className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                    data-testid="button-replay-backward-10"
                  >
                    ⏪ -10
                  </button>
                  <button
                    onClick={() => onStepBackward(1)}
                    disabled={replayIndex <= 100}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                    data-testid="button-replay-backward-1"
                  >
                    ◀ -1
                  </button>
                  <button
                    onClick={onTogglePlayback}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
                    data-testid="button-replay-play"
                  >
                    {isReplayPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button
                    onClick={() => onStepForward(1)}
                    disabled={replayIndex >= maxCandles}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                    data-testid="button-replay-forward-1"
                  >
                    +1 ▶
                  </button>
                  <button
                    onClick={() => onStepForward(10)}
                    disabled={replayIndex >= maxCandles}
                    className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                    data-testid="button-replay-forward-10"
                  >
                    +10 ⏩
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Row 2: Speed & Progress Bar */}
          {isReplayMode && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-gray-400 text-xs">Speed:</Label>
                <Select value={replaySpeed.toString()} onValueChange={(v) => onSetReplaySpeed(parseInt(v))}>
                  <SelectTrigger className="w-20 h-7 bg-slate-900 text-white border-slate-600 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                    <SelectItem value="10">10x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 flex items-center gap-2">
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  {replayIndex} / {maxCandles} candles
                </span>
                <div className="flex-1 bg-slate-900 rounded h-2 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-200"
                    style={{ width: `${maxCandles > 0 ? (replayIndex / maxCandles) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
