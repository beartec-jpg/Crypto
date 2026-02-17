import { useState, useCallback, useRef, useEffect } from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  initialPosition?: Position | (() => Position);
  bounds?: { left: number; top: number; right: number; bottom: number };
  storageKey?: string; // For localStorage persistence
}

export function useDraggable(options: UseDraggableOptions = {}) {
  // Evaluate initialPosition function if provided
  const getInitialPosition = useCallback(() => {
    if (!options.initialPosition) return { x: 0, y: 0 };
    return typeof options.initialPosition === 'function' 
      ? options.initialPosition() 
      : options.initialPosition;
  }, [options.initialPosition]);

  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef<Position>({ x: 0, y: 0 });

  // Validate position is within viewport bounds
  const validatePosition = useCallback((pos: Position): Position => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Ensure position is within viewport
    const validX = Math.max(0, Math.min(pos.x, viewportWidth - 100));
    const validY = Math.max(0, Math.min(pos.y, viewportHeight - 100));
    
    return { x: validX, y: validY };
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    if (options.storageKey) {
      const saved = localStorage.getItem(options.storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Validate position before applying
          const validatedPos = validatePosition(parsed);
          setPosition(validatedPos);
        } catch (e) {
          // If parsing fails, use initial position
          setPosition(getInitialPosition());
        }
      }
    }
  }, [options.storageKey, validatePosition, getInitialPosition]);

  // Save to localStorage when position changes
  useEffect(() => {
    if (options.storageKey && !isDragging) {
      localStorage.setItem(options.storageKey, JSON.stringify(position));
    }
  }, [position, isDragging, options.storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    offsetRef.current = {
      x: clientX - position.x,
      y: clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      let newX = clientX - offsetRef.current.x;
      let newY = clientY - offsetRef.current.y;

      // Apply bounds if provided
      if (options.bounds) {
        newX = Math.max(options.bounds.left, Math.min(newX, options.bounds.right));
        newY = Math.max(options.bounds.top, Math.min(newY, options.bounds.bottom));
      }

      setPosition({ x: newX, y: newY });
    };

    const handleEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    // Use passive: false to allow preventDefault() and avoid scrolling during dragging
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, options.bounds]);

  return {
    position,
    isDragging,
    dragRef,
    handleMouseDown,
    setPosition,
  };
}
