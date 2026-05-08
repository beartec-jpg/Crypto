import { useState, useEffect } from 'react';
import { generateMnemonic, mnemonicToSeed } from 'bip39';
import { CheckCircle, Copy, AlertTriangle, Wallet, Download } from 'lucide-react';
import PinSetup from '../components/PinSetup';
import {
  generateSaltHex,
  deriveVaultKey,
  encryptSeed,
} from '../lib/vault';
import { deriveKeyPair, getAddress } from '../lib/keys';
import { saveWallet } from '../storage/walletStore';
import {
  mainWalletExists,
  getMainWalletRecord,
  decryptMainWalletMnemonic,
} from '../lib/mainWalletBridge';

interface OnboardingPageProps {
  onComplete: (masterSeed: Uint8Array, qbtcAddress: string) => void;
}

type Step = 'detecting' | 'intro' | 'import-password' | 'mnemonic' | 'confirm' | 'pin' | 'generating';

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState<Step>('detecting');
  const [hasMainWallet, setHasMainWallet] = useState(false);
  const [mnemonic] = useState(() => generateMnemonic(256)); // 24 words (only used for new wallet flow)
  const [copied, setCopied] = useState(false);
  const [confirmWords, setConfirmWords] = useState<string[]>(Array(24).fill(''));
  const [confirmError, setConfirmError] = useState('');
  const [status, setStatus] = useState('');

  // Import-from-main-wallet state
  const [importPassword, setImportPassword] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  // Pending mnemonic from import — set before going to 'pin'
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);

  // Detect main wallet on mount
  useEffect(() => {
    mainWalletExists().then(exists => {
      setHasMainWallet(exists);
      setStep('intro');
    });
  }, []);

  async function handleImportFromMain(e: React.FormEvent) {
    e.preventDefault();
    setImportLoading(true);
    setImportError('');
    try {
      const record = await getMainWalletRecord();
      if (!record) {
        setImportError('No BearTec wallet found. Make sure you are logged into the main app first.');
        return;
      }
      const mn = await decryptMainWalletMnemonic(record, importPassword.trim());
      setPendingMnemonic(mn);
      setStep('pin');
    } catch (err) {
      console.error('Import failed:', err);
      setImportError('Incorrect password — please try again');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirm() {
    const entered = confirmWords.join(' ').trim();
    if (entered !== mnemonic.trim()) {
      setConfirmError('Words do not match. Please check your backup carefully.');
      return;
    }
    setConfirmError('');
    setStep('pin');
  }

  async function handlePin(pin: string) {
    setStep('generating');
    const mnemonicToUse = pendingMnemonic ?? mnemonic;
    setStatus('Deriving keys…');
    try {
      const seedBuffer = await mnemonicToSeed(mnemonicToUse);
      const masterSeed = new Uint8Array(seedBuffer);

      setStatus('Deriving qBTC key pair…');
      const keyPair = await deriveKeyPair(masterSeed);
      const qbtcAddress = getAddress(keyPair, 'testnet');

      setStatus('Encrypting vault…');
      const saltHex = generateSaltHex();
      const vaultKey = await deriveVaultKey(pin, saltHex);
      const { encryptedSeed, seedIv } = await encryptSeed(masterSeed, vaultKey);

      await saveWallet({
        id: 'main',
        encryptedSeed,
        seedIv,
        saltHex,
        qbtcAddress,
        createdAt: Date.now(),
      });

      onComplete(masterSeed, qbtcAddress);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const words = mnemonic.split(' ');

  // ── detecting ─────────────────────────────────────────────────────────────
  if (step === 'detecting') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── generating ────────────────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-300 text-sm">{status}</p>
        </div>
      </div>
    );
  }

  // ── pin ───────────────────────────────────────────────────────────────────
  if (step === 'pin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
        <div className="w-full max-w-sm">
          <PinSetup onComplete={handlePin} />
        </div>
      </div>
    );
  }

  // ── import password (piggyback off existing wallet) ───────────────────────
  if (step === 'import-password') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div>
            <button onClick={() => setStep('intro')} className="text-slate-400 text-sm mb-4 flex items-center gap-1">
              ← Back
            </button>
            <h2 className="text-xl font-bold text-white">Use Existing Wallet</h2>
            <p className="text-slate-400 text-sm mt-2">
              Enter your BearTec wallet password to import your qBTC keys into this app.
            </p>
          </div>
          <form onSubmit={handleImportFromMain} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="Wallet password"
              value={importPassword}
              onChange={e => setImportPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3
                         text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              autoComplete="current-password"
              autoFocus
            />
            {importError && <p className="text-red-400 text-sm">{importError}</p>}
            <button
              type="submit"
              disabled={!importPassword || importLoading}
              className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importLoading ? 'Importing…' : 'Import'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── confirm (new wallet flow) ─────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 px-6 py-8">
        <div className="flex-1 overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-2">Verify your backup</h2>
          <p className="text-slate-400 text-sm mb-6">
            Type your recovery phrase to confirm you saved it correctly.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {words.map((_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-slate-500 text-xs">#{i + 1}</span>
                <input
                  type="text"
                  value={confirmWords[i]}
                  onChange={e => {
                    const updated = [...confirmWords];
                    updated[i] = e.target.value.trim().toLowerCase();
                    setConfirmWords(updated);
                  }}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm
                             text-slate-100 focus:outline-none focus:border-cyan-500"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
          {confirmError && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
              <AlertTriangle size={16} />
              {confirmError}
            </div>
          )}
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={() => setStep('mnemonic')}
            className="flex-1 py-3 rounded-lg border border-slate-600 text-slate-300 font-semibold">
            Back
          </button>
          <button onClick={handleConfirm}
            className="flex-1 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
            Confirm
          </button>
        </div>
      </div>
    );
  }

  // ── mnemonic (new wallet flow) ────────────────────────────────────────────
  if (step === 'mnemonic') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 px-6 py-8">
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={20} className="text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Recovery Phrase</h2>
          </div>
          <p className="text-slate-400 text-sm mb-5">
            Write down these 24 words in order. This is the only way to recover your wallet.
            Store them offline in a safe place. Never share them.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {words.map((word, i) => (
              <div key={i} className="bg-slate-800 rounded-lg px-2 py-2 flex items-center gap-1">
                <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}.</span>
                <span className="text-slate-100 text-sm font-mono">{word}</span>
              </div>
            ))}
          </div>
          <button onClick={handleCopy} className="flex items-center gap-2 text-cyan-400 text-sm">
            {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
        <div className="pt-4">
          <button onClick={() => setStep('confirm')}
            className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
            I've saved my phrase
          </button>
        </div>
      </div>
    );
  }

  // ── intro ─────────────────────────────────────────────────────────────────
  const deferredPrompt = (window as any).deferredInstallPrompt;

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    (window as any).deferredInstallPrompt = null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
      <div className="w-full max-w-sm text-center flex flex-col gap-6">
        <div>
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
            <span className="text-4xl">₿</span>
          </div>
          <h1 className="text-3xl font-bold text-white">qBTC Wallet</h1>
          <p className="text-slate-400 text-sm mt-2">Quantum-resistant Bitcoin on your device</p>
        </div>
        <div className="flex flex-col gap-3">
          {/* Install to home screen — shown if browser supports it */}
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Install App
            </button>
          )}
          {hasMainWallet && (
            <button
              onClick={() => setStep('import-password')}
              className="w-full py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-base flex items-center justify-center gap-2"
            >
              <Wallet size={20} />
              Use My Existing Wallet
            </button>
          )}
          <button
            onClick={() => setStep('mnemonic')}
            className={`w-full py-4 rounded-xl font-semibold text-base
              ${hasMainWallet
                ? 'border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
          >
            Create New Wallet
          </button>
        </div>
        {hasMainWallet && (
          <p className="text-xs text-slate-500">
            "Use My Existing Wallet" imports your qBTC keys using your BearTec wallet password.
            No new seed phrase needed.
          </p>
        )}
        {/* iOS fallback — no beforeinstallprompt support */}
        {!deferredPrompt && (
          <p className="text-xs text-slate-600">
            On iPhone? Tap <span className="text-slate-400">Share →  Add to Home Screen</span> to install.
          </p>
        )}
      </div>
    </div>
  );
}
