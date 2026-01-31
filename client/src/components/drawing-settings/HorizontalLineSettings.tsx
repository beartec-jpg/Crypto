import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineWidthSelector } from './shared/LineWidthSelector';
import { LineStyleSelector } from './shared/LineStyleSelector';

interface HorizontalLineSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function HorizontalLineSettings({ drawing, onUpdate }: HorizontalLineSettingsProps) {
  const color = drawing.style?.color || '#facc15';
  const opacity = drawing.style?.opacity ?? 1;
  const lineWidth = drawing.style?.lineWidth || 2;
  const lineStyle = drawing.style?.lineStyle || 'solid';

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

      {/* Line Style */}
      <LineStyleSelector
        value={lineStyle}
        onChange={(style) => onUpdate({ lineStyle: style })}
      />
    </div>
  );
}
