// client/src/components/Wallet/SendForm.tsx
// Secure send form with transaction preview and passkey confirmation

import { useState, useEffect } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import { 
  securityManager, 
  getSecurityRequirements,
  getSecuritySettings,
  type SecurityAction 
} from '@/lib/securityService';
import { authenticateWithPasskey } from '@/lib/passkeyService';
import { runSecurityScan, quickSecurityCheck, type SecurityScanResult } from '@/lib/securityScanner';
import { 
  estimateGas, 
  checkSufficientBalance, 
  buildTransaction, 
  broadcastTransaction,
  getChainSymbol as getSendChainSymbol,
  SUPPORTED_SEND_CHAINS,
} from '@/lib/sendService';
import { signTransaction } from '@/lib/walletService';
import { getPrice, formatUsd } from '@/lib/priceService';
import { fetchChainBalance } from '@/lib/balanceService';
import { 
  getXrpAccountInfo,
  checkDestinationExists,
  buildXrpTransaction,
  signXrpTransaction,
  broadcastXrpTransaction,
  estimateXrpFee,
} from '@/lib/xrpSendService';
import TransactionPreviewModal from './TransactionPreviewModal';
import PinEntryModal from './PinEntryModal';
import SecurityWarningModal from './SecurityWarningModal';
import PasswordModal from './PasswordModal';
import TransactionSuccessModal from './TransactionSuccessModal';
import BalanceDisplay from './BalanceDisplay';
import DestinationTagInput from './DestinationTagInput';
import MemoInput from './MemoInput';
import NewAccountWarningModal from './NewAccountWarningModal';
import type { Chain } from '@/lib/balanceService';
import type { usePendingTransactions } from '@/hooks/usePendingTransactions';

interface SendFormProps {
  userId: string;
  isPasskeyAuthenticated: boolean;
  onRequestPasskey: () => void;
  selectedChain: Chain;
  onAddPendingTransaction?: (tx: Parameters<ReturnType<typeof usePendingTransactions>['addPendingTransaction']>[0]) => void;
  sovereignWallet?: any;
}

export default function SendForm({
  userId,
  isPasskeyAuthenticated,
  onRequestPasskey,
  selectedChain,
  onAddPendingTransaction,
  sovereignWallet,
}: SendFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [destinationTag, setDestinationTag] = useState('');
  const [memo, setMemo] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showNewAccountWarning, setShowNewAccountWarning] = useState(false);
  const [securityScanResult, setSecurityScanResult] = useState<SecurityScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [estimatedFee, setEstimatedFee] = useState<string>('0.0001');
  const [estimatedFeeUsd, setEstimatedFeeUsd] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionStep, setTransactionStep] = useState<'estimating' | 'signing' | 'broadcasting' | 'verifying' | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [balanceUsd, setBalanceUsd] = useState<number>(0);
  const [xrpReserved, setXrpReserved] = useState<string>('0');
  const [xrpAvailable, setXrpAvailable] = useState<string>('0');
  const [successData, setSuccessData] = useState<{
    hash: string;
    amount: string;
    to: string;
    fee: string;
    feeUsd: number;
    explorerUrl: string;
  } | null>(null);

  // Constants
  const TRANSACTION_BUFFER = 0.0001; // Small buffer for fee estimation
  const XRP_ACTIVATION_AMOUNT = 10; // Minimum XRP required to activate new account

  // Check if wallet is locked
  const isLocked = securityManager.isWalletLocked();

  // Fetch balance on mount and when chain changes
  useEffect(() => {
    async function fetchBalance() {
      if (sovereignWallet?.addresses?.[selectedChain]) {
        try {
          const chainBalance = await fetchChainBalance(
            selectedChain,
            sovereignWallet.addresses[selectedChain]
          );
          setBalance(chainBalance.balance);
          
          // Get price and calculate USD value
          const price = await getPrice(selectedChain);
          setBalanceUsd(parseFloat(chainBalance.balance) * price);
          
          // For XRP, fetch reserve info
          if (selectedChain === 'xrp') {
            try {
              const accountInfo = await getXrpAccountInfo(
                sovereignWallet.addresses[selectedChain]
              );
              setXrpReserved(accountInfo.reserves.total.toString());
              setXrpAvailable(accountInfo.available);
              
              // Also fetch estimated fee
              const fee = await estimateXrpFee();
              setEstimatedFee(fee);
            } catch (err) {
              console.warn('Failed to fetch XRP account info:', err);
            }
          }
        } catch (err) {
          console.error('Failed to fetch balance:', err);
        }
      }
    }
    fetchBalance();
  }, [selectedChain, sovereignWallet]);

  const handleMaxClick = () => {
    // Calculate max sendable (balance - estimated fee - small buffer)
    let maxAmount: number;
    
    if (selectedChain === 'xrp') {
      // For XRP, use available balance minus fee
      maxAmount = parseFloat(xrpAvailable) - parseFloat(estimatedFee) - TRANSACTION_BUFFER;
    } else {
      // For ETH/BSC, use balance minus fee
      maxAmount = parseFloat(balance) - parseFloat(estimatedFee) - TRANSACTION_BUFFER;
    }
    
    if (maxAmount > 0) {
      setAmount(maxAmount.toFixed(6));
    } else {
      setError('Insufficient balance for transaction');
    }
  };

  const handleSendClick = async () => {
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
    
    // For XRP, check if destination exists and show warning if needed
    if (selectedChain === 'xrp') {
      try {
        const exists = await checkDestinationExists(recipient);
        if (!exists && parseFloat(amount) < XRP_ACTIVATION_AMOUNT) {
          setError(`New XRP addresses require a minimum of ${XRP_ACTIVATION_AMOUNT} XRP to activate`);
          return;
        }
        if (!exists) {
          setShowNewAccountWarning(true);
          return;
        }
      } catch (err) {
        console.error('Failed to check destination:', err);
        // Continue anyway
      }
    }

    // Check if wallet is locked
    if (isLocked) {
      setError('Wallet is locked. Please unlock first.');
      onRequestPasskey();
      return;
    }

    // Get security requirements for send action
    const requirements = getSecurityRequirements(userId, 'send');

    // Check if PIN is required
    if (requirements.includes('pin')) {
      setShowPinModal(true);
      return;
    }

    // Check if passkey is required
    if (requirements.includes('passkey')) {
      if (!isPasskeyAuthenticated) {
        setError('Passkey authentication required');
        onRequestPasskey();
        return;
      }
    }

    // Show transaction preview modal
    setShowPreview(true);
  };

  const handlePinSuccess = async () => {
    setShowPinModal(false);

    // After PIN success, check for passkey requirement
    const requirements = getSecurityRequirements(userId, 'send');
    
    if (requirements.includes('passkey')) {
      try {
        await authenticateWithPasskey();
        // After all auth, run security scan before showing preview
        await proceedWithSecurityCheck();
      } catch (err: any) {
        setError(err.message || 'Passkey authentication failed');
        onRequestPasskey();
      }
    } else {
      // No passkey needed, proceed with security check
      await proceedWithSecurityCheck();
    }
  };

  const proceedWithSecurityCheck = async () => {
    // Get current security tier
    const settings = getSecuritySettings(userId);

    // For Tier 3 (maximum), run full security scan
    if (settings.tier === 'maximum') {
      const scanResult = await runSecurityScan();
      setSecurityScanResult(scanResult);
      
      if (!scanResult.safe || scanResult.warnings.length > 0) {
        setShowSecurityModal(true);
        return;
      }
    } else {
      // For other tiers, just do quick check
      if (!quickSecurityCheck()) {
        setError('Security check failed. Please try in a secure environment.');
        return;
      }
    }

    // If security check passed, show transaction preview
    setShowPreview(true);
  };

  const handleSecurityProceed = () => {
    setShowSecurityModal(false);
    setShowPreview(true);
  };

  const handleSecurityCancel = () => {
    setShowSecurityModal(false);
    setSecurityScanResult(null);
  };

  const handlePinCancel = () => {
    setShowPinModal(false);
    setError('PIN authentication cancelled');
  };
  
  const handleNewAccountProceed = () => {
    setShowNewAccountWarning(false);
    // Continue with the transaction
    proceedToAuth();
  };
  
  const handleNewAccountCancel = () => {
    setShowNewAccountWarning(false);
  };
  
  const proceedToAuth = () => {
    // Get security requirements for send action
    const requirements = getSecurityRequirements(userId, 'send');

    // Check if PIN is required
    if (requirements.includes('pin')) {
      setShowPinModal(true);
      return;
    }

    // Check if passkey is required
    if (requirements.includes('passkey')) {
      if (!isPasskeyAuthenticated) {
        setError('Passkey authentication required');
        onRequestPasskey();
        return;
      }
    }

    // Show transaction preview modal
    setShowPreview(true);
  };

  const handleConfirmTransaction = async () => {
    // Show password modal for signing
    setShowPreview(false);
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async (password: string) => {
    setPasswordError(null);
    setIsProcessing(true);
    
    try {
      const fromAddress = sovereignWallet?.addresses?.[selectedChain];
      if (!fromAddress) {
        throw new Error('Wallet address not found. Please try again.');
      }
      
      // Handle XRP separately
      if (selectedChain === 'xrp') {
        setTransactionStep('estimating');
        const fee = await estimateXrpFee();
        setEstimatedFee(fee);
        
        const price = await getPrice('xrp');
        setEstimatedFeeUsd(parseFloat(fee) * price);
        
        // Build XRP transaction
        setTransactionStep('signing');
        const destinationTagNum = destinationTag ? parseInt(destinationTag) : undefined;
        const tx = await buildXrpTransaction(fromAddress, recipient, amount, destinationTagNum);
        
        // Get wallet ID and private key (seed for XRP)
        const walletId = localStorage.getItem(`wallet_id_${userId}`);
        if (!walletId) {
          throw new Error('Wallet ID not found. Please try again.');
        }
        
        // For XRP, we need to get the seed from wallet service
        // NOTE: In production, this should use proper key derivation with BIP44
        // The XRP seed/private key should be derived from the mnemonic using:
        // - BIP39 for mnemonic to seed
        // - BIP32/BIP44 for deriving XRP key at path m/44'/144'/0'/0/0
        // - Proper encoding to XRP seed format (secp256k1)
        // Current implementation is simplified and may need security hardening
        const { unlockWallet } = await import('@/lib/walletService');
        const wallet = await unlockWallet(walletId, password);
        const xrpSeed = wallet.privateKeys.xrp;
        
        const signedTx = signXrpTransaction(tx, xrpSeed);
        
        // Broadcast
        setTransactionStep('broadcasting');
        const result = await broadcastXrpTransaction(signedTx);
        
        // Success
        setShowPasswordModal(false);
        setSuccessData({
          hash: result.hash,
          amount,
          to: recipient,
          fee,
          feeUsd: parseFloat(fee) * price,
          explorerUrl: result.explorerUrl,
        });
        setShowSuccessModal(true);
        
        // Clear form
        setRecipient('');
        setAmount('');
        setDestinationTag('');
        setError(null);
        
        setIsProcessing(false);
        setTransactionStep(null);
        return;
      }

      // ETH/BSC flow (existing logic)
      if (!SUPPORTED_SEND_CHAINS.includes(selectedChain as any)) {
        throw new Error(`Chain not supported for EVM-based transactions: ${selectedChain}`);
      }

      const fromAddress = sovereignWallet?.addresses?.[selectedChain];
      if (!fromAddress) {
        throw new Error('Wallet address not found. Please try again.');
      }

      // Step 2: Estimate gas
      setTransactionStep('estimating');
      const gasEstimate = await estimateGas(selectedChain, fromAddress, recipient, amount);
      setEstimatedFee(gasEstimate.estimatedFee);
      setEstimatedFeeUsd(gasEstimate.estimatedFeeUsd);
      
      // Step 3: Check balance BEFORE signing (CRITICAL)
      const balanceCheck = await checkSufficientBalance(
        selectedChain,
        fromAddress,
        amount,
        gasEstimate.estimatedFee
      );
      
      if (!balanceCheck.sufficient) {
        // DO NOT SIGN - Return friendly error
        const symbol = getSendChainSymbol(selectedChain);
        throw new Error(
          `Insufficient balance. You need ${balanceCheck.required} ${symbol} but only have ${balanceCheck.balance} ${symbol}.`
        );
      }
      
      // Step 4: Build transaction
      setTransactionStep('signing');
      const tx = await buildTransaction(selectedChain, fromAddress, recipient, amount, gasEstimate);
      
      // Step 5: Sign transaction
      const walletId = localStorage.getItem(`wallet_id_${userId}`);
      if (!walletId) {
        throw new Error('Wallet ID not found. Please try again.');
      }

      const signedTx = await signTransaction(
        walletId,
        password,
        selectedChain,
        tx,
        isPasskeyAuthenticated
      );
      
      // Step 6: Broadcast and verify
      setTransactionStep('broadcasting');
      const result = await broadcastTransaction(selectedChain, signedTx);
      
      // Verification step is now included in broadcastTransaction
      console.log('Transaction verified and broadcast successfully');
      
      // Step 7: Add to pending transactions
      if (onAddPendingTransaction) {
        onAddPendingTransaction({
          hash: result.hash,
          chain: selectedChain,
          from: fromAddress,
          to: recipient,
          amount,
          token: getSendChainSymbol(selectedChain),
          status: 'pending',
          confirmations: 0,
          requiredConfirmations: selectedChain === 'ethereum' ? 6 : 15,
          timestamp: Date.now(),
          explorerUrl: result.explorerUrl,
        });
      }
      
      // Step 8: Show success modal
      setShowPasswordModal(false);
      setSuccessData({
        hash: result.hash,
        amount,
        to: recipient,
        fee: gasEstimate.estimatedFee,
        feeUsd: gasEstimate.estimatedFeeUsd,
        explorerUrl: result.explorerUrl,
      });
      setShowSuccessModal(true);
      
      // Clear form
      setRecipient('');
      setAmount('');
      setError(null);
      
    } catch (err: any) {
      console.error('Transaction error:', err);
      setPasswordError(err.message || 'Failed to send transaction');
      // Form data is preserved - user can retry
    } finally {
      setIsProcessing(false);
      setTransactionStep(null);
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordError(null);
    setIsProcessing(false);
    setTransactionStep(null);
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    setSuccessData(null);
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

  // Get current security tier for display
  const currentSettings = getSecuritySettings(userId);
  const securityRequirements = getSecurityRequirements(userId, 'send');

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Send {getChainSymbol(selectedChain)}</h2>
          
          {/* Security Tier Indicator */}
          {securityRequirements.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-700/50 text-xs">
              <span className="text-gray-400">Security:</span>
              <span className="font-medium text-emerald-400 capitalize">
                {currentSettings.tier}
              </span>
            </div>
          )}
        </div>

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

        {/* Balance Display */}
        <BalanceDisplay
          chain={selectedChain}
          balance={balance}
          balanceUsd={balanceUsd}
          reserved={selectedChain === 'xrp' ? xrpReserved : undefined}
          available={selectedChain === 'xrp' ? xrpAvailable : undefined}
        />

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
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Amount
            </label>
            <button
              onClick={handleMaxClick}
              className="px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600/30 transition-colors font-medium"
            >
              MAX
            </button>
          </div>
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
          {amount && parseFloat(amount) > 0 && (
            <p className="mt-1 text-sm text-gray-400">
              ≈ ${(parseFloat(amount) * (balanceUsd / parseFloat(balance || '1'))).toFixed(2)}
            </p>
          )}
        </div>

        {/* XRP Destination Tag */}
        {selectedChain === 'xrp' && (
          <DestinationTagInput
            value={destinationTag}
            onChange={setDestinationTag}
          />
        )}

        {/* BSC Memo */}
        {selectedChain === 'bsc' && (
          <MemoInput
            value={memo}
            onChange={setMemo}
          />
        )}

        {/* Estimated Fee */}
        <div className="bg-gray-900/50 rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Estimated Network Fee</span>
            <span className="text-gray-300">
              {estimatedFee} {getChainSymbol(selectedChain)}
              {estimatedFeeUsd > 0 && (
                <span className="text-gray-500 ml-1">
                  ≈ {formatUsd(estimatedFeeUsd)}
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-gray-300">Total</span>
            <span className="text-emerald-400">
              {amount ? (parseFloat(amount) + parseFloat(estimatedFee)).toFixed(6) : '0.000000'} {getChainSymbol(selectedChain)}
              {amount && balanceUsd > 0 && (
                <span className="text-gray-500 ml-1 font-normal">
                  ≈ {formatUsd((parseFloat(amount) + parseFloat(estimatedFee)) * (balanceUsd / parseFloat(balance || '1')))}
                </span>
              )}
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

      {/* PIN Entry Modal */}
      {showPinModal && (
        <PinEntryModal
          userId={userId}
          onClose={handlePinCancel}
          onSuccess={handlePinSuccess}
          title="Enter PIN to Send"
          description="Verify your PIN to authorize this transaction"
        />
      )}

      {/* New Account Warning Modal */}
      {showNewAccountWarning && (
        <NewAccountWarningModal
          destinationAddress={recipient}
          onConfirm={handleNewAccountProceed}
          onCancel={handleNewAccountCancel}
        />
      )}

      {/* Security Warning Modal */}
      {showSecurityModal && securityScanResult && (
        <SecurityWarningModal
          result={securityScanResult}
          onProceed={handleSecurityProceed}
          onCancel={handleSecurityCancel}
          action="sign this transaction"
          allowProceedWithWarnings={true}
        />
      )}

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

      {/* Password Modal */}
      {showPasswordModal && (
        <PasswordModal
          onSubmit={handlePasswordSubmit}
          onCancel={handlePasswordCancel}
          title="Enter Password to Sign"
          description="Enter your wallet password to sign this transaction"
          isLoading={isProcessing}
          error={passwordError}
        />
      )}

      {/* Transaction Step Indicator */}
      {transactionStep && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <h3 className="text-xl font-semibold mb-2">
              {transactionStep === 'estimating' && 'Estimating Fees...'}
              {transactionStep === 'signing' && 'Signing Transaction...'}
              {transactionStep === 'broadcasting' && 'Broadcasting & Verifying...'}
              {transactionStep === 'verifying' && 'Verifying...'}
            </h3>
            <p className="text-gray-400">Please wait</p>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && successData && (
        <TransactionSuccessModal
          amount={successData.amount}
          token={getChainSymbol(selectedChain)}
          to={successData.to}
          fee={successData.fee}
          feeUsd={successData.feeUsd}
          hash={successData.hash}
          explorerUrl={successData.explorerUrl}
          onClose={handleSuccessClose}
        />
      )}
    </>
  );
}
