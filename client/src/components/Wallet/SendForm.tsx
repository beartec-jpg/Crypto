// client/src/components/Wallet/SendForm.tsx
// Secure send form with native + token support, transaction preview and passkey confirmation

import { useState, useEffect } from 'react';
import { Send, AlertCircle, ChevronDown } from 'lucide-react';
import { 
  securityManager, 
  getSecurityRequirements,
  getSecuritySettings,
  type SecurityAction 
} from '@/lib/securityService';
import { authenticateWithPasskey } from '@/lib/passkeyService';
import { 
  estimateGas, 
  checkSufficientBalance, 
  buildTransaction, 
  broadcastTransaction,
  getChainSymbol as getSendChainSymbol,
  validateAddress,
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
import { getWalletTokens, ensureNativeTokens, type Token } from '@/lib/tokenService';
import {
  QBTCChain,
  QBTCKeyPair,
  getQBTCRpcSettings,
  setQBTCRpcSettings,
  isValidQBTCAddress,
  type QBTCRpcSettings,
} from '@/lib/qbtcService';
import TransactionPreviewModal from './TransactionPreviewModal';
import PinEntryModal from './PinEntryModal';
import PasswordModal from './PasswordModal';
import TransactionSuccessModal from './TransactionSuccessModal';
import BalanceDisplay from './BalanceDisplay';
import DestinationTagInput from './DestinationTagInput';
import MemoInput from './MemoInput';
import NewAccountWarningModal from './NewAccountWarningModal';
import type { Chain } from '@/lib/balanceService';
import type { usePendingTransactions } from '@/hooks/usePendingTransactions';

// Constants
const TRANSACTION_BUFFER = 0.0001;
const XRP_ACTIVATION_AMOUNT = 10;

interface SendFormProps {
  userId: string;
  isPasskeyAuthenticated: boolean;
  onRequestPasskey: () => void;
  selectedChain: Chain;
  onChainChange?: (chain: Chain) => void;
  onAddPendingTransaction?: (tx: Parameters<ReturnType<typeof usePendingTransactions>['addPendingTransaction']>[0]) => void;
  sovereignWallet?: any;
}

export default function SendForm({
  userId,
  isPasskeyAuthenticated,
  onRequestPasskey,
  selectedChain,
  onChainChange,
  onAddPendingTransaction,
  sovereignWallet,
}: SendFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [destinationTag, setDestinationTag] = useState('');
  const [memo, setMemo] = useState('');
  
  // Token selection state
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  
  const [showPreview, setShowPreview] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showNewAccountWarning, setShowNewAccountWarning] = useState(false);
  const [passkeyAuthenticatedThisSession, setPasskeyAuthenticatedThisSession] = useState(false);
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
  const [qbtcSettings, setQbtcSettings] = useState<QBTCRpcSettings>(getQBTCRpcSettings());
  const [successData, setSuccessData] = useState<{
    hash: string;
    amount: string;
    to: string;
    fee: string;
    feeUsd: number;
    explorerUrl: string;
  } | null>(null);

  const isLocked = securityManager.isWalletLocked();

  // Helper function to calculate and format USD value - Bug 15 fix
  const calculateUsdDisplay = (amount: string, token: Token | null): string | null => {
    if (!amount || !token) return null;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return null;
    
    const tokenUsdValue = token.usdValue || 0;
    const tokenBalance = parseFloat(token.balance || '1');
    
    // Calculate price per token to avoid division by zero
    const pricePerToken = tokenBalance > 0 ? tokenUsdValue / tokenBalance : 0;
    const totalUsd = amountNum * pricePerToken;
    
    // Only return if we have a valid USD value
    if (isNaN(totalUsd) || totalUsd === 0) return null;
    
    return totalUsd.toFixed(2);
  };

  // Load tokens for selected chain
  useEffect(() => {
    async function loadTokens() {
      if (!sovereignWallet?.id) return;
      
      try {
        const walletTokens = await ensureNativeTokens(sovereignWallet.id);
        const chainTokens = walletTokens.filter(t => t.chain === selectedChain);
        setTokens(chainTokens);
        
        // Check for pending token selection from URL params
        const pendingTokenId = sessionStorage.getItem('pendingTokenSelection');
        if (pendingTokenId) {
          const tokenToSelect = chainTokens.find(t => t.id === pendingTokenId);
          if (tokenToSelect) {
            setSelectedToken(tokenToSelect);
            sessionStorage.removeItem('pendingTokenSelection');
            return;
          }
        }
        
        // Auto-select native token
        const nativeToken = chainTokens.find(t => t.isNative);
        if (nativeToken) {
          setSelectedToken(nativeToken);
        }
      } catch (err) {
        console.error('Failed to load tokens:', err);
      }
    }
    
    loadTokens();
  }, [sovereignWallet?.id, selectedChain]);

  useEffect(() => {
    setQbtcSettings(getQBTCRpcSettings());
  }, [selectedChain]);

  // Fetch balance when token changes
  useEffect(() => {
    async function fetchBalance() {
      if (!selectedToken || !sovereignWallet?.addresses?.[selectedChain]) return;
      
      try {
        if (selectedToken.isNative) {
          // Fetch native balance from chain
          const chainBalance = await fetchChainBalance(
            selectedChain,
            sovereignWallet.addresses[selectedChain]
          );
          setBalance(chainBalance.balance);
          
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
              
              const fee = await estimateXrpFee();
              setEstimatedFee(fee);
            } catch (err) {
              console.warn('Failed to fetch XRP account info:', err);
            }
          }
        } else {
          // Use token balance from stored data
          setBalance(selectedToken.balance);
          setBalanceUsd(selectedToken.usdValue || 0);
        }
      } catch (err) {
        console.error('Failed to fetch balance:', err);
      }
    }
    
    fetchBalance();
  }, [selectedChain, selectedToken, sovereignWallet]);

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setShowTokenDropdown(false);
    setAmount(''); // Clear amount when switching tokens
  };

  const handleMaxClick = () => {
    if (!selectedToken) return;
    
    let maxAmount: number;
    
    if (selectedToken.isNative) {
      if (selectedChain === 'xrp') {
        maxAmount = parseFloat(xrpAvailable) - parseFloat(estimatedFee) - TRANSACTION_BUFFER;
      } else {
        maxAmount = parseFloat(balance) - parseFloat(estimatedFee) - TRANSACTION_BUFFER;
      }
    } else {
      // For tokens, can send full balance (fee paid in native currency)
      maxAmount = parseFloat(balance);
    }
    
    if (maxAmount > 0) {
      setAmount(maxAmount.toFixed(selectedToken.decimals || 6));
    } else {
      setError('Insufficient balance for transaction');
    }
  };

  const handleSendClick = async () => {
    setError(null);

    if (!selectedToken) {
      setError('Please select a token');
      return;
    }

    if (!recipient) {
      setError('Please enter a recipient address');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    const recipientValid = selectedChain === 'qbtc'
      ? isValidQBTCAddress(recipient, qbtcSettings.network)
      : validateAddress(recipient, selectedChain as any);

    if (!recipientValid) {
      setError(`Invalid ${selectedChain} address`);
      return;
    }

    // Check token balance
    if (parseFloat(amount) > parseFloat(balance)) {
      setError(`Insufficient ${selectedToken.symbol} balance`);
      return;
    }

    if (isLocked) {
      setError('Wallet is locked. Please unlock first.');
      onRequestPasskey();
      return;
    }
    
    // For XRP, check destination exists
    if (selectedChain === 'xrp' && selectedToken.isNative) {
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
      }
    }

    setShowPreview(true);
  };

  const handlePinSuccess = () => {
    setShowPinModal(false);
    
    const requirements = getSecurityRequirements(userId, 'send');
    const isAlreadyAuthenticated = isPasskeyAuthenticated || passkeyAuthenticatedThisSession;
    
    if (requirements.includes('passkey') && !isAlreadyAuthenticated) {
      authenticateWithPasskey()
        .then(() => {
          setPasskeyAuthenticatedThisSession(true);
          setShowPasswordModal(true);
        })
        .catch((error) => {
          console.error('Passkey authentication error:', error);
          setError('Passkey authentication failed. Please try again.');
        });
    } else {
      setShowPasswordModal(true);
    }
  };

  const handlePinCancel = () => {
    setShowPinModal(false);
    setError('PIN authentication cancelled');
  };
  
  const handleNewAccountProceed = () => {
    setShowNewAccountWarning(false);
    setShowPreview(true);
  };
  
  const handleNewAccountCancel = () => {
    setShowNewAccountWarning(false);
  };

  const handleConfirmTransaction = async () => {
    setShowPreview(false);
    
    const requirements = getSecurityRequirements(userId, 'send');
    
    if (requirements.includes('pin')) {
      setShowPinModal(true);
      return;
    }
    
    const isAlreadyAuthenticated = isPasskeyAuthenticated || passkeyAuthenticatedThisSession;
    
    if (requirements.includes('passkey') && !isAlreadyAuthenticated) {
      try {
        await authenticateWithPasskey();
        setPasskeyAuthenticatedThisSession(true);
      } catch (err) {
        console.error('Passkey authentication error:', err);
        setError('Passkey authentication failed. Please try again.');
        return;
      }
    }
    
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async (password: string) => {
    setPasswordError(null);
    setIsProcessing(true);
    
    try {
      if (!selectedToken) {
        throw new Error('No token selected');
      }

      const fromAddress = sovereignWallet?.addresses?.[selectedChain];
      if (!fromAddress) {
        throw new Error('Wallet address not found. Please try again.');
      }
      
      // Handle QBTC (hybrid PQC signing)
      if (selectedChain === 'qbtc' && selectedToken.isNative) {
        const walletId = localStorage.getItem(`wallet_id_${userId}`);
        if (!walletId) {
          throw new Error('Wallet ID not found. Please try again.');
        }

        setTransactionStep('signing');
        const { unlockWallet } = await import('@/lib/walletService');
        const wallet = await unlockWallet(walletId, password);
        const qbtcPrivateKey = wallet.privateKeys.qbtc;

        if (!qbtcPrivateKey) {
          throw new Error('QBTC private key not found in wallet');
        }

        const qbtcChain = new QBTCChain(qbtcSettings);
        const keyPair = QBTCKeyPair.fromECDSAPrivateKey(qbtcPrivateKey);

        setTransactionStep('broadcasting');
        const txid = await qbtcChain.sendTransaction(keyPair, recipient, amount);

        if (onAddPendingTransaction) {
          onAddPendingTransaction({
            hash: txid,
            chain: 'qbtc',
            from: fromAddress,
            to: recipient,
            amount,
            token: 'QBTC',
            status: 'pending',
            confirmations: 0,
            requiredConfirmations: 6,
            timestamp: Date.now(),
            explorerUrl: `${qbtcSettings.rpcUrl.replace(/\/$/, '')}/tx/${txid}`,
          });
        }

        setShowPasswordModal(false);
        setSuccessData({
          hash: txid,
          amount,
          to: recipient,
          fee: 'dynamic',
          feeUsd: 0,
          explorerUrl: `${qbtcSettings.rpcUrl.replace(/\/$/, '')}/tx/${txid}`,
        });
        setShowSuccessModal(true);

        setRecipient('');
        setAmount('');
        setError(null);

        setIsProcessing(false);
        setTransactionStep(null);
        return;
      }

      // Handle XRP
      if (selectedChain === 'xrp' && selectedToken.isNative) {
        setTransactionStep('estimating');
        const fee = await estimateXrpFee();
        setEstimatedFee(fee);
        
        const price = await getPrice('xrp');
        setEstimatedFeeUsd(parseFloat(fee) * price);
        
        setTransactionStep('signing');
        const destinationTagNum = destinationTag ? parseInt(destinationTag) : undefined;
        const tx = await buildXrpTransaction(fromAddress, recipient, amount, destinationTagNum);
        
        const walletId = localStorage.getItem(`wallet_id_${userId}`);
        if (!walletId) {
          throw new Error('Wallet ID not found. Please try again.');
        }
        
        const { unlockWallet } = await import('@/lib/walletService');
        const wallet = await unlockWallet(walletId, password);
        const xrpSeed = wallet.privateKeys.xrp;
        
        if (!xrpSeed) {
          throw new Error('XRP private key not found in wallet');
        }
        
        const signedTx = signXrpTransaction(tx, xrpSeed);
        
        setTransactionStep('broadcasting');
        const result = await broadcastXrpTransaction(signedTx);
        
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
        
        setRecipient('');
        setAmount('');
        setDestinationTag('');
        setError(null);
        
        setIsProcessing(false);
        setTransactionStep(null);
        return;
      }

      // ETH/BSC flow
      if (!SUPPORTED_SEND_CHAINS.includes(selectedChain as any)) {
        throw new Error(`Chain not supported for EVM-based transactions: ${selectedChain}`);
      }

      setTransactionStep('estimating');
      const gasEstimate = await estimateGas(selectedChain as any, fromAddress, recipient, amount);
      setEstimatedFee(gasEstimate.estimatedFee);
      setEstimatedFeeUsd(gasEstimate.estimatedFeeUsd);
      
      const balanceCheck = await checkSufficientBalance(
        selectedChain as any,
        fromAddress,
        amount,
        gasEstimate.estimatedFee
      );
      
      if (!balanceCheck.sufficient) {
        const symbol = getSendChainSymbol(selectedChain as any);
        throw new Error(
          `Insufficient balance. You need ${balanceCheck.required} ${symbol} but only have ${balanceCheck.balance} ${symbol}.`
        );
      }
      
      setTransactionStep('signing');
            const tx = await buildTransaction(selectedChain as any, fromAddress, recipient, amount, gasEstimate);
      
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
      
      setTransactionStep('broadcasting');
      const result = await broadcastTransaction(selectedChain as any, signedTx);
      
      console.log('Transaction verified and broadcast successfully');
      
      if (onAddPendingTransaction) {
        onAddPendingTransaction({
          hash: result.hash,
          chain: selectedChain,
          from: fromAddress,
          to: recipient,
          amount,
          token: selectedToken.symbol,
          status: 'pending',
          confirmations: 0,
          requiredConfirmations: selectedChain === 'ethereum' ? 6 : 15,
          timestamp: Date.now(),
          explorerUrl: result.explorerUrl,
        });
      }
      
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
      
      setRecipient('');
      setAmount('');
      setError(null);
      
    } catch (err: any) {
      console.error('Transaction error:', err);
      setPasswordError(err.message || 'Failed to send transaction');
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
      qbtc: 'QBTC',
    };
    return symbols[chain];
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    
    const isValid = selectedChain === 'qbtc'
      ? isValidQBTCAddress(value, qbtcSettings.network)
      : validateAddress(value, selectedChain as any);

    if (value && isValid) {
      setError(null);
    }
  };

  const isRecipientValid = selectedChain === 'qbtc'
    ? isValidQBTCAddress(recipient, qbtcSettings.network)
    : validateAddress(recipient, selectedChain as any);

  const currentSettings = getSecuritySettings(userId);
  const securityRequirements = getSecurityRequirements(userId, 'send');

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">
            Send {selectedToken ? selectedToken.symbol : getChainSymbol(selectedChain)}
          </h2>

          {selectedChain === 'qbtc' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
              PQC Protected
            </span>
          )}
          
          {securityRequirements.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-700/50 text-xs">
              <span className="text-gray-400">Security:</span>
              <span className="font-medium text-emerald-400 capitalize">
                {currentSettings.tier}
              </span>
            </div>
          )}
        </div>

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

        {/* Chain Selector - Bug 19 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select Chain
          </label>
          <select
            value={selectedChain}
            onChange={(e) => {
              const newChain = e.target.value as Chain;
              if (onChainChange) {
                onChainChange(newChain);
              }
              // Reset token selection when chain changes
              setSelectedToken(null);
              setAmount('');
              setRecipient('');
              setError(null);
            }}
            className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ethereum">Ethereum (ETH)</option>
            <option value="bsc">BNB Smart Chain (BNB)</option>
            <option value="xrp">XRP Ledger (XRP)</option>
            <option value="bitcoin">Bitcoin (BTC)</option>
            <option value="solana">Solana (SOL)</option>
            <option value="qbtc">QuantumBTC (QBTC)</option>
          </select>
        </div>

        {selectedChain === 'qbtc' && (
          <div className="space-y-3 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5">
            <p className="text-sm font-medium text-cyan-200">QuantumBTC Node Settings</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Network</label>
                <select
                  value={qbtcSettings.network}
                  onChange={(e) => {
                    const next = setQBTCRpcSettings({ network: e.target.value as 'testnet' | 'mainnet' });
                    setQbtcSettings(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                >
                  <option value="testnet">Testnet (qbtct1...)</option>
                  <option value="mainnet">Mainnet (qbtc1...)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">RPC URL</label>
                <input
                  value={qbtcSettings.rpcUrl}
                  onChange={(e) => {
                    const next = setQBTCRpcSettings({ rpcUrl: e.target.value });
                    setQbtcSettings(next);
                  }}
                  placeholder="http://localhost:28332"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">RPC Username (optional)</label>
                <input
                  value={qbtcSettings.username || ''}
                  onChange={(e) => {
                    const next = setQBTCRpcSettings({ username: e.target.value || undefined });
                    setQbtcSettings(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">RPC Password (optional)</label>
                <input
                  type="password"
                  value={qbtcSettings.password || ''}
                  onChange={(e) => {
                    const next = setQBTCRpcSettings({ password: e.target.value || undefined });
                    setQbtcSettings(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Fee Rate (sat/vB, min 10)</label>
                <input
                  type="number"
                  min={10}
                  value={qbtcSettings.feeRate || 10}
                  onChange={(e) => {
                    const next = setQBTCRpcSettings({ feeRate: Math.max(10, Number(e.target.value || 10)) });
                    setQbtcSettings(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* Token Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select Token
          </label>
          <div className="relative">
            <button
              onClick={() => setShowTokenDropdown(!showTokenDropdown)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors"
            >
              {selectedToken ? (
                <div className="flex items-center gap-3">
                  {selectedToken.logoUrl ? (
                    <img 
                      src={selectedToken.logoUrl} 
                      alt={selectedToken.symbol} 
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-semibold">
                      {selectedToken.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedToken.symbol}</p>
                      {selectedToken.isNative && (
                        <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                          Native
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{selectedToken.name}</p>
                  </div>
                </div>
              ) : (
                <span className="text-gray-400">Select a token</span>
              )}
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showTokenDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showTokenDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl z-10 max-h-64 overflow-y-auto">
                {tokens.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-400 text-sm">
                    No tokens found for this chain
                  </div>
                ) : (
                  tokens.map((token) => (
                    <button
                      key={token.id}
                      onClick={() => handleTokenSelect(token)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left ${
                        selectedToken?.id === token.id ? 'bg-gray-700' : ''
                      }`}
                    >
                      {token.logoUrl ? (
                        <img 
                          src={token.logoUrl} 
                          alt={token.symbol} 
                          className="w-6 h-6 rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-semibold">
                          {token.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{token.symbol}</p>
                          {token.isNative && (
                            <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                              Native
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{token.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono">{parseFloat(token.balance).toFixed(4)}</p>
                        {token.usdValue && token.usdValue > 0 && (
                          <p className="text-xs text-gray-400">${token.usdValue.toFixed(2)}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Balance Display */}
        {selectedToken && (
          <BalanceDisplay
            chain={selectedChain}
            balance={balance}
            balanceUsd={balanceUsd}
            reserved={selectedChain === 'xrp' && selectedToken.isNative ? xrpReserved : undefined}
            available={selectedChain === 'xrp' && selectedToken.isNative ? xrpAvailable : undefined}
          />
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
          {recipient && !isRecipientValid && (
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
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none pr-20"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
              {selectedToken?.symbol || getChainSymbol(selectedChain)}
            </span>
          </div>
          {(() => {
            const usdValue = calculateUsdDisplay(amount, selectedToken);
            return usdValue ? (
              <p className="mt-1 text-sm text-gray-400">
                ≈ ${usdValue}
              </p>
            ) : null;
          })()}
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
          {selectedToken?.isNative && (
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
          )}
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
          disabled={!recipient || !amount || !isRecipientValid || !selectedToken}
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

      {/* Transaction Preview Modal */}
      {showPreview && selectedToken && (
        <TransactionPreviewModal
          transaction={{
            to: recipient,
            amount,
            token: selectedToken.symbol,
            chain: selectedChain,
            estimatedFee,
            totalCost: selectedToken.isNative 
              ? (parseFloat(amount) + parseFloat(estimatedFee)).toFixed(6)
              : amount,
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
          token={selectedToken?.symbol || getChainSymbol(selectedChain)}
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
      
