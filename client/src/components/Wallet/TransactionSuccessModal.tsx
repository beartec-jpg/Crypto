// client/src/components/Wallet/TransactionSuccessModal.tsx
// Success modal shown after transaction is broadcast

import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, X } from 'lucide-react';

interface TransactionSuccessModalProps {
  amount: string;
  token: string;
  to: string;
  fee: string;
  feeUsd?: number;
  hash: string;
  explorerUrl: string;
  onClose: () => void;
}

export default function TransactionSuccessModal({
  amount,
  token,
  to,
  fee,
  feeUsd,
  hash,
  explorerUrl,
  onClose,
}: TransactionSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-700">
        {/* Header with Close Button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Icon and Title */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Transaction Sent!</h2>
          <p className="text-gray-400 text-sm">
            Your transaction has been broadcast to the network
          </p>
        </div>

        {/* Transaction Details */}
        <div className="bg-gray-900/50 rounded-xl p-4 space-y-3 mb-6">
          {/* Amount */}
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Amount:</span>
            <span className="font-medium">
              {amount} {token}
            </span>
          </div>

          {/* Recipient */}
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">To:</span>
            <span className="font-mono text-sm">{formatAddress(to)}</span>
          </div>

          {/* Network Fee */}
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Network Fee:</span>
            <div className="text-right">
              <div className="font-medium text-sm">
                {parseFloat(fee).toFixed(6)} {token}
              </div>
              {feeUsd !== undefined && feeUsd > 0 && (
                <div className="text-xs text-gray-500">≈ ${feeUsd.toFixed(2)}</div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700 my-2" />

          {/* Transaction Hash */}
          <div>
            <span className="text-gray-400 text-sm block mb-2">Transaction Hash:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs bg-gray-800 px-3 py-2 rounded-lg flex-1 truncate">
                {hash}
              </span>
              <button
                onClick={handleCopyHash}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                title="Copy transaction hash"
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors font-medium text-center flex items-center justify-center gap-2"
          >
            View on Explorer
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors font-medium"
          >
            Close
          </button>
        </div>

        {/* Info Text */}
        <p className="text-xs text-gray-500 text-center mt-4">
          Your transaction is being processed. You can track its progress in Recent Transactions.
        </p>
      </div>
    </div>
  );
}
