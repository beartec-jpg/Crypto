// client/src/components/Wallet/BitcoinSendModal.tsx
// Modal for Bitcoin send with fee selection

import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle, Zap, Clock, TrendingDown } from 'lucide-react';
import {
  fetchBitcoinFees,
  fetchBitcoinUTXOs,
  selectUTXOs,
  buildBitcoinTransaction,
  broadcastBitcoinTransaction,
  satsToBTC,
  btcToSats,
  validateBitcoinAddress,
  deriveWIFFromPrivateKey,
  type BitcoinFeeEstimate,
  type UTXO,
} from '@/lib/bitcoinService';

interface BitcoinSendModalProps {
  fromAddress: string;
  privateKeyHex: string;
  availableBalance: number; // BTC
  onClose: () => void;
  onSuccess: (txid: string) => void;
}

type FeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

export default function BitcoinSendModal({
  fromAddress,
  privateKeyHex,
  availableBalance,
  onClose,
  onSuccess,
}: BitcoinSendModalProps) {
  const [toAddress, setToAddress] = useState('');
  const [amountBTC, setAmountBTC] = useState('');
  const [selectedFeeSpeed, setSelectedFeeSpeed] = useState<FeeSpeed>('halfHour');
  
  const [fees, setFees] = useState<BitcoinFeeEstimate | null>(null);
  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const [isLoadingFees, setIsLoadingFees] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txid, setTxid] = useState<string>('');

  // Load fees and UTXOs on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingFees(true);
      try {
        const [feeData, utxoData] = await Promise.all([
          fetchBitcoinFees(),
          fetchBitcoinUTXOs(fromAddress),
        ]);
        
        setFees(feeData);
        setUtxos(utxoData);
      } catch (err: any) {
        setError(err.message || 'Failed to load fee estimates');
      } finally {
        setIsLoadingFees(false);
      }
    };

    loadData();
  }, [fromAddress]);

  // Calculate estimated fee
  const calculateFee = () => {
    if (!fees || !amountBTC) return null;

    const amountSats = btcToSats(parseFloat(amountBTC));
    const feeRate = fees[`${selectedFeeSpeed}Fee`];

    const selection = selectUTXOs(utxos, amountSats, feeRate);
    
    return selection;
  };

  const feeSelection = calculateFee();

  // Handle send
  const handleSend = async () => {
    if (!fees || !feeSelection) return;

    // Validation
    if (!validateBitcoinAddress(toAddress)) {
      setError('Invalid Bitcoin address');
      return;
    }

    const amountSats = btcToSats(parseFloat(amountBTC));
    if (amountSats <= 0) {
      setError('Invalid amount');
      return;
    }

    if (amountSats > btcToSats(availableBalance)) {
      setError('Insufficient balance');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      // Derive WIF from private key
      const wif = deriveWIFFromPrivateKey(privateKeyHex);

      // Build transaction
      const feeRate = fees[`${selectedFeeSpeed}Fee`];
      const txResult = await buildBitcoinTransaction(
        wif,
        fromAddress,
        toAddress,
        amountSats,
        feeRate
      );

      // Broadcast transaction
      const broadcastedTxid = await broadcastBitcoinTransaction(txResult.raw);

      setTxid(broadcastedTxid);
      setSuccess(true);

      setTimeout(() => {
        onSuccess(broadcastedTxid);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send Bitcoin transaction');
    } finally {
      setIsSending(false);
    }
  };

  // Set max amount (available balance minus estimated fee)
  const handleMaxAmount = () => {
    if (!fees) return;

    const feeRate = fees[`${selectedFeeSpeed}Fee`];
    const availableSats = btcToSats(availableBalance);

    // Try to send max by iterating to find right amount
    let maxAmount = availableSats;
    
    for (let i = 0; i < 10; i++) {
      const selection = selectUTXOs(utxos, maxAmount, feeRate);
      if (selection && selection.totalInput >= maxAmount + selection.estimatedFee) {
        setAmountBTC(satsToBTC(maxAmount).toFixed(8));
        return;
      }
      maxAmount -= 10000; // Reduce by 0.0001 BTC
    }

    setError('Unable to calculate max amount. Try a smaller value.');
  };

  const feeOptions = [
    {
      speed: 'fastest' as FeeSpeed,
      label: 'Fastest',
      time: '~10 min',
      icon: Zap,
      color: 'text-red-400',
    },
    {
      speed: 'halfHour' as FeeSpeed,
      label: 'Fast',
      time: '~30 min',
      icon: Zap,
      color: 'text-orange-400',
    },
    {
      speed: 'hour' as FeeSpeed,
      label: 'Standard',
      time: '~60 min',
      icon: Clock,
      color: 'text-blue-400',
    },
    {
      speed: 'economy' as FeeSpeed,
      label: 'Economy',
      time: 'Low priority',
      icon: TrendingDown,
      color: 'text-green-400',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">Send Bitcoin</h2>
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
              <p className="text-sm text-gray-400 mb-4">Your Bitcoin is on its way</p>
              <a
                href={`https://blockstream.info/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-sm underline"
              >
                View on Explorer
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
                  placeholder="bc1... or 1... or 3..."
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono text-sm"
                  disabled={isSending}
                />
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Amount (BTC)</label>
                  <button
                    onClick={handleMaxAmount}
                    disabled={isSending || isLoadingFees}
                    className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    Max
                  </button>
                </div>
                <input
                  type="number"
                  value={amountBTC}
                  onChange={(e) => setAmountBTC(e.target.value)}
                  placeholder="0.00000000"
                  step="0.00000001"
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono"
                  disabled={isSending}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available: {availableBalance.toFixed(8)} BTC
                </p>
              </div>

              {/* Fee Selection */}
              <div>
                <label className="text-sm text-gray-400 mb-3 block">Network Fee</label>
                
                {isLoadingFees ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : fees ? (
                  <div className="grid grid-cols-2 gap-2">
                    {feeOptions.map((option) => {
                      const Icon = option.icon;
                      const feeRate = fees[`${option.speed}Fee`];
                      const isSelected = selectedFeeSpeed === option.speed;

                      return (
                        <button
                          key={option.speed}
                          onClick={() => setSelectedFeeSpeed(option.speed)}
                          disabled={isSending}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-gray-700 bg-gray-700/30 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-4 h-4 ${option.color}`} />
                            <span className="font-semibold text-sm">{option.label}</span>
                          </div>
                          <p className="text-xs text-gray-400">{option.time}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {feeRate} sat/vB
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Fee Summary */}
              {feeSelection && (
                <div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Amount:</span>
                    <span className="font-mono">{amountBTC} BTC</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Network Fee:</span>
                    <span className="font-mono">
                      {satsToBTC(feeSelection.estimatedFee).toFixed(8)} BTC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>({feeSelection.estimatedFee} sats)</span>
                    <span>~{feeSelection.selectedUTXOs.length} input(s)</span>
                  </div>
                  <div className="border-t border-gray-600 pt-2 flex justify-between font-semibold">
                    <span>Total:</span>
                    <span className="font-mono">
                      {satsToBTC(btcToSats(parseFloat(amountBTC)) + feeSelection.estimatedFee).toFixed(8)} BTC
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
                disabled={isSending || !toAddress || !amountBTC || !feeSelection || isLoadingFees}
                className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Bitcoin'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
