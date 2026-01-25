// client/src/components/Wallet/SolanaSendModal.tsx
// Modal for Solana native + SPL token sending

import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle, Zap, Clock, TrendingDown, Info } from 'lucide-react';
import {
  sendSolana,
  sendSPLToken,
  validateSolanaAddress,
  lamportsToSOL,
  solToLamports,
  getSolanaPriorityFees,
  estimateSOLTransferFee,
  estimateSPLTransferFee,
  getTokenAccount,
  type SolanaPriorityFee,
} from '@/lib/solanaService';
import type { Token } from '@/lib/tokenService';

interface SolanaSendModalProps {
  fromAddress: string;
  privateKeyBase58: string;
  selectedToken: Token; // Can be native SOL or SPL token
  onClose: () => void;
  onSuccess: (signature: string) => void;
}

type PriorityLevel = 'none' | 'low' | 'medium' | 'high' | 'veryHigh';

export default function SolanaSendModal({
  fromAddress,
  privateKeyBase58,
  selectedToken,
  onClose,
  onSuccess,
}: SolanaSendModalProps) {
  const isNative = selectedToken.isNative;
  const isSPL = selectedToken.standard === 'SPL';

  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [priorityLevel, setPriorityLevel] = useState<PriorityLevel>('medium');
  
  const [fees, setFees] = useState<SolanaPriorityFee>(getSolanaPriorityFees());
  const [estimatedFee, setEstimatedFee] = useState<number>(0);
  const [needsATA, setNeedsATA] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [signature, setSignature] = useState<string>('');

  // Estimate fee when inputs change
  useEffect(() => {
    const estimate = async () => {
      if (!toAddress || !amount) {
        setEstimatedFee(0);
        return;
      }

      setIsEstimating(true);
      try {
        const priorityFee = fees[priorityLevel];

        if (isNative) {
          const fee = await estimateSOLTransferFee(fromAddress, priorityFee);
          setEstimatedFee(fee);
          setNeedsATA(false);
        } else if (isSPL) {
          const result = await estimateSPLTransferFee(
            fromAddress,
            toAddress,
            selectedToken.mintAddress!,
            priorityFee
          );
          setEstimatedFee(result.fee);
          setNeedsATA(result.needsATA);
        }
      } catch (err) {
        console.error('Fee estimation failed:', err);
      } finally {
        setIsEstimating(false);
      }
    };

    const debounce = setTimeout(estimate, 500);
    return () => clearTimeout(debounce);
  }, [toAddress, amount, priorityLevel, isNative, isSPL, fromAddress, selectedToken, fees]);

  // Handle send
  const handleSend = async () => {
    // Validation
    if (!validateSolanaAddress(toAddress)) {
      setError('Invalid Solana address');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }

    const balance = parseFloat(selectedToken.balance);
    if (amountNum > balance) {
      setError(`Insufficient ${selectedToken.symbol} balance`);
      return;
    }

    // For native SOL, check if amount + fee exceeds balance
    if (isNative) {
      const amountLamports = solToLamports(amountNum);
      const totalNeeded = amountLamports + estimatedFee;
      const availableLamports = solToLamports(balance);

      if (totalNeeded > availableLamports) {
        setError(`Insufficient SOL. Need ${lamportsToSOL(totalNeeded).toFixed(9)} SOL (including fee of ${lamportsToSOL(estimatedFee).toFixed(9)} SOL)`);
        return;
      }
    }

    setIsSending(true);
    setError(null);

    try {
      const priorityFee = fees[priorityLevel];
      let result;

      if (isNative) {
        // Send native SOL
        result = await sendSolana(
          privateKeyBase58,
          toAddress,
          amountNum,
          priorityFee,
          memo || undefined
        );
      } else if (isSPL) {
        // Send SPL token
        result = await sendSPLToken(
          privateKeyBase58,
          toAddress,
          selectedToken.mintAddress!,
          amountNum,
          selectedToken.decimals,
          priorityFee,
          memo || undefined
        );
      } else {
        throw new Error('Invalid token type');
      }

      setSignature(result.signature);
      setSuccess(true);

      setTimeout(() => {
        onSuccess(result.signature);
      }, 3000);
    } catch (err: any) {
      console.error('Send failed:', err);
      setError(err.message || 'Failed to send transaction');
    } finally {
      setIsSending(false);
    }
  };

  // Set max amount
  const handleMaxAmount = () => {
    const balance = parseFloat(selectedToken.balance);

    if (isNative) {
      // For SOL, subtract estimated fee
      const maxAmount = Math.max(0, balance - lamportsToSOL(estimatedFee));
      setAmount(maxAmount.toFixed(9));
    } else {
      // For SPL tokens, can send full balance (fee paid in SOL)
      setAmount(balance.toString());
    }
  };

  const priorityOptions = [
    { level: 'none' as PriorityLevel, label: 'None', icon: TrendingDown, color: 'text-gray-400' },
    { level: 'low' as PriorityLevel, label: 'Low', icon: Clock, color: 'text-green-400' },
    { level: 'medium' as PriorityLevel, label: 'Medium', icon: Zap, color: 'text-blue-400' },
    { level: 'high' as PriorityLevel, label: 'High', icon: Zap, color: 'text-orange-400' },
    { level: 'veryHigh' as PriorityLevel, label: 'Very High', icon: Zap, color: 'text-red-400' },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Send {selectedToken.symbol}</h2>
            <p className="text-sm text-gray-400">
              {isNative ? 'Native SOL' : `SPL Token (${selectedToken.standard})`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Success State */}
          {success ? (
            <div className="py-8 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-bold text-green-400 mb-2">Transaction Sent!</h3>
              <p className="text-sm text-gray-400 mb-4">
                Your {selectedToken.symbol} is on its way
              </p>
              <a
                href={`https://solscan.io/tx/${signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-sm underline"
              >
                View on Solscan
              </a>
            </div>
          ) : (
            <>
              {/* Recipient Address */}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value.trim())}
                  placeholder="Solana address..."
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono text-sm"
                  disabled={isSending}
                />
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">
                    Amount ({selectedToken.symbol})
                  </label>
                  <button
                    onClick={handleMaxAmount}
                    disabled={isSending}
                    className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    Max
                  </button>
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="any"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono"
                  disabled={isSending}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available: {parseFloat(selectedToken.balance).toFixed(selectedToken.decimals)} {selectedToken.symbol}
                </p>
              </div>

              {/* Memo */}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Memo (Optional)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Add a note..."
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white"
                  disabled={isSending}
                  maxLength={100}
                />
              </div>

              {/* Priority Fee */}
              <div>
                <label className="text-sm text-gray-400 mb-3 block">
                  Priority Fee (Optional)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {priorityOptions.map((option) => {
                    const Icon = option.icon;
                    const isSelected = priorityLevel === option.level;

                    return (
                      <button
                        key={option.level}
                        onClick={() => setPriorityLevel(option.level)}
                        disabled={isSending}
                        className={`p-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-700 bg-gray-700/30 hover:border-gray-600'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mx-auto ${option.color}`} />
                        <p className="text-xs mt-1">{option.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ATA Warning */}
              {needsATA && isSPL && (
                <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-200">
                      <p className="font-semibold mb-1">Token Account Creation Required</p>
                      <p>
                        The recipient doesn't have a token account for this SPL token. 
                        An Associated Token Account (ATA) will be created automatically 
                        (costs ~0.002 SOL, paid by you).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fee Summary */}
              {estimatedFee > 0 && (
                <div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Amount:</span>
                    <span className="font-mono">
                      {amount || '0'} {selectedToken.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Network Fee:</span>
                    <span className="font-mono">
                      {isEstimating ? '...' : `${lamportsToSOL(estimatedFee).toFixed(9)} SOL`}
                    </span>
                  </div>
                  {needsATA && (
                    <div className="flex justify-between text-xs text-blue-400">
                      <span>└ Includes ATA creation</span>
                      <span>~0.002 SOL</span>
                    </div>
                  )}
                  <div className="border-t border-gray-600 pt-2 flex justify-between font-semibold">
                    <span>Total Cost:</span>
                    <span className="font-mono">
                      {isNative 
                        ? `${(parseFloat(amount || '0') + lamportsToSOL(estimatedFee)).toFixed(9)} SOL`
                        : `${amount || '0'} ${selectedToken.symbol} + ${lamportsToSOL(estimatedFee).toFixed(9)} SOL`
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={isSending || !toAddress || !amount || isEstimating}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  `Send ${selectedToken.symbol}`
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
