import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineWidthSelector } from './shared/LineWidthSelector';
import { LineStyleSelector } from './shared/LineStyleSelector';
import { LabelSettings } from './shared/LabelSettings';

interface HorizontalLineSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

export function HorizontalLineSettings({ drawing, onUpdate }: HorizontalLineSettingsProps) {
  const color = drawing.style?.color || '#facc15';
  const opacity = drawing.style?.opacity ?? 1;
  const lineWidth = drawing.style?.lineWidth || 2;
  const lineStyle = drawing.style?.lineStyle || 'solid';
  const label = drawing.style?.label || '';
  const showLabel = drawing.style?.showLabel ?? drawing.style?.showLabels ?? true;
  const labelPosition = drawing.style?.labelPosition || 'right';
  const labelColor = drawing.style?.labelColor || color;
  const labelSize = drawing.style?.labelSize || 'md';

  // Helper to wrap updates in { style: { ... } } format
  const handleUpdate = (styleUpdates: any) => {
    console.log('[HorizontalLineSettings] Updating with:', styleUpdates);
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

      <LabelSettings
        label={label}
        showLabel={showLabel}
        labelPosition={labelPosition}
        labelColor={labelColor}
        labelSize={labelSize}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
