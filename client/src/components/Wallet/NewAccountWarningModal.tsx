// client/src/components/Wallet/NewAccountWarningModal.tsx
// Warning modal for sending to unfunded XRP addresses

import { AlertCircle, X } from 'lucide-react';

interface NewAccountWarningModalProps {
  destinationAddress: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function NewAccountWarningModal({
  destinationAddress,
  onConfirm,
  onCancel,
}: NewAccountWarningModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-lg w-full p-6 border border-amber-700/50">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-600/20">
              <AlertCircle className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold">New XRP Account</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-6">
          <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/30">
            <p className="text-amber-300 text-sm">
              The destination address has not been activated on the XRP Ledger.
            </p>
          </div>

          <div className="space-y-2 text-sm text-gray-300">
            <p>
              <span className="font-medium">Destination:</span>
            </p>
            <div className="p-3 rounded-lg bg-gray-800 font-mono text-xs break-all">
              {destinationAddress}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-gray-200">Requirements:</h4>
            <ul className="space-y-1 text-sm text-gray-400 list-disc list-inside">
              <li>Minimum amount: <span className="text-emerald-400 font-medium">10 XRP</span></li>
              <li>This reserve activates the account</li>
              <li>Once activated, the account can receive any amount</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
            <p className="text-xs text-gray-400">
              <strong>Note:</strong> If you send less than 10 XRP to a new address, 
              the transaction will fail and you'll lose the network fee (~0.00001 XRP).
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 transition-colors font-medium"
          >
            I Understand, Continue
          </button>
        </div>
      </div>
    </div>
  );
}
