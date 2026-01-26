// client/src/components/Wallet/TokenActionModal.tsx
// Action modal shown when clicking a token in the wallet

import { Send, ArrowRightLeft, X } from 'lucide-react';
import type { Token } from '@/lib/tokenService';

interface TokenActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: Token;
  onSend: (token: Token) => void;
  onSwap: (token: Token) => void;
}

export default function TokenActionModal({
  isOpen,
  onClose,
  token,
  onSend,
  onSwap,
}: TokenActionModalProps) {
  if (!isOpen) return null;

  const handleSend = () => {
    onSend(token);
    onClose();
  };

  const handleSwap = () => {
    onSwap(token);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-700">
        {/* Header with Close Button */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            {token.logoUrl ? (
              <img
                src={token.logoUrl}
                alt={token.symbol}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                <span className="text-sm font-semibold text-gray-400">
                  {token.symbol.slice(0, 3).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{token.symbol}</h2>
              <p className="text-sm text-gray-400">{token.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Token Balance */}
        <div className="bg-gray-900/50 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-1">Balance</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold font-mono">
              {parseFloat(token.balance).toFixed(6)}
            </p>
            <span className="text-gray-400">{token.symbol}</span>
          </div>
          {token.usdValue !== undefined && token.usdValue > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              ≈ ${token.usdValue.toFixed(2)} USD
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Send Button */}
          <button
            onClick={handleSend}
            className="w-full px-4 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            Send {token.symbol}
          </button>

          {/* Swap Button - Disabled for now */}
          <button
            onClick={handleSwap}
            disabled
            className="w-full px-4 py-4 rounded-xl bg-gray-700/50 hover:bg-gray-700 transition-colors font-medium flex items-center justify-center gap-2 relative disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightLeft className="w-5 h-5" />
            Swap {token.symbol}
            <span className="absolute top-2 right-2 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
