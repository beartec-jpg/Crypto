import { describe, it, expect, vi } from 'vitest';
import {
  isChunkLoadError,
  extractModuleUrl,
  parseStaticImports,
  refetchModuleGraph,
} from '@/lib/chunkRecovery';

const BASE = 'https://www.beartec.uk/assets/js/Page-AAA.js';

describe('chunkRecovery', () => {
  it('detects chunk load errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
  });

  it('extracts the failing module url', () => {
    expect(
      extractModuleUrl(new TypeError(`Failed to fetch dynamically imported module: ${BASE}`)),
    ).toBe(BASE);
    expect(extractModuleUrl(new Error('nope'))).toBeNull();
  });

  it('parses minified static imports incl. names with spaces', () => {
    const src = 'import{a as b}from"./vendor-X.js";import{c}from"./beartec logo_1-Y.js";import"./side-Z.js";';
    expect(parseStaticImports(src, BASE).sort()).toEqual(
      [
        'https://www.beartec.uk/assets/js/vendor-X.js',
        'https://www.beartec.uk/assets/js/beartec%20logo_1-Y.js',
        'https://www.beartec.uk/assets/js/side-Z.js',
      ].sort(),
    );
  });

  it('re-fetches the graph with cache: reload and skips html fallbacks', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const files: Record<string, { type: string; body: string }> = {
      [BASE]: { type: 'application/javascript', body: 'import{a}from"./dep-B.js";' },
      'https://www.beartec.uk/assets/js/dep-B.js': { type: 'application/javascript', body: 'export const a=1;' },
    };
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const f = files[url] ?? { type: 'text/html', body: '<html></html>' };
      return new Response(f.body, { status: 200, headers: { 'content-type': f.type } });
    });
    const n = await refetchModuleGraph(BASE, fetchImpl as unknown as typeof fetch);
    expect(n).toBe(2);
    expect(calls.map((c) => c[0])).toEqual([BASE, 'https://www.beartec.uk/assets/js/dep-B.js']);
    expect(calls.every((c) => c[1]?.cache === 'reload')).toBe(true);
  });
});
