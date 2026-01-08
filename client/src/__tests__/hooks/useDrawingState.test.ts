import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useDrawingState } from '@/hooks/useDrawingState'
import { createMockTrendline, createMockHorizontal, createMockChannel } from '../utils/testHelpers'

describe('useDrawingState', () => {
  describe('Drawing operations', () => {
    it('should add new drawing with unique ID', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.trendlines[0].id).toBe(trendline.id)
    })

    it('should add multiple drawing types', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      const horizontal = createMockHorizontal()
      const channel = createMockChannel()

      act(() => {
        result.current.addDrawing('trendline', trendline)
        result.current.addDrawing('horizontal', horizontal)
        result.current.addDrawing('channel', channel)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.horizontals).toHaveLength(1)
      expect(result.current.state.channels).toHaveLength(1)
    })

    it('should update drawing properties', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.updateDrawing('trendline', trendline.id, {
          color: '#ff0000',
          thickness: 5,
        })
      })

      expect(result.current.state.trendlines[0].color).toBe('#ff0000')
      expect(result.current.state.trendlines[0].thickness).toBe(5)
    })

    it('should delete drawing and remove from state', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      expect(result.current.state.trendlines).toHaveLength(1)

      act(() => {
        result.current.deleteDrawing('trendline', trendline.id)
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should clear all drawings', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      const horizontal = createMockHorizontal()

      act(() => {
        result.current.addDrawing('trendline', trendline)
        result.current.addDrawing('horizontal', horizontal)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.horizontals).toHaveLength(1)

      act(() => {
        result.current.clearAllDrawings()
      })

      expect(result.current.state.trendlines).toHaveLength(0)
      expect(result.current.state.horizontals).toHaveLength(0)
    })
  })

  describe('Undo/Redo functionality', () => {
    it('should handle undo action correctly', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.canUndo).toBe(true)

      act(() => {
        result.current.undo()
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should handle redo action correctly', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.undo()
      })

      expect(result.current.state.trendlines).toHaveLength(0)
      expect(result.current.canRedo).toBe(true)

      act(() => {
        result.current.redo()
      })

      expect(result.current.state.trendlines).toHaveLength(1)
    })

    it('should not undo when at initial state', () => {
      const { result } = renderHook(() => useDrawingState())

      expect(result.current.canUndo).toBe(false)

      act(() => {
        result.current.undo()
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should not redo when at latest state', () => {
      const { result } = renderHook(() => useDrawingState())

      expect(result.current.canRedo).toBe(false)

      act(() => {
        result.current.redo()
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should clear redo history when new action performed', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline1 = createMockTrendline()
      const trendline2 = createMockTrendline({ id: 'trendline-2' })

      act(() => {
        result.current.addDrawing('trendline', trendline1)
      })

      act(() => {
        result.current.undo()
      })

      expect(result.current.canRedo).toBe(true)

      act(() => {
        result.current.addDrawing('trendline', trendline2)
      })

      // After new action, redo should not bring back trendline1
      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.trendlines[0].id).toBe(trendline2.id)
    })
  })

  describe('History management', () => {
    it('should limit history to prevent memory bloat', () => {
      const { result } = renderHook(() => useDrawingState())

      // Add drawings one at a time
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.addDrawing('trendline', createMockTrendline({ id: `trendline-${i}` }))
        })
      }

      // Should be able to undo
      expect(result.current.canUndo).toBe(true)
      expect(result.current.state.trendlines).toHaveLength(10)
      
      // Undo 5 times
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.undo()
        })
      }

      // Should have 5 trendlines left
      expect(result.current.state.trendlines).toHaveLength(5)
      expect(result.current.canUndo).toBe(true)
    })

    it('should handle empty state', () => {
      const { result } = renderHook(() => useDrawingState())

      expect(result.current.state.trendlines).toHaveLength(0)
      expect(result.current.state.horizontals).toHaveLength(0)
      expect(result.current.state.channels).toHaveLength(0)
    })

    it('should maintain state consistency across operations', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.updateDrawing('trendline', trendline.id, { color: '#ff0000' })
      })

      act(() => {
        result.current.undo()
      })

      // After undo, should have original color
      expect(result.current.state.trendlines[0].color).toBe(trendline.color)

      act(() => {
        result.current.redo()
      })

      // After redo, should have updated color
      expect(result.current.state.trendlines[0].color).toBe('#ff0000')
    })
  })

  describe('Selection state', () => {
    it('should select a drawing', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.selectDrawing(trendline.id, 'trendline')
      })

      expect(result.current.state.selectedDrawing).toEqual({
        id: trendline.id,
        type: 'trendline',
      })
    })

    it('should deselect current drawing', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.selectDrawing(trendline.id, 'trendline')
      })

      act(() => {
        result.current.deselectDrawing()
      })

      expect(result.current.state.selectedDrawing).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should handle update on non-existent drawing gracefully', () => {
      const { result } = renderHook(() => useDrawingState())

      act(() => {
        result.current.updateDrawing('trendline', 'non-existent-id', { color: '#ff0000' })
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should handle delete on non-existent drawing gracefully', () => {
      const { result } = renderHook(() => useDrawingState())

      act(() => {
        result.current.deleteDrawing('trendline', 'non-existent-id')
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should support multiple drawing types simultaneously', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      const horizontal = createMockHorizontal()
      const channel = createMockChannel()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.addDrawing('horizontal', horizontal)
      })

      act(() => {
        result.current.addDrawing('channel', channel)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.horizontals).toHaveLength(1)
      expect(result.current.state.channels).toHaveLength(1)

      // Undo once to remove the channel
      expect(result.current.canUndo).toBe(true)
      
      act(() => {
        result.current.undo()
      })

      // After one undo, channel should be removed
      expect(result.current.state.channels).toHaveLength(0)
      expect(result.current.state.horizontals).toHaveLength(1)
      expect(result.current.state.trendlines).toHaveLength(1)
    })
  })
})
