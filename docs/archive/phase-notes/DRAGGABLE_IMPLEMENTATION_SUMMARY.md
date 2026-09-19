# Draggable Components Feature - Implementation Summary

## Overview
Successfully implemented draggable functionality for the drawing toolbar and oscillator popout windows in the fullscreen chart page.

## Components Created

### 1. `useDraggable` Hook (`client/src/hooks/useDraggable.ts`)

A reusable React hook that provides draggable functionality with the following features:

- **Mouse and Touch Support**: Handles both mouse and touch events for desktop and mobile
- **Position State Tracking**: Manages `{ x, y }` position state
- **Bounds Constraining**: Keeps draggable elements within their parent container
- **localStorage Persistence**: Saves and restores positions across sessions
- **Drag State**: Provides `isDragging` boolean for visual feedback

**Interface**:
```typescript
interface UseDraggableOptions {
  initialPosition?: { x: number; y: number };
  bounds?: 'parent' | { left: number; top: number; right: number; bottom: number };
  storageKey?: string;
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
```

**Key Features**:
- Spreads `dragHandleProps` onto any element to make it a drag handle
- Automatically constrains movement within bounds
- Persists position to localStorage with specified key
- Clean event listener management with proper cleanup

### 2. `DraggableToolbar` Component (`client/src/components/draggable/DraggableToolbar.tsx`)

A wrapper component that makes the drawing toolbar draggable.

**Visual Structure**:
```
┌───────────────┐
│     ⋮⋮⋮       │  ← Drag handle (GripVertical icon)
├───────────────┤
│  📈  ─  □  ⊕  │  ← Toolbar content (children)
└───────────────┘
```

**Features**:
- Grip icon at the top for dragging
- Wraps existing `VerticalDrawingToolbar` component
- Fixed positioning with z-index 50
- Opacity change during dragging (80%)
- Default position: bottom center of screen
- Customizable storage key for localStorage

**Usage**:
```tsx
<DraggableToolbar 
  storageKey="fullscreen-drawing-toolbar"
  defaultPosition={{ x: window.innerWidth / 2 - 40, y: window.innerHeight - 150 }}
>
  <VerticalDrawingToolbar 
    activeTool={activeTool} 
    onSelectTool={handleSelectTool}
  />
</DraggableToolbar>
```

### 3. `OscillatorPopoutWindow` Component (`client/src/components/oscillators/OscillatorPopoutWindow.tsx`)

A floating window component for displaying oscillators outside the main chart panel.

**Visual Structure**:
```
┌─────────────────────────────────────┐
│ ☰ RSI (14)              [Dock] [×] │  ← Draggable title bar
├─────────────────────────────────────┤
│                                     │
│        Oscillator Chart             │  ← Content area
│        (RSIPanel, etc.)             │
│                                     │
└─────────────────────────────────────┘
```

**Features**:
- Draggable title bar with grip icon
- "Dock" button to close and return to docked panel
- "X" button for closing
- Fixed positioning with z-index 50
- Customizable size and position
- Automatic position offset for each oscillator type
- Shadow and backdrop blur for visual depth

**Props**:
```typescript
interface OscillatorPopoutWindowProps {
  oscillatorType: 'rsi' | 'macd' | 'volume';
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  storageKey?: string;
  defaultSize?: { width: number; height: number };
}
```

**Usage**:
```tsx
<OscillatorPopoutWindow
  oscillatorType="rsi"
  title="RSI (14)"
  isOpen={true}
  onClose={() => handleToggleOscillator('rsi')}
  storageKey="oscillator-rsi-position"
  defaultSize={{ width: 500, height: 240 }}
>
  <div className="p-2 h-full">
    <RSIPanel 
      data={oscillatorData.rsi}
      period={14}
      candles={candles}
    />
  </div>
</OscillatorPopoutWindow>
```

## Integration with ChartFullscreenPage

### Changes Made:

1. **Added Imports**:
```tsx
import { DraggableToolbar } from '@/components/draggable/DraggableToolbar';
import { OscillatorPopoutWindow } from '@/components/oscillators/OscillatorPopoutWindow';
```

2. **Replaced Fixed Toolbar**:
```tsx
// Before:
<VerticalDrawingToolbar 
  activeTool={activeTool} 
  onSelectTool={handleSelectTool}
  className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20"
/>

// After:
<DraggableToolbar 
  storageKey="fullscreen-drawing-toolbar"
  defaultPosition={{ x: window.innerWidth / 2 - 40, y: window.innerHeight - 150 }}
>
  <VerticalDrawingToolbar 
    activeTool={activeTool} 
    onSelectTool={handleSelectTool}
  />
</DraggableToolbar>
```

3. **Added Oscillator Popout Windows**:
- RSI popout window (500x240px)
- MACD popout window (500x240px)
- Volume popout window (500x180px)

Each popout window:
- Only renders when `oscillatorPopout === true`
- Only renders when the oscillator is selected
- Calls `handleToggleOscillator` to close/dock
- Has its own localStorage key for position persistence

## User Experience

### Draggable Drawing Toolbar:
1. User can grab the toolbar by the grip handle at the top
2. Drag it anywhere on the screen
3. Position is automatically saved to localStorage
4. On page reload, toolbar appears at the last saved position
5. Toolbar stays within viewport bounds

### Oscillator Popout Windows:
1. User clicks "Popout" button in the oscillator panel
2. Selected oscillators appear in floating windows
3. Each window can be dragged independently
4. Each window has its own "Dock" button to return to panel
5. Window positions are saved to localStorage
6. Windows automatically offset from each other by default

## Technical Notes

### Styling:
- All components use Tailwind CSS classes
- Dark theme with slate colors matching existing design
- Backdrop blur for modern glass-morphism effect
- Box shadows for depth
- z-index: 50 for popouts (above chart but below modals)

### Performance:
- Event listeners properly cleaned up on unmount
- Position updates throttled through React state
- No unnecessary re-renders
- localStorage operations wrapped in try-catch

### Accessibility:
- Cursor changes (grab/grabbing) for visual feedback
- Keyboard navigation maintained for toolbar buttons
- ARIA labels preserved on toolbar buttons

### Mobile Support:
- Touch events handled alongside mouse events
- Touch move and touch end properly supported
- Bounds checking works on mobile viewports

## Future Enhancements (Optional):

1. **Resizable Windows**: Add resize handles to oscillator windows
2. **Window Minimize**: Add minimize/maximize functionality
3. **Multi-Monitor Support**: Save position relative to screen size
4. **Snap to Grid**: Optional snapping to grid positions
5. **Keyboard Shortcuts**: Arrow keys to move selected windows
6. **Window Manager**: Show/hide all windows with one click

## Files Modified:

### New Files:
- `client/src/hooks/useDraggable.ts` (220 lines)
- `client/src/components/draggable/DraggableToolbar.tsx` (54 lines)
- `client/src/components/oscillators/OscillatorPopoutWindow.tsx` (99 lines)

### Modified Files:
- `client/src/pages/ChartFullscreenPage.tsx` (added 61 lines)

## Testing:

The implementation:
- ✅ Compiles without TypeScript errors
- ✅ Builds successfully with Vite
- ✅ No runtime errors in console
- ✅ Follows existing codebase patterns
- ✅ Uses existing UI components (Button, icons)
- ✅ Matches existing styling conventions

## localStorage Keys Used:

- `fullscreen-drawing-toolbar` - Drawing toolbar position
- `oscillator-rsi-position` - RSI window position
- `oscillator-macd-position` - MACD window position
- `oscillator-volume-position` - Volume window position

These keys can be cleared from localStorage if needed to reset positions.
