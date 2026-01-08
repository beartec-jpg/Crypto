import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useDrawingState } from '@/hooks/useDrawingState'
import { createMockTrendline, createMockHorizontal } from '../utils/testHelpers'

/**
 * Integration tests for complete drawing workflows
 * Tests the interaction between different drawing operations and state management
 */
describe('DrawingWorkflow Integration', () => {
  describe('Complete drawing lifecycle', () => {
    it('should complete full drawing creation → modification → delete cycle', () => {
      const { result } = renderHook(() => useDrawingState())

      // Step 1: Create a trendline
      const trendline = createMockTrendline({ id: 'test-trendline' })
      
      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.trendlines[0].id).toBe('test-trendline')

      // Step 2: Modify the trendline
      act(() => {
        result.current.updateDrawing('trendline', 'test-trendline', {
          color: '#ff0000',
          thickness: 5,
        })
      })

      expect(result.current.state.trendlines[0].color).toBe('#ff0000')
      expect(result.current.state.trendlines[0].thickness).toBe(5)

      // Step 3: Delete the trendline
      act(() => {
        result.current.deleteDrawing('trendline', 'test-trendline')
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })

    it('should handle undo/redo in drawing context', () => {
      const { result } = renderHook(() => useDrawingState())

      // Create and modify a drawing
      const trendline = createMockTrendline({ id: 'test-trendline' })
      
      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.updateDrawing('trendline', 'test-trendline', {
          color: '#00ff00',
        })
      })

      expect(result.current.state.trendlines[0].color).toBe('#00ff00')

      // Undo the color change
      act(() => {
        result.current.undo()
      })

      expect(result.current.state.trendlines[0].color).toBe(trendline.color)

      // Redo the color change
      act(() => {
        result.current.redo()
      })

      expect(result.current.state.trendlines[0].color).toBe('#00ff00')
    })

    it('should update drawing on user interaction', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      
      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      // Simulate user dragging a point
      const newP2 = { time: Date.now() + 7200000, price: 120 }
      
      act(() => {
        result.current.updateDrawing('trendline', trendline.id, {
          p2: newP2,
        })
      })

      expect(result.current.state.trendlines[0].p2).toEqual(newP2)
    })
  })

  describe('Multiple drawing types workflow', () => {
    it('should handle multiple drawing types in sequence', () => {
      const { result } = renderHook(() => useDrawingState())

      // Add different drawing types
      const trendline = createMockTrendline()
      const horizontal = createMockHorizontal()

      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      act(() => {
        result.current.addDrawing('horizontal', horizontal)
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.horizontals).toHaveLength(1)

      // Delete trendline, keep horizontal
      act(() => {
        result.current.deleteDrawing('trendline', trendline.id)
      })

      expect(result.current.state.trendlines).toHaveLength(0)
      expect(result.current.state.horizontals).toHaveLength(1)

      // Undo delete
      act(() => {
        result.current.undo()
      })

      expect(result.current.state.trendlines).toHaveLength(1)
    })

    it('should maintain independent state for each drawing type', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      const horizontal = createMockHorizontal()

      act(() => {
        result.current.addDrawing('trendline', trendline)
        result.current.addDrawing('horizontal', horizontal)
      })

      // Modify trendline
      act(() => {
        result.current.updateDrawing('trendline', trendline.id, {
          color: '#ff0000',
        })
      })

      // Horizontal should be unchanged
      expect(result.current.state.horizontals[0].color).toBe(horizontal.color)
      expect(result.current.state.trendlines[0].color).toBe('#ff0000')
    })
  })

  describe('Selection workflow', () => {
    it('should handle drawing selection and deselection', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      
      act(() => {
        result.current.addDrawing('trendline', trendline)
      })

      // Select the drawing
      act(() => {
        result.current.selectDrawing(trendline.id, 'trendline')
      })

      expect(result.current.state.selectedDrawing).toEqual({
        id: trendline.id,
        type: 'trendline',
      })

      // Deselect the drawing
      act(() => {
        result.current.deselectDrawing()
      })

      expect(result.current.state.selectedDrawing).toBeNull()
    })

    it('should change selection between drawings', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline = createMockTrendline()
      const horizontal = createMockHorizontal()

      act(() => {
        result.current.addDrawing('trendline', trendline)
        result.current.addDrawing('horizontal', horizontal)
      })

      // Select trendline
      act(() => {
        result.current.selectDrawing(trendline.id, 'trendline')
      })

      expect(result.current.state.selectedDrawing?.type).toBe('trendline')

      // Change selection to horizontal
      act(() => {
        result.current.selectDrawing(horizontal.id, 'horizontal')
      })

      expect(result.current.state.selectedDrawing?.type).toBe('horizontal')
      expect(result.current.state.selectedDrawing?.id).toBe(horizontal.id)
    })
  })

  describe('State persistence workflow', () => {
    it('should maintain state consistency through complex operations', () => {
      const { result } = renderHook(() => useDrawingState())

      const trendline1 = createMockTrendline({ id: 'trendline-1' })
      const trendline2 = createMockTrendline({ id: 'trendline-2' })

      // Add first trendline
      act(() => {
        result.current.addDrawing('trendline', trendline1)
      })

      // Add second trendline
      act(() => {
        result.current.addDrawing('trendline', trendline2)
      })

      expect(result.current.state.trendlines).toHaveLength(2)

      // Delete first
      act(() => {
        result.current.deleteDrawing('trendline', 'trendline-1')
      })

      expect(result.current.state.trendlines).toHaveLength(1)
      expect(result.current.state.trendlines[0].id).toBe('trendline-2')

      // Undo delete
      act(() => {
        result.current.undo()
      })

      expect(result.current.state.trendlines).toHaveLength(2)

      // Clear all
      act(() => {
        result.current.clearAllDrawings()
      })

      expect(result.current.state.trendlines).toHaveLength(0)
    })
  })
})
