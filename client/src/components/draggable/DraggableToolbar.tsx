import { ReactNode } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { GripVertical } from 'lucide-react';

interface DraggableToolbarProps {
  children: ReactNode;
  storageKey?: string;
  initialPosition?: { x: number; y: number } | (() => { x: number; y: number });
}

// Default position function evaluated at render time
const defaultPosition = () => ({
  x: window.innerWidth / 2 - 150,
  y: window.innerHeight - 150
});

export function DraggableToolbar({ 
  children, 
  storageKey, 
  initialPosition = defaultPosition 
}: DraggableToolbarProps) {
  const { position, isDragging, handleMouseDown } = useDraggable({
    storageKey,
    initialPosition,
  });

  return (
    <div
      className="fixed z-30"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      <div className="flex flex-col items-center bg-slate-800/90 backdrop-blur rounded-lg shadow-lg border border-slate-600">
        {/* Drag Handle */}
        <div
          className="w-full px-2 py-1 cursor-grab active:cursor-grabbing flex justify-center border-b border-slate-600"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        {/* Toolbar Content */}
        <div className="p-2">
          {children}
        </div>
      </div>
    </div>
  );
}
