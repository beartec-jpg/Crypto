import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Loading...' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex flex-col items-center gap-3 rounded-lg bg-[#1a1a1a] border border-gray-800 px-8 py-6">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-400">{message}</p>
      </div>
    </div>
  );
}
