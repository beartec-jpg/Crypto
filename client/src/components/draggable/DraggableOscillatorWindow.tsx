import { ReactNode } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { X, Minimize2 } from 'lucide-react';

interface DraggableOscillatorWindowProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onDock?: () => void;
  storageKey?: string;
  initialPosition?: { x: number; y: number };
  width?: number;
  height?: number;
}

export function DraggableOscillatorWindow({
  title,
  children,
  onClose,
  onDock,
  storageKey,
  initialPosition = { x: 100, y: 100 },
  width = 400,
  height = 200,
}: DraggableOscillatorWindowProps) {
  const { position, isDragging, handleMouseDown } = useDraggable({
    storageKey,
    initialPosition,
  });

  return (
    <div
      className="fixed z-40 bg-slate-900 rounded-lg shadow-xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width,
        minHeight: height,
      }}
    >
      {/* Title Bar / Drag Handle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-800 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <span className="text-sm font-medium text-white">{title}</span>
        <div className="flex items-center gap-1">
          {onDock && (
            <button
              onClick={onDock}
              className="p-1 hover:bg-slate-700 rounded"
              title="Dock"
            >
              <Minimize2 className="h-3 w-3 text-slate-400" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-500/20 rounded"
            title="Close"
          >
            <X className="h-3 w-3 text-slate-400 hover:text-red-400" />
          </button>
        </div>
      </div>
      {/* Content */}
      <div className="p-2">
        {children}
      </div>
    </div>
  );
}
