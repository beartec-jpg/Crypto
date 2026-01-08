import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorHandler } from '@/lib/errorHandler'

describe('ErrorHandler', () => {
  beforeEach(() => {
    // Clear logs before each test
    ErrorHandler.clearLogs()
    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('Error logging', () => {
    it('should log errors with timestamp, category, and message', () => {
      ErrorHandler.logError('data-fetch', 'Failed to fetch data')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0]).toMatchObject({
        level: 'error',
        category: 'data-fetch',
        message: 'Failed to fetch data',
      })
      expect(logs[0].timestamp).toBeDefined()
      expect(new Date(logs[0].timestamp).getTime()).toBeGreaterThan(0)
    })

    it('should log errors with details', () => {
      const details = { code: 404, url: '/api/data' }
      ErrorHandler.logError('data-fetch', 'Not found', details)

      const logs = ErrorHandler.getLogs()
      expect(logs[0].details).toEqual(details)
    })

    it('should log errors with context', () => {
      const context = { userId: '123', action: 'fetch' }
      ErrorHandler.logError('data-fetch', 'Error occurred', undefined, context)

      const logs = ErrorHandler.getLogs()
      expect(logs[0].context).toEqual(context)
    })

    it('should include stack trace in error logs', () => {
      ErrorHandler.logError('rendering', 'Render failed')

      const logs = ErrorHandler.getLogs()
      expect(logs[0].stack).toBeDefined()
      expect(typeof logs[0].stack).toBe('string')
    })
  })

  describe('Warning logging', () => {
    it('should log warnings with correct level', () => {
      ErrorHandler.logWarning('interaction', 'Unusual behavior detected')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('warning')
      expect(logs[0].category).toBe('interaction')
      expect(logs[0].message).toBe('Unusual behavior detected')
    })

    it('should log warnings with details', () => {
      const details = { attempts: 3, timeout: true }
      ErrorHandler.logWarning('state', 'Multiple attempts', details)

      const logs = ErrorHandler.getLogs()
      expect(logs[0].details).toEqual(details)
    })
  })

  describe('Info logging', () => {
    it('should log info messages', () => {
      ErrorHandler.logInfo('App initialized successfully')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('info')
      expect(logs[0].message).toBe('App initialized successfully')
    })

    it('should log info with context', () => {
      const context = { version: '1.0.0', env: 'production' }
      ErrorHandler.logInfo('System ready', context)

      const logs = ErrorHandler.getLogs()
      expect(logs[0].context).toEqual(context)
    })
  })

  describe('Log rotation', () => {
    it('should limit logs to 100 maximum', () => {
      // Add 150 logs
      for (let i = 0; i < 150; i++) {
        ErrorHandler.logError('state', `Error ${i}`)
      }

      const logs = ErrorHandler.getLogs()
      expect(logs.length).toBe(100)
    })

    it('should keep most recent logs when limit exceeded', () => {
      // Add 105 logs
      for (let i = 0; i < 105; i++) {
        ErrorHandler.logError('state', `Error ${i}`)
      }

      const logs = ErrorHandler.getLogs()
      // Should have removed first 5 logs
      expect(logs[0].message).toBe('Error 5')
      expect(logs[logs.length - 1].message).toBe('Error 104')
    })

    it('should not exceed limit even with mixed log types', () => {
      for (let i = 0; i < 60; i++) {
        ErrorHandler.logError('state', `Error ${i}`)
      }
      for (let i = 0; i < 60; i++) {
        ErrorHandler.logWarning('interaction', `Warning ${i}`)
      }

      const logs = ErrorHandler.getLogs()
      expect(logs.length).toBe(100)
    })
  })

  describe('Log export', () => {
    it('should export logs as valid JSON', () => {
      ErrorHandler.logError('data-fetch', 'Export test')
      ErrorHandler.logWarning('state', 'Warning test')

      const exported = ErrorHandler.exportLogs()
      expect(() => JSON.parse(exported)).not.toThrow()

      const parsed = JSON.parse(exported)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
    })

    it('should export logs with proper structure', () => {
      ErrorHandler.logError('rendering', 'Test error', { foo: 'bar' })

      const exported = ErrorHandler.exportLogs()
      const parsed = JSON.parse(exported)

      expect(parsed[0]).toHaveProperty('timestamp')
      expect(parsed[0]).toHaveProperty('level')
      expect(parsed[0]).toHaveProperty('category')
      expect(parsed[0]).toHaveProperty('message')
      expect(parsed[0]).toHaveProperty('details')
      expect(parsed[0].details).toEqual({ foo: 'bar' })
    })

    it('should export empty array when no logs', () => {
      const exported = ErrorHandler.exportLogs()
      const parsed = JSON.parse(exported)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(0)
    })

    it('should format JSON with indentation', () => {
      ErrorHandler.logError('state', 'Test')

      const exported = ErrorHandler.exportLogs()
      // Check if JSON is formatted (contains newlines)
      expect(exported).toContain('\n')
      expect(exported).toContain('  ') // 2-space indentation
    })
  })

  describe('Different error levels', () => {
    it('should support error, warning, and info levels', () => {
      ErrorHandler.logError('data-fetch', 'Error message')
      ErrorHandler.logWarning('state', 'Warning message')
      ErrorHandler.logInfo('Info message')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(3)
      expect(logs[0].level).toBe('error')
      expect(logs[1].level).toBe('warning')
      expect(logs[2].level).toBe('info')
    })
  })

  describe('Clear logs', () => {
    it('should clear all logs on clearLogs()', () => {
      ErrorHandler.logError('state', 'Error 1')
      ErrorHandler.logError('state', 'Error 2')
      ErrorHandler.logWarning('interaction', 'Warning 1')

      expect(ErrorHandler.getLogs()).toHaveLength(3)

      ErrorHandler.clearLogs()

      expect(ErrorHandler.getLogs()).toHaveLength(0)
    })

    it('should allow new logs after clearing', () => {
      ErrorHandler.logError('state', 'Error 1')
      ErrorHandler.clearLogs()
      ErrorHandler.logError('state', 'Error 2')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].message).toBe('Error 2')
    })
  })

  describe('Error categories', () => {
    it('should support all error categories', () => {
      ErrorHandler.logError('data-fetch', 'Fetch error')
      ErrorHandler.logError('rendering', 'Render error')
      ErrorHandler.logError('interaction', 'Interaction error')
      ErrorHandler.logError('state', 'State error')
      ErrorHandler.logError('unknown', 'Unknown error')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(5)
      expect(logs.map(l => l.category)).toEqual([
        'data-fetch',
        'rendering',
        'interaction',
        'state',
        'unknown',
      ])
    })
  })

  describe('Console output', () => {
    it('should log to console.error for errors', () => {
      ErrorHandler.logError('state', 'Test error')

      expect(console.error).toHaveBeenCalledWith(
        '[state] Test error',
        undefined
      )
    })

    it('should log to console.warn for warnings', () => {
      ErrorHandler.logWarning('interaction', 'Test warning')

      expect(console.warn).toHaveBeenCalledWith(
        '[interaction] Test warning',
        undefined
      )
    })

    it('should log to console.log for info', () => {
      ErrorHandler.logInfo('Test info')

      expect(console.log).toHaveBeenCalledWith(
        'Test info',
        undefined
      )
    })
  })
})
