import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineWidthSelector } from './shared/LineWidthSelector';
import { LineStyleSelector } from './shared/LineStyleSelector';

interface TrendlineSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function TrendlineSettings({ drawing, onUpdate }: TrendlineSettingsProps) {
  const color = drawing.style?.color || '#facc15';
  const opacity = drawing.style?.opacity ?? 1;
  const lineWidth = drawing.style?.lineWidth || 2;
  const lineStyle = drawing.style?.lineStyle || 'solid';
  const extendLeft = drawing.style?.extendLeft || false;
  const extendRight = drawing.style?.extendRight || false;

  // Helper to wrap updates in { style: { ... } } format
  const handleUpdate = (styleUpdates: any) => {
    console.log('[TrendlineSettings] Updating with:', styleUpdates);
    onUpdate({ style: { ...drawing.style, ...styleUpdates } });
  };

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
      {/* Color */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-16">Color:</span>
        <ColorPicker
          color={color}
          onChange={(c) => handleUpdate({ color: c })}
        />
      </div>

      {/* Opacity */}
      <OpacitySlider
        value={opacity}
        onChange={(val) => handleUpdate({ opacity: val })}
        label="Opacity"
      />

      {/* Line Width */}
      <LineWidthSelector
        value={lineWidth}
        onChange={(w) => handleUpdate({ lineWidth: w })}
      />

      {/* Line Style */}
      <LineStyleSelector
        value={lineStyle}
        onChange={(style) => handleUpdate({ lineStyle: style })}
      />

      {/* Extension Toggles */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400 mb-2">Extension</div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={extendLeft}
            onChange={(e) => handleUpdate({ extendLeft: e.target.checked })}
            className="rounded border-slate-600 w-4 h-4 cursor-pointer"
            id="extend-left"
          />
          <label htmlFor="extend-left" className="text-xs text-gray-300 cursor-pointer">Extend Left</label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={extendRight}
            onChange={(e) => handleUpdate({ extendRight: e.target.checked })}
            className="rounded border-slate-600 w-4 h-4 cursor-pointer"
            id="extend-right"
          />
          <label htmlFor="extend-right" className="text-xs text-gray-300 cursor-pointer">Extend Right</label>
        </div>
      </div>
    </div>
  );
}
