import { useState } from 'react';
import { X, Fingerprint, Shield, Loader2, AlertCircle } from 'lucide-react';
import { createWallet } from '@/lib/walletService';

interface PasskeyAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PasskeyAuthModal({ onClose, onSuccess }: PasskeyAuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleCreateWallet = async () => {
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Creating multi-chain wallet...');
      
      const wallet = await createWallet(password);
      
      console.log('✅ Multi-chain wallet created!');
      console.log('Ethereum:', wallet.addresses.ethereum);
      console.log('Bitcoin:', wallet.addresses.bitcoin);
      console.log('BSC:', wallet.addresses.bsc);
      console.log('XRP:', wallet.addresses.xrp);
      console.log('Solana:', wallet.addresses.solana);
      
      // Set session
      sessionStorage.setItem('wallet_unlocked', 'true');
      
      setTimeout(() => {
        onSuccess();
      }, 1000);

    } catch (err: any) {
      console.error('Failed to create wallet:', err);
      setError(err.message || 'Failed to create wallet. Please try again.');
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
          <h2 className="text-2xl font-bold">Create Multi-Chain Wallet</h2>
          <p className="text-gray-400 mt-2">
            One wallet for ETH, BTC, BSC, XRP & Solana
          </p>
        </div>

        {!isLoading ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Wallet Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 focus:border-emerald-500 focus:outline-none"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 focus:border-emerald-500 focus:outline-none"
                placeholder="Re-enter password"
              />
            </div>

            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-sm text-emerald-400 hover:underline"
            >
              {showPassword ? 'Hide' : 'Show'} password
            </button>

            {error && (
              <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/30 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleCreateWallet}
              disabled={!password || !confirmPassword}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              <span>Create Wallet</span>
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin mb-4" />
            <p className="text-gray-300">Creating your multi-chain wallet...</p>
            <p className="text-sm text-gray-400 mt-2">This may take a few seconds</p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-700 text-sm text-gray-400">
          <div className="flex items-start gap-2 mb-3">
            <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-300 mb-1">Security Features</p>
              <ul className="space-y-1 list-disc list-inside text-xs">
                <li>BIP39 mnemonic (24 words)</li>
                <li>Password encrypted storage</li>
                <li>Multi-chain support (5 blockchains)</li>
                <li>Keys never leave your device</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
