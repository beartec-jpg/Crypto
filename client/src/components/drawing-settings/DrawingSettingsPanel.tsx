import { ChannelSettings } from './ChannelSettings';
import { TrendlineSettings } from './TrendlineSettings';
import { HorizontalLineSettings } from './HorizontalLineSettings';
import { FibRetracementSettings } from './FibRetracementSettings';
import { TrendFibSettings } from './TrendFibSettings';

interface DrawingSettingsPanelProps {
  drawing: any;
  onUpdate: (updates: any) => void;
  onClose: () => void;
}

export function DrawingSettingsPanel({ drawing, onUpdate, onClose }: DrawingSettingsPanelProps) {
  if (!drawing) return null;

  const renderSettings = () => {
    switch (drawing.type) {
      case 'trendline':
        return <TrendlineSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'horizontal':
        return <HorizontalLineSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'channel':
        return <ChannelSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'fib_retracement':
        return <FibRetracementSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'trend_fib':
        return <TrendFibSettings drawing={drawing} onUpdate={onUpdate} />;
      default:
        return <div className="p-4 text-gray-400 text-sm">Settings not available for this tool</div>;
    }
  };

  return (
    <div className="fixed right-4 top-20 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <h3 className="text-white font-semibold text-sm">Drawing Settings</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {renderSettings()}
      </div>
    </div>
  );
}
