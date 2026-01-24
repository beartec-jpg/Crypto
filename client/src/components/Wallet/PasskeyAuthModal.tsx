// client/src/components/Wallet/PasskeyAuthModal.tsx
// Passkey authentication modal with create/import wallet options

import { useState, useEffect } from 'react';
import { Lock, Shield, Key, AlertTriangle, Eye, EyeOff, Check, X, Import, Plus } from 'lucide-react';
import { 
  createWallet, 
  importWallet, 
  validateMnemonic, 
  markMnemonicBackedUp,
  hasExistingWallet 
} from '@/lib/walletService';
import { 
  registerPasskey, 
  authenticateWithPasskey, 
  isPasskeyRegistered,
  isWebAuthnSupported 
} from '@/lib/passkeyService';

interface PasskeyAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
  userId: string; // Add this
}

type ModalMode = 'choose' | 'create' | 'import' | 'backup' | 'authenticate';

export default function PasskeyAuthModal({ onClose, onSuccess, userId }: PasskeyAuthModalProps) {
  const [mode, setMode] = useState<ModalMode>('choose');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);
  
  // Import wallet state
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  
  // Backup state (for new wallet creation)
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);

  useEffect(() => {
    // Check WebAuthn support
    setWebAuthnSupported(isWebAuthnSupported());
    
    // Check if passkey already registered (returning user)
    const checkExisting = async () => {
      const hasWallet = await hasExistingWallet();
      if (hasWallet && isPasskeyRegistered()) {
        setMode('authenticate');
      }
    };
    checkExisting();
  }, []);

  const validatePassword = (): boolean => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (mode === 'create' && password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleCreateWallet = async () => {
    if (!validatePassword()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Pass userId to createWallet
      const wallet = await createWallet(password, userId);
      
      // Store for backup step
      setGeneratedMnemonic(wallet.mnemonic);
      setWalletId(wallet.id);
      
      // Register passkey
      if (webAuthnSupported) {
        try {
          await registerPasskey('wallet_user');
        } catch (passkeyError) {
          console.warn('Passkey registration failed, continuing with password-only:', passkeyError);
        }
      }
      
      // Move to backup step
      setMode('backup');
      
    } catch (err: any) {
      setError(err.message || 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportWallet = async () => {
    if (!validatePassword()) return;
    
    // Validate mnemonic first
    const validation = validateMnemonic(mnemonicInput);
    if (!validation.valid) {
      setMnemonicError(validation.error || 'Invalid recovery phrase');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setMnemonicError(null);
    
    try {
      // Pass userId to importWallet
      await importWallet(mnemonicInput, password, userId);
      
      // Register passkey
      if (webAuthnSupported) {
        try {
          await registerPasskey('wallet_user');
        } catch (passkeyError) {
          console.warn('Passkey registration failed, continuing with password-only:', passkeyError);
        }
      }
      
      // Clear sensitive data
      setMnemonicInput('');
      setPassword('');
      
      onSuccess();
      
    } catch (err: any) {
      setError(err.message || 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await authenticateWithPasskey();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupComplete = async () => {
    if (!backupConfirmed) {
      setError('Please confirm you have saved your recovery phrase');
      return;
    }
    
    if (walletId) {
      await markMnemonicBackedUp(walletId);
    }
    
    // Clear sensitive data
    setGeneratedMnemonic(null);
    setPassword('');
    setConfirmPassword('');
    
    onSuccess();
  };

  const copyMnemonic = () => {
    if (generatedMnemonic) {
      navigator.clipboard.writeText(generatedMnemonic);
      setMnemonicCopied(true);
      setTimeout(() => setMnemonicCopied(false), 3000);
    }
  };

  const renderMnemonicWords = (mnemonic: string) => {
    const words = mnemonic.split(' ');
    return (
      <div className="grid grid-cols-3 gap-2 p-4 bg-gray-900 rounded-lg">
        {words.map((word, index) => (
          <div 
            key={index} 
            className="flex items-center gap-2 p-2 bg-gray-800 rounded text-sm"
          >
            <span className="text-gray-500 w-6">{index + 1}.</span>
            <span className="text-white font-mono">{word}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              {mode === 'backup' ? <Key className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {mode === 'choose' && 'Sovereign Wallet'}
                {mode === 'create' && 'Create New Wallet'}
                {mode === 'import' && 'Import Wallet'}
                {mode === 'backup' && 'Backup Recovery Phrase'}
                {mode === 'authenticate' && 'Unlock Wallet'}
              </h2>
              <p className="text-sm text-gray-400">
                {mode === 'choose' && 'Create or import your wallet'}
                {mode === 'create' && 'Set a strong password'}
                {mode === 'import' && 'Enter your 12 or 24 word phrase'}
                {mode === 'backup' && 'Write down these words safely'}
                {mode === 'authenticate' && 'Verify your identity'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Choose Mode */}
          {mode === 'choose' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('create')}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-semibold">Create New Wallet</p>
                  <p className="text-sm text-white/70">Generate a new multi-chain wallet</p>
                </div>
              </button>

              <button
                onClick={() => setMode('import')}
                className="w-full p-4 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
                  <Import className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-semibold">Import Existing Wallet</p>
                  <p className="text-sm text-gray-400">Restore with recovery phrase</p>
                </div>
              </button>

              <div className="mt-6 p-4 rounded-xl bg-gray-900/50 border border-gray-700">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-400">
                    <p className="font-medium text-emerald-400 mb-1">Your Keys, Your Crypto</p>
                    <p>
                      Your private keys are encrypted and stored locally on this device.
                      We never have access to your funds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Wallet */}
          {mode === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a strong password"
                    className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setMode('choose')}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateWallet}
                  disabled={isLoading || !password || !confirmPassword}
                  className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      Create Wallet
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Import Wallet */}
          {mode === 'import' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Recovery Phrase
                </label>
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => {
                    setMnemonicInput(e.target.value);
                    setMnemonicError(null);
                  }}
                  placeholder="Enter your 12 or 24 word recovery phrase, separated by spaces"
                  rows={4}
                  className={`w-full px-4 py-3 rounded-lg bg-gray-900 border ${
                    mnemonicError ? 'border-red-500' : 'border-gray-700'
                  } focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-sm`}
                />
                {mnemonicError && (
                  <p className="mt-1 text-sm text-red-400">{mnemonicError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Words: {mnemonicInput.trim() ? mnemonicInput.trim().split(/\s+/).length : 0}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set a password for this device"
                    className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700/50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    Never share your recovery phrase. Anyone with these words can access your funds.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setMode('choose');
                    setMnemonicInput('');
                    setMnemonicError(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImportWallet}
                  disabled={isLoading || !mnemonicInput || !password || !confirmPassword}
                  className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Import className="w-5 h-5" />
                      Import Wallet
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Backup Mnemonic */}
          {mode === 'backup' && generatedMnemonic && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-400">Write these words down!</p>
                    <p className="text-sm text-red-300 mt-1">
                      This is the ONLY way to recover your wallet. Store it safely offline.
                      Never share it with anyone.
                    </p>
                  </div>
                </div>
              </div>

              {renderMnemonicWords(generatedMnemonic)}

              <button
                onClick={copyMnemonic}
                className="w-full px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
              >
                {mnemonicCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>

              <label className="flex items-start gap-3 p-4 rounded-lg bg-gray-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-300">
                  I have written down my recovery phrase and stored it in a safe place.
                  I understand that losing this phrase means losing access to my funds.
                </span>
              </label>

              <button
                onClick={handleBackupComplete}
                disabled={!backupConfirmed}
                className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Shield className="w-5 h-5" />
                I've Backed Up My Phrase
              </button>
            </div>
          )}

          {/* Authenticate */}
          {mode === 'authenticate' && (
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-900/30 border border-emerald-700/50 flex items-center justify-center mb-4">
                  <Lock className="w-10 h-10 text-emerald-400" />
                </div>
                <p className="text-gray-400">
                  Use your passkey or biometrics to unlock your wallet
                </p>
              </div>

              <button
                onClick={handleAuthenticate}
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Unlock with Passkey
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  onClick={() => setMode('import')}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Restore from recovery phrase instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
