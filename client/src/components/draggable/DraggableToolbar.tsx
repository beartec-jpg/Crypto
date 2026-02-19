import { ReactNode, useState, Children, isValidElement, cloneElement } from 'react';
import { GripVertical, RotateCw, Minus, Plus } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';

interface DraggableToolbarProps {
  children: ReactNode;
  storageKey?: string;
  defaultPosition?: () => { x: number; y: number };
  className?: string;
  /** Key for persisting rotation state */
  rotationStorageKey?: string;
  /** Key for persisting minimized state */
  minimizedStorageKey?: string;
  /** First child element to show when minimized */
  minimizedPreview?: ReactNode;
}

export function DraggableToolbar({
  children,
  storageKey = 'draggable-toolbar-position',
  defaultPosition = () => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 30 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - 150 : 0,
  }),
  className,
  rotationStorageKey,
  minimizedStorageKey,
  minimizedPreview,
}: DraggableToolbarProps) {
  // Rotation state (false = horizontal, true = vertical)
  const [isVertical, setIsVertical] = useState(() => {
    if (!rotationStorageKey) return false;
    try {
      return localStorage.getItem(rotationStorageKey) === 'true';
    } catch { /* Ignore localStorage errors (e.g., private browsing) */ return false; }
  });

  // Minimized state
  const [isMinimized, setIsMinimized] = useState(() => {
    if (!minimizedStorageKey) return false;
    try {
      return localStorage.getItem(minimizedStorageKey) === 'true';
    } catch { /* Ignore localStorage errors (e.g., private browsing) */ return false; }
  });

  const { position, isDragging, dragHandleProps } = useDraggable({
    initialPosition: defaultPosition(),
    storageKey,
  });

  const handleRotate = () => {
    const newValue = !isVertical;
    setIsVertical(newValue);
    if (rotationStorageKey) {
      try { localStorage.setItem(rotationStorageKey, String(newValue)); } catch { /* Ignore localStorage errors */ }
    }
  };

  const handleToggleMinimize = () => {
    const newValue = !isMinimized;
    setIsMinimized(newValue);
    if (minimizedStorageKey) {
      try { localStorage.setItem(minimizedStorageKey, String(newValue)); } catch { /* Ignore localStorage errors */ }
    }
  };

  return (
    <div
      data-draggable
      className={cn(
        "fixed z-50 select-none",
        isDragging && "opacity-80",
        className
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className={cn("flex", isVertical ? "flex-row" : "flex-col")}>
        {/* Control Bar (Drag Handle + Rotate + Minimize) */}
        <div
          className={cn(
            "flex items-center justify-center gap-1 bg-slate-800/95 backdrop-blur-sm border border-slate-700",
            isVertical
              ? "flex-col border-r-0 rounded-l-lg px-1 py-2"
              : "flex-row border-b-0 rounded-t-lg px-2 py-1"
          )}
        >
          {/* Drag Handle */}
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1">
            <GripVertical className={cn("h-4 w-4 text-slate-400", isVertical && "rotate-90")} />
          </div>

          {/* Rotate Button */}
          <button
            onClick={handleRotate}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
            title="Rotate toolbar"
            aria-label="Rotate toolbar"
          >
            <RotateCw className="h-3 w-3" />
          </button>

          {/* Minimize/Maximize Button */}
          <button
            onClick={handleToggleMinimize}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
            title={isMinimized ? "Expand toolbar" : "Minimize toolbar"}
            aria-label={isMinimized ? "Expand toolbar" : "Minimize toolbar"}
          >
            {isMinimized ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </button>
        </div>

        {/* Toolbar Content */}
        <div
          className={cn(
            isVertical ? "[&>*]:rounded-l-none" : "[&>*]:rounded-t-none",
            isMinimized && "hidden"
          )}
        >
          {Children.map(children, (child) =>
            isValidElement(child) ? cloneElement(child as React.ReactElement<{ isVertical?: boolean }>, { isVertical }) : child
          )}
        </div>

        {/* Minimized Preview (shows first icon as clickable preview to expand) */}
        {isMinimized && minimizedPreview && (
          <div
            onClick={handleToggleMinimize}
            className={cn(
              "bg-slate-900/95 backdrop-blur-sm border border-slate-700 p-2 cursor-pointer hover:bg-slate-800",
              isVertical ? "rounded-r-lg border-l-0" : "rounded-b-lg border-t-0"
            )}
          >
            {minimizedPreview}
          </div>
        )}
      </div>
    </div>
  );
}
