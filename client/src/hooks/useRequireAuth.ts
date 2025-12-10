import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { isDevelopment } from './useCryptoAuth';

function useClerkAuth() {
  if (isDevelopment) {
    return {
      isSignedIn: true,
      isLoaded: true,
    };
  }
  const { useAuth } = require('@clerk/clerk-react');
  return useAuth();
}

export function useRequireAuth(redirectTo: string = '/cryptologin') {
  const { isSignedIn, isLoaded } = useClerkAuth();
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
