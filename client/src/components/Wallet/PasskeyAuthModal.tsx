// PasskeyAuthModal — single-tap wallet creation + cold signer import.
// No mnemonic. No password. One biometric tap = wallet ready, backed by Google/Apple.

import { useState, useEffect } from 'react';
import { Fingerprint, Snowflake, QrCode, X, AlertTriangle, Loader, CheckCircle } from 'lucide-react';
import { registerPasskeyWithPRF, authenticateWithPasskeyPRF, b64uEncodePasskey } from '@/lib/passkeyService';
import {
  createWalletFromPasskey,
  createWatchOnlyWallet,
  getWalletType,
  getWalletCredentialId,
  getCurrentWallet,
  migrateToPasskey,
  unlockWallet,
  updateWalletCredentialId,
} from '@/lib/walletService';
import type { Wallet } from '@/lib/walletService';

// Re-export wallet type for callers
export type { Wallet };

interface ColdPubKeysPayload {
  type: 'qbtc-cold-pubkeys';
  v: 1;
  address: string;
  ecdsaPub: string;
  falconPub: string;
  network: 'testnet' | 'mainnet';
}

interface PasskeyAuthModalProps {
  userId: string;
  onClose: () => void;
  /** Called on success with the session masterSeed (null for watch-only) and loaded wallet */
  onSuccess: (masterSeed: Uint8Array | null, wallet: Wallet) => void;
}

type Step = 'choose' | 'migrate-password' | 'use-password' | 'creating' | 'unlocking' | 'scanning' | 'done' | 'error';

export default function PasskeyAuthModal({ userId, onClose, onSuccess }: PasskeyAuthModalProps) {
  const [step, setStep] = useState<Step>('choose');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [legacyPassword, setLegacyPassword] = useState('');
  const [fallbackPassword, setFallbackPassword] = useState('');
  const [showPasskeyRetry, setShowPasskeyRetry] = useState(false);

  // ── Password fallback (when passkey unavailable on this device) ————————————
  async function handlePasswordFallback() {
    setError('');
    setStep('creating');
    setStatus('Unlocking wallet…');
    try {
      const wallet = await getCurrentWallet(userId);
      if (!wallet) throw new Error('No wallet found');
      await unlockWallet(wallet.id, fallbackPassword);
      // Clear stale credential ID so next passkey attempt uses full picker
      updateWalletCredentialId(wallet.id, '').catch(() => {});
      // Mark session as authenticated so security requirement checks pass
      sessionStorage.setItem('passkey_authenticated', 'true');
      sessionStorage.setItem('passkey_auth_time', Date.now().toString());
      setStep('done');
      onSuccess(null, wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Incorrect password');
      setStep('use-password');
    }
  }

  // ── Try passkey with empty allowCredentials (full picker) ———————————————
  async function handleTryPasskeyList() {
    setStep('unlocking');
    setStatus('Select your passkey from the list…');
    try {
      // No credential ID — Chrome shows full local passkey picker
      const { masterSeed, credentialId } = await authenticateWithPasskeyPRF();
      const wallet = await getCurrentWallet(userId);
      if (!wallet) throw new Error('Wallet record missing');
      // Self-heal: store the ID that actually worked
      await updateWalletCredentialId(wallet.id, b64uEncodePasskey(credentialId));
      setStep('done');
      onSuccess(masterSeed, wallet);
    } catch (err: any) {
      setShowPasskeyRetry(true);
      if (err?.name === 'NotAllowedError') {
        setError('Passkey selection cancelled. You can try again or use your password below.');
      } else if (err?.name === 'OperationError') {
        setError('Decryption failed — the selected passkey doesn\'t match this wallet. Please use your password.');
        setShowPasskeyRetry(false);
      } else if (err?.message?.includes('PRF extension not available')) {
        setError('This passkey doesn\'t support the required extension. Please use your password on this device.');
        setShowPasskeyRetry(false);
      } else {
        setError(err?.message || 'Passkey authentication failed. Please use your password.');
      }
      setStep('use-password');
    }
  }
  async function handleCreateWallet(migrateWithPassword?: string) {
    setError('');
    setStep('creating');
    setStatus('Authenticating…');
    try {
      const rpId = window.location.hostname.split('.').slice(-2).join('.') || window.location.hostname;

      // 1. Check for existing passkey wallet — unlock instead of recreate
      const existingType = await getWalletType(userId);
      if (existingType === 'passkey') {
        setStep('unlocking');
        setStatus('Authenticating…');

        const storedCredentialIdB64 = await getWalletCredentialId(userId);
        try {
          // Pass stored ID so Chrome uses the local PIN prompt instead of QR
          const { masterSeed, credentialId } = await authenticateWithPasskeyPRF(storedCredentialIdB64 ?? undefined);

          // Verify the right passkey was used before attempting decryption
          if (storedCredentialIdB64) {
            const returnedB64 = b64uEncodePasskey(credentialId);
            if (returnedB64 !== storedCredentialIdB64) {
              setError(
                'Wrong passkey selected. Please try again and select the correct passkey, or use your wallet password below.'
              );
              setShowPasskeyRetry(true);
              setStep('use-password');
              return;
            }
          }

          const wallet = await getCurrentWallet(userId);
          if (!wallet) throw new Error('Wallet record missing');

          // Self-heal: store the actual credential ID from this auth
          await updateWalletCredentialId(wallet.id, b64uEncodePasskey(credentialId));

          setStep('done');
          onSuccess(masterSeed, wallet);
        } catch (authErr: any) {
          if (authErr?.name === 'OperationError') {
            // AES-GCM decryption failed — safety net
            setError('Decryption failed — the selected passkey doesn\'t match this wallet. Use your wallet password instead.');
            setStep('use-password');
          } else if (authErr?.name === 'NotAllowedError') {
            // Chrome showed QR (couldn\'t find the specific passkey locally) and user cancelled.
            // Clear the stale stored ID so next attempt uses the full picker.
            getCurrentWallet(userId).then(w => {
              if (w) updateWalletCredentialId(w.id, '').catch(() => {});
            }).catch(() => {});
            setShowPasskeyRetry(true);
            setError(
              'Your passkey wasn\'t found on this device automatically. ' +
              'Try selecting it from the list, or use your wallet password.'
            );
            setStep('use-password');
          } else if (authErr?.message?.includes('PRF extension not available')) {
            setError(
              'This passkey doesn\'t support the required PRF extension. ' +
              'Please use your wallet password on this device.'
            );
            setStep('use-password');
          } else {
            throw authErr;
          }
        }
        return;
      }

      // 2. Register new passkey + derive master seed via PRF
      setStatus('Registering passkey…');
      const { credentialId, masterSeed } = await registerPasskeyWithPRF(userId);

      // 3a. Legacy wallet: migrate in-place (same addresses, re-encrypted with PRF)
      if (existingType === 'legacy') {
        const pwd = migrateWithPassword ?? legacyPassword;
        if (!pwd) throw new Error('Password required for migration');
        setStatus('Re-encrypting wallet with passkey…');
        const wallet = await migrateToPasskey(userId, masterSeed, credentialId, rpId, pwd);
        setStep('done');
        onSuccess(masterSeed, wallet);
        return;
      }

      // 3b. Watch-only or no wallet: fresh passkey wallet
      setStatus('Deriving addresses…');
      const wallet = await createWalletFromPasskey(userId, masterSeed, credentialId, rpId);

      setStep('done');
      onSuccess(masterSeed, wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
      setStep('error');
    }
  }

  // ── Scan cold signer QR ─────────────────────────────────────────────────────
  async function handleColdScan(raw: string) {
    setError('');
    try {
      const payload = JSON.parse(raw) as ColdPubKeysPayload;
      if (payload.type !== 'qbtc-cold-pubkeys' || payload.v !== 1) {
        throw new Error('Not a valid cold signer QR code');
      }
      setStatus('Saving watch-only wallet…');
      // Build addresses from cold signer qBTC address only; other chains not applicable
      const addresses = {
        ethereum: '',
        bitcoin: '',
        bitcoinTestnet: '',
        bsc: '',
        xrp: '',
        xrpTestnet: '',
        solana: '',
        solanaTestnet: '',
        qbtc: payload.address,
        qbtcMainnet: payload.network === 'mainnet' ? payload.address : '',
      };
      const publicKeys = {
        ethereum: '',
        bitcoin: '',
        bsc: '',
        xrp: '',
        solana: '',
        qbtc: payload.ecdsaPub,
      };
      const wallet = await createWatchOnlyWallet(userId, addresses, publicKeys);
      setStep('done');
      onSuccess(null, wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid QR code');
    }
  }

  // ── QR Scanner (simple video-based) ────────────────────────────────────────
  // We use a hidden video + canvas to decode — delegate to jsQR if available
  // otherwise show manual paste fallback.
  const [qrInput, setQrInput] = useState('');
  function handleQrPaste() {
    if (!qrInput.trim()) return;
    handleColdScan(qrInput.trim());
  }

  // ── Spinner ─────────────────────────────────────────────────────────────────
  if (step === 'migrate-password') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-2xl max-w-sm w-full p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Fingerprint size={24} className="text-amber-400" />
            <div>
              <p className="text-white font-semibold">Migrate to Passkey</p>
              <p className="text-xs text-gray-400">Enter your current password, then touch your sensor</p>
            </div>
          </div>
          <p className="text-sm text-amber-200/70">
            Your existing addresses are kept — no need to move funds. The passkey simply replaces the password as your unlock method.
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Current wallet password</label>
            <input
              type="password"
              autoFocus
              value={legacyPassword}
              onChange={e => setLegacyPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && legacyPassword) handleCreateWallet(legacyPassword); }}
              placeholder="Enter your password"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 focus:border-amber-500 focus:outline-none text-sm"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={() => handleCreateWallet(legacyPassword)}
            disabled={!legacyPassword}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2"
          >
            <Fingerprint size={18} /> Continue — Touch Sensor
          </button>
          <button onClick={() => { setStep('choose'); setError(''); setLegacyPassword(''); }} className="text-gray-500 text-xs text-center">Back</button>
        </div>
      </div>
    );
  }

  if (step === 'creating' || step === 'unlocking') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-2xl max-w-sm w-full p-8 text-center flex flex-col items-center gap-5">
          <Loader size={40} className="text-emerald-400 animate-spin" />
          <p className="text-gray-300 text-sm">{status}</p>
          {step === 'unlocking' && (
            <p className="text-xs text-gray-500">
              If Chrome shows a QR code, scan it with the phone that has your passkey, then use biometrics on that device.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-2xl max-w-sm w-full p-8 text-center flex flex-col items-center gap-5">
          <CheckCircle size={40} className="text-emerald-400" />
          <p className="text-white font-semibold">Wallet Ready</p>
        </div>
      </div>
    );
  }

  if (step === 'use-password') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-2xl max-w-sm w-full p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-white font-semibold">Use wallet password</p>
              <p className="text-xs text-gray-400 mt-0.5">Enter the password you used before setting up your passkey</p>
            </div>
          </div>
          {error && <p className="text-xs text-red-400 bg-red-900/20 rounded-xl p-3">{error}</p>}
          {showPasskeyRetry && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleTryPasskeyList}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2"
              >
                <Fingerprint size={18} /> Select passkey from list
              </button>
              <p className="text-center text-xs text-gray-500">— or use your password below —</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Wallet password</label>
            <input
              type="password"
              autoFocus
              value={fallbackPassword}
              onChange={e => setFallbackPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && fallbackPassword) handlePasswordFallback(); }}
              placeholder="Enter your password"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 focus:border-amber-500 focus:outline-none text-sm"
            />
          </div>
          <button
            onClick={handlePasswordFallback}
            disabled={!fallbackPassword}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold"
          >
            Unlock Wallet
          </button>
          <p className="text-xs text-gray-500 text-center">
            You can re-register your passkey from Settings after logging in.
          </p>
          <button onClick={() => { setStep('choose'); setError(''); setFallbackPassword(''); setShowPasskeyRetry(false); }} className="text-gray-500 text-xs text-center">Back</button>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-2xl max-w-sm w-full p-8 flex flex-col gap-5">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle size={24} />
            <span className="font-semibold">Setup Failed</span>
          </div>
          <p className="text-gray-400 text-sm">{error}</p>
          {error.includes('PRF') && (
            <p className="text-xs text-amber-400 bg-amber-900/20 rounded-xl p-3">
              PRF extension requires Chrome 115+, Safari 17.4+, or Firefox 119+ with a platform
              authenticator (fingerprint / Face ID). Hardware security keys may not support PRF.
            </p>
          )}
          <button
            onClick={() => { setStep('choose'); setError(''); }}
            className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white"
          >
            Try Again
          </button>
          <button
            onClick={() => { setStep('use-password'); setError(''); }}
            className="w-full py-3 rounded-xl border border-amber-700/40 text-amber-400 text-sm hover:bg-amber-900/20"
          >
            Use wallet password instead
          </button>
          <button onClick={onClose} className="text-gray-500 text-sm text-center">Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'scanning') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-2xl max-w-sm w-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="text-white font-semibold text-sm">Scan Cold Signer QR</h2>
            <button onClick={() => setStep('choose')} className="text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-gray-400 text-sm">
              In the cold signer app, press <strong className="text-white">"Export to Web"</strong> to show
              the QR code, then paste its JSON content below.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}
            <textarea
              value={qrInput}
              onChange={e => setQrInput(e.target.value)}
              placeholder={'{"type":"qbtc-cold-pubkeys","v":1,...}'}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-cyan-500 resize-none"
            />
            <button
              onClick={handleQrPaste}
              disabled={!qrInput.trim()}
              className="w-full py-3 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-semibold disabled:opacity-40"
            >
              Import Cold Signer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Choose ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl max-w-sm w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Secure Wallet</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <ChooseOptions
            userId={userId}
            onPasskey={() => {
              getWalletType(userId).then(type => {
                if (type === 'legacy') setStep('migrate-password');
                else handleCreateWallet();
              });
            }}
            onPassword={() => { setStep('use-password'); setShowPasskeyRetry(false); setError(''); }}
            onColdSigner={() => setStep('scanning')}
          />
        </div>
      </div>
    </div>
  );
}

// ── Async choose panel — auto-fires passkey for existing passkey wallets ──────
function ChooseOptions({
  userId,
  onPasskey,
  onPassword,
  onColdSigner,
}: {
  userId: string;
  onPasskey: () => void;
  onPassword: () => void;
  onColdSigner: () => void;
}) {
  const [walletType, setWalletType] = useState<string | null>(null);
  const [autoFired, setAutoFired] = useState(false);

  useEffect(() => {
    getWalletType(userId).then(t => setWalletType(t ?? 'none')).catch(() => setWalletType('none'));
  }, [userId]);

  // Auto-fire passkey for existing passkey wallets — no button press needed
  useEffect(() => {
    if (walletType === 'passkey' && !autoFired) {
      setAutoFired(true);
      onPasskey();
    }
  }, [walletType, autoFired, onPasskey]);

  // While loading wallet type (or after auto-firing passkey), show spinner
  if (walletType === null || walletType === 'passkey') {
    return (
      <>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader size={32} className="text-emerald-400 animate-spin" />
          <p className="text-gray-400 text-sm">Waiting for passkey…</p>
        </div>
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={onPassword}
            className="text-gray-500 hover:text-amber-400 text-xs text-center transition-colors"
          >
            Use wallet password instead
          </button>
          <button
            onClick={onColdSigner}
            className="text-gray-600 hover:text-gray-300 text-xs text-center"
          >
            Import from Cold Signer
          </button>
        </div>
      </>
    );
  }

  // New wallet / legacy wallet — passkey-first
  return (
    <>
      <button
        onClick={onPasskey}
        className="w-full flex items-start gap-4 p-5 rounded-2xl bg-gradient-to-br from-emerald-900/60 to-cyan-900/60
                   hover:from-emerald-800/60 hover:to-cyan-800/60 border border-emerald-700/40 text-left transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
          <Fingerprint size={22} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-white font-semibold">Create / Open with Passkey</p>
          <p className="text-gray-400 text-sm mt-0.5">
            One biometric tap. Backed by Google or Apple account. No seed phrase.
          </p>
        </div>
      </button>

      <button
        onClick={onColdSigner}
        className="w-full flex items-start gap-4 p-5 rounded-2xl bg-gray-800 hover:bg-gray-750
                   border border-gray-700 text-left transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
          <Snowflake size={22} className="text-blue-400" />
        </div>
        <div>
          <p className="text-white font-semibold">Import from Cold Signer</p>
          <p className="text-gray-400 text-sm mt-0.5">
            Keys stay offline. Watch balance here, sign on your air-gapped device.
          </p>
        </div>
      </button>

      <p className="text-center text-gray-600 text-xs mt-2">
        No seed phrases. No passwords. Nothing to lose.
      </p>
      <button
        onClick={onPassword}
        className="text-gray-500 hover:text-gray-300 text-xs text-center underline underline-offset-2"
      >
        Passkey not working? Use wallet password
      </button>
    </>
  );
}
