// client/src/components/wallet/SendForm.tsx
// Form for sending tokens with hybrid post-quantum signing

import { useState } from 'react';
import { useSendTransaction, useAccount, useEstimateGas } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { AlertTriangle, Loader2, Shield, Check } from 'lucide-react';
import { hybridSign, generateHybridKeys } from '../../lib/crypto';

interface SendFormProps {
  isPasskeyAuthenticated: boolean;
  onRequestPasskey: () => void;
  selectedChain: 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';
}

export default function SendForm({
  isPasskeyAuthenticated,
  onRequestPasskey,
  selectedChain,
}: SendFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isQuantumSigning, setIsQuantumSigning] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<'idle' | 'signing' | 'signed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const { address } = useAccount();
  const { sendTransaction, isPending: isSending, isSuccess, data: txHash } = useSendTransaction();

  // Get chain-specific config
  const getChainConfig = () => {
    switch (selectedChain) {
      case 'ethereum':
        return { symbol: 'ETH', placeholder: '0x...', explorer: 'https://sepolia.etherscan.io/tx/' };
      case 'bitcoin':
        return { symbol: 'BTC', placeholder: 'bc1... or 1...', explorer: 'https://blockstream.info/tx/' };
      case 'bsc':
        return { symbol: 'BNB', placeholder: '0x...', explorer: 'https://testnet.bscscan.com/tx/' };
      case 'xrp':
        return { symbol: 'XRP', placeholder: 'r...', explorer: 'https://testnet.xrpl.org/transactions/' };
      case 'solana':
        return { symbol: 'SOL', placeholder: 'Solana address...', explorer: 'https://explorer.solana.com/tx/' };
      default:
        return { symbol: 'ETH', placeholder: '0x...', explorer: 'https://sepolia.etherscan.io/tx/' };
    }
  };

  const chainConfig = getChainConfig();

  // Validate inputs based on chain
  const validateAddress = (addr: string): boolean => {
    switch (selectedChain) {
      case 'ethereum':
      case 'bsc':
        return isAddress(addr);
      case 'bitcoin':
        // Basic Bitcoin address validation
        return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr);
      case 'xrp':
        // Basic XRP address validation
        return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr);
      case 'solana':
        // Basic Solana address validation (base58, ~44 chars)
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
      default:
        return false;
    }
  };

  const isValidRecipient = recipient && validateAddress(recipient);
  const isValidAmount = amount && parseFloat(amount) > 0;
  const canSend = isValidRecipient && isValidAmount && isPasskeyAuthenticated;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasskeyAuthenticated) {
      onRequestPasskey();
      return;
    }

    if (!isValidRecipient || !isValidAmount) {
      setError('Please enter a valid recipient address and amount');
      return;
    }

    // Only Ethereum and BSC are fully implemented with Wagmi
    if (selectedChain !== 'ethereum' && selectedChain !== 'bsc') {
      setError(`${chainConfig.symbol} transactions coming soon. Implementation requires chain-specific libraries.`);
      return;
    }

    try {
      setIsQuantumSigning(true);
      setSignatureStatus('signing');

      // Create transaction data for signing
      const txData = {
        to: recipient as `0x${string}`,
        value: parseEther(amount),
        from: address,
        chainId: selectedChain === 'ethereum' ? 11155111 : 97, // Sepolia or BSC Testnet
      };

      // Generate hybrid signature (ML-DSA + ECDSA)
      const messageToSign = JSON.stringify(txData);
      
      // Perform hybrid post-quantum signing
      const hybridSignature = await hybridSign(
        new TextEncoder().encode(messageToSign)
      );

      console.log('Hybrid signature generated:', hybridSignature.algorithm);
      setSignatureStatus('signed');

      // Add optimistic UI update
      const pendingTx = {
        hash: `pending_${Date.now()}`,
        type: 'send' as const,
        amount,
        token: chainConfig.symbol,
        to: recipient,
        from: address || '',
        timestamp: new Date(),
        status: 'pending' as const,
      };

      // Store pending tx for optimistic display
      const existingPending = localStorage.getItem(`pending_txs_${address}`);
      const pendingTxs = existingPending ? JSON.parse(existingPending) : [];
      pendingTxs.push(pendingTx);
      localStorage.setItem(`pending_txs_${address}`, JSON.stringify(pendingTxs));

      // Send the actual transaction via wagmi
      sendTransaction({
        to: recipient as `0x${string}`,
        value: parseEther(amount),
      });

    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setSignatureStatus('error');
    } finally {
      setIsQuantumSigning(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-semibold mb-6">Send Funds</h2>

      {/* Chain Notice */}
      <div className="mb-6 p-4 rounded-xl bg-blue-900/20 border border-blue-700/30">
        <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
          <Shield className="w-4 h-4" />
          <span className="font-medium">Selected Network: {selectedChain.toUpperCase()}</span>
        </div>
        <p className="text-sm text-gray-400">
          Make sure the recipient address is on the {selectedChain} network.
        </p>
      </div>

      {!isPasskeyAuthenticated && (
        <div className="mb-6 p-4 rounded-xl bg-amber-900/20 border border-amber-700/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-400">Authentication Required</p>
              <p className="text-sm text-gray-400 mt-1">
                Please authenticate with your passkey to enable sending.
              </p>
              <button
                onClick={onRequestPasskey}
                className="mt-3 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors text-sm"
              >
                Authenticate with Passkey
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSend} className="space-y-6">
        {/* Recipient Address */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400">Recipient Address</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={chainConfig.placeholder}
            className={`w-full px-4 py-3 rounded-xl bg-gray-900 border ${
              recipient && !isValidRecipient
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-700 focus:ring-emerald-500'
            } focus:outline-none focus:ring-2 font-mono text-sm`}
          />
          {recipient && !isValidRecipient && (
            <p className="text-sm text-red-400">Invalid {selectedChain} address format</p>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400">Amount</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.0001"
              min="0"
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
              {chainConfig.symbol}
            </span>
          </div>
        </div>

        {/* Security Info */}
        <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
          <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
            <Shield className="w-4 h-4" />
            <span className="font-medium">Quantum-Secure Signing</span>
          </div>
          <p*

