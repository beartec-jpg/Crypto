import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initSandboxBootstrap, isSandboxAvailable } from '@/utils/sandboxBootstrap'

describe('sandboxBootstrap', () => {
  beforeEach(() => {
    // Reset any mocks
    vi.clearAllMocks()
  })

  describe('initSandboxBootstrap', () => {
    it('should return handle without initializing when autoInit is false', () => {
      const handle = initSandboxBootstrap({ autoInit: false })
      
      expect(handle).toBeDefined()
      expect(handle.disconnect).toBeDefined()
      expect(typeof handle.disconnect).toBe('function')
    })

    it('should return handle when autoInit is true in browser environment', () => {
      const handle = initSandboxBootstrap({ autoInit: true })
      
      expect(handle).toBeDefined()
      expect(handle.disconnect).toBeDefined()
      expect(typeof handle.disconnect).toBe('function')
    })

    it('should accept options parameter', () => {
      const options = {
        autoInit: false,
        skipLabels: true,
        rootSelector: '#root'
      }
      
      const handle = initSandboxBootstrap(options)
      
      expect(handle).toBeDefined()
      expect(handle.disconnect).toBeDefined()
    })

    it('should not throw when called without options', () => {
      expect(() => initSandboxBootstrap()).not.toThrow()
    })
  })

  describe('isSandboxAvailable', () => {
    it('should return true in browser environment (jsdom)', () => {
      expect(isSandboxAvailable()).toBe(true)
    })

    it('should check for window and document', () => {
      // In jsdom environment, both should exist
      expect(typeof window).not.toBe('undefined')
      expect(typeof document).not.toBe('undefined')
      expect(isSandboxAvailable()).toBe(true)
    })
  })

  describe('default export', () => {
    it('should export the initializer function', async () => {
      const sandboxBootstrap = await import('@/utils/sandboxBootstrap')
      
      expect(sandboxBootstrap.default).toBeDefined()
      expect(typeof sandboxBootstrap.default).toBe('function')
    })
  })
})
