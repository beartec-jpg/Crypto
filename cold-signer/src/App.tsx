import { useCallback, useEffect, useState } from 'react';
import {
  Fingerprint, Snowflake, AlertTriangle, WifiOff,
  Download, X, Loader, Share2, Scan, CheckCircle,
} from 'lucide-react';
import QRScanner from './components/QRScanner';
import QRDisplay from './components/QRDisplay';
import { registerPasskey, unlockWithPasskey } from './lib/passkeyVault';
import { hasColdWallet, saveColdWallet, loadColdWallet } from './lib/coldSignerDb';
import { deriveKeysFromSeed } from './lib/qbtcKeys';
import { signQBTCFromColdKeyPair } from './lib/qbtcSigner';
import {
  b64uEncode, b64uDecode, encodePayload, decodePayload,
  type ColdPubKeysPayload, type ColdUnsignedTxPayload, type ColdSignedTxPayload,
} from './lib/coldSignerProtocol';
import type { ColdKeyPair } from './lib/qbtcKeys';

// ── Install banner ───────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type AppStep =
  | 'loading'
  | 'no-wallet'        // first run — register passkey
  | 'locked'           // has wallet, needs biometric unlock
  | 'ready'            // unlocked — show main screen
  | 'exporting'        // showing pub key QR
  | 'scanning'         // scanning unsigned tx QR
  | 'signing'          // processing signature
  | 'signed';          // showing signed tx QR

export default function App() {
  const [step, setStep] = useState<AppStep>('loading');
  const [keys, setKeys] = useState<ColdKeyPair | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [error, setError] = useState('');
  const [signedQR, setSignedQR] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Online/offline detection
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // PWA install
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Check for existing wallet on mount
  useEffect(() => {
    hasColdWallet().then(has => setStep(has ? 'locked' : 'no-wallet'));
  }, []);

  // ── Registration ────────────────────────────────────────────────────────────
  async function handleCreateWallet() {
    setError('');
    setStep('loading');
    try {
      const rpId = window.location.hostname;
      const { masterSeed, credentialId } = await registerPasskey(rpId, 'qBTC Cold Signer');
      const derived = await deriveKeysFromSeed(masterSeed, 'testnet');

      await saveColdWallet({
        id: 'main',
        credentialIdB64: b64uEncode(credentialId),
        rpId,
        qbtcAddress: derived.address,
        ecdsaPubHex: Buffer.from(derived.ecdsaPub).toString('hex'),
        falconPubHex: Buffer.from(derived.falconPub).toString('hex'),
        network: 'testnet',
        createdAt: Date.now(),
      });

      setWalletAddress(derived.address);
      setKeys(derived);
      setStep('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
      setStep('no-wallet');
    }
  }

  // ── Unlock ──────────────────────────────────────────────────────────────────
  const handleUnlock = useCallback(async () => {
    setError('');
    try {
      const record = await loadColdWallet();
      if (!record) { setStep('no-wallet'); return; }

      const credentialId = b64uDecode(record.credentialIdB64);
      const masterSeed = await unlockWithPasskey(record.rpId, credentialId);
      const derived = await deriveKeysFromSeed(masterSeed, record.network ?? 'testnet');

      setWalletAddress(record.qbtcAddress);
      setKeys(derived);
      setStep('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlock failed');
    }
  }, []);

  // ── Export to Web ───────────────────────────────────────────────────────────
  function handleExport() {
    if (!keys) return;
    setStep('exporting');
  }

  function exportQRPayload(): string {
    if (!keys) return '';
    const payload: ColdPubKeysPayload = {
      type: 'qbtc-cold-pubkeys',
      v: 1,
      address: walletAddress,
      ecdsaPub: b64uEncode(keys.ecdsaPub),
      falconPub: b64uEncode(keys.falconPub),
      network: 'testnet',
    };
    return encodePayload(payload);
  }

  // ── Sign Transaction ────────────────────────────────────────────────────────
  async function handleScanResult(raw: string) {
    setError('');
    try {
      const payload = decodePayload(raw);
      if (payload.type !== 'qbtc-unsigned-tx') {
        throw new Error(`Unexpected QR type: ${payload.type}`);
      }
      const tx = payload as ColdUnsignedTxPayload;

      if (!keys) throw new Error('No keys loaded — please unlock first');
      setStep('signing');

      const { txHex } = await signQBTCFromColdKeyPair(keys, {
        to: tx.to,
        amountSats: tx.amountSats,
        utxos: tx.utxos,
        network: tx.network,
        changeAddress: walletAddress,
      });

      const signedPayload: ColdSignedTxPayload = {
        type: 'qbtc-signed-tx',
        v: 1,
        hex: txHex,
      };
      setSignedQR(encodePayload(signedPayload));
      setStep('signed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed');
      setStep('ready');
    }
  }

  // ── Install prompt ──────────────────────────────────────────────────────────
  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowInstallBanner(false);
  }

  // ── Renders ─────────────────────────────────────────────────────────────────

  const offlineBadge = (
    <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded-full">
      <WifiOff size={12} /> Offline
    </div>
  );
  const onlineBadge = (
    <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded-full">
      <WifiOff size={12} /> Online
    </div>
  );

  const installBanner = showInstallBanner && (
    <div className="fixed bottom-0 inset-x-0 bg-slate-800 border-t border-slate-700 px-4 py-3 flex items-center gap-3 z-50">
      <Download size={18} className="text-cyan-400 shrink-0" />
      <p className="flex-1 text-sm text-slate-200">Install Cold Signer for offline use</p>
      <button onClick={handleInstall} className="text-sm font-semibold text-cyan-400">Install</button>
      <button onClick={() => setShowInstallBanner(false)} className="text-slate-400"><X size={18} /></button>
    </div>
  );

  // Loading
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
        <Loader size={36} className="text-cyan-400 animate-spin" />
      </div>
    );
  }

  // Signing in progress
  if (step === 'signing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6 gap-4">
        <Loader size={36} className="text-cyan-400 animate-spin" />
        <p className="text-slate-300 text-sm">Signing transaction…</p>
      </div>
    );
  }

  // First run — register passkey
  if (step === 'no-wallet') {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
          <div className="w-full max-w-sm flex flex-col gap-8">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                <Snowflake size={40} className="text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">qBTC Cold Signer</h1>
              <p className="text-slate-400 text-sm mt-2">
                Air-gapped key storage. Sign transactions without exposing private keys.
              </p>
            </div>
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-2xl p-4 text-sm text-amber-300 flex gap-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>For best security, <strong>turn on airplane mode</strong> before registering.</span>
            </div>
            {error && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-2xl p-4 text-sm text-red-400">
                {error}
              </div>
            )}
            <button
              onClick={handleCreateWallet}
              className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white
                         font-semibold flex items-center justify-center gap-3"
            >
              <Fingerprint size={22} />
              Create Wallet with Passkey
            </button>
            <p className="text-center text-slate-600 text-xs">
              Your passkey syncs to Google/iCloud — same keys on any device you own.
            </p>
          </div>
        </div>
        {installBanner}
      </>
    );
  }

  // Locked — needs biometric unlock
  if (step === 'locked') {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
          <div className="w-full max-w-sm flex flex-col gap-8 text-center">
            <div>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                <Snowflake size={40} className="text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">qBTC Cold Signer</h1>
              <p className="text-slate-400 text-sm mt-2">Authenticate to load your keys</p>
            </div>
            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl p-3">
                {error}
              </div>
            )}
            <button
              onClick={handleUnlock}
              className="w-full py-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white
                         font-semibold flex items-center justify-center gap-3 text-lg"
            >
              <Fingerprint size={26} />
              Unlock
            </button>
          </div>
        </div>
        {installBanner}
      </>
    );
  }

  // Export QR
  if (step === 'exporting') {
    const qrData = exportQRPayload();
    return (
      <div className="flex flex-col min-h-screen bg-slate-950">
        <header className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">Export to Web Wallet</h2>
            <p className="text-slate-400 text-xs mt-0.5">Scan this QR in your qBTC web wallet</p>
          </div>
          {isOnline ? onlineBadge : offlineBadge}
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="bg-white p-4 rounded-2xl">
            <QRDisplay data={qrData} onComplete={() => setStep('ready')} />
          </div>
          <p className="text-slate-500 text-xs text-center max-w-xs">
            Contains only public keys — no private data. Safe to scan on any device.
          </p>
        </div>
        <div className="px-5 pb-8">
          <button
            onClick={() => setStep('ready')}
            className="w-full py-4 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Scan unsigned tx
  if (step === 'scanning') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950">
        <header className="px-5 py-4 border-b border-slate-800">
          <button onClick={() => setStep('ready')} className="text-slate-400 text-sm">← Back</button>
          <h2 className="text-white font-semibold mt-1">Scan Transaction QR</h2>
          <p className="text-slate-400 text-xs mt-0.5">Scan the QR shown in your web wallet</p>
        </header>
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3">
            <AlertTriangle size={16} className="shrink-0" />
            {error}
          </div>
        )}
        <div className="flex-1">
          <QRScanner onScan={handleScanResult} onCancel={() => setStep('ready')} />
        </div>
      </div>
    );
  }

  // Show signed tx QR
  if (step === 'signed') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950">
        <header className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-400" />
          <div>
            <h2 className="text-white font-semibold">Transaction Signed</h2>
            <p className="text-slate-400 text-xs mt-0.5">Scan this in your web wallet to broadcast</p>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="bg-white p-4 rounded-2xl">
            <QRDisplay data={signedQR} onComplete={() => setStep('ready')} />
          </div>
        </div>
        <div className="px-5 pb-8">
          <button
            onClick={() => setStep('ready')}
            className="w-full py-4 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Ready (main screen)
  return (
    <>
      <div className="flex flex-col min-h-screen bg-slate-950">
        <header className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Snowflake size={20} className="text-blue-400" />
            <span className="text-white font-semibold text-sm">Cold Signer</span>
          </div>
          {isOnline ? onlineBadge : offlineBadge}
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="bg-slate-800/60 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Address</p>
              <p className="text-white font-mono text-sm break-all">{walletAddress}</p>
            </div>

            <button
              onClick={() => setStep('scanning')}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-slate-800 hover:bg-slate-700
                         active:bg-slate-600 border border-slate-700 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-600/20 flex items-center justify-center shrink-0">
                <Scan size={22} className="text-cyan-400" />
              </div>
              <div>
                <p className="text-white font-semibold">Sign Transaction</p>
                <p className="text-slate-400 text-sm mt-0.5">Scan an unsigned transaction QR</p>
              </div>
            </button>

            <button
              onClick={handleExport}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-slate-800 hover:bg-slate-700
                         active:bg-slate-600 border border-slate-700 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
                <Share2 size={22} className="text-blue-400" />
              </div>
              <div>
                <p className="text-white font-semibold">Export to Web</p>
                <p className="text-slate-400 text-sm mt-0.5">Show QR for your web wallet (public keys only)</p>
              </div>
            </button>
          </div>
        </div>

        <div className="px-5 pb-6">
          <button
            onClick={() => { setKeys(null); setStep('locked'); }}
            className="w-full py-3 rounded-2xl border border-slate-700 text-slate-400 text-sm hover:text-white hover:border-slate-500"
          >
            Lock
          </button>
        </div>
      </div>
      {installBanner}
    </>
  );
}
