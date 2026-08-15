import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { queryClient } from '@/lib/queryClient';

/**
 * Clears React Query cache when the signed-in user changes so drawings,
 * watchlists, and settings never leak across accounts in the same browser.
 */
export function AuthQueryIsolation() {
  const { userId, isLoaded } = useAuth();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    const prev = prevUserIdRef.current;
    // First load: just record; don't wipe
    if (prev === undefined) {
      prevUserIdRef.current = userId ?? null;
      return;
    }

    if (prev !== (userId ?? null)) {
      console.log('[AuthQueryIsolation] User changed — clearing query cache', {
        from: prev,
        to: userId ?? null,
      });
      queryClient.clear();
      // Drop shared non-user-scoped localStorage leftovers
      try {
        localStorage.removeItem('watchlistTickers');
      } catch {
        /* ignore */
      }
      prevUserIdRef.current = userId ?? null;
    }
  }, [userId, isLoaded]);

  return null;
}
