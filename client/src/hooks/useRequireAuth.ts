import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { isDevelopment } from './useCryptoAuth';
import { useAuth } from '@clerk/clerk-react';

function useClerkAuth() {
  const auth = useAuth();
  
  if (isDevelopment) {
    return {
      isSignedIn: true,
      isLoaded: true,
    };
  }
  return auth;
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
