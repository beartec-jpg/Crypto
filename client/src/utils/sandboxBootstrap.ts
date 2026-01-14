/**
 * Sandbox Bootstrap Utility
 * 
 * This module provides initialization and cleanup utilities for the CryptoSandbox feature.
 * It's designed to be safe for both SSR/build environments and browser runtime.
 * 
 * @module sandboxBootstrap
 */

/**
 * Helper to detect if code is running in a browser environment.
 * @internal
 */
function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Configuration options for sandbox initialization
 */
export interface SandboxOptions {
  /**
   * Enable debug mode for verbose logging
   * @default false
   */
  debug?: boolean;
  
  /**
   * Custom canvas context settings
   */
  canvasSettings?: {
    alpha?: boolean;
    desynchronized?: boolean;
  };
  
  /**
   * Performance monitoring settings
   */
  performance?: {
    enabled?: boolean;
    sampleRate?: number;
  };
}

/**
 * Handle returned from sandbox initialization
 */
export interface SandboxHandle {
  /**
   * Indicates if the sandbox was successfully initialized
   */
  initialized: boolean;
  
  /**
   * Timestamp of initialization
   */
  timestamp: number;
  
  /**
   * Environment type where sandbox is running
   * Note: Currently 'ssr' is reserved for future use; non-browser environments return 'build'
   */
  environment: 'browser' | 'ssr' | 'build';
}

/**
 * Initialize the sandbox environment.
 * 
 * This function performs a safe no-op when run in non-browser environments (SSR/build)
 * and gracefully returns a consistent value when called in the browser.
 * 
 * **Implementation Note:** This is currently a stub implementation. When implementing
 * the full sandbox functionality, replace this with actual initialization logic that:
 * - Sets up WebGL contexts
 * - Initializes performance monitoring
 * - Configures event listeners
 * - Loads necessary resources
 * 
 * @param options - Optional configuration for sandbox initialization
 * @returns A promise that resolves to a SandboxHandle
 * 
 * @example
 * ```typescript
 * import { initSandbox } from '@/utils/sandboxBootstrap';
 * 
 * // Basic usage
 * const handle = await initSandbox();
 * console.log('Sandbox initialized:', handle.initialized);
 * 
 * // With options
 * const handle = await initSandbox({
 *   debug: true,
 *   performance: { enabled: true, sampleRate: 0.1 }
 * });
 * ```
 */
export async function initSandbox(options?: SandboxOptions): Promise<SandboxHandle> {
  // Detect environment
  const isBrowser = isBrowserEnvironment();
  // Non-browser environments are classified as 'build' (includes SSR, build time, Node tests)
  const environment: 'browser' | 'ssr' | 'build' = isBrowser ? 'browser' : 'build';
  
  // Safe no-op for non-browser environments
  if (!isBrowser) {
    return {
      initialized: false,
      timestamp: Date.now(),
      environment,
    };
  }
  
  // Browser environment - safe initialization
  if (options?.debug && import.meta.env?.DEV !== false) {
    // Only log in development mode
    console.log('[SandboxBootstrap] Initializing sandbox with options:', options);
  }
  
  // TODO: Add actual sandbox initialization logic here
  // For example:
  // - Initialize WebGL contexts
  // - Set up performance monitoring
  // - Configure event listeners
  // - Load resources
  
  return {
    initialized: true,
    timestamp: Date.now(),
    environment,
  };
}

/**
 * Clean up sandbox resources.
 * 
 * This function safely releases any resources allocated during sandbox initialization.
 * It's safe to call even if the sandbox was never initialized.
 * 
 * **Implementation Note:** When implementing full sandbox functionality, ensure this
 * function properly cleans up:
 * - WebGL contexts
 * - Event listeners
 * - Performance monitoring
 * - Any allocated memory or resources
 * 
 * @example
 * ```typescript
 * import { cleanupSandbox } from '@/utils/sandboxBootstrap';
 * 
 * // Clean up resources
 * cleanupSandbox();
 * ```
 */
export function cleanupSandbox(): void {
  if (!isBrowserEnvironment()) {
    return;
  }
  
  // TODO: Add actual cleanup logic here
  // For example:
  // - Dispose WebGL contexts
  // - Remove event listeners
  // - Stop performance monitoring
  // - Release memory
}

/**
 * Check if the sandbox environment is available.
 * 
 * Returns true when running in a browser environment where sandbox features
 * can be safely used (window and document are available).
 * 
 * @returns true if running in a browser environment, false otherwise
 * 
 * @example
 * ```typescript
 * import { isSandboxAvailable } from '@/utils/sandboxBootstrap';
 * 
 * if (isSandboxAvailable()) {
 *   // Safe to use sandbox features
 * }
 * ```
 */
export function isSandboxAvailable(): boolean {
  return isBrowserEnvironment();
}

/**
 * Default export for compatibility with different import styles.
 * Supports both named imports and default import patterns.
 * 
 * @example
 * ```typescript
 * // Named imports (preferred)
 * import { initSandbox, cleanupSandbox } from '@/utils/sandboxBootstrap';
 * 
 * // Default import
 * import sandboxBootstrap from '@/utils/sandboxBootstrap';
 * const handle = await sandboxBootstrap.initSandbox();
 * ```
 */
export default {
  initSandbox,
  cleanupSandbox,
  isSandboxAvailable,
};
