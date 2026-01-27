import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineWidthSelector } from './shared/LineWidthSelector';

interface TrendlineSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function TrendlineSettings({ drawing, onUpdate }: TrendlineSettingsProps) {
  const color = drawing.style?.color || '#facc15';
  const opacity = drawing.style?.opacity ?? 1;
  const lineWidth = drawing.style?.lineWidth || 2;
  const extendLeft = drawing.style?.extendLeft || false;
  const extendRight = drawing.style?.extendRight || false;

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
      {/* Color */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-16">Color:</span>
        <ColorPicker
          color={color}
          onChange={(c) => onUpdate({ color: c })}
        />
      </div>

      {/* Opacity */}
      <OpacitySlider
        value={opacity}
        onChange={(val) => onUpdate({ opacity: val })}
        label="Opacity"
      />

      {/* Line Width */}
      <LineWidthSelector
        value={lineWidth}
        onChange={(w) => onUpdate({ lineWidth: w })}
      />

      {/* Extension Toggles */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400 mb-2">Extension</div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={extendLeft}
            onChange={(e) => onUpdate({ extendLeft: e.target.checked })}
            className="rounded border-slate-600 w-4 h-4"
            id="extend-left"
          />
          <label htmlFor="extend-left" className="text-xs text-gray-300">Extend Left</label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={extendRight}
            onChange={(e) => onUpdate({ extendRight: e.target.checked })}
            className="rounded border-slate-600 w-4 h-4"
            id="extend-right"
          />
          <label htmlFor="extend-right" className="text-xs text-gray-300">Extend Right</label>
        </div>
      </div>
    </div>
  );
}
