import { ChannelSettings } from './ChannelSettings';
import { TrendlineSettings } from './TrendlineSettings';
import { HorizontalLineSettings } from './HorizontalLineSettings';
import { VerticalLineSettings } from './VerticalLineSettings';
import { FibRetracementSettings } from './FibRetracementSettings';
import { TrendFibSettings } from './TrendFibSettings';
import { RectangleSettings } from './RectangleSettings';
import { ElliottWaveSettings } from './ElliottWaveSettings';
import { TextSettings } from './TextSettings';

interface DrawingSettingsPanelProps {
  drawing: any;
  onUpdate: (updates: any) => void;
  onClose: () => void;
  autoColorEnabled?: boolean;
  onAutoColorChange?: (enabled: boolean) => void;
  onSaveAsDefault?: (payload: { tool: string; style: any }) => void | Promise<void>;
  onResetDefault?: (tool: string) => void | Promise<void>;
}

export function DrawingSettingsPanel({
  drawing,
  onUpdate,
  onClose,
  autoColorEnabled,
  onAutoColorChange,
  onSaveAsDefault,
  onResetDefault,
}: DrawingSettingsPanelProps) {
  if (!drawing) return null;

  const renderSettings = () => {
    switch (drawing.type) {
      case 'trendline':
        return <TrendlineSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'horizontal':
        return <HorizontalLineSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'vertical':
        return <VerticalLineSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'text':
        return <TextSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'rectangle':
        return <RectangleSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'channel':
        return <ChannelSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'fib_retracement':
        return <FibRetracementSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'trend_fib':
        return <TrendFibSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'elliott_wave':
        return <ElliottWaveSettings drawing={drawing} onUpdate={onUpdate} />;
      default:
        return <div className="p-4 text-gray-400 text-sm text-center">Settings not available for this tool</div>;
    }
  };

  return (
    <div className="w-full bg-slate-900 flex flex-col max-h-[70vh]">
      {/* Content - Scrollable */}
      <div className="overflow-y-auto flex-1">
        {renderSettings()}

        <div className="p-4 border-t border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-300">Auto Color</div>
            <button
              type="button"
              onClick={() => onAutoColorChange?.(!(autoColorEnabled ?? true))}
              className={`relative w-11 h-6 rounded-full transition-colors ${(autoColorEnabled ?? true) ? 'bg-cyan-600' : 'bg-slate-600'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${(autoColorEnabled ?? true) ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSaveAsDefault?.({ tool: drawing.type, style: drawing.style || {} })}
            className="w-full px-3 py-2 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Save Current Style as Default
          </button>

          <button
            type="button"
            onClick={() => onResetDefault?.(drawing.type)}
            className="w-full px-3 py-2 rounded text-xs bg-amber-700 hover:bg-amber-600 text-amber-100 transition-colors"
          >
            Reset Saved Default for This Tool
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
