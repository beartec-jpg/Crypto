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
  const extendLeft = drawing.style?.extendLeft || false;
  const extendRight = drawing.style?.extendRight || false;

  // Helper to wrap updates in { style: { ... } } format
  const handleUpdate = (styleUpdates: any) => {
    console.log('[RectangleSettings] Updating with:', styleUpdates);
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

      {/* Fill Opacity */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Fill Opacity</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(fillOpacity * 100)}
            onChange={(e) => handleUpdate({ fillOpacity: parseInt(e.target.value) / 100 })}
            className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
          />
          <span className="text-xs text-slate-300 w-10 text-right">{Math.round(fillOpacity * 100)}%</span>
        </div>
      </div>

      {/* Extension Toggles */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400 mb-2">Extension</div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={extendLeft}
            onChange={(e) => handleUpdate({ extendLeft: e.target.checked })}
            className="rounded border-slate-600 w-4 h-4 cursor-pointer"
            id="rectangle-extend-left"
          />
          <label htmlFor="rectangle-extend-left" className="text-xs text-gray-300 cursor-pointer">Extend Left</label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={extendRight}
            onChange={(e) => handleUpdate({ extendRight: e.target.checked })}
            className="rounded border-slate-600 w-4 h-4 cursor-pointer"
            id="rectangle-extend-right"
          />
          <label htmlFor="rectangle-extend-right" className="text-xs text-gray-300 cursor-pointer">Extend Right</label>
        </div>
      </div>

      {/* Label Text */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Label (optional)</div>
        <input
          type="text"
          value={label}
          onChange={(e) => handleUpdate({ label: e.target.value })}
          placeholder="Enter label..."
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
        />
      </div>

      {/* Show Label Toggle */}
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Show Label</span>
          <button
            onClick={() => handleUpdate({ showLabel: !showLabel })}
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
              onClick={() => handleUpdate({ labelPosition: 'left' })}
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
              onClick={() => handleUpdate({ labelPosition: 'right' })}
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
