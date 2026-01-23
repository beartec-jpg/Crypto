// client/src/components/Wallet/SendForm.tsx
// Secure send form with transaction preview and passkey confirmation

import { useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import { securityManager } from '@/lib/securityService';
import TransactionPreviewModal from './TransactionPreviewModal';
import type { Chain } from '@/lib/balanceService';

interface SendFormProps {
  isPasskeyAuthenticated: boolean;
  onRequestPasskey: () => void;
  selectedChain: Chain;
}

export default function SendForm({
  isPasskeyAuthenticated,
  onRequestPasskey,
  selectedChain,
}: SendFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedFee, setEstimatedFee] = useState<string>('0.0001');

  // Check if wallet is locked
  const isLocked = securityManager.isWalletLocked();

  const handleSendClick = () => {
    setError(null);

    // Validation
    if (!recipient) {
      setError('Please enter a recipient address');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Check if wallet is locked
    if (isLocked) {
      setError('Wallet is locked. Please unlock first.');
      onRequestPasskey();
      return;
    }

    // Show transaction preview modal
    setShowPreview(true);
  };

  const handleConfirmTransaction = async () => {
    try {
      console.log('🚀 Sending transaction:', {
        to: recipient,
        amount,
        chain: selectedChain,
      });

      // TODO: Implement actual transaction sending
      // This will be chain-specific (ETH, BTC, etc.)
      
      // Simulate transaction
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Clear form
      setRecipient('');
      setAmount('');
      setShowPreview(false);
      setError(null);

      alert('Transaction sent successfully!');
    } catch (err: any) {
      throw new Error(err.message || 'Failed to send transaction');
    }
  };

  const getChainSymbol = (chain: Chain): string => {
    const symbols: Record<Chain, string> = {
      ethereum: 'ETH',
      bitcoin: 'BTC',
      bsc: 'BNB',
      xrp: 'XRP',
      solana: 'SOL',
    };
    return symbols[chain];
  };

  const validateAddress = (address: string): boolean => {
    // Basic validation - expand per chain
    switch (selectedChain) {
      case 'ethereum':
      case 'bsc':
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case 'bitcoin':
        return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) ||
               /^bc1[a-z0-9]{39,59}$/.test(address);
      case 'xrp':
        return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
      case 'solana':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    
    // Clear error if address becomes valid
    if (value && validateAddress(value)) {
      setError(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Send {getChainSymbol(selectedChain)}</h2>

        {/* Security Notice */}
        {isLocked && (
          <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-300">
                <p className="font-medium mb-1">Wallet Locked</p>
                <p className="text-amber-400/80">
                  Your wallet is currently locked. You'll need to authenticate with your passkey before sending transactions.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => handleRecipientChange(e.target.value)}
            placeholder={`Enter ${selectedChain} address`}
            className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none font-mono text-sm"
          />
          {recipient && !validateAddress(recipient) && (
            <p className="mt-2 text-sm text-red-400">
              Invalid {selectedChain} address format
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.000001"
              min="0"
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
              {getChainSymbol(selectedChain)}
            </span>
          </div>
        </div>

        {/* Estimated Fee */}
        <div className="bg-gray-900/50 rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Estimated Network Fee</span>
            <span className="text-gray-300">
              {estimatedFee} {getChainSymbol(selectedChain)}
            </span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-gray-300">Total</span>
            <span className="text-emerald-400">
              {amount ? (parseFloat(amount) + parseFloat(estimatedFee)).toFixed(6) : '0.000000'} {getChainSymbol(selectedChain)}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSendClick}
          disabled={!recipient || !amount || !validateAddress(recipient)}
          className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Send className="w-5 h-5" />
          Review Transaction
        </button>
      </div>

      {/* Transaction Preview Modal */}
      {showPreview && (
        <TransactionPreviewModal
          transaction={{
            to: recipient,
            amount,
            token: getChainSymbol(selectedChain),
            chain: selectedChain,
            estimatedFee,
            totalCost: (parseFloat(amount) + parseFloat(estimatedFee)).toFixed(6),
          }}
          onConfirm={handleConfirmTransaction}
          onCancel={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
