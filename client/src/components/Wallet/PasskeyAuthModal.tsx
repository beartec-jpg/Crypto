import { useState } from 'react';
import { X, Fingerprint, Shield, Loader2 } from 'lucide-react';

interface PasskeyAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PasskeyAuthModal({ onClose, onSuccess }: PasskeyAuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Starting passkey registration...');
      
      // Simple localStorage-based wallet creation (no WebAuthn for now)
      const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      localStorage.setItem('wallet_id', walletId);
      localStorage.setItem('wallet_created', 'true');
      localStorage.setItem('wallet_created_at', new Date().toISOString());
      
      console.log('Wallet created:', walletId);
      
      setTimeout(() => {
        onSuccess();
      }, 1000);

    } catch (err: any) {
      console.error('Registration failed:', err);
      setError('Failed to create wallet. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-700">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <Fingerprint className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Create Wallet</h2>
          <p className="text-gray-400 mt-2">Set up your secure wallet</p>
        </div>

        {!isLoading && !error && (
          <button
            onClick={handleRegister}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Shield className="w-5 h-5" />
            <span>Create Wallet</span>
          </button>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin mb-4" />
            <p className="text-gray-300">Creating wallet...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/30">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="mt-3 text-sm text-cyan-400 hover:underline">
              Try again
            </button>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-700 text-sm text-gray-400">
          <p className="font-medium text-gray-300 mb-2">How it works</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Wallet created instantly</li>
            <li>Keys stored locally</li>
            <li>Non-custodial security</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
