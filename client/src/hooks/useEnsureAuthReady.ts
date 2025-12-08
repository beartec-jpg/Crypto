import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { isDevelopment } from './useCryptoAuth';

interface AuthReadyState {
  ready: boolean;
  token: string | null;
  error: Error | null;
  isLoading: boolean;
}

export function useEnsureAuthReady(maxRetries = 10, retryDelay = 300): AuthReadyState {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [state, setState] = useState<AuthReadyState>({
    ready: isDevelopment,
    token: null,
    error: null,
    isLoading: !isDevelopment,
  });

  useEffect(() => {
    if (isDevelopment) {
      setState({
        ready: true,
        token: null,
        error: null,
        isLoading: false,
      });
      return;
    }
    
    let cancelled = false;
    let retryCount = 0;

    const checkAuth = async () => {
      if (!isLoaded) {
        return;
      }

      if (!isSignedIn) {
        setState({
          ready: false,
          token: null,
          error: null,
          isLoading: false,
        });
        return;
      }

      try {
        const token = await getToken();
        
        if (token && token.length > 0) {
          if (!cancelled) {
            setState({
              ready: true,
              token,
              error: null,
              isLoading: false,
            });
          }
          return;
        }

        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(checkAuth, retryDelay);
        } else {
          if (!cancelled) {
            setState({
              ready: false,
              token: null,
              error: new Error('Failed to obtain authentication token after multiple attempts'),
              isLoading: false,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            ready: false,
            token: null,
            error: err instanceof Error ? err : new Error('Authentication error'),
            isLoading: false,
          });
        }
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, maxRetries, retryDelay]);

  return state;
}
