import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

interface CryptoAuthGateProps {
  children: React.ReactNode;
}

const ProductionAuthGate = lazy(() => import('./ProductionAuthGate'));

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

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-[#00c4b4] animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export function CryptoAuthGate({ children }: CryptoAuthGateProps) {
  if (isDevelopment) {
    return <DevelopmentAuthGate>{children}</DevelopmentAuthGate>;
  }
  
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProductionAuthGate>{children}</ProductionAuthGate>
    </Suspense>
  );
}
