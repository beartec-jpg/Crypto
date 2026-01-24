// client/src/pages/Wallet.tsx
// Main Wallet Page - Sovereign Wallet with WebAuthn passkeys

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { useUser } from '@clerk/clerk-react';
import WalletDashboard from '../components/Wallet/WalletDashboard';
import ReceiveSection from '../components/Wallet/ReceiveSection';
import SendForm from '../components/Wallet/SendForm';
import PasskeyAuthModal from '../components/Wallet/PasskeyAuthModal';
import PinEntryModal from '../components/Wallet/PinEntryModal';
import SecuritySettings from '../components/Wallet/SecuritySettings';
import { getCurrentWallet, migrateWalletToUser } from '@/lib/walletService';
import { securityManager, getSecurityRequirements } from '@/lib/securityService';
import { Shield, Lock, Eye, EyeOff, Wallet as WalletIcon, AlertTriangle } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

type WalletTab = 'dashboard' | 'send' | 'receive' | 'settings';
type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

export default function WalletPage() {
  const { user } = useUser();
  const userId = user?.id || '';
  
  const [activeTab, setActiveTab] = useState<WalletTab>('dashboard');
  const [hideBalances, setHideBalances] = useState(true);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [isPasskeyAuthenticated, setIsPasskeyAuthenticated] = useState(false);
  const [selectedChain, setSelectedChain] = useState<Chain>('ethereum');
  const [sovereignWallet, setSovereignWallet] = useState<any>(null);
  const [autoLockTime, setAutoLockTime] = useState(600);
  
  // New state variables for security tier enforcement
  const [isWalletUnlocked, setIsWalletUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<any>(null);
  const [authStep, setAuthStep] = useState<'none' | 'pin' | 'passkey' | 'complete'>('none');

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
      
      // First, check if wallet exists
      const wallet = await getCurrentWallet(userId);
      if (!wallet) {
        setSovereignWallet(null);
        setIsWalletUnlocked(false);
        return;
      }
      
      // Get security requirements for opening wallet
      const requirements = getSecurityRequirements(userId, 'openWallet');
      
      // Tier 1: No auth needed to view wallet
      if (requirements.length === 0) {
        setSovereignWallet(wallet);
        setIsWalletUnlocked(true);
        setIsPasskeyAuthenticated(true);
        return;
      }
      
      // Tier 2 or 3: Check if already authenticated this session
      const sessionUnlocked = sessionStorage.getItem('wallet_unlocked') === 'true';
      if (sessionUnlocked && !securityManager.isWalletLocked()) {
        setSovereignWallet(wallet);
        setIsWalletUnlocked(true);
        setIsPasskeyAuthenticated(true);
        return;
      }
      
      // Need to authenticate - store wallet reference, show auth modal
      setPendingWallet(wallet);
      
      if (requirements.includes('pin')) {
        // Tier 3: PIN first, then passkey
        setAuthStep('pin');
        setShowPinModal(true);
      } else if (requirements.includes('passkey')) {
        // Tier 2: Passkey only
        setAuthStep('passkey');
        setShowPasskeyModal(true);
      }
    };
    
    checkWalletAndSecurity();
  }, [userId]);

  const handlePinSuccess = () => {
    setShowPinModal(false);
    
    // After PIN, check if passkey is also required
    if (!userId) return;
    
    const requirements = getSecurityRequirements(userId, 'openWallet');
    if (requirements.includes('passkey')) {
      setAuthStep('passkey');
      setShowPasskeyModal(true);
    } else {
      // PIN only was required, complete auth
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

          {/* Chain Selector */}
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

            {/* Navigation Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-800 pb-4">
              {(['dashboard', 'send', 'receive', 'settings'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors capitalize ${
                    activeTab === tab
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-gray-800 rounded-2xl p-6">
              {activeTab === 'dashboard' && (
                <WalletDashboard
                  address={activeAddress}
                  balance={balance}
                  hideBalances={hideBalances}
                  selectedChain={selectedChain}
                  sovereignWallet={sovereignWallet}
                />
              )}
              {activeTab === 'send' && (
                <SendForm
                  userId={userId}
                  isPasskeyAuthenticated={isPasskeyAuthenticated}
                  onRequestPasskey={() => setShowPasskeyModal(true)}
                  selectedChain={selectedChain}
                />
              )}
              {activeTab === 'receive' && (
                <ReceiveSection address={activeAddress} />
              )}
              {activeTab === 'settings' && (
                <SettingsSection sovereignWallet={sovereignWallet} userId={userId} />
              )}
            </div>
          </>
        )}
      </div>

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

// Settings Section Component
function SettingsSection({ sovereignWallet, userId }: { sovereignWallet: any; userId: string }) {
  const [showMnemonicWarning, setShowMnemonicWarning] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'security'>('general');

  return (
    <div className="space-y-6">
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

            {sovereignWallet?.mnemonicBackedUp !== undefined && (
              <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Recovery Phrase Backup</p>
                    <p className="text-sm text-gray-400">
                      {sovereignWallet.mnemonicBackedUp ? 'Backed up ✓' : 'Not backed up yet'}
                    </p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${sovereignWallet.mnemonicBackedUp ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                </div>
              </div>
            )}
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
