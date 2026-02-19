import { ReactNode, useState, useMemo } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { Minimize2, Maximize2 } from 'lucide-react';

interface DraggableOscillatorWindowProps {
  title: string;
  children: ReactNode;
  storageKey?: string;
  initialPosition?: { x: number; y: number };
  height?: number;
}

// Width mode constants
const FULL_WIDTH_PERCENTAGE = 0.9; // 90% of screen width
const FULL_WIDTH_LEFT_MARGIN = '5%'; // Center with 5% margin on each side
const HALF_WIDTH_PERCENTAGE = 0.48; // 48% so two can fit side by side

export function DraggableOscillatorWindow({
  title,
  children,
  storageKey,
  initialPosition = { x: 100, y: 100 },
  height = 200,
}: DraggableOscillatorWindowProps) {
  // Width toggle state - load from localStorage
  const widthStorageKey = storageKey ? `${storageKey}-width` : undefined;
  const [isFullWidth, setIsFullWidth] = useState(() => {
    if (!widthStorageKey) return false;
    try {
      const saved = localStorage.getItem(widthStorageKey);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
  
  // Save width preference to localStorage
  const toggleWidth = () => {
    const newValue = !isFullWidth;
    setIsFullWidth(newValue);
    if (widthStorageKey) {
      try {
        localStorage.setItem(widthStorageKey, JSON.stringify(newValue));
      } catch (e) {
        console.warn('Failed to save width preference:', e);
      }
    }
  };

  const { position, isDragging, dragHandleProps } = useDraggable({
    storageKey,
    initialPosition,
  });
  
  // Memoize width calculation
  const actualWidth = useMemo(() => {
    return isFullWidth
      ? window.innerWidth * FULL_WIDTH_PERCENTAGE
      : window.innerWidth * HALF_WIDTH_PERCENTAGE;
  }, [isFullWidth]);

  return (
    <div
      data-draggable // Marker for useDraggable hook to find the draggable element
      className="fixed z-40 bg-slate-900 rounded-lg shadow-xl overflow-hidden"
      style={{
        left: isFullWidth ? FULL_WIDTH_LEFT_MARGIN : position.x,
        top: position.y,
        width: actualWidth,
        minHeight: height,
      }}
    >
      {/* Title Bar / Drag Handle */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-3 py-2 bg-slate-800 cursor-grab active:cursor-grabbing"
      >
        <span className="text-sm font-medium text-white">{title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleWidth}
            className="p-1 hover:bg-slate-700 rounded"
            title={isFullWidth ? "Half Width" : "Full Width"}
          >
            {isFullWidth ? <Minimize2 className="h-3 w-3 text-slate-400" /> : <Maximize2 className="h-3 w-3 text-slate-400" />}
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
