import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineWidthSelector } from './shared/LineWidthSelector';
import { LineStyleSelector } from './shared/LineStyleSelector';

interface ElliottWaveSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function ElliottWaveSettings({ drawing, onUpdate }: ElliottWaveSettingsProps) {
  const style = drawing.style || {};

  const impulseColor   = style.impulseColor   ?? style.color ?? '#00CED1';
  const impulseOpacity = style.impulseOpacity  ?? style.opacity ?? 1;
  const impulseWidth   = style.impulseWidth    ?? style.lineWidth ?? 2;
  const impulseStyle   = style.impulseStyle    ?? 'solid';
  const zigzagColor    = style.zigzagColor     ?? '#808080';
  const zigzagOpacity  = style.zigzagOpacity   ?? 1;
  const zigzagStyle    = style.zigzagStyle     ?? 'dashed';
  const degreeLabel    = style.degreeLabel     ?? 'Minor';
  const showLabel      = style.showLabel       ?? true;
  const fontSize       = style.fontSize        ?? '12px';
  const showFuturePredictions = style.showFuturePredictions ?? true;

  const handleUpdate = (styleUpdates: any) => {
    onUpdate({ style: { ...style, ...styleUpdates } });
  };

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
      {/* Main Impulse Line */}
      <div className="border-b border-slate-700 pb-4">
        <div className="text-sm font-semibold text-white mb-3">Main Impulse Line</div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-16">Color:</span>
            <ColorPicker
              color={impulseColor}
              onChange={(c) => handleUpdate({ impulseColor: c, color: c })}
            />
          </div>

          <OpacitySlider
            value={impulseOpacity}
            onChange={(val) => handleUpdate({ impulseOpacity: val, opacity: val })}
            label="Opacity"
          />

          <LineWidthSelector
            value={impulseWidth}
            onChange={(w) => handleUpdate({ impulseWidth: w, lineWidth: w })}
          />

          <LineStyleSelector
            value={impulseStyle}
            onChange={(s) => handleUpdate({ impulseStyle: s })}
          />
        </div>
      </div>

      {/* Zigzag Correction Line */}
      <div className="border-b border-slate-700 pb-4">
        <div className="text-sm font-semibold text-white mb-3">Zigzag Correction</div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-16">Color:</span>
            <ColorPicker
              color={zigzagColor}
              onChange={(c) => handleUpdate({ zigzagColor: c })}
            />
          </div>

          <OpacitySlider
            value={zigzagOpacity}
            onChange={(val) => handleUpdate({ zigzagOpacity: val })}
            label="Opacity"
          />

          <LineStyleSelector
            value={zigzagStyle}
            onChange={(s) => handleUpdate({ zigzagStyle: s })}
          />
        </div>
      </div>

      {/* Degree Label */}
      <div className="border-b border-slate-700 pb-4">
        <div className="text-sm font-semibold text-white mb-3">Degree Label</div>

        <div className="space-y-3">
          <input
            type="text"
            value={degreeLabel}
            onChange={(e) => handleUpdate({ degreeLabel: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ew-show-label"
              checked={showLabel}
              onChange={(e) => handleUpdate({ showLabel: e.target.checked })}
              className="rounded border-slate-600 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="ew-show-label" className="text-xs text-slate-300 cursor-pointer">Show Label</label>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 whitespace-nowrap">Font Size:</label>
            <select
              value={fontSize}
              onChange={(e) => handleUpdate({ fontSize: e.target.value })}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="8px">8px</option>
              <option value="10px">10px</option>
              <option value="12px">12px</option>
              <option value="14px">14px</option>
            </select>
          </div>
        </div>
      </div>

      {/* Future Projections */}
      <div>
        <div className="text-sm font-semibold text-white mb-3">Future Projections</div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ew-show-predictions"
              checked={showFuturePredictions}
              onChange={(e) => handleUpdate({ showFuturePredictions: e.target.checked })}
              className="rounded border-slate-600 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="ew-show-predictions" className="text-xs text-slate-300 cursor-pointer">
              Show Future Wave Predictions
            </label>
          </div>

          <p className="text-xs text-slate-500">
            Display predicted retracement levels for the next wave based on current wave labeling
          </p>
        </div>
      </div>
    </div>
  );
}
