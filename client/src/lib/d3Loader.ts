/**
 * Dynamic D3 loader for lazy loading D3 library
 * This ensures D3 is only loaded when actually needed (i.e., when CryptoSandbox is accessed)
 * Saves ~300KB from initial bundle
 */

let d3Cache: typeof import('d3') | null = null;
let d3LoadPromise: Promise<typeof import('d3')> | null = null;

/**
 * Load D3 library dynamically
 * Uses caching to avoid multiple loads
 * @returns Promise that resolves to the D3 library
 */
export async function loadD3(): Promise<typeof import('d3')> {
  // Return cached D3 if already loaded
  if (d3Cache) {
    return d3Cache;
  }

  // Return existing load promise if loading is in progress
  if (d3LoadPromise) {
    return d3LoadPromise;
  }

  // Start loading D3
  d3LoadPromise = import('d3').then((d3Module) => {
    d3Cache = d3Module;
    return d3Module;
  });

  return d3LoadPromise;
}

/**
 * Check if D3 is already loaded
 * @returns true if D3 is loaded, false otherwise
 */
export function isD3Loaded(): boolean {
  return d3Cache !== null;
}

/**
 * Reset D3 cache (mainly for testing)
 */
export function resetD3Cache(): void {
  d3Cache = null;
  d3LoadPromise = null;
}
