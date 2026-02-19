import { AlertCircle, ArrowRight, CheckCircle } from 'lucide-react';
import { TransactionPreviewData } from '../types/coldTypes';

interface TransactionPreviewProps {
  transaction: TransactionPreviewData;
  onApprove: () => void;
  onReject: () => void;
}

export default function TransactionPreview({
  transaction,
  onApprove,
  onReject,
}: TransactionPreviewProps) {
  const getChainDisplay = (chain: string) => {
    switch (chain) {
      case 'ethereum':
        return 'Ethereum';
      case 'bsc':
        return 'Binance Smart Chain';
      case 'xrp':
        return 'XRP Ledger';
      default:
        return chain.toUpperCase();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500/20 rounded-full mb-4">
            <AlertCircle className="w-10 h-10 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Review Transaction</h2>
          <p className="text-gray-400">
            Carefully review the details before signing
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6 space-y-4">
          {/* Chain */}
          <div>
            <label className="text-sm text-gray-400 block mb-1">Network</label>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="font-semibold">{getChainDisplay(transaction.chain)}</span>
            </div>
          </div>

          {/* To Address */}
          <div>
            <label className="text-sm text-gray-400 block mb-1">To Address</label>
            <div className="bg-gray-900 rounded p-3">
              <p className="text-sm font-mono break-all">{transaction.to}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-center justify-between py-4 border-t border-b border-gray-700">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Amount</label>
              <p className="text-2xl font-bold text-emerald-500">
                {transaction.amount}
              </p>
            </div>
            <ArrowRight className="w-6 h-6 text-gray-600" />
          </div>

          {/* Fee */}
          <div>
            <label className="text-sm text-gray-400 block mb-1">Network Fee</label>
            <p className="font-semibold">{transaction.fee}</p>
          </div>

          {/* Additional Info */}
          {transaction.additionalInfo && Object.keys(transaction.additionalInfo).length > 0 && (
            <div className="pt-4 border-t border-gray-700 space-y-2">
              {Object.entries(transaction.additionalInfo).map(([key, value]) => (
                <div key={key}>
                  <label className="text-sm text-gray-400 block mb-1">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                  <p className="text-sm font-mono">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 mb-6">
          <p className="text-red-500 text-sm">
            ⚠️ Verify all details carefully. Signed transactions cannot be reversed.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onReject}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
