// client/src/pages/Wallet.tsx
// Main wallet page with multi-chain support, security tiers, and transaction management

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { useUser } from '@clerk/clerk-react';
import WalletDashboard from '@/components/Wallet/WalletDashboard';
import SendForm from '@/components/Wallet/SendForm';
import ReceiveModal from '@/components/Wallet/ReceiveModal';
import BitcoinSendModal from '@/components/Wallet/BitcoinSendModal';
import SolanaSendModal from '@/components/Wallet/SolanaSendModal';
import PasskeyAuthModal from '@/components/Wallet/PasskeyAuthModal';
import PinEntryModal from '@/components/Wallet/PinEntryModal';
import SecuritySettings from '@/components/Wallet/SecuritySettings';
import SecurityEducationCenter from '@/components/Security/SecurityEducationCenter';
import { getCurrentWallet, migrateWalletToUser, deleteWallet } from '@/lib/walletService';
import { securityManager, getSecurityRequirements } from '@/lib/securityService';
import { getWalletTokens, clearWalletTokens, ensureNativeTokens, type Token } from '@/lib/tokenService';
import { deriveWIFFromPrivateKey } from '@/lib/bitcoinService';
import { usePendingTransactions } from '@/hooks/usePendingTransactions';
import { Shield, Lock, Eye, EyeOff, Wallet as WalletIcon, AlertTriangle, Send, QrCode, Settings as SettingsIcon, Pickaxe } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import type { Chain } from '@/lib/balanceService';

type WalletMode = 'dashboard' | 'send' | 'receive' | 'settings' | 'security';

export default function WalletPage() {
  const { user } = useUser();
  const userId = user?.id || '';
  const { toast } = useToast();
  
  const [mode, setMode] = useState<WalletMode>('dashboard');
  const [hideBalances, setHideBalances] = useState(true);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [isPasskeyAuthenticated, setIsPasskeyAuthenticated] = useState(false);
  const [selectedChain, setSelectedChain] = useState<Chain>('ethereum');
  const [sovereignWallet, setSovereignWallet] = useState<any>(null);
  const [autoLockTime, setAutoLockTime] = useState(600);
  
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  
  const [showBitcoinSend, setShowBitcoinSend] = useState(false);
  const [showSolanaSend, setShowSolanaSend] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  
  const [isWalletUnlocked, setIsWalletUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<any>(null);
  const [authStep, setAuthStep] = useState<'none' | 'pin' | 'passkey' | 'complete'>('none');

  // Delete wallet states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const { transactions: pendingTransactions, addPendingTransaction, removeTransaction } = usePendingTransactions();

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  // Handle URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const chain = params.get('chain');
    const tokenId = params.get('token');

    if (tab === 'send') {
      setMode('send');
    }

    if (chain && ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana', 'qbtc'].includes(chain)) {
      setSelectedChain(chain as Chain);
    }

    if (tokenId) {
      sessionStorage.setItem('pendingTokenSelection', tokenId);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      migrateWalletToUser(userId);
    }
  }, [userId]);

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

  useEffect(() => {
    const checkWalletAndSecurity = async () => {
      if (!userId) return;
      
      const wallet = await getCurrentWallet(userId);
      if (!wallet) {
        setSovereignWallet(null);
        setIsWalletUnlocked(false);
        return;
      }
      
      const walletTokens = await ensureNativeTokens(wallet.id);
      setTokens(walletTokens);
      
      const requirements = getSecurityRequirements(userId, 'openWallet');
      
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

  const handlePasskeySuccess = async () => {
    setShowPasskeyModal(false);

    if (!userId) {
      completeWalletUnlock();
      return;
    }

    const freshWallet = await getCurrentWallet(userId);
    if (freshWallet) {
      setPendingWallet(freshWallet);
      const walletTokens = await ensureNativeTokens(freshWallet.id);
      setTokens(walletTokens);
    }

    completeWalletUnlock();
  };

  const handleAuthenticateClick = () => {
    if (!userId) return;
    
    const requirements = getSecurityRequirements(userId, 'openWallet');
    
    if (requirements.includes('pin')) {
      setAuthStep('pin');
      setShowPinModal(true);
    } else if (requirements.includes('passkey')) {
      setAuthStep('passkey');
      setShowPasskeyModal(true);
    } else {
      completeWalletUnlock();
    }
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
      sessionStorage.removeItem('pendingTokenSelection');
      setSovereignWallet(null);
      setIsPasskeyAuthenticated(false);
      setIsWalletUnlocked(false);
      setPendingWallet(null);
      setTokens([]);
      setAuthStep('none');
    }
  };

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setSelectedChain(token.chain);

    const params = new URLSearchParams();
    params.set('tab', 'send');
    params.set('chain', token.chain);
    params.set('token', token.id);
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);

    if (token.chain === 'bitcoin' && token.isNative) {
      setShowBitcoinSend(true);
    } else if (token.chain === 'solana') {
      setShowSolanaSend(true);
    } else {
      setMode('send');
    }
  };

  const handleBitcoinSendSuccess = (txid: string) => {
    addPendingTransaction({
      hash: txid,
      chain: 'bitcoin',
      amount: '0',
      token: 'BTC',
      from: '',
      to: '',
      timestamp: Date.now(),
      status: 'pending',
      confirmations: 0,
      requiredConfirmations: 6,
      explorerUrl: `https://mempool.space/tx/${txid}`,
    });

    setShowBitcoinSend(false);
    setMode('dashboard');
  };

  const handleSolanaSendSuccess = (signature: string) => {
    addPendingTransaction({
      hash: signature,
      chain: 'solana',
      amount: '0',
      token: selectedToken?.symbol || 'SOL',
      from: '',
      to: '',
      timestamp: Date.now(),
      status: 'pending',
      confirmations: 0,
      requiredConfirmations: 32,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    });

    setShowSolanaSend(false);
    setMode('dashboard');
  };

  // Delete wallet handler
  const handleDeleteWallet = async () => {
    if (!sovereignWallet || !user?.id) return;
    
    setIsDeleting(true);
    setDeleteError('');
    
    try {
      // Verify password
      const { unlockWallet } = await import('@/lib/walletService');
      try {
        await unlockWallet(sovereignWallet.id, deletePassword);
      } catch (error) {
        setDeleteError('Invalid password');
        setIsDeleting(false);
        return;
      }
      
      // Delete wallet and tokens
      await deleteWallet(sovereignWallet.id, user.id);
      await clearWalletTokens(sovereignWallet.id);
      
      // Clear state
      setSovereignWallet(null);
      setIsPasskeyAuthenticated(false);
      setIsWalletUnlocked(false);
      setShowDeleteConfirm(false);
      
      toast({
        title: "Wallet Deleted",
        description: "Your wallet has been permanently deleted.",
      });
      
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      setDeleteError(error.message || 'Failed to delete wallet');
    } finally {
      setIsDeleting(false);
    }
  };

  const isWalletConnected = isConnected || (sovereignWallet !== null && isWalletUnlocked);
  const activeAddress = address || (sovereignWallet?.addresses[selectedChain] as `0x${string}` | undefined);

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
        <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap mb-8 px-2">
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title={hideBalances ? 'Show balances' : 'Hide balances'}
          >
            {hideBalances ? (
              <EyeOff className="w-5 h-5 text-gray-400" />
            ) : (
              <Eye className="w-5 h-5 text-emerald-400" />
            )}
          </button>

          {isPasskeyAuthenticated || sovereignWallet ? (
            <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
              <span className="text-sm text-emerald-400">
                {sovereignWallet ? 'Sovereign Wallet' : 'Passkey Active'}
              </span>
            </div>
          ) : (
            <button
              onClick={handleAuthenticateClick}
              className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors"
              title="Authenticate"
            >
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Authenticate</span>
            </button>
          )}

          {(isPasskeyAuthenticated || sovereignWallet) && (
            <div 
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-gray-800 text-xs"
              title="Auto-lock timer"
            >
              <Lock className="w-3 h-3 text-gray-400" />
              <span className="text-gray-400">
                <span className="hidden sm:inline">Auto-lock: </span>
                {Math.floor(autoLockTime / 60)}:{(autoLockTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          {(isPasskeyAuthenticated || sovereignWallet) && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
              title="Logout"
            >
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>

        {/* Connection Status */}
        {!isWalletConnected ? (
          <div>
            {pendingWallet && !isWalletUnlocked ? (
              <div className="bg-gray-800 rounded-2xl p-8 mb-8 text-center">
                <Lock className="w-16 h-16 mx-auto text-amber-400 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Wallet Locked</h2>
                <p className="text-gray-400 mb-6">
                  Your security settings require authentication to access the wallet.
                </p>
                <button
                  onClick={handleAuthenticateClick}
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
                        {/* Mode Navigation - RESPONSIVE */}
            {mode !== 'security' && (
              <div className="flex items-center gap-1 sm:gap-2 bg-gray-800 rounded-lg p-1 mb-6 overflow-x-auto">
                <button
                  onClick={() => setMode('dashboard')}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-2 ${
                    mode === 'dashboard'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Dashboard"
                >
                  <WalletIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
                <button
                  onClick={() => setMode('send')}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-2 ${
                    mode === 'send'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Send"
                >
                  <Send className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Send</span>
                </button>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-2 ${
                    showReceiveModal
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Receive"
                >
                  <QrCode className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Receive</span>
                </button>
                <button
                  onClick={() => setMode('settings')}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-2 ${
                    mode === 'settings'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Settings"
                >
                  <SettingsIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Settings</span>
                </button>
                <button
                  onClick={() => setMode('security')}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-2 text-gray-400 hover:text-white`}
                  title="Security"
                >
                  <Shield className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Security</span>
                </button>
                <button
                  onClick={() => {
                    window.location.href = '/qbtc-faucet';
                  }}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 sm:gap-2 text-cyan-300 hover:text-cyan-200`}
                  title="QBTC Faucet"
                >
                  <Pickaxe className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Faucet</span>
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
                  onRemovePendingTransaction={removeTransaction}
                />
              )}

              {mode === 'send' && sovereignWallet && (
                <SendForm
                  userId={userId}
                  isPasskeyAuthenticated={isPasskeyAuthenticated}
                  onRequestPasskey={() => setShowPasskeyModal(true)}
                  selectedChain={selectedChain}
                  onChainChange={setSelectedChain}
                  onAddPendingTransaction={addPendingTransaction}
                  sovereignWallet={sovereignWallet}
                />
              )}

              {mode === 'settings' && (
                <SettingsSection 
                  sovereignWallet={sovereignWallet} 
                  userId={userId}
                  onDeleteWallet={() => setShowDeleteConfirm(true)}
                />
              )}

              {mode === 'security' && (
                <SecurityEducationCenter onBack={() => setMode('dashboard')} />
              )}
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
          privateKeyHex={''}
          availableBalance={0}
          onClose={() => setShowBitcoinSend(false)}
          onSuccess={handleBitcoinSendSuccess}
        />
      )}

      {/* Solana Send Modal */}
      {showSolanaSend && sovereignWallet && selectedToken && (
        <SolanaSendModal
          fromAddress={sovereignWallet.addresses.solana}
          privateKeyBase58={''}
          selectedToken={selectedToken}
          onClose={() => setShowSolanaSend(false)}
          onSuccess={handleSolanaSendSuccess}
        />
      )}

      {/* PIN Entry Modal */}
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

      {/* Delete Wallet Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-gray-900 border border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Wallet - Are You Sure?
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              This will permanently delete your wallet and all associated data.
              You will need your recovery phrase to restore access to your funds.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-400 font-medium mb-2">
                ⚠️ Warning: This action cannot be undone
              </p>
              <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                <li>Your wallet will be permanently deleted</li>
                <li>All added tokens will be removed</li>
                <li>You will need your recovery phrase to restore access</li>
                <li>Make sure you have backed up your recovery phrase</li>
              </ul>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Enter your password to confirm:
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={isDeleting}
              />
            </div>
            
            {deleteError && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded p-2">
                {deleteError}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword('');
                setDeleteError('');
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWallet}
              disabled={!deletePassword || isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Wallet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Settings Section Component
function SettingsSection({ 
  sovereignWallet, 
  userId,
  onDeleteWallet 
}: { 
  sovereignWallet: any; 
  userId: string;
  onDeleteWallet: () => void;
}) {
  const [showMnemonicWarning, setShowMnemonicWarning] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'security'>('general');
  const [autoLockMinutes, setAutoLockMinutes] = useState(securityManager.getAutoLockMinutes());

  const handleAutoLockChange = (minutes: number) => {
    setAutoLockMinutes(minutes);
    securityManager.setAutoLockMinutes(minutes);
  };

  return (
    <div className="space-y-6 bg-gray-800 rounded-2xl p-6">
      <h2 className="text-2xl font-semibold">Wallet Settings</h2>

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
          <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
            <h3 className="font-medium text-gray-300 mb-2">Account</h3>
            <p className="text-sm text-gray-400">User ID: {userId}</p>
            {sovereignWallet && (
              <p className="text-sm text-gray-400 mt-1">
                Wallet Created: {new Date(sovereignWallet.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>

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
                <div>
                  <span className="text-gray-400">QBTC:</span>
                  <span className="ml-2 text-gray-300 break-all">{sovereignWallet.addresses.qbtc}</span>
                </div>
              </div>
            </div>
          )}

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
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium">Auto-Lock Timer</p>
                  <p className="text-sm text-gray-400">Wallet locks after inactivity</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {[1, 2, 5, 10, 15].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => handleAutoLockChange(mins)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      autoLockMinutes === mins
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Maximum 15 minutes for security
              </p>
            </div>
          </div>

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

          {/* Delete Wallet Section */}
          {sovereignWallet && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 mt-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-400 mb-2">
                    Delete Wallet
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Permanently delete your wallet and all associated data. This action cannot be undone.
                    Make sure you have backed up your recovery phrase.
                  </p>
                  <button
                    onClick={onDeleteWallet}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                  >
                    Delete Wallet
                  </button>
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
