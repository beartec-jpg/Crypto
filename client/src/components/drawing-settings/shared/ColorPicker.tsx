import { useState } from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#ffffff'];

export function ColorPicker({ color, onChange, className = '' }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded border-2 border-slate-600 hover:border-slate-400 transition-colors"
        style={{ backgroundColor: color }}
        type="button"
      />
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg p-3 grid grid-cols-3 gap-2 left-0 mt-1 shadow-xl min-w-[120px]">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
                className="w-8 h-8 rounded hover:scale-110 transition-transform border-2 border-slate-700 hover:border-slate-500"
                style={{ backgroundColor: c }}
                type="button"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
