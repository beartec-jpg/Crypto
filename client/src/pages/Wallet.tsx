// client/src/pages/Wallet.tsx - PART 1
// Main Wallet Page - Integrated with Token System

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { useUser } from '@clerk/clerk-react';
import WalletDashboard from '../components/Wallet/WalletDashboard';
import ReceiveModal from '../components/Wallet/ReceiveModal';
import SendForm, { type SendTransactionData } from '../components/Wallet/SendForm';
import BitcoinSendModal from '../components/Wallet/BitcoinSendModal';
import SolanaSendModal from '../components/Wallet/SolanaSendModal';
import PasskeyAuthModal from '../components/Wallet/PasskeyAuthModal';
import PinEntryModal from '../components/Wallet/PinEntryModal';
import SecuritySettings from '../components/Wallet/SecuritySettings';
import SecurityEducationCenter from '../components/Security/SecurityEducationCenter';
import { getCurrentWallet, migrateWalletToUser } from '@/lib/walletService';
import { securityManager, getSecurityRequirements } from '@/lib/securityService';
import { getWalletTokens, type Token } from '@/lib/tokenService';
import { deriveWIFFromPrivateKey } from '@/lib/bitcoinService';
import { usePendingTransactions } from '@/hooks/usePendingTransactions';
import { Shield, Lock, Eye, EyeOff, Wallet as WalletIcon, AlertTriangle, Send, QrCode, Settings as SettingsIcon } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import type { Chain } from '@/lib/balanceService';

type WalletMode = 'dashboard' | 'send' | 'receive' | 'settings' | 'security';

export default function WalletPage() {
  const { user } = useUser();
  const userId = user?.id || '';
  
  const [mode, setMode] = useState<WalletMode>('dashboard');
  const [hideBalances, setHideBalances] = useState(true);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [isPasskeyAuthenticated, setIsPasskeyAuthenticated] = useState(false);
  const [selectedChain, setSelectedChain] = useState<Chain>('ethereum');
  const [sovereignWallet, setSovereignWallet] = useState<any>(null);
  const [autoLockTime, setAutoLockTime] = useState(600);
  
  // Token state
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  
  // Modal state
  const [showBitcoinSend, setShowBitcoinSend] = useState(false);
  const [showSolanaSend, setShowSolanaSend] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  
  // Security tier enforcement
  const [isWalletUnlocked, setIsWalletUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<any>(null);
  const [authStep, setAuthStep] = useState<'none' | 'pin' | 'passkey' | 'complete'>('none');

  // Pending transactions hook
  const { transactions: pendingTransactions, addPendingTransaction } = usePendingTransactions();

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  // Migrate old wallet on mount
  useEffect(() => {
    if (userId) {
      migrateWalletToUser(userId);
    }
  }, [userId]);

  // Setup security manager and auto-lock
  useEffect(() => {
    const handleLock = (locked: boolean) => {
      if (locked) {
        setIsPasskeyAuthenticated(false);
        setIsWalletUnlocked(false);
        setSovereignWallet(null);
        setPendingWallet(null);
        console.log('🔒 Wallet auto-locked due to inactivity');
      }
    };

    securityManager.addLockListener(handleLock);

    const interval = setInterval(() => {
      setAutoLockTime(securityManager.getTimeUntilLock());
    }, 1000);

    return () => {
      securityManager.removeLockListener(handleLock);
      clearInterval(interval);
      securityManager.lockWallet();
    };
  }, []);

  // Check wallet and enforce security tier on mount
  useEffect(() => {
    const checkWalletAndSecurity = async () => {
      if (!userId) return;
      
      const wallet = await getCurrentWallet(userId);
      if (!wallet) {
        setSovereignWallet(null);
        setIsWalletUnlocked(false);
        return;
      }
      
      // Load tokens
      const walletTokens = await getWalletTokens(wallet.id);
      setTokens(walletTokens);
      
      const requirements = getSecurityRequirements(userId, 'openWallet');
      
      if (requirements.length === 0) {
        setSovereignWallet(wallet);
        setIsWalletUnlocked(true);
        setIsPasskeyAuthenticated(true);
        return;
      }
      
      const sessionUnlocked = sessionStorage.getItem('wallet_unlocked') === 'true';
      if (sessionUnlocked && !securityManager.isWalletLocked()) {
        setSovereignWallet(wallet);
        setIsWalletUnlocked(true);
        setIsPasskeyAuthenticated(true);
        return;
      }
      
      setPendingWallet(wallet);
      
      if (requirements.includes('pin')) {
        setAuthStep('pin');
        setShowPinModal(true);
      } else if (requirements.includes('passkey')) {
        setAuthStep('passkey');
        setShowPasskeyModal(true);
      }
    };
    
    checkWalletAndSecurity();
  }, [userId]);

  const handlePinSuccess = () => {
    setShowPinModal(false);
    
    if (!userId) return;
    
    const requirements = getSecurityRequirements(userId, 'openWallet');
    if (requirements.includes('passkey')) {
      setAuthStep('passkey');
      setShowPasskeyModal(true);
    } else {
      completeWalletUnlock();
    }
  };

  const handlePinCancel = () => {
    setShowPinModal(false);
    setAuthStep('none');
    setPendingWallet(null);
  };

  const completeWalletUnlock = () => {
    if (pendingWallet) {
      setSovereignWallet(pendingWallet);
      setPendingWallet(null);
    }
    setIsWalletUnlocked(true);
    setIsPasskeyAuthenticated(true);
    setAuthStep('complete');
    sessionStorage.setItem('wallet_unlocked', 'true');
    securityManager.unlockWallet();
  };

  const handlePasskeySuccess = () => {
    setShowPasskeyModal(false);
    completeWalletUnlock();
  };

  const handleConnect = (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      connect({ connector });
    }
  };

  const handleDisconnect = () => {
    if (isConnected) {
      disconnect();
    } else {
      securityManager.lockWallet();
      sessionStorage.removeItem('wallet_unlocked');
      setSovereignWallet(null);
      setIsPasskeyAuthenticated(false);
      setIsWalletUnlocked(false);
      setPendingWallet(null);
    }
  };

  // Handle token selection from dashboard
  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setSelectedChain(token.chain);

    if (token.chain === 'bitcoin' && token.isNative) {
      setShowBitcoinSend(true);
    } else if (token.chain === 'solana') {
      setShowSolanaSend(true);
    } else {
      setMode('send');
    }
  };

  // Handle send transaction
  const handleSend = async (data: SendTransactionData) => {
    try {
      if (data.chain === 'ethereum' || data.chain === 'bsc') {
        const { signTransaction, broadcastTransaction } = await import('@/lib/walletService');
        
        const tx = {
          to: data.toAddress,
          value: data.token.isNative ? data.amount : undefined,
          data: data.token.isNative ? undefined : '0x',
        };

        const password = prompt('Enter your wallet password:');
        if (!password) throw new Error('Password required');

        const signedTx = await signTransaction(
          sovereignWallet!.id,
          password,
          data.chain,
          tx,
          false
        );

        const txHash = await broadcastTransaction(data.chain, signedTx);

        addPendingTransaction({
          hash: txHash,
          chain: data.chain,
          type: 'send',
          amount: data.amount,
          asset: data.token.symbol,
          to: data.toAddress,
          timestamp: Date.now(),
          status: 'pending',
        });

        alert(`Transaction sent! Hash: ${txHash}`);
        setMode('dashboard');
      } else if (data.chain === 'xrp') {
        const { sendXRP, sendXRPToken } = await import('@/lib/xrpService');
        
        const password = prompt('Enter your wallet password:');
        if (!password) throw new Error('Password required');

        const { unlockWallet } = await import('@/lib/walletService');
        const unlockedWallet = await unlockWallet(sovereignWallet!.id, password);
        const privateKey = unlockedWallet.privateKeys.xrp;

        let txHash: string;

        if (data.token.isNative) {
          const result = await sendXRP(privateKey, data.toAddress, data.amount, data.memo);
          txHash = result.hash;
        } else {
          const result = await sendXRPToken(
            privateKey,
            data.toAddress,
            data.token.currencyCode!,
            data.token.issuer!,
            data.amount,
            data.memo
          );
          txHash = result.hash;
        }

        addPendingTransaction({
          hash: txHash,
          chain: 'xrp',
          type: 'send',
          amount: data.amount,
          asset: data.token.symbol,
          to: data.toAddress,
          timestamp: Date.now(),
          status: 'pending',
        });

        alert(`Transaction sent! Hash: ${txHash}`);
        setMode('dashboard');
      }
    } catch (error: any) {
      console.error('Send failed:', error);
      alert('Failed to send: ' + error.message);
      throw error;
    }
  };

  // Handle Bitcoin send success
  const handleBitcoinSendSuccess = (txid: string) => {
    addPendingTransaction({
      hash: txid,
      chain: 'bitcoin',
      type: 'send',
      amount: '0',
      asset: 'BTC',
      to: '',
      timestamp: Date.now(),
      status: 'pending',
    });

    setShowBitcoinSend(false);
    setMode('dashboard');
  };

  // Handle Solana send success
  const handleSolanaSendSuccess = (signature: string) => {
    addPendingTransaction({
      hash: signature,
      chain: 'solana',
      type: 'send',
      amount: '0',
      asset: selectedToken?.symbol || 'SOL',
      to: '',
      timestamp: Date.now(),
      status: 'pending',
    });

    setShowSolanaSend(false);
    setMode('dashboard');
  };

  const isWalletConnected = isConnected || (sovereignWallet !== null && isWalletUnlocked);
  const activeAddress = address || (sovereignWallet?.addresses[selectedChain] as `0x${string}` | undefined);

  // Chain selector
  const chains: Chain[] = ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana'];
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Security Banner */}
      <div className="bg-gradient-to-r from-emerald-900/50 to-cyan-900/50 border-b border-emerald-700/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-300">
            Non-custodial • End-to-end encrypted • Your keys never leave your device
          </span>
          <Lock className="w-4 h-4 text-emerald-400" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* BearTec Logo */}
        <div className="flex justify-center mb-8">
          <img 
            src={bearTecLogoNew} 
            alt="BearTec Logo" 
            className="h-[140px] w-auto object-contain"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-center gap-4 flex-wrap mb-8">
          {/* Privacy Toggle */}
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title={hideBalances ? 'Show balances' : 'Hide balances'}
          >
            {hideBalances ? (
              <EyeOff className="w-5 h-5 text-gray-400" />
            ) : (
              <Eye className="w-5 h-5 text-emerald-400" />
            )}
          </button>

          {/* Chain Selector (only in send/receive modes) */}
          {(mode === 'send' || mode === 'receive') && (
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value as Chain)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ethereum">Ethereum</option>
              <option value="bitcoin">Bitcoin</option>
              <option value="bsc">BSC (BNB)</option>
              <option value="xrp">XRP (Ripple)</option>
              <option value="solana">Solana</option>
            </select>
          )}

          {/* Network Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm text-gray-300">Mainnet</span>
          </div>

          {/* Passkey Auth Status */}
          {isPasskeyAuthenticated || sovereignWallet ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-emerald-400">
                {sovereignWallet ? 'Sovereign Wallet' : 'Passkey Active'}
              </span>
            </div>
          ) : (
            <button
              onClick={() => setShowPasskeyModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>Authenticate</span>
            </button>
          )}

          {/* Auto-Lock Indicator */}
          {(isPasskeyAuthenticated || sovereignWallet) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 text-xs">
              <Lock className="w-3 h-3 text-gray-400" />
              <span className="text-gray-400">
                Auto-lock: {Math.floor(autoLockTime / 60)}:{(autoLockTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {/* Connection Status */}
        {!isWalletConnected ? (
          <div>
            {/* Show locked state for Tier 2/3 when not unlocked */}
            {pendingWallet && !isWalletUnlocked ? (
              <div className="bg-gray-800 rounded-2xl p-8 mb-8 text-center">
                <Lock className="w-16 h-16 mx-auto text-amber-400 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Wallet Locked</h2>
                <p className="text-gray-400 mb-6">
                  Your security settings require authentication to access the wallet.
                </p>
                <button
                  onClick={() => {
                    if (!userId) return;
                    
                    const requirements = getSecurityRequirements(userId, 'openWallet');
                    if (requirements.includes('pin')) {
                      setAuthStep('pin');
                      setShowPinModal(true);
                    } else {
                      setAuthStep('passkey');
                      setShowPasskeyModal(true);
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors inline-flex items-center gap-2"
                >
                  <Lock className="w-5 h-5" />
                  Unlock Wallet
                </button>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-2xl p-8 mb-8">
                <div className="text-center mb-6">
                  <WalletIcon className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                  <h2 className="text-2xl font-semibold mb-2">Connect Your Wallet</h2>
                  <p className="text-gray-400">
                    Connect an external wallet or create a new sovereign wallet with passkey authentication
                  </p>
                </div>

                <div className="flex flex-col gap-4 max-w-md mx-auto">
                  <button
                    onClick={() => handleConnect('metaMask')}
                    disabled={isPending}
                    className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="font-medium">MetaMask</span>
                  </button>

                  <button
                    onClick={() => handleConnect('walletConnect')}
                    disabled={isPending}
                    className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="font-medium">WalletConnect</span>
                  </button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-700" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-gray-800 text-gray-400">or</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowPasskeyModal(true)}
                    disabled={!userId}
                    className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Lock className="w-6 h-6" />
                    <span className="font-medium">Create Sovereign Wallet with Passkey</span>
                  </button>
                  
                  {!userId && (
                    <p className="text-center text-sm text-red-400">
                      Please sign in to create a sovereign wallet
                    </p>
                  )}
                </div>

                {/* Security Notice */}
                <div className="mt-8 p-4 rounded-xl bg-gray-900/50 border border-gray-700 max-w-2xl mx-auto">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-400">
                      <p className="font-medium text-amber-400 mb-1">Security Notice</p>
                      <p>
                        Your private keys are generated and stored securely on your device using WebAuthn passkeys.
                        We never have access to your keys or funds. All signing happens client-side with
                        industry-standard encryption.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Connected Wallet Info */}
            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400" />
                <div>
                  <p className="text-sm text-gray-400">
                    {sovereignWallet ? 'Sovereign Wallet' : 'Connected'}
                  </p>
                  <p className="font-mono text-sm">
                    {activeAddress?.slice(0, 10)}...{activeAddress?.slice(-4)}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {selectedChain} • Mainnet
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
              >
                Disconnect
              </button>
            </div>

            {/* Mode Navigation */}
            {mode !== 'security' && (
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1 mb-6">
                <button
                  onClick={() => setMode('dashboard')}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    mode === 'dashboard'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <WalletIcon className="w-4 h-4" />
                  Dashboard
                </button>
                <button
                  onClick={() => setMode('send')}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    mode === 'send'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    showReceiveModal
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Receive
                </button>
                <button
                  onClick={() => setMode('settings')}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    mode === 'settings'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={() => setMode('security')}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    mode === 'security'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Security
                </button>
              </div>
            )}

            {/* Main Content */}
            <div>
              {mode === 'dashboard' && (
                <WalletDashboard
                  address={activeAddress}
                  balance={balance}
                  hideBalances={hideBalances}
                  selectedChain={selectedChain}
                  sovereignWallet={sovereignWallet}
                  pendingTransactions={pendingTransactions}
                  onSelectToken={handleTokenSelect}
                />
              )}

              {mode === 'send' && sovereignWallet && (
                <SendForm
                  chain={selectedChain}
                  walletId={sovereignWallet.id}
                  walletAddresses={sovereignWallet.addresses}
                  onSend={handleSend}
                  defaultToken={selectedToken || undefined}
                />
              )}

              {mode === 'settings' && (
                <SettingsSection sovereignWallet={sovereignWallet} userId={userId} />
              )}

              {mode === 'security' && <SecurityEducationCenter />}
            </div>
          </>
        )}
      </div>

      {/* Receive Modal */}
      {showReceiveModal && sovereignWallet && (
        <ReceiveModal
          addresses={sovereignWallet.addresses}
          selectedChain={selectedChain}
          onSelectChain={setSelectedChain}
          onClose={() => setShowReceiveModal(false)}
        />
      )}

      {/* Bitcoin Send Modal */}
      {showBitcoinSend && sovereignWallet && (
        <BitcoinSendModal
          fromAddress={sovereignWallet.addresses.bitcoin}
          privateKeyHex={''} // TODO: Get from unlocked wallet
          availableBalance={0} // TODO: Get from balance service
          onClose={() => setShowBitcoinSend(false)}
          onSuccess={handleBitcoinSendSuccess}
        />
      )}

      {/* Solana Send Modal */}
      {showSolanaSend && sovereignWallet && selectedToken && (
        <SolanaSendModal
          fromAddress={sovereignWallet.addresses.solana}
          privateKeyBase58={''} // TODO: Get from unlocked wallet
          selectedToken={selectedToken}
          onClose={() => setShowSolanaSend(false)}
          onSuccess={handleSolanaSendSuccess}
        />
      )}

      {/* PIN Entry Modal for Tier 3 */}
      {showPinModal && userId && (
        <PinEntryModal
          userId={userId}
          onClose={handlePinCancel}
          onSuccess={handlePinSuccess}
          title="Enter PIN to Unlock Wallet"
          description="Your security settings require PIN verification"
        />
      )}

      {/* Passkey Auth Modal */}
      {showPasskeyModal && userId && (
        <PasskeyAuthModal
          onClose={() => setShowPasskeyModal(false)}
          onSuccess={handlePasskeySuccess}
          userId={userId}
        />
      )}
    </div>
  );
}

// Settings Section Component (kept from original)
function SettingsSection({ sovereignWallet, userId }: { sovereignWallet: any; userId: string }) {
  const [showMnemonicWarning, setShowMnemonicWarning] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'security'>('general');

  return (
    <div className="space-y-6 bg-gray-800 rounded-2xl p-6">
      <h2 className="text-2xl font-semibold">Wallet Settings</h2>

      {/* Settings Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        <button
          onClick={() => setActiveSettingsTab('general')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSettingsTab === 'general'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setActiveSettingsTab('security')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSettingsTab === 'security'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          Security
        </button>
      </div>

      {activeSettingsTab === 'general' && (
        <>
          {/* User Info */}
          <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
            <h3 className="font-medium text-gray-300 mb-2">Account</h3>
            <p className="text-sm text-gray-400">User ID: {userId}</p>
            {sovereignWallet && (
              <p className="text-sm text-gray-400 mt-1">
                Wallet Created: {new Date(sovereignWallet.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Wallet Info */}
          {sovereignWallet && (
            <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
              <h3 className="font-medium text-emerald-400 mb-3">Multi-Chain Addresses (Mainnet)</h3>
              <div className="space-y-2 text-sm font-mono">
                <div>
                  <span className="text-gray-400">ETH:</span>
                  <span className="ml-2 text-gray-300 break-all">{sovereignWallet.addresses.ethereum}</span>
                </div>
                <div>
                  <span className="text-gray-400">BTC:</span>
                  <span className="ml-2 text-gray-300 break-all">{sovereignWallet.addresses.bitcoin}</span>
                </div>
                <div>
                  <span className="text-gray-400">BSC:</span>
                  <span className="ml-2 text-gray-300 break-all">{sovereignWallet.addresses.bsc}</span>
                </div>
                <div>
                  <span className="text-gray-400">XRP:</span>
                  <span className="ml-2 text-gray-300 break-all">{sovereignWallet.addresses.xrp}</span>
                </div>
                <div>
                  <span className="text-gray-400">SOL:</span>
                  <span className="ml-2 text-gray-300 break-all">{sovereignWallet.addresses.solana}</span>
                </div>
              </div>
            </div>
          )}

          {/* Security Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-300">Security Status</h3>
            
            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Passkey Authentication</p>
                  <p className="text-sm text-gray-400">Use biometrics or PIN for signing</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-Lock</p>
                  <p className="text-sm text-gray-400">Wallet locks after 10 minutes of inactivity</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
            </div>
          </div>

          {/* Advanced (Mnemonic Export) */}
          {sovereignWallet && (
            <div className="pt-6 border-t border-gray-700">
              <h3 className="text-lg font-medium text-gray-300 mb-4">Advanced</h3>
              
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-red-400">Recovery Phrase Export</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Export your BIP-39 mnemonic for backup purposes only. Never share this with anyone.
                    </p>
                    
                    {!showMnemonicWarning ? (
                      <button
                        onClick={() => setShowMnemonicWarning(true)}
                        className="mt-4 px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
                      >
                        Show Recovery Options
                      </button>
                    ) : (
                      <div className="mt-4 space-y-4">
                        <div className="p-3 rounded-lg bg-red-900/30 text-sm text-red-300">
                          ⚠️ Warning: Anyone with your recovery phrase can access your funds.
                          Store it securely offline. Never enter it on websites or share with support.
                        </div>
                        <button
                          onClick={() => setShowMnemonic(!showMnemonic)}
                          className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors text-sm"
                        >
                          {showMnemonic ? 'Hide' : 'Reveal'} Recovery Phrase
                        </button>
                        {showMnemonic && (
                          <div className="p-4 rounded-lg bg-gray-900 font-mono text-sm">
                            <p className="text-gray-400 italic">
                              [Requires password authentication to view - Feature coming soon]
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeSettingsTab === 'security' && (
        <SecuritySettings userId={userId} />
      )}
    </div>
  );
}
  
