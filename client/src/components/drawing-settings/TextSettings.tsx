import { resolveDrawingColor } from '@/constants/drawingColors';
import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';

interface TextSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function TextSettings({ drawing, onUpdate }: TextSettingsProps) {
  const color = resolveDrawingColor(drawing.style);
  const opacity = drawing.style?.opacity ?? 1;
  const text = drawing.style?.text || 'Text';
  const fontSize = drawing.style?.fontSize ?? 14;
  const fontWeight = drawing.style?.fontWeight || 'normal';
  const showBackground = drawing.style?.showBackground ?? true;
  const backgroundColor = drawing.style?.backgroundColor || 'rgba(15, 23, 42, 0.8)';

  const handleUpdate = (styleUpdates: any) => {
    onUpdate({ style: { ...drawing.style, ...styleUpdates } });
  };

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
      <div>
        <div className="text-xs text-slate-400 mb-2">Text</div>
        <input
          type="text"
          value={text}
          onChange={(e) => handleUpdate({ text: e.target.value })}
          placeholder="Enter label..."
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-16">Color:</span>
        <ColorPicker color={color} onChange={(c) => handleUpdate({ color: c })} />
      </div>

      <OpacitySlider
        value={opacity}
        onChange={(val) => handleUpdate({ opacity: val })}
        label="Opacity"
      />

      <div>
        <div className="text-xs text-slate-400 mb-2">Text Size</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="10"
            max="36"
            value={fontSize}
            onChange={(e) => handleUpdate({ fontSize: parseInt(e.target.value, 10) })}
            className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
          />
          <span className="text-xs text-slate-300 w-10 text-right">{fontSize}px</span>
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-2">Font Weight</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleUpdate({ fontWeight: 'normal' })}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              fontWeight === 'normal'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => handleUpdate({ fontWeight: 'bold' })}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              fontWeight === 'bold'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            Bold
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Show Background</span>
        <button
          type="button"
          onClick={() => handleUpdate({ showBackground: !showBackground })}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            showBackground ? 'bg-cyan-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              showBackground ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {showBackground && (
        <div>
          <div className="text-xs text-slate-400 mb-2">Background Color</div>
          <input
            type="text"
            value={backgroundColor}
            onChange={(e) => handleUpdate({ backgroundColor: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
            placeholder="rgba(15, 23, 42, 0.8)"
          />
        </div>
      )}
    </div>
  );
}
