import { ChannelSettings } from './ChannelSettings';
import { TrendlineSettings } from './TrendlineSettings';
import { HorizontalLineSettings } from './HorizontalLineSettings';
import { FibRetracementSettings } from './FibRetracementSettings';
import { TrendFibSettings } from './TrendFibSettings';
import { RectangleSettings } from './RectangleSettings';

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
      case 'rectangle':
        return <RectangleSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'channel':
        return <ChannelSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'fib_retracement':
        return <FibRetracementSettings drawing={drawing} onUpdate={onUpdate} />;
      case 'trend_fib':
        return <TrendFibSettings drawing={drawing} onUpdate={onUpdate} />;
      default:
        return <div className="p-4 text-gray-400 text-sm text-center">Settings not available for this tool</div>;
    }
  };

  return (
    <div className="w-full bg-slate-900 flex flex-col max-h-[70vh]">
      {/* Content - Scrollable */}
      <div className="overflow-y-auto flex-1">
        {renderSettings()}
      </div>
    </div>
  );
}
