/**
 * Sandbox Bootstrap Utility - Re-export from shared implementation
 * 
 * This file re-exports the shared sandbox bootstrap to maintain backwards compatibility.
 * The actual implementation is in shared/utils/sandboxBootstrap.ts
 */

// Re-export everything from the shared implementation
export { default, initSandboxBootstrap, type SandboxOptions, type SandboxHandle } from '@shared/utils/sandboxBootstrap';

// Legacy export for backwards compatibility with existing code
export { initSandboxBootstrap as initSandbox } from '@shared/utils/sandboxBootstrap';

/**
 * Check if the sandbox environment is available.
 * 
 * Returns true when running in a browser environment where sandbox features
 * can be safely used (window and document are available).
 * 
 * @returns true if running in a browser environment, false otherwise
 */
export function isSandboxAvailable(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Clean up sandbox resources.
 * Note: With the new shared implementation, cleanup is handled via the disconnect() method
 * on the handle returned by initSandboxBootstrap().
 * This function is kept for backwards compatibility.
 */
export function cleanupSandbox(): void {
  // Legacy function - no-op as cleanup is now handled via handle.disconnect()
  // New code should use: const handle = initSandboxBootstrap({ autoInit: true }); handle.disconnect();
}

