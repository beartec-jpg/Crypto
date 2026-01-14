import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initSandbox, cleanupSandbox, isSandboxAvailable } from '@/utils/sandboxBootstrap'

describe('sandboxBootstrap', () => {
  beforeEach(() => {
    // Reset any mocks
    vi.clearAllMocks()
  })

  describe('initSandbox', () => {
    it('should return initialized handle in browser environment', async () => {
      // Test runs in jsdom, which has window and document
      const handle = await initSandbox()
      
      expect(handle).toBeDefined()
      expect(handle.initialized).toBe(true)
      expect(handle.environment).toBe('browser')
      expect(handle.timestamp).toBeGreaterThan(0)
    })

    it('should accept options parameter', async () => {
      const options = {
        debug: true,
        performance: { enabled: true, sampleRate: 0.1 }
      }
      
      const handle = await initSandbox(options)
      
      expect(handle).toBeDefined()
      expect(handle.initialized).toBe(true)
    })

    it('should return handle with timestamp', async () => {
      const beforeTime = Date.now()
      const handle = await initSandbox()
      const afterTime = Date.now()
      
      expect(handle.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(handle.timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('cleanupSandbox', () => {
    it('should execute without errors', () => {
      expect(() => cleanupSandbox()).not.toThrow()
    })

    it('should be safe to call multiple times', () => {
      cleanupSandbox()
      cleanupSandbox()
      expect(() => cleanupSandbox()).not.toThrow()
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
    it('should export all functions', async () => {
      const sandboxBootstrap = await import('@/utils/sandboxBootstrap')
      
      expect(sandboxBootstrap.default).toBeDefined()
      expect(sandboxBootstrap.default.initSandbox).toBe(initSandbox)
      expect(sandboxBootstrap.default.cleanupSandbox).toBe(cleanupSandbox)
      expect(sandboxBootstrap.default.isSandboxAvailable).toBe(isSandboxAvailable)
    })
  })
})
