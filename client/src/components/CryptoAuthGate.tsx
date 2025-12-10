import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { setAuthTokenGetter, queryClient } from '@/lib/queryClient';
import { configureApiAuth } from '@/lib/apiAuth';

const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

interface CryptoAuthGateProps {
  children: React.ReactNode;
}

function ProductionAuthGate({ children }: CryptoAuthGateProps) {
  const { useAuth, RedirectToSignIn } = require('@clerk/clerk-react');
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [loadTimeout, setLoadTimeout] = useState(false);
  const authConfigured = useRef(false);

  useEffect(() => {
    if (!authConfigured.current && getToken) {
      setAuthTokenGetter(getToken);
      configureApiAuth(getToken);
      authConfigured.current = true;
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/my-subscription'] });
    }
  }, [getToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoaded) {
        setLoadTimeout(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  const { isLoading: isBootstrapping } = useQuery({
    queryKey: ['/api/crypto/bootstrap'],
    enabled: isLoaded && isSignedIn === true,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No auth token');
      
      const response = await fetch('/api/crypto/bootstrap', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to bootstrap user');
      }
      
      return response.json();
    },
    staleTime: Infinity,
    retry: 2,
  });

  if (!isLoaded) {
    if (loadTimeout) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e] p-6">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Authentication Error</h2>
            <p className="text-gray-400 mb-4">
              Unable to connect to the login service. This may be a configuration issue.
            </p>
            <p className="text-gray-500 text-sm mb-4">
              Please try refreshing the page or contact support if the problem persists.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-[#00c4b4] hover:bg-[#00a89c] text-black font-medium px-6 py-2 rounded"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#00c4b4] animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#00c4b4] animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Setting up your account...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function DevelopmentAuthGate({ children }: CryptoAuthGateProps) {
  const { isLoading: isBootstrapping } = useQuery({
    queryKey: ['/api/crypto/bootstrap'],
    queryFn: async () => {
      const response = await fetch('/api/crypto/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to bootstrap user');
      return response.json();
    },
    staleTime: Infinity,
    retry: 2,
  });

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#00c4b4] animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Setting up dev account...</p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

export function CryptoAuthGate({ children }: CryptoAuthGateProps) {
  if (isDevelopment) {
    return <DevelopmentAuthGate>{children}</DevelopmentAuthGate>;
  }
  
  return <ProductionAuthGate>{children}</ProductionAuthGate>;
}
