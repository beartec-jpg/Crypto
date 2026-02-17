import { useState, useEffect, useRef, useCallback } from 'react';

interface UseDraggableOptions {
  initialPosition?: { x: number; y: number };
  bounds?: 'parent' | { left: number; top: number; right: number; bottom: number };
  storageKey?: string; // For localStorage persistence
  onDragStart?: () => void;
  onDragEnd?: (position: { x: number; y: number }) => void;
}

interface UseDraggableReturn {
  position: { x: number; y: number };
  isDragging: boolean;
  dragHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    style: { cursor: string };
  };
  setPosition: (pos: { x: number; y: number }) => void;
}

export function useDraggable(options: UseDraggableOptions = {}): UseDraggableReturn {
  const {
    initialPosition = { x: 0, y: 0 },
    bounds = 'parent',
    storageKey,
    onDragStart,
    onDragEnd,
  } = options;

  // Load initial position from localStorage if available
  const getInitialPosition = useCallback(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            // Validate that positions are within reasonable bounds
            const maxX = typeof window !== 'undefined' ? window.innerWidth : 2000;
            const maxY = typeof window !== 'undefined' ? window.innerHeight : 2000;
            const validX = Math.max(0, Math.min(parsed.x, maxX - 100)); // Allow 100px for visibility
            const validY = Math.max(0, Math.min(parsed.y, maxY - 100));
            return { x: validX, y: validY };
          }
        }
      } catch (e) {
        console.warn('Failed to load position from localStorage:', e);
      }
    }
    return initialPosition;
  }, [storageKey, initialPosition]);

  const [position, setPosition] = useState(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });
  const elementRef = useRef<HTMLElement | null>(null);

  // Save position to localStorage when it changes
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(position));
      } catch (e) {
        console.warn('Failed to save position to localStorage:', e);
      }
    }
  }, [position, storageKey]);

  // Constrain position within bounds
  const constrainPosition = useCallback((pos: { x: number; y: number }): { x: number; y: number } => {
    if (!elementRef.current) return pos;

    const element = elementRef.current;
    const rect = element.getBoundingClientRect();
    
    let { x, y } = pos;

    if (bounds === 'parent') {
      const parent = element.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        
        // Constrain to parent bounds
        x = Math.max(0, Math.min(x, parentRect.width - rect.width));
        y = Math.max(0, Math.min(y, parentRect.height - rect.height));
      }
    } else {
      // Custom bounds
      x = Math.max(bounds.left, Math.min(x, bounds.right - rect.width));
      y = Math.max(bounds.top, Math.min(y, bounds.bottom - rect.height));
    }

    return { x, y };
  }, [bounds]);

  // Handle drag move
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;

    const dx = clientX - dragStartPos.current.x;
    const dy = clientY - dragStartPos.current.y;

    const newPos = {
      x: elementStartPos.current.x + dx,
      y: elementStartPos.current.y + dy,
    };

    setPosition(constrainPosition(newPos));
  }, [isDragging, constrainPosition]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    onDragEnd?.(position);
  }, [isDragging, position, onDragEnd]);

  // Mouse move handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  }, [handleDragMove]);

  // Touch move handler
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length > 0) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [handleDragMove]);

  // Mouse up handler
  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Touch end handler
  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Set up and tear down event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Handle drag start (mouse)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    // Find the draggable element (should be a parent with data-draggable attribute)
    let draggableElement = target;
    while (draggableElement && !draggableElement.hasAttribute('data-draggable')) {
      draggableElement = draggableElement.parentElement as HTMLElement;
    }

    if (draggableElement) {
      elementRef.current = draggableElement;
    }

    dragStartPos.current = { x: e.clientX, y: e.clientY };
    elementStartPos.current = { ...position };
    setIsDragging(true);
    onDragStart?.();
  }, [position, onDragStart]);

  // Handle drag start (touch)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();

    if (e.touches.length > 0) {
      const target = e.currentTarget as HTMLElement;
      // Find the draggable element (should be a parent with data-draggable attribute)
      let draggableElement = target;
      while (draggableElement && !draggableElement.hasAttribute('data-draggable')) {
        draggableElement = draggableElement.parentElement as HTMLElement;
      }

      if (draggableElement) {
        elementRef.current = draggableElement;
      }

      dragStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      elementStartPos.current = { ...position };
      setIsDragging(true);
      onDragStart?.();
    }
  }, [position, onDragStart]);

  return {
    position,
    isDragging,
    dragHandleProps: {
      onMouseDown: handleMouseDown,
      onTouchStart: handleTouchStart,
      style: { cursor: isDragging ? 'grabbing' : 'grab' },
    },
    setPosition,
  };
}
