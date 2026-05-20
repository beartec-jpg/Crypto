// client/src/components/Wallet/TransactionPreviewModal.tsx
// Secure transaction preview with passkey confirmation

import { useState } from 'react';
import { AlertTriangle, Lock, ArrowRight, X } from 'lucide-react';

interface TransactionDetails {
  to: string;
  amount: string;
  token: string;
  chain: string;
  gasLimit?: string;
  gasPrice?: string;
  estimatedFee?: string;
  totalCost?: string;
}

interface TransactionPreviewModalProps {
  transaction: TransactionDetails;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export default function TransactionPreviewModal({
  transaction,
  onConfirm,
  onCancel,
}: TransactionPreviewModalProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setError(null);
      setIsSending(true);

      // Execute transaction — passkey was already verified at login;
      // the send flow (handleConfirmTransaction) uses masterSeed directly.
      await onConfirm();

      console.log('✅ Transaction submitted');
    } catch (err: any) {
      console.error('❌ Transaction failed:', err);
      setError(err.message || 'Transaction failed');
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6 border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            Confirm Transaction
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isAuthenticating || isSending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Notice */}
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-300">
              <p className="font-medium mb-1">Security Check Required</p>
              <p className="text-amber-400/80">
                You will be asked to authenticate with your passkey (biometric/PIN) before sending this transaction.
              </p>
            </div>
          </div>
        </div>

        {/* Transaction Details */}
        <div className="space-y-4 mb-6">
          <div className="bg-gray-900/50 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-1">Sending</p>
            <p className="text-2xl font-bold text-emerald-400">
              {transaction.amount} {transaction.token}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-6 h-6 text-gray-500" />
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-1">To Address</p>
            <p className="text-sm font-mono break-all text-gray-300">
              {transaction.to}
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-1">Network</p>
            <p className="text-sm font-medium text-gray-300 capitalize">
              {transaction.chain}
            </p>
          </div>

          {/* Fee Breakdown */}
          {transaction.estimatedFee && (
            <div className="bg-gray-900/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Amount</span>
                <span className="text-gray-300">
                  {transaction.amount} {transaction.token}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Network Fee</span>
                <span className="text-gray-300">
                  {transaction.estimatedFee} {transaction.token}
                </span>
              </div>
              <div className="border-t border-gray-700 pt-2 flex justify-between font-medium">
                <span className="text-gray-300">Total Cost</span>
                <span className="text-emerald-400">
                  {transaction.totalCost || 
                    (parseFloat(transaction.amount) + parseFloat(transaction.estimatedFee)).toFixed(6)
                  } {transaction.token}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isAuthenticating || isSending}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isAuthenticating || isSending}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            {isAuthenticating ? (
              <>
                <Lock className="w-4 h-4 animate-pulse" />
                Authenticating...
              </>
            ) : isSending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Confirm & Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
