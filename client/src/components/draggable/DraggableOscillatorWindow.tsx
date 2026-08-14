import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface DraggableOscillatorWindowProps {
  title: string;
  children: ReactNode;
  storageKey?: string;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  onTap?: () => void;
}

const MIN_WIDTH = 150;
const MIN_HEIGHT = 80;
const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 120;
const TITLE_BAR_HEIGHT = 28;

export function DraggableOscillatorWindow({
  title,
  children,
  storageKey,
  initialPosition = { x: 20, y: 100 },
  initialSize = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  onTap,
}: DraggableOscillatorWindowProps) {
  // Always open in the provided initial position (middle of the chart).
  // Position is not persisted so cycling mini → middle always recenters.
  const [position, setPosition] = useState(() => ({
    x: Math.max(0, Math.min(window.innerWidth - MIN_WIDTH, initialPosition.x)),
    y: Math.max(0, Math.min(window.innerHeight - TITLE_BAR_HEIGHT, initialPosition.y)),
  }));

  // Load size from localStorage
  const [size, setSize] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`${storageKey}-size`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return initialSize;
  });

  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });

  // Save size to localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`${storageKey}-size`, JSON.stringify(size));
    }
  }, [size, storageKey]);

  // Drag handlers
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    isDragging.current = true;
    dragMoved.current = false;
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  }, [position]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    dragMoved.current = true;
    const newX = Math.max(0, Math.min(window.innerWidth - size.width, clientX - dragStart.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - size.height, clientY - dragStart.current.y));
    setPosition({ x: newX, y: newY });
  }, [size]);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((clientX: number, clientY: number) => {
    isResizing.current = true;
    resizeStart.current = { width: size.width, height: size.height, x: clientX, y: clientY };
  }, [size]);

  const handleResizeMove = useCallback((clientX: number, clientY: number) => {
    if (!isResizing.current) return;
    const deltaX = clientX - resizeStart.current.x;
    const deltaY = clientY - resizeStart.current.y;
    const newWidth = Math.max(MIN_WIDTH, resizeStart.current.width + deltaX);
    const newHeight = Math.max(MIN_HEIGHT, resizeStart.current.height + deltaY);
    setSize({ width: newWidth, height: newHeight });
  }, []);

  const handleResizeEnd = useCallback(() => {
    isResizing.current = false;
  }, []);

  // Mouse event handlers
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleResizeStart(e.clientX, e.clientY);
  };

  // Touch event handlers
  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const onResizeTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    handleResizeStart(touch.clientX, touch.clientY);
  };

  const handleTitleClick = useCallback(() => {
    if (!dragMoved.current && onTap) {
      onTap();
    }
  }, [onTap]);

  // Global mouse/touch move and end
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
      handleResizeMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      handleDragEnd();
      handleResizeEnd();
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
      handleResizeMove(touch.clientX, touch.clientY);
    };
    const onTouchEnd = () => {
      handleDragEnd();
      handleResizeEnd();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd]);

  return (
    <div
      className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* Title Bar - Drag Handle */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={handleTitleClick}
        className="flex items-center gap-2 px-2 py-1 bg-slate-800 cursor-grab active:cursor-grabbing select-none"
      >
        <GripVertical className="h-3 w-3 text-slate-500" />
        <span className="text-xs font-medium text-white truncate flex-1">{title}</span>
      </div>

      {/* Content - chart will fill this and scale with size */}
      <div className="relative overflow-hidden" style={{ height: size.height - TITLE_BAR_HEIGHT }}>
        <div className="absolute inset-0">
          {children}
        </div>
      </div>

      {/* Resize Handle - Bottom Right Corner */}
      <div
        onMouseDown={onResizeMouseDown}
        onTouchStart={onResizeTouchStart}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10"
        title="Drag to resize"
        style={{
          background: 'linear-gradient(135deg, transparent 45%, #94a3b8 45%)',
        }}
      />
    </div>
  );
}
