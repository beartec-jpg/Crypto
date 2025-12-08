import { useAuth, RedirectToSignIn } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

interface CryptoAuthGateProps {
  children: React.ReactNode;
}

const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

export function CryptoAuthGate({ children }: CryptoAuthGateProps) {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  const { isLoading: isBootstrapping } = useQuery({
    queryKey: ['/api/crypto/bootstrap'],
    enabled: isDevelopment || (isLoaded && isSignedIn === true),
    queryFn: async () => {
      if (isDevelopment) {
        const response = await fetch('/api/crypto/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to bootstrap user');
        return response.json();
      }
      
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

  // In development, skip Clerk checks entirely
  if (isDevelopment) {
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

  // Production: require Clerk authentication
  if (!isLoaded) {
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
