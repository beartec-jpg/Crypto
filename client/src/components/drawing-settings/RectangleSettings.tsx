import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineWidthSelector } from './shared/LineWidthSelector';

interface RectangleSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function RectangleSettings({ drawing, onUpdate }: RectangleSettingsProps) {
  const color = drawing.style?.color || '#facc15';
  const opacity = drawing.style?.opacity ?? 1;
  const lineWidth = drawing.style?.lineWidth || 2;
  const fillOpacity = drawing.style?.fillOpacity ?? 0.1;
  const label = drawing.style?.label || '';
  const showLabel = drawing.style?.showLabel !== false;
  const labelPosition = drawing.style?.labelPosition || 'right';

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

      {/* Line Opacity */}
      <OpacitySlider
        value={opacity}
        onChange={(val) => onUpdate({ opacity: val })}
        label="Line Opacity"
      />

      {/* Fill Opacity */}
      <OpacitySlider
        value={fillOpacity}
        onChange={(val) => onUpdate({ fillOpacity: val })}
        label="Fill Opacity"
      />

      {/* Line Width */}
      <LineWidthSelector
        value={lineWidth}
        onChange={(w) => onUpdate({ lineWidth: w })}
      />

      {/* Label Text */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Label (optional)</div>
        <input
          type="text"
          value={label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Enter label..."
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
        />
      </div>

      {/* Show Label Toggle */}
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Show Label</span>
          <button
            onClick={() => onUpdate({ showLabel: !showLabel })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              showLabel ? 'bg-cyan-600' : 'bg-slate-600'
            }`}
            type="button"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                showLabel ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Label Position */}
      {label && showLabel && (
        <div>
          <div className="text-xs text-slate-400 mb-2">Label Position</div>
          <div className="flex gap-2">
            <button
              onClick={() => onUpdate({ labelPosition: 'left' })}
              className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                labelPosition === 'left'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
              type="button"
            >
              Left
            </button>
            <button
              onClick={() => onUpdate({ labelPosition: 'right' })}
              className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                labelPosition === 'right'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
              type="button"
            >
              Right
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
