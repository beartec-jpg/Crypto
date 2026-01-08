import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { ErrorHandler } from '@/lib/errorHandler'

describe('useErrorHandler', () => {
  beforeEach(() => {
    // Clear logs before each test
    ErrorHandler.clearLogs()
    // Mock console methods to avoid cluttering test output
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('Error state management', () => {
    it('should set error on handleError call', () => {
      const { result } = renderHook(() => useErrorHandler())

      expect(result.current.isError).toBe(false)
      expect(result.current.error).toBeNull()

      act(() => {
        result.current.handleError('data-fetch', 'Failed to fetch data')
      })

      expect(result.current.isError).toBe(true)
      expect(result.current.error).toBe('Failed to fetch data')
    })

    it('should clear error on clearError call', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleError('rendering', 'Rendering failed')
      })

      expect(result.current.isError).toBe(true)

      act(() => {
        result.current.clearError()
      })

      expect(result.current.isError).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should handle multiple errors sequentially', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleError('data-fetch', 'Error 1')
      })

      expect(result.current.error).toBe('Error 1')

      act(() => {
        result.current.handleError('interaction', 'Error 2')
      })

      expect(result.current.error).toBe('Error 2')
    })

    it('should handle error with details and context', () => {
      const { result } = renderHook(() => useErrorHandler())

      const details = { code: 500, message: 'Internal Server Error' }
      const context = { url: '/api/data', timestamp: Date.now() }

      act(() => {
        result.current.handleError('data-fetch', 'API Error', details, context)
      })

      const logs = result.current.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].category).toBe('data-fetch')
      expect(logs[0].message).toBe('API Error')
      expect(logs[0].details).toEqual(details)
      expect(logs[0].context).toEqual(context)
    })
  })

  describe('Error logging', () => {
    it('should log errors to ErrorHandler', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleError('state', 'State update failed')
      })

      const logs = result.current.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('error')
      expect(logs[0].category).toBe('state')
      expect(logs[0].message).toBe('State update failed')
      expect(logs[0].timestamp).toBeDefined()
    })

    it('should log warnings without setting error state', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleWarning('interaction', 'Unusual interaction detected')
      })

      // Warning should not set error state
      expect(result.current.isError).toBe(false)
      expect(result.current.error).toBeNull()

      // But should be logged
      const logs = result.current.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('warning')
      expect(logs[0].message).toBe('Unusual interaction detected')
    })

    it('should get all error logs', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleError('data-fetch', 'Error 1')
        result.current.handleWarning('state', 'Warning 1')
        result.current.handleError('rendering', 'Error 2')
      })

      const logs = result.current.getLogs()
      expect(logs).toHaveLength(3)
      expect(logs[0].message).toBe('Error 1')
      expect(logs[1].message).toBe('Warning 1')
      expect(logs[2].message).toBe('Error 2')
    })
  })

  describe('Log export', () => {
    it('should export logs as JSON', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleError('data-fetch', 'Export test error')
      })

      // Mock document.createElement to return a mock link element
      const mockLink = document.createElement('a')
      const mockClick = vi.fn()
      mockLink.click = mockClick
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink)

      act(() => {
        result.current.exportLogs()
      })

      expect(mockClick).toHaveBeenCalled()
      expect(mockLink.download).toContain('error-logs-')
      expect(mockLink.download).toContain('.json')
    })

    it('should export empty array when no logs', () => {
      const { result } = renderHook(() => useErrorHandler())

      const logs = result.current.getLogs()
      expect(logs).toHaveLength(0)

      // Verify ErrorHandler.exportLogs returns valid JSON
      const exported = ErrorHandler.exportLogs()
      expect(() => JSON.parse(exported)).not.toThrow()
      expect(JSON.parse(exported)).toEqual([])
    })

    it('should export logs with correct structure', () => {
      const { result } = renderHook(() => useErrorHandler())

      act(() => {
        result.current.handleError('rendering', 'Test error', { foo: 'bar' })
      })

      const exported = ErrorHandler.exportLogs()
      const parsed = JSON.parse(exported)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]).toHaveProperty('timestamp')
      expect(parsed[0]).toHaveProperty('level')
      expect(parsed[0]).toHaveProperty('category')
      expect(parsed[0]).toHaveProperty('message')
      expect(parsed[0].level).toBe('error')
      expect(parsed[0].category).toBe('rendering')
      expect(parsed[0].message).toBe('Test error')
      expect(parsed[0].details).toEqual({ foo: 'bar' })
    })
  })

  describe('Error categories', () => {
    it('should support all error categories', () => {
      const { result } = renderHook(() => useErrorHandler())

      const categories: Array<'data-fetch' | 'rendering' | 'interaction' | 'state' | 'unknown'> = [
        'data-fetch',
        'rendering',
        'interaction',
        'state',
        'unknown',
      ]

      act(() => {
        categories.forEach((category, index) => {
          result.current.handleError(category, `Error ${index}`)
        })
      })

      const logs = result.current.getLogs()
      expect(logs).toHaveLength(categories.length)

      categories.forEach((category, index) => {
        expect(logs[index].category).toBe(category)
      })
    })
  })

  describe('Memory management', () => {
    it('should not exceed maximum log limit', () => {
      const { result } = renderHook(() => useErrorHandler())

      // Add 105 logs (exceeds the 100 limit)
      act(() => {
        for (let i = 0; i < 105; i++) {
          result.current.handleError('state', `Error ${i}`)
        }
      })

      const logs = result.current.getLogs()
      // Should be limited to 100
      expect(logs.length).toBeLessThanOrEqual(100)
    })

    it('should maintain most recent logs when limit exceeded', () => {
      const { result } = renderHook(() => useErrorHandler())

      // Add 105 logs
      act(() => {
        for (let i = 0; i < 105; i++) {
          result.current.handleError('state', `Error ${i}`)
        }
      })

      const logs = result.current.getLogs()
      // Last log should be "Error 104"
      expect(logs[logs.length - 1].message).toBe('Error 104')
      // First log should be "Error 5" (after 5 logs were removed)
      expect(logs[0].message).toBe('Error 5')
    })
  })
})
