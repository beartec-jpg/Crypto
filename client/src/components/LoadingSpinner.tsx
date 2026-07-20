import { Loader2 } from 'lucide-react';
import { useLoadingMessages } from '@/hooks/useLoadingMessages';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Loading spinner component for Suspense fallback UI
 * Used during lazy-loaded route and component loading.
 * Cycles through funny loading messages while active.
 */
export function LoadingSpinner({ message, size = 'lg' }: LoadingSpinnerProps) {
  const cyclingMessage = useLoadingMessages(true);
  const displayMessage = message !== undefined ? message : cyclingMessage;

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-100"
      role="status"
      aria-live="polite"
    >
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />
      {displayMessage && (
        <p className="mt-4 text-sm text-slate-400">{displayMessage}</p>
      )}
    </div>
  );
}
