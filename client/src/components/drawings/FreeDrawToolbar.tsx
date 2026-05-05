import { cn } from '@/lib/utils';
import type { FreeDrawMode } from '@/types/drawing';

interface FreeDrawToolbarProps {
  mode: FreeDrawMode;
  onModeChange: (mode: FreeDrawMode) => void;
  color: string;
  onColorChange: (color: string) => void;
  lineWidth: number;
  onLineWidthChange: (width: number) => void;
}

const MODES: { mode: FreeDrawMode; label: string; title: string }[] = [
  { mode: 'free', label: '~', title: 'Free – exact freehand stroke' },
  { mode: 'line_assisted', label: '⟋', title: 'Line assisted – straightens segments' },
  { mode: 'curve_assisted', label: '∪', title: 'Curve assisted – smooth curves' },
];

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#ef4444', // red
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ffffff', // white
  '#94a3b8', // slate
  '#f97316', // orange
];

const LINE_WIDTHS = [
  { width: 1, label: '—', title: 'Thin' },
  { width: 2, label: '━', title: 'Medium' },
  { width: 3, label: '┅', title: 'Thick' },
];

/**
 * Floating on-screen toolbar shown whenever the free_draw tool is active.
 * Lets the user pick draw mode, colour and line thickness without navigating menus.
 */
export function FreeDrawToolbar({
  mode,
  onModeChange,
  color,
  onColorChange,
  lineWidth,
  onLineWidthChange,
}: FreeDrawToolbarProps) {
  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-slate-900/95 border border-slate-600 rounded-lg px-3 py-1.5 shadow-xl backdrop-blur-sm select-none"
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      {/* Mode buttons */}
      <div className="flex items-center gap-0.5">
        {MODES.map(({ mode: m, label, title }) => (
          <button
            key={m}
            title={title}
            type="button"
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onModeChange(m); }}
            className={cn(
              'w-7 h-7 rounded text-sm font-mono transition-colors',
              mode === m
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-slate-600" />

      {/* Colour presets */}
      <div className="flex items-center gap-1">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            title={c}
            type="button"
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onColorChange(c); }}
            className={cn(
              'w-4 h-4 rounded-full border transition-transform',
              color === c ? 'scale-125 border-white' : 'border-slate-500 hover:scale-110',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="w-px h-5 bg-slate-600" />

      {/* Line width */}
      <div className="flex items-center gap-0.5">
        {LINE_WIDTHS.map(({ width, label, title: t }) => (
          <button
            key={width}
            title={t}
            type="button"
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onLineWidthChange(width); }}
            className={cn(
              'w-7 h-7 rounded text-sm font-mono transition-colors',
              lineWidth === width
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
