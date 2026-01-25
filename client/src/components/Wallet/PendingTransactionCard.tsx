// client/src/components/Wallet/PendingTransactionCard.tsx
// Card showing pending transaction progress with steps

import { Send, CheckCircle2, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import type { PendingTransaction } from '@/hooks/usePendingTransactions';

interface PendingTransactionCardProps {
  transaction: PendingTransaction;
}

export default function PendingTransactionCard({ transaction }: PendingTransactionCardProps) {
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diffInSeconds = Math.floor((now - timestamp) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getStatusIcon = () => {
    if (transaction.status === 'confirmed') {
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    }
    if (transaction.status === 'failed') {
      return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
    return <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />;
  };

  const getStatusColor = () => {
    if (transaction.status === 'confirmed') return 'text-emerald-400';
    if (transaction.status === 'failed') return 'text-red-400';
    return 'text-cyan-400';
  };

  const getStatusText = () => {
    if (transaction.status === 'confirmed') return 'Confirmed';
    if (transaction.status === 'failed') return 'Failed';
    if (transaction.status === 'confirming') {
      return `Confirming (${transaction.confirmations}/${transaction.requiredConfirmations})`;
    }
    if (transaction.status === 'pending') return 'Pending';
    if (transaction.status === 'broadcasting') return 'Broadcasting';
    if (transaction.status === 'signing') return 'Signing';
    return 'Processing';
  };

  const progressPercentage = transaction.status === 'confirmed' 
    ? 100 
    : (transaction.confirmations / transaction.requiredConfirmations) * 100;

  return (
    <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            transaction.status === 'confirmed' ? 'bg-emerald-900/30' :
            transaction.status === 'failed' ? 'bg-red-900/30' :
            'bg-cyan-900/30'
          }`}>
            {getStatusIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                Sending {transaction.amount} {transaction.token}
              </span>
            </div>
            <div className="text-sm text-gray-400">
              To: {transaction.to.slice(0, 6)}...{transaction.to.slice(-4)}
            </div>
          </div>
        </div>
        <span className="text-xs text-gray-500">{formatTime(transaction.timestamp)}</span>
      </div>

      {/* Progress Bar */}
      {transaction.status !== 'confirmed' && transaction.status !== 'failed' && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Progress</span>
            <span className={getStatusColor()}>{getStatusText()}</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                transaction.status === 'confirmed' ? 'bg-emerald-500' :
                transaction.status === 'failed' ? 'bg-red-500' :
                'bg-cyan-500'
              }`}
              style={{ width: `${Math.max(5, progressPercentage)}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Badge for Completed */}
      {(transaction.status === 'confirmed' || transaction.status === 'failed') && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-center font-medium ${
          transaction.status === 'confirmed' 
            ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/50' 
            : 'bg-red-900/30 text-red-400 border border-red-700/50'
        }`}>
          {transaction.status === 'confirmed' ? '✓ Transaction Confirmed' : '✗ Transaction Failed'}
        </div>
      )}

      {/* Transaction Steps */}
      <div className="space-y-2 mb-4">
        {transaction.steps.map((step, index) => (
          <div key={index} className="flex items-center gap-3">
            {/* Step Icon */}
            <div className="flex-shrink-0">
              {step.status === 'complete' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              {step.status === 'active' && (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              )}
              {step.status === 'pending' && (
                <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
              )}
              {step.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-red-400" />
              )}
            </div>
            
            {/* Step Text */}
            <span className={`text-sm ${
              step.status === 'complete' ? 'text-emerald-400' :
              step.status === 'active' ? 'text-cyan-400' :
              step.status === 'error' ? 'text-red-400' :
              'text-gray-500'
            }`}>
              {step.name}
            </span>
          </div>
        ))}
      </div>

      {/* View Transaction Button */}
      <a
        href={transaction.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-sm font-medium"
      >
        View Transaction
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
