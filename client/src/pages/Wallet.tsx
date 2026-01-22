// client/src/pages/Wallet.tsx
// Main Wallet Page - Sovereign Wallet with WebAuthn passkeys and post-quantum security

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { metaMask, walletConnect } from 'wagmi/connectors';
import WalletDashboard from '../components/wallet/WalletDashboard';
import ReceiveSection from '../components/wallet/ReceiveSection';
import SendForm from '../components/wallet/SendForm';
import PasskeyAuthModal from '../components/wallet/PasskeyAuthModal';
import { Shield, Lock, Eye, EyeOff, Wallet as WalletIcon, AlertTriangle } from 'lucide-react';

type WalletTab = 'dashboard' | 'send' | 'receive' | 'settings';

export default function WalletPage() {
  const [activeTab, setActiveTab] = useState<WalletTab>('dashboard');
  const [hideBalances, setHideBalances] = useState(true);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [isPasskeyAuthenticated, setIsPasskeyAuthenticated] = useState(false);
  const [selectedChain, setSelectedChain] = useState<'ethereum' | 'solana'>('ethereum');

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  // Check for existing passkey session on mount
  useEffect(() => {
    const passkeySession = sessionStorage.getItem('passkey_authenticated');
    if (passkeySession === 'true') {
      setIsPasskeyAuthenticated(true);
    }
  }, []);

  const handlePasskeySuccess = () => {
    setIsPasskeyAuthenticated(true);
    sessionStorage.setItem('passkey_authenticated', 'true');
    setShowPasskeyModal(false);
  };

  const handleConnect = (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      connect({ connector });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Security Banner */}
      <div className="bg-gradient-to-r from-emerald-900/50 to-cyan-900/50 border-b border-emerald-700/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-300">
            Non-custodial • Quantum-secure • Your keys never leave your device
          </span>
          <Lock className="w-4 h-4 text-emerald-400" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              BearTec Sovereign Wallet
            </h1>
            <p className="text-gray-400 mt-2">
              Post-quantum secure, multi-chain, non-custodial
            </p>
          </div>

          <div className="flex items-center gap-4">
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
              onChange={(e) => setSelectedChain(e.target.value as 'ethereum' | 'solana')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ethereum">Ethereum (Sepolia)</option>
              <option value="solana">Solana (Devnet)</option>
            </select>

            {/* Passkey Auth Status */}
            {isPasskeyAuthenticated ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-emerald-400">Passkey Active</span>
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
          </div>
        </div>

        {/* Connection Status */}
        {!isConnected ? (
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
                <img src="/metamask-icon.svg" alt="MetaMask" className="w-6 h-6" onError={(e) => e.currentTarget.style.display = 'none'} />
                <span className="font-medium">MetaMask</span>
              </button>

              <button
                onClick={() => handleConnect('walletConnect')}
                disabled={isPending}
                className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <img src="/walletconnect-icon.svg" alt="WalletConnect" className="w-6 h-6" onError={(e) => e.currentTarget.style.display = 'none'} />
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
                className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors"
              >
                <Lock className="w-6 h-6" />
                <span className="font-medium">Create Sovereign Wallet with Passkey</span>
              </button>
            </div>

            {/* Security Notice */}
            <div className="mt-8 p-4 rounded-xl bg-gray-900/50 border border-gray-700 max-w-2xl mx-auto">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-400">
                  <p className="font-medium text-amber-400 mb-1">Security Notice</p>
                  <p>
                    Your private keys are generated and stored securely on your device using WebAuthn passkeys.
                    We never have access to your keys or funds. All signing happens client-side with hybrid
                    post-quantum cryptography (ML-DSA + ECDSA) for future-proof security.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Connected Wallet Info */}
            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400" />
                <div>
                  <p className="text-sm text-gray-400">Connected</p>
                  <p className="font-mono text-sm">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => disconnect()}
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
                  address={address}
                  balance={balance}
                  hideBalances={hideBalances}
                  selectedChain={selectedChain}
                />
              )}
              {activeTab === 'send' && (
                <SendForm
                  isPasskeyAuthenticated={isPasskeyAuthenticated}
                  onRequestPasskey={() => setShowPasskeyModal(true)}
                  selectedChain={selectedChain}
                />
              )}
              {activeTab === 'receive' && (
                <ReceiveSection address={address} />
              )}
              {activeTab === 'settings' && (
                <SettingsSection />
              )}
            </div>
          </>
        )}
      </div>

      {/* Passkey Auth Modal */}
      {showPasskeyModal && (
        <PasskeyAuthModal
          onClose={() => setShowPasskeyModal(false)}
          onSuccess={handlePasskeySuccess}
        />
      )}
    </div>
  );
}

// Settings Section Component (inline for simplicity)
function SettingsSection() {
  const [showMnemonicWarning, setShowMnemonicWarning] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Wallet Settings</h2>

      {/* Security Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-300">Security</h3>
        
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
              <p className="font-medium">Post-Quantum Signatures</p>
              <p className="text-sm text-gray-400">Hybrid ML-DSA + ECDSA enabled</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
        </div>
      </div>

      {/* Advanced (Mnemonic Export) */}
      <div className="pt-6 border-t border-gray-700">
        <h3 className="text-lg font-medium text-gray-300 mb-4">Advanced</h3>
        
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-400">Recovery Phrase Export</p>
              <p className="text-sm text-gray-400 mt-1">
                Export a BIP-39 mnemonic for backup purposes only. Never share this with anyone.
                Your passkey remains the primary authentication method.
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
                    <div className="p-4 rounded-lg bg-gray-900 font-mono text-sm break-all">
                      {/* In production, this would be derived from the actual key */}
                      abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
