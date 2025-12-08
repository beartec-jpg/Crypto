import { useAuth } from '@clerk/clerk-react';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { isDevelopment } from './useCryptoAuth';

export function useRequireAuth(redirectTo: string = '/cryptologin') {
  const { isSignedIn, isLoaded } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isDevelopment) return;
    
    if (isLoaded && !isSignedIn) {
      const currentPath = window.location.pathname;
      const returnUrl = encodeURIComponent(currentPath);
      setLocation(`${redirectTo}?returnTo=${returnUrl}`);
    }
  }, [isLoaded, isSignedIn, setLocation, redirectTo]);

  return {
    isAuthenticated: isDevelopment || isSignedIn,
    isLoading: !isDevelopment && !isLoaded,
    shouldRedirect: !isDevelopment && isLoaded && !isSignedIn,
  };
}
