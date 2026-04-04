// client/src/components/Wallet/PasskeyAuthModal.tsx
// Passkey authentication modal with create/import wallet options

import { useState, useEffect } from 'react';
import { Lock, Shield, Key, AlertTriangle, Eye, EyeOff, Check, X, Import, Plus } from 'lucide-react';
import { 
  createWallet, 
  importWallet, 
  validateMnemonic, 
  markMnemonicBackedUp,
  hasExistingWallet,
  removeAllWalletsForUser
} from '@/lib/walletService';
import { reconstructMnemonic, splitMnemonic } from '@/lib/shamirService';
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
  const [importMethod, setImportMethod] = useState<'mnemonic' | 'shamir'>('mnemonic');
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [shamirShareA, setShamirShareA] = useState('');
  const [shamirShareB, setShamirShareB] = useState('');
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  
  // Backup state (for new wallet creation)
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [shamirShares, setShamirShares] = useState<string[] | null>(null);
  const [shamirCopied, setShamirCopied] = useState<number | null>(null);
  const [showShamirBackup, setShowShamirBackup] = useState(false);

  useEffect(() => {
    // Check WebAuthn support
    setWebAuthnSupported(isWebAuthnSupported());
    
    // Check if passkey already registered (returning user)
    const checkExisting = async () => {
      const hasWallet = await hasExistingWallet(userId);
      if (hasWallet && isPasskeyRegistered()) {
        setMode('authenticate');
      }
    };
    checkExisting();
  }, [userId]);

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
          await registerPasskey(userId);
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

    let recoveredMnemonic = '';
    if (importMethod === 'mnemonic') {
      const validation = validateMnemonic(mnemonicInput);
      if (!validation.valid) {
        setMnemonicError(validation.error || 'Invalid recovery phrase');
        return;
      }
      recoveredMnemonic = mnemonicInput;
    } else {
      const shareA = shamirShareA.trim();
      const shareB = shamirShareB.trim();
      if (!shareA || !shareB) {
        setMnemonicError('Enter 2 Shamir shares to reconstruct your wallet phrase.');
        return;
      }

      try {
        // Validate share format: secrets.js shares for a mnemonic are ~280+ chars long.
        // 64-char shares are QBTC ECDSA key splits and cannot reconstruct a mnemonic.
        if (shareA.length < 100 || shareB.length < 100) {
          setMnemonicError(
            `Invalid share format. Shares should be ~280+ characters long (yours are ${shareA.length} and ${shareB.length} chars). ` +
            `These may be QBTC key shares, not mnemonic recovery shares. Use your written recovery phrase instead.`
          );
          return;
        }
        recoveredMnemonic = reconstructMnemonic([shareA, shareB]);
      } catch (error: any) {
        setMnemonicError(error?.message || 'Failed to reconstruct mnemonic from shares');
        return;
      }

      const validation = validateMnemonic(recoveredMnemonic);
      if (!validation.valid) {
        setMnemonicError('Recovered phrase is invalid. Check your shares and try again.');
        return;
      }
    }
    
    setIsLoading(true);
    setError(null);
    setMnemonicError(null);
    
    try {
      // Pass userId to importWallet
      await importWallet(recoveredMnemonic, password, userId);
      
      // Register passkey
      if (webAuthnSupported) {
        try {
          await registerPasskey(userId);
        } catch (passkeyError) {
          console.warn('Passkey registration failed, continuing with password-only:', passkeyError);
        }
      }
      
      // Clear sensitive data
      setMnemonicInput('');
      setShamirShareA('');
      setShamirShareB('');
      setPassword('');
      
      onSuccess();
      
    } catch (err: any) {
      setError(err.message || 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveWallet = async () => {
    if (!window.confirm('Remove this wallet from the device? Your funds are safe — you can restore with your recovery phrase. This cannot be undone on this device.')) return;
    try {
      await removeAllWalletsForUser(userId);
      // Reload the page so useEffect re-evaluates with clean state
      window.location.reload();
    } catch (err: any) {
      // Even if cleanup threw, localStorage was already wiped — reload anyway
      window.location.reload();
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
                  <p className="text-sm text-gray-400">Restore with recovery phrase or Shamir shares</p>
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
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-gray-900 border border-gray-700">
                <button
                  onClick={() => {
                    setImportMethod('mnemonic');
                    setMnemonicError(null);
                  }}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    importMethod === 'mnemonic'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Recovery Phrase
                </button>
                <button
                  onClick={() => {
                    setImportMethod('shamir');
                    setMnemonicError(null);
                  }}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    importMethod === 'shamir'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Shamir (2 shares)
                </button>
              </div>

              {importMethod === 'mnemonic' ? (
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
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Shamir Share 1
                    </label>
                    <textarea
                      value={shamirShareA}
                      onChange={(e) => {
                        setShamirShareA(e.target.value.trim());
                        setMnemonicError(null);
                      }}
                      placeholder="Paste first Shamir share"
                      rows={3}
                      className={`w-full px-4 py-3 rounded-lg bg-gray-900 border ${
                        mnemonicError ? 'border-red-500' : 'border-gray-700'
                      } focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Shamir Share 2
                    </label>
                    <textarea
                      value={shamirShareB}
                      onChange={(e) => {
                        setShamirShareB(e.target.value.trim());
                        setMnemonicError(null);
                      }}
                      placeholder="Paste second Shamir share"
                      rows={3}
                      className={`w-full px-4 py-3 rounded-lg bg-gray-900 border ${
                        mnemonicError ? 'border-red-500' : 'border-gray-700'
                      } focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-xs`}
                    />
                  </div>

                  {mnemonicError && (
                    <p className="text-sm text-red-400">{mnemonicError}</p>
                  )}
                  <div className="rounded-lg border border-cyan-700/40 bg-cyan-900/20 p-3 text-xs text-cyan-100 space-y-1">
                    <p className="font-semibold text-cyan-300">Shamir Recovery Help</p>
                    <p>Use any 2 shares from the same 2-of-3 backup set.</p>
                    <p>Paste each full share string exactly as saved (no edits).</p>
                    <p>If reconstruction fails, one share is from a different set or was altered.</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Enter any 2 valid shares from your 2-of-3 backup set.
                  </p>
                </div>
              )}

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
                    Never share your recovery phrase or Shamir shares. Anyone with enough recovery material can access your funds.
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
                  disabled={
                    isLoading ||
                    !password ||
                    !confirmPassword ||
                    (importMethod === 'mnemonic' ? !mnemonicInput : (!shamirShareA || !shamirShareB))
                  }
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

              {/* Shamir Backup Option */}
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => {
                    setShowShamirBackup(v => !v);
                    if (!shamirShares && generatedMnemonic) {
                      setShamirShares(splitMnemonic(generatedMnemonic, { shares: 3, threshold: 2 }));
                    }
                  }}
                  className="w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2 text-emerald-400">
                    <Shield className="w-4 h-4" />
                    Generate Shamir Shares (optional)
                  </span>
                  <span className="text-gray-500 text-xs">{showShamirBackup ? '▲ hide' : '▼ show'}</span>
                </button>
                {showShamirBackup && shamirShares && (
                  <div className="p-4 space-y-3 bg-gray-900/50">
                    <p className="text-xs text-gray-400">
                      Any 2 of these 3 shares can reconstruct your wallet. Store each in a different secure location.
                    </p>
                    {shamirShares.map((share, i) => (
                      <div key={i} className="bg-gray-900 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-300">Share {i + 1}{i === 0 ? ' (keep here)' : i === 1 ? ' (cold storage)' : ' (paper backup)'}</span>
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(share);
                              setShamirCopied(i);
                              setTimeout(() => setShamirCopied(null), 2000);
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            {shamirCopied === i ? <><Check className="w-3 h-3" /> Copied</> : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs font-mono text-gray-400 break-all leading-relaxed">{share}</p>
                      </div>
                    ))}
                    <p className="text-xs text-yellow-500">⚠ These shares reconstruct your full wallet. Treat each one like a private key.</p>
                  </div>
                )}
              </div>

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

              <div className="text-center space-y-2">
                <button
                  onClick={() => setMode('import')}
                  className="text-sm text-gray-400 hover:text-white transition-colors block w-full"
                >
                  Restore from recovery options instead
                </button>
                <button
                  onClick={() => setMode('create')}
                  className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors block w-full"
                >
                  + Start a new wallet
                </button>
                <button
                  onClick={handleRemoveWallet}
                  className="text-sm text-red-500 hover:text-red-400 transition-colors block w-full pt-2"
                >
                  Remove wallet from this device
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
