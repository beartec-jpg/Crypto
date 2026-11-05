// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Recovery for "Failed to fetch dynamically imported module".
 *
 * Root cause: during a deploy, a request for a not-yet-present /assets/js/<chunk>.js
 * is answered by the SPA fallback (index.html, 200 text/html) with the
 * `Cache-Control: max-age=31536000, immutable` header that applies to /assets/*.
 * The browser then keeps that HTML under the chunk URL for a year, so even after
 * the real chunk exists (and after a normal reload) the module import fails on MIME type.
 *
 * Fix: re-fetch the failed module and its static imports with `cache: 'reload'`,
 * which overwrites the poisoned HTTP cache entries, then reload once.
 */

const STATIC_IMPORT_RE = /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*["'](\.{1,2}\/[^"']+)["']/g;
const MAX_MODULES = 120;
const RELOAD_KEY = '__chunk_recover_at__';
const RELOAD_WINDOW_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const msg =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | null | undefined)?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

export function extractModuleUrl(error: unknown): string | null {
  const msg =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | null | undefined)?.message || '';
  const m = msg.match(/https?:\/\/[^\s'"]+?\.js/);
  return m ? m[0] : null;
}

export function parseStaticImports(source: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const re of [STATIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      try {
        out.add(new URL(m[1], baseUrl).toString());
      } catch {
        /* ignore malformed specifier */
      }
    }
  }
  return [...out];
}

/** Re-fetch a module and its static import graph bypassing (and overwriting) the HTTP cache. */
export async function refetchModuleGraph(
  entryUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const seen = new Set<string>();
  let queue = [entryUrl];
  while (queue.length && seen.size < MAX_MODULES) {
    const batch = queue.filter((u) => !seen.has(u)).slice(0, MAX_MODULES - seen.size);
    batch.forEach((u) => seen.add(u));
    const next: string[] = [];
    await Promise.all(
      batch.map(async (url) => {
        try {
          const res = await fetchImpl(url, { cache: 'reload', credentials: 'same-origin' });
          const type = res.headers.get('content-type') || '';
          if (!res.ok || !type.includes('javascript')) return;
          next.push(...parseStaticImports(await res.text(), url));
        } catch {
          /* network error: nothing to repair for this URL */
        }
      }),
    );
    queue = next;
  }
  return seen.size;
}

/** Repair the HTTP cache for a failed chunk and reload once per minute. Returns true if a reload was triggered. */
export async function recoverFromChunkError(error: unknown): Promise<boolean> {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last < RELOAD_WINDOW_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const url = extractModuleUrl(error);
  if (url) await refetchModuleGraph(url);
  // Also refresh the entry document so it points at the current chunk names.
  try {
    await fetch(window.location.href, { cache: 'reload' });
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}
