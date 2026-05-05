// client/src/components/Wallet/SendForm.tsx
// Secure send form with native + token support, transaction preview and passkey confirmation

import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { Send, AlertCircle, ChevronDown, Shield, Lock } from 'lucide-react';
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
  checkNativeBalanceForTokenGas,
  buildTransaction, 
  estimateERC20Gas,
  buildERC20Transaction,
  broadcastTransaction,
  getChainSymbol as getSendChainSymbol,
  validateAddress,
  SUPPORTED_SEND_CHAINS,
  type GasEstimate,
} from '@/lib/sendService';
import { signTransaction, isBackupVerified } from '@/lib/walletService';
import { getPrice, formatUsd } from '@/lib/priceService';
import { fetchChainBalance } from '@/lib/balanceService';
import { 
  getXrpAccountInfo,
  checkDestinationExists,
  buildXrpTransaction,
  buildXrpTokenTransaction,
  signXrpTransaction,
  broadcastXrpTransaction,
  estimateXrpFee,
} from '@/lib/xrpSendService';
import { getWalletTokens, ensureNativeTokens, type Token } from '@/lib/tokenService';
import type { TokenNetwork } from '@/lib/tokenService';
import { getChainNetworkAddress, getVaultNetworkAddress, type WalletAddresses } from '@/lib/networkAddress';
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
import ConfirmationTimer from './ConfirmationTimer';
import BalanceDisplay from './BalanceDisplay';
import DestinationTagInput from './DestinationTagInput';
import MemoInput from './MemoInput';
import NewAccountWarningModal from './NewAccountWarningModal';
import UnsignedTxQRModal from './UnsignedTxQRModal';
import SignedTxScannerModal from './SignedTxScannerModal';
import {
  isColdSignerConfigured,
  buildUnsignedTxPayload,
  serializeForQR,
} from '@/lib/coldSignerService';
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
  tokenNetwork?: TokenNetwork;
  onChainChange?: (chain: Chain) => void;
  onAddPendingTransaction?: (tx: Parameters<ReturnType<typeof usePendingTransactions>['addPendingTransaction']>[0]) => void;
  sovereignWallet?: any;
}

export default function SendForm({
  userId,
  isPasskeyAuthenticated,
  onRequestPasskey,
  selectedChain,
  tokenNetwork = 'mainnet',
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
  const [useColdSigner, setUseColdSigner] = useState(false);
  const [coldSignerAvailable] = useState(() => isColdSignerConfigured());
  const [showUnsignedTxQR, setShowUnsignedTxQR] = useState(false);
  const [showSignedTxScanner, setShowSignedTxScanner] = useState(false);
  const [showColdSignerPassword, setShowColdSignerPassword] = useState(false);
  const [coldSignerPassword, setColdSignerPassword] = useState('');
  const [unsignedTxPayload, setUnsignedTxPayload] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [estimatedFee, setEstimatedFee] = useState<string>('0.0001');
  const [estimatedFeeUsd, setEstimatedFeeUsd] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionStep, setTransactionStep] = useState<'estimating' | 'signing' | 'broadcasting' | 'verifying' | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [qbtcSource, setQbtcSource] = useState<'hot' | 'vault'>('hot');
  const [balanceUsd, setBalanceUsd] = useState<number>(0);
  const [xrpReserved, setXrpReserved] = useState<string>('0');
  const [xrpAvailable, setXrpAvailable] = useState<string>('0');
  const [qbtcSettings, setQbtcSettings] = useState<QBTCRpcSettings>(getQBTCRpcSettings());
  const [confirmationMinutes, setConfirmationMinutes] = useState(10); // default 10min = 1 conf
  const qbtcChainRef = useRef<InstanceType<typeof QBTCChain> | null>(null);
  const [successData, setSuccessData] = useState<{
    hash: string;
    amount: string;
    to: string;
    fee: string;
    feeUsd: number;
    explorerUrl: string;
  } | null>(null);

  const isLocked = securityManager.isWalletLocked();
  const currentSecurityTier = getSecuritySettings(userId).tier;
  const isColdDeviceMode = currentSecurityTier === 'cold';

  const resolveChainAddress = useCallback((chain: Chain) => {
    if (!sovereignWallet?.addresses) return '';
    return getChainNetworkAddress(
      sovereignWallet.addresses as WalletAddresses,
      chain,
      tokenNetwork
    );
  }, [sovereignWallet?.addresses, tokenNetwork]);

  const getFromAddress = useCallback(() => {
    if (!sovereignWallet?.addresses) return '';
    if (selectedChain === 'qbtc' && qbtcSource === 'vault') {
      return getVaultNetworkAddress(
        sovereignWallet.addresses as WalletAddresses,
        tokenNetwork
      );
    }
    return resolveChainAddress(selectedChain);
  }, [sovereignWallet?.addresses, selectedChain, qbtcSource, tokenNetwork, resolveChainAddress]);

  useEffect(() => {
    if (isColdDeviceMode && coldSignerAvailable) {
      setUseColdSigner(true);
    }
  }, [isColdDeviceMode, coldSignerAvailable]);

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
        const walletTokens = await ensureNativeTokens(sovereignWallet.id, tokenNetwork);
        const chainTokens = walletTokens.filter(t => t.chain === selectedChain && t.network === tokenNetwork);
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
  }, [sovereignWallet?.id, selectedChain, tokenNetwork]);

  useEffect(() => {
    setQbtcSettings(getQBTCRpcSettings());
  }, [selectedChain]);

  // Fetch balance when token or QBTC source changes
  useEffect(() => {
    async function fetchBalance() {
      if (!selectedToken) return;
      
      try {
        if (selectedToken.isNative) {
          // For QBTC, use the correct source address (hot or vault)
          const address = getFromAddress();

          if (!address) return;

          // Fetch native balance from chain
          const chainBalance = await fetchChainBalance(
            selectedChain,
            address,
            tokenNetwork
          );
          setBalance(chainBalance.balance);
          
          const price = await getPrice(selectedChain);
          setBalanceUsd(parseFloat(chainBalance.balance) * price);
          
          // For XRP, fetch reserve info
          if (selectedChain === 'xrp') {
            try {
              const accountInfo = await getXrpAccountInfo(
                getFromAddress(),
                tokenNetwork
              );
              setXrpReserved(accountInfo.reserves.total.toString());
              setXrpAvailable(accountInfo.available);
              
              const fee = await estimateXrpFee(tokenNetwork);
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
  }, [selectedChain, selectedToken, sovereignWallet, qbtcSource, getFromAddress, tokenNetwork]);

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
        const exists = await checkDestinationExists(recipient, tokenNetwork);
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

  const handleColdSignerPasswordSubmit = async () => {
    try {
      // For QBTC, fetch UTXOs from the correct source (hot or vault)
      let utxos: { txid: string; vout: number; value: number; scriptPubKey?: string }[] | undefined;
      let changeAddress: string | undefined;
      if (selectedChain === 'qbtc') {
        const isVault = qbtcSource === 'vault';
        const fromAddress = isVault
          ? getVaultNetworkAddress(sovereignWallet?.addresses as WalletAddresses, tokenNetwork)
          : resolveChainAddress('qbtc');
        if (!fromAddress) throw new Error(`QBTC ${isVault ? 'vault' : 'hot wallet'} address not found`);
        const qbtcChain = new QBTCChain(qbtcSettings);
        const rawUtxos = await qbtcChain.scanUTXOs(fromAddress);
        if (rawUtxos.length === 0) throw new Error('No UTXOs found for this address. Cannot build transaction.');
        utxos = rawUtxos.map(u => ({ txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8), scriptPubKey: u.scriptPubKey }));
        changeAddress = fromAddress;
      }
      const payload = await buildUnsignedTxPayload(selectedChain, {
        to: recipient,
        amount,
        fee: estimatedFee,
        nonce: undefined,
        chainId: selectedChain === 'ethereum' ? ((import.meta.env.VITE_SWAP_NETWORK || 'testnet') !== 'mainnet' ? 11155111 : 1) : selectedChain === 'bsc' ? ((import.meta.env.VITE_SWAP_NETWORK || 'testnet') !== 'mainnet' ? 97 : 56) : undefined,
        destination: selectedChain === 'xrp' ? recipient : undefined,
        destinationTag: selectedChain === 'xrp' && destinationTag ? parseInt(destinationTag) : undefined,
        utxos,
        changeAddress,
      }, coldSignerPassword, sovereignWallet?.id);
      setShowColdSignerPassword(false);
      setColdSignerPassword('');
      setUnsignedTxPayload(serializeForQR(payload));
      setShowUnsignedTxQR(true);
    } catch (err: any) {
      setError(err.message === 'Cold signer not configured — hot share missing'
        ? err.message
        : 'Incorrect password or failed to decrypt hot share');
      setShowColdSignerPassword(false);
      setColdSignerPassword('');
    }
  };

  const handleConfirmTransaction = async () => {
    setShowPreview(false);

    // Cold signer flow: prompt for password to decrypt hot share
    if (useColdSigner) {
      setShowColdSignerPassword(true);
      setColdSignerPassword('');
      return;
    }

    // Pre-check: EVM send (both native and token) requires the backup to be verified.
    // Surface this as a clear top-level error rather than letting it appear
    // inside the password modal after the user has already entered their password.
    if (SUPPORTED_SEND_CHAINS.includes(selectedChain as any)) {
      const walletId = localStorage.getItem(`wallet_id_${userId}`);
      if (walletId) {
        const backupOk = await isBackupVerified(walletId);
        if (!backupOk) {
          setError('Please verify your recovery phrase backup before sending transactions. Go to Settings → Backup.');
          return;
        }
      }
    }
    
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

  const handleColdSignerSuccess = (result: { hash: string; explorerUrl: string }) => {
    setShowSignedTxScanner(false);
    setShowUnsignedTxQR(false);

    if (onAddPendingTransaction) {
      const fromAddress = getFromAddress();
      onAddPendingTransaction({
        hash: result.hash,
        chain: selectedChain,
        from: fromAddress || '',
        to: recipient,
        amount,
        token: selectedToken?.symbol || getChainSymbol(selectedChain),
        status: 'pending',
        confirmations: 0,
        requiredConfirmations: selectedChain === 'ethereum' ? 6 : 15,
        timestamp: Date.now(),
        explorerUrl: result.explorerUrl,
      });
    }

    setSuccessData({
      hash: result.hash,
      amount,
      to: recipient,
      fee: estimatedFee,
      feeUsd: estimatedFeeUsd,
      explorerUrl: result.explorerUrl,
    });
    setShowSuccessModal(true);
    setRecipient('');
    setAmount('');
    setError(null);
  };

  const handlePasswordSubmit = async (password: string) => {
    setPasswordError(null);
    setIsProcessing(true);
    
    try {
      if (!selectedToken) {
        throw new Error('No token selected');
      }

      const fromAddress = getFromAddress();
      if (!fromAddress) {
        throw new Error('Wallet address not found. Please try again.');
      }
      
      // Handle QBTC (dual-mode: hot = ECDSA-only, vault = PQC hybrid)
      if (selectedChain === 'qbtc' && selectedToken.isNative) {
        const walletId = localStorage.getItem(`wallet_id_${userId}`);
        if (!walletId) {
          throw new Error('Wallet ID not found. Please try again.');
        }

        setTransactionStep('signing');
        const { unlockWallet } = await import('@/lib/walletService');
        const wallet = await unlockWallet(walletId, password);

        const isVault = qbtcSource === 'vault';
        const privateKey = isVault ? wallet.privateKeys.qbtcVault : wallet.privateKeys.qbtc;

        if (!privateKey) {
          throw new Error(`QBTC ${isVault ? 'vault' : 'hot wallet'} private key not found`);
        }

        const qbtcChain = new QBTCChain(qbtcSettings);
        qbtcChainRef.current = qbtcChain;
        const keyPair = await QBTCKeyPair.fromECDSAPrivateKey(privateKey);
        const signMode = isVault ? 'hybrid' : 'ecdsa';

        setTransactionStep('broadcasting');
        const { txid, fee: feeSats } = await qbtcChain.sendTransaction(keyPair, recipient, amount, signMode);
        const feeQbtc = (feeSats / 1e8).toFixed(8);

        if (onAddPendingTransaction) {
          const requiredConfs = Math.floor((confirmationMinutes * 60) / 10); // 10s blocks
          onAddPendingTransaction({
            hash: txid,
            chain: 'qbtc',
            from: fromAddress,
            to: recipient,
            amount,
            token: 'QBTC',
            status: 'pending',
            confirmations: 0,
            requiredConfirmations: requiredConfs,
            timestamp: Date.now(),
            explorerUrl: `/qbtc-scan?q=${txid}`,
          });
        }

        setShowPasswordModal(false);
        setSuccessData({
          hash: txid,
          amount,
          to: recipient,
          fee: `${feeQbtc} QBTC`,
          feeUsd: 0,
          explorerUrl: `/qbtc-scan?q=${txid}`,
        });
        setShowSuccessModal(true);

        setRecipient('');
        setAmount('');
        setError(null);

        setIsProcessing(false);
        setTransactionStep(null);
        return;
      }

      // Handle XRP native
      if (selectedChain === 'xrp' && selectedToken.isNative) {
        setTransactionStep('estimating');
        const fee = await estimateXrpFee(tokenNetwork);
        setEstimatedFee(fee);
        
        const price = await getPrice('xrp');
        setEstimatedFeeUsd(parseFloat(fee) * price);
        
        setTransactionStep('signing');
        const destinationTagNum = destinationTag ? parseInt(destinationTag) : undefined;
        const tx = await buildXrpTransaction(fromAddress, recipient, amount, destinationTagNum, tokenNetwork);
        
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
        const result = await broadcastXrpTransaction(signedTx, tokenNetwork);
        
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

      // Handle XRP token (XRPL IOU / trust-line)
      if (selectedChain === 'xrp' && !selectedToken.isNative) {
        setTransactionStep('estimating');
        const fee = await estimateXrpFee(tokenNetwork);
        setEstimatedFee(fee);

        setTransactionStep('signing');
        const destinationTagNum = destinationTag ? parseInt(destinationTag) : undefined;
        const tx = await buildXrpTokenTransaction(
          fromAddress,
          recipient,
          selectedToken.currencyCode || selectedToken.symbol,
          selectedToken.issuer || '',
          amount,
          destinationTagNum,
          tokenNetwork
        );

        const walletId = localStorage.getItem(`wallet_id_${userId}`);
        if (!walletId) throw new Error('Wallet ID not found. Please try again.');

        const { unlockWallet } = await import('@/lib/walletService');
        const wallet = await unlockWallet(walletId, password);
        const xrpSeed = wallet.privateKeys.xrp;
        if (!xrpSeed) throw new Error('XRP private key not found in wallet');

        const signedTx = signXrpTransaction(tx, xrpSeed);

        setTransactionStep('broadcasting');
        const result = await broadcastXrpTransaction(signedTx, tokenNetwork);

        setShowPasswordModal(false);
        setSuccessData({
          hash: result.hash,
          amount,
          to: recipient,
          fee,
          feeUsd: 0,
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

      const walletId = localStorage.getItem(`wallet_id_${userId}`);
      if (!walletId) {
        throw new Error('Wallet ID not found. Please try again.');
      }

      let tx: ethers.TransactionRequest;
      let gasEstimate: GasEstimate;

      if (selectedToken.isNative) {
        // Native ETH / BNB transfer
        gasEstimate = await estimateGas(selectedChain as any, fromAddress, recipient, amount);
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
        tx = await buildTransaction(selectedChain as any, fromAddress, recipient, amount, gasEstimate);
      } else {
        // ERC-20 / BEP-20 token transfer
        if (!selectedToken.contractAddress) {
          throw new Error(`Token ${selectedToken.symbol} is missing a contract address`);
        }

        gasEstimate = await estimateERC20Gas(
          selectedChain as any,
          fromAddress,
          selectedToken.contractAddress,
          recipient,
          amount,
          selectedToken.decimals
        );
        setEstimatedFee(gasEstimate.estimatedFee);
        setEstimatedFeeUsd(gasEstimate.estimatedFeeUsd);

        // Check native balance covers gas
        const feeCheck = await checkNativeBalanceForTokenGas(
          selectedChain as any,
          fromAddress,
          gasEstimate.estimatedFee
        );

        if (!feeCheck.sufficient) {
          const symbol = getSendChainSymbol(selectedChain as any);
          throw new Error(
            `Insufficient ${symbol} for gas. Need ${feeCheck.required} ${symbol} but only have ${feeCheck.balance} ${symbol}.`
          );
        }

        // Check token balance
        const tokenBalanceNum = parseFloat(selectedToken.balance || '0');
        const amountNum = parseFloat(amount);
        if (amountNum > tokenBalanceNum) {
          throw new Error(
            `Insufficient ${selectedToken.symbol} balance. You have ${selectedToken.balance} but are trying to send ${amount}.`
          );
        }

        setTransactionStep('signing');
        tx = await buildERC20Transaction(
          selectedChain as any,
          fromAddress,
          selectedToken.contractAddress,
          recipient,
          amount,
          selectedToken.decimals,
          gasEstimate
        );
      }
      
      const signedTx = await signTransaction(
        walletId,
        password,
        selectedChain,
        tx,
        isPasskeyAuthenticated || passkeyAuthenticatedThisSession
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
      bsc_testnet: 'tBNB',
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
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
              qbtcSource === 'vault'
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
            }`}>
              {qbtcSource === 'vault' ? 'PQC Hybrid' : 'ECDSA'}
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
            <p className="text-xs text-gray-500">Transactions are routed through your API proxy. These settings are for display only.</p>

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
                  placeholder="/api/qbtc/rpc"
                  autoComplete="off"
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
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
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
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Fee Rate (sat/vB, min 5)</label>
                <input
                  type="number"
                  min={5}
                  value={qbtcSettings.feeRate || 5}
                  onChange={(e) => {
                    const next = setQBTCRpcSettings({ feeRate: Math.max(5, Number(e.target.value || 5)) });
                    setQbtcSettings(next);
                  }}
                  autoComplete="off"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* QBTC Source Selector — Hot Wallet (ECDSA) vs Vault (PQC Hybrid) */}
        {selectedChain === 'qbtc' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Send From
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setQbtcSource('hot')}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-colors ${
                  qbtcSource === 'hot'
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Send className="w-4 h-4" />
                <div className="text-left">
                  <p className="font-semibold">Hot Wallet</p>
                  <p className="text-xs opacity-70">ECDSA · Fast &amp; cheap</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setQbtcSource('vault')}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-colors ${
                  qbtcSource === 'vault'
                    ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Lock className="w-4 h-4" />
                <div className="text-left">
                  <p className="font-semibold">Quantum Vault</p>
                  <p className="text-xs opacity-70">PQC Hybrid · Quantum-safe</p>
                </div>
              </button>
            </div>
            {qbtcSource === 'vault' && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-start gap-2">
                <Shield className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-cyan-400">
                  Vault sends use <strong>ECDSA + QBTC PQC hybrid</strong> signatures. Larger transaction size but quantum-resistant.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Confirmation Security Slider — QBTC only */}
        {selectedChain === 'qbtc' && (
          <ConfirmationTimer
            onTargetChange={(minutes) => setConfirmationMinutes(minutes)}
            defaultStepIndex={4}
          />
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

        {/* Cold Signer Toggle */}
        {coldSignerAvailable && (
          <div className={`flex items-center justify-between p-4 rounded-xl border ${
            isColdDeviceMode
              ? 'bg-gradient-to-r from-sky-950/80 via-blue-950/70 to-cyan-950/80 border-cyan-400/50'
              : 'bg-gray-900/50 border-gray-700'
          }`}>
            <div>
              <p className="text-sm font-medium">{isColdDeviceMode ? 'Cold Device Mode Active' : 'Sign with Cold Signer'}</p>
              <p className={`text-xs ${isColdDeviceMode ? 'text-cyan-100/80' : 'text-gray-400'}`}>
                {isColdDeviceMode ? 'All sends must use the cold signer QR workflow' : 'Generate QR for air-gapped signing'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useColdSigner}
              onClick={() => {
                if (!isColdDeviceMode) {
                  setUseColdSigner(!useColdSigner);
                }
              }}
              disabled={isColdDeviceMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useColdSigner ? (isColdDeviceMode ? 'bg-cyan-400' : 'bg-emerald-600') : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useColdSigner ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSendClick}
          disabled={!recipient || !amount || !isRecipientValid || !selectedToken}
          className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Send className="w-5 h-5" />
          {useColdSigner ? 'Generate Cold Signer QR' : 'Review Transaction'}
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
          {...(selectedChain === 'qbtc' && qbtcChainRef.current ? {
            confirmationTarget: confirmationMinutes,
            pollConfirmations: (txid: string) => qbtcChainRef.current!.getTransactionConfirmations(txid),
          } : {})}
        />
      )}

      {/* Cold Signer: Password to decrypt hot share */}
      {showColdSignerPassword && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Enter Hot Share Password</h3>
              <p className="mt-1 text-sm text-gray-400">
                Decrypt your hot share to build the unsigned transaction.
              </p>
            </div>
            <input
              type="password"
              value={coldSignerPassword}
              onChange={(e) => setColdSignerPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && coldSignerPassword) void handleColdSignerPasswordSubmit(); }}
              placeholder="Password"
              autoComplete="off"
              autoFocus
              className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowColdSignerPassword(false); setColdSignerPassword(''); }}
                className="flex-1 rounded-xl bg-gray-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleColdSignerPasswordSubmit()}
                disabled={!coldSignerPassword}
                className="flex-1 rounded-xl bg-cyan-400 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-40"
              >
                Decrypt & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cold Signer: Unsigned TX QR Display */}
      {showUnsignedTxQR && unsignedTxPayload && (
        <UnsignedTxQRModal
          payload={unsignedTxPayload}
          chain={selectedChain}
          to={recipient}
          amount={amount}
          fee={estimatedFee}
          onScanSigned={() => {
            setShowUnsignedTxQR(false);
            setShowSignedTxScanner(true);
          }}
          onCancel={() => {
            setShowUnsignedTxQR(false);
            setUnsignedTxPayload('');
          }}
        />
      )}

      {/* Cold Signer: Signed TX Scanner */}
      {showSignedTxScanner && (
        <SignedTxScannerModal
          chain={selectedChain}
          to={recipient}
          amount={amount}
          token={selectedToken?.symbol || getChainSymbol(selectedChain)}
          onSuccess={handleColdSignerSuccess}
          onCancel={() => setShowSignedTxScanner(false)}
        />
      )}
    </>
  );
}
      
