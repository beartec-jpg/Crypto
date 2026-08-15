import { useState } from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

// Common drawing + fib palette so pickers can re-select chart defaults
const COLORS = [
  '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#ffffff',
  '#787B86', '#F7525F', '#FF9800', '#4CAF50', '#089981', '#9C27B0',
  '#3179F5', '#E91E63', '#00CED1', '#808080', '#a855f7', '#94a3b8',
];

function colorsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isLight(color: string): boolean {
  const c = (color || '').trim().toLowerCase();
  if (c === '#fff' || c === '#ffffff' || c === 'white') return true;
  if (c.startsWith('#') && c.length >= 7) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    // relative luminance-ish
    return (r * 299 + g * 587 + b * 114) / 1000 > 180;
  }
  return false;
}

export function ColorPicker({ color, onChange, className = '' }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const safeColor = color && color.trim() ? color : '#3b82f6';
  const inPalette = COLORS.some((c) => colorsMatch(c, safeColor));
  const light = isLight(safeColor);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-8 h-8 rounded-md border-2 hover:scale-105 transition-transform shrink-0 ${
          light ? 'border-slate-400 shadow-inner' : 'border-slate-600'
        }`}
        style={{
          backgroundColor: safeColor,
          boxShadow: light
            ? 'inset 0 0 0 1px rgba(15,23,42,0.35)'
            : `0 0 0 1px ${safeColor}`,
        }}
        type="button"
        title={safeColor}
        aria-label={`Color ${safeColor}`}
      />
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg p-3 grid grid-cols-6 gap-2 left-0 mt-1 shadow-xl min-w-[168px]">
            <div className="col-span-6 text-[10px] text-slate-400 mb-0.5 font-mono truncate">
              {safeColor}
            </div>
            {!inPalette && safeColor && (
              <button
                onClick={() => {
                  onChange(safeColor);
                  setIsOpen(false);
                }}
                className="w-8 h-8 rounded hover:scale-110 transition-transform border-2 border-cyan-400"
                style={{ backgroundColor: safeColor }}
                type="button"
                title={`Current: ${safeColor}`}
              />
            )}
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
                className={`w-8 h-8 rounded hover:scale-110 transition-transform border-2 ${
                  colorsMatch(c, safeColor)
                    ? 'border-cyan-400 scale-110'
                    : isLight(c)
                      ? 'border-slate-500'
                      : 'border-slate-700 hover:border-slate-500'
                }`}
                style={{ backgroundColor: c }}
                type="button"
                title={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
