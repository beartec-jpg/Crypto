import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorHandler } from '@/lib/errorHandler'

/**
 * Integration tests for error handling and recovery workflows
 * Tests the interaction between ErrorBoundary, ErrorHandler, and component recovery
 */

// Component that can throw errors on demand
const ErrorProneComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Simulated rendering error')
  }
  return <div>Component rendered successfully</div>
}

describe('ErrorRecovery Integration', () => {
  // Suppress console errors during error tests
  const originalError = console.error
  beforeEach(() => {
    console.error = vi.fn()
    ErrorHandler.clearLogs()
  })
  afterEach(() => {
    console.error = originalError
  })

  describe('Error boundary integration', () => {
    it('should catch and log rendering errors', () => {
      render(
        <ErrorBoundary>
          <ErrorProneComponent shouldThrow={true} />
        </ErrorBoundary>
      )

      // Error boundary should show fallback UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Simulated rendering error')).toBeInTheDocument()

      // Error should be logged
      const logs = ErrorHandler.getLogs()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[logs.length - 1].level).toBe('error')
      expect(logs[logs.length - 1].category).toBe('rendering')
    })

    it('should provide recovery UI after error', () => {
      render(
        <ErrorBoundary>
          <ErrorProneComponent shouldThrow={true} />
        </ErrorBoundary>
      )

      // Should show reload button
      const reloadButton = screen.getByRole('button', { name: /reload page/i })
      expect(reloadButton).toBeInTheDocument()

      // Should show error details
      expect(screen.getByText('Error Details')).toBeInTheDocument()
    })

    it('should render successfully when no error', () => {
      render(
        <ErrorBoundary>
          <ErrorProneComponent shouldThrow={false} />
        </ErrorBoundary>
      )

      // Normal rendering
      expect(screen.getByText('Component rendered successfully')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    })

    it('should call custom error handler when provided', () => {
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ErrorProneComponent shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(onError).toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Object)
      )
    })
  })

  describe('Error logging workflow', () => {
    it('should accumulate error logs across multiple errors', () => {
      ErrorHandler.clearLogs()

      // Simulate multiple errors
      ErrorHandler.logError('data-fetch', 'Failed to fetch data')
      ErrorHandler.logError('rendering', 'Failed to render component')
      ErrorHandler.logError('interaction', 'Failed to handle click')

      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(3)
      expect(logs[0].message).toBe('Failed to fetch data')
      expect(logs[1].message).toBe('Failed to render component')
      expect(logs[2].message).toBe('Failed to handle click')
    })

    it('should maintain error context through recovery', () => {
      ErrorHandler.clearLogs()

      // Log error with context
      const context = {
        userId: 'user123',
        action: 'loadChart',
        timestamp: Date.now(),
      }

      ErrorHandler.logError('data-fetch', 'Chart load failed', undefined, context)

      const logs = ErrorHandler.getLogs()
      expect(logs[0].context).toEqual(context)
    })
  })

  describe('Graceful degradation', () => {
    it('should allow partial functionality after component error', () => {
      const WorkingComponent = () => <div>Working component</div>

      render(
        <div>
          <WorkingComponent />
          <ErrorBoundary>
            <ErrorProneComponent shouldThrow={true} />
          </ErrorBoundary>
        </div>
      )

      // Working component should still render
      expect(screen.getByText('Working component')).toBeInTheDocument()
      
      // Error boundary should contain the error
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should isolate errors to specific boundaries', () => {
      render(
        <div>
          <ErrorBoundary>
            <ErrorProneComponent shouldThrow={false} />
          </ErrorBoundary>
          <ErrorBoundary>
            <ErrorProneComponent shouldThrow={true} />
          </ErrorBoundary>
        </div>
      )

      // First boundary should render normally
      expect(screen.getByText('Component rendered successfully')).toBeInTheDocument()
      
      // Second boundary should show error
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  describe('Error recovery actions', () => {
    it('should support manual error recovery', () => {
      ErrorHandler.clearLogs()

      // Log an error
      ErrorHandler.logError('state', 'Invalid state')
      expect(ErrorHandler.getLogs()).toHaveLength(1)

      // Clear logs (simulating recovery action)
      ErrorHandler.clearLogs()
      expect(ErrorHandler.getLogs()).toHaveLength(0)

      // Continue normal operation
      ErrorHandler.logInfo('Recovery successful')
      const logs = ErrorHandler.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('info')
    })

    it('should provide error export for debugging', () => {
      ErrorHandler.clearLogs()

      ErrorHandler.logError('rendering', 'Debug error')
      
      const exported = ErrorHandler.exportLogs()
      const parsed = JSON.parse(exported)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0].message).toBe('Debug error')
      expect(parsed[0].category).toBe('rendering')
    })
  })
})
