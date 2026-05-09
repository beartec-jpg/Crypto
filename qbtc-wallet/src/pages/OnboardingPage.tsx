import { useState } from 'react';
import {
  Fingerprint,
  Snowflake,
  QrCode,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  Loader,
} from 'lucide-react';
import { registerPasskey, getDefaultRpId, b64uEncode } from '../lib/passkeyVault';
import { deriveKeyPair, getAddress } from '../lib/keys';
import { saveWallet } from '../storage/walletStore';
import QRScanner from '../components/QRScanner';
import type { ColdPubKeysPayload } from '../lib/coldSignerProtocol';

interface OnboardingPageProps {
  onHotWalletReady: (masterSeed: Uint8Array, qbtcAddress: string) => void;
  onColdWalletReady: (qbtcAddress: string, ecdsaPubHex: string, falconPubHex: string) => void;
  needsMigration?: boolean;
  onMigrateFromPin: (pin: string) => Promise<string | null>;
}

type Step =
  | 'intro'
  | 'creating'
  | 'cold-intro'
  | 'cold-scan'
  | 'migrate-pin'
  | 'migrate-passkey';

export default function OnboardingPage({
  onHotWalletReady,
  onColdWalletReady,
  needsMigration = false,
  onMigrateFromPin,
}: OnboardingPageProps) {
  const [step, setStep] = useState<Step>(needsMigration ? 'migrate-pin' : 'intro');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [migratePin, setMigratePin] = useState('');
  const [showMigratePin, setShowMigratePin] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);

  async function handleMigrateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMigrateLoading(true);
    setStep('migrate-passkey');
    setStatus('Verifying PIN and registering passkey…');
    const err = await onMigrateFromPin(migratePin);
    setMigrateLoading(false);
    if (err) {
      setError(err);
      setStep('migrate-pin');
    }
    // On success vault state -> 'unlocked', App.tsx unmounts this component
  }

  async function handleCreateHotWallet() {
    setError('');
    setStep('creating');
    setStatus('Setting up passkey…');
    try {
      const rpId = getDefaultRpId();
      const { masterSeed, credentialId } = await registerPasskey(rpId, 'qBTC Wallet');

      setStatus('Deriving keys…');
      const keyPair = await deriveKeyPair(masterSeed);
      const qbtcAddress = getAddress(keyPair, 'testnet');

      setStatus('Saving wallet…');
      await saveWallet({
        id: 'main',
        walletType: 'passkey',
        credentialIdB64: b64uEncode(credentialId),
        rpId,
        qbtcAddress,
        createdAt: Date.now(),
      });

      onHotWalletReady(masterSeed, qbtcAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
      setStep('intro');
    }
  }

  function handleColdQRScan(raw: string) {
    setError('');
    try {
      const payload = JSON.parse(raw) as ColdPubKeysPayload;
      if (payload.type !== 'qbtc-cold-pubkeys' || payload.v !== 1) {
        throw new Error('Not a valid cold signer QR code');
      }
      saveWallet({
        id: 'main',
        walletType: 'watch-only',
        qbtcAddress: payload.address,
        ecdsaPubHex: payload.ecdsaPub,
        falconPubHex: payload.falconPub,
        network: payload.network,
        createdAt: Date.now(),
      }).then(() => {
        onColdWalletReady(payload.address, payload.ecdsaPub, payload.falconPub);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid QR code');
    }
  }

  // ── Spinner (passkey in progress) ─────────────────────────────────────────
  if (step === 'creating' || step === 'migrate-passkey') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
        <div className="text-center flex flex-col items-center gap-4">
          <Loader size={40} className="text-cyan-400 animate-spin" />
          <p className="text-slate-300 text-sm">{status}</p>
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Migration: enter PIN ──────────────────────────────────────────────────
  if (step === 'migrate-pin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-900/40 flex items-center justify-center">
              <Lock size={32} className="text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Upgrade Security</h1>
            <p className="text-slate-400 text-sm mt-2">
              Enter your current PIN once to migrate to passkey — biometrics only from now on.
            </p>
          </div>
          <form onSubmit={handleMigrateSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <input
                type={showMigratePin ? 'text' : 'password'}
                placeholder="Current PIN"
                value={migratePin}
                onChange={e => setMigratePin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 pr-10
                           text-slate-100 placeholder-slate-500 text-center text-xl tracking-widest
                           focus:outline-none focus:border-cyan-500"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowMigratePin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showMigratePin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={!migratePin || migrateLoading}
              className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white
                         font-semibold text-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {migrateLoading ? 'Migrating…' : 'Migrate to Passkey'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Cold QR scanner ───────────────────────────────────────────────────────
  if (step === 'cold-scan') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950">
        <div className="px-5 py-4 border-b border-slate-800">
          <button onClick={() => setStep('cold-intro')} className="text-slate-400 text-sm">
            ← Back
          </button>
          <h2 className="text-white font-semibold mt-1">Scan Cold Signer QR</h2>
          <p className="text-slate-400 text-xs mt-1">
            Press "Export to Web" in the cold signer app, then scan the QR here.
          </p>
        </div>
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3">
            <AlertTriangle size={16} className="shrink-0" />
            {error}
          </div>
        )}
        <div className="flex-1">
          <QRScanner onScan={handleColdQRScan} onClose={() => setStep('cold-intro')} />
        </div>
      </div>
    );
  }

  // ── Cold intro ────────────────────────────────────────────────────────────
  if (step === 'cold-intro') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 px-6 py-8">
        <button onClick={() => setStep('intro')} className="text-slate-400 text-sm mb-6 self-start">
          ← Back
        </button>
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <div className="w-16 h-16 mb-4 rounded-full bg-slate-800 flex items-center justify-center">
              <Snowflake size={32} className="text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Cold Wallet Setup</h1>
            <p className="text-slate-400 text-sm mt-2">
              Your private keys never touch this device. Watch balances here, sign offline.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-5 flex flex-col gap-3 text-sm text-slate-300">
            <p className="font-semibold text-white">Steps</p>
            {[
              ['1.', 'Install qBTC Cold Signer on a spare device'],
              ['2.', 'Turn on airplane mode on that device'],
              ['3.', 'Create wallet with your passkey (biometrics)'],
              ['4.', 'Press "Export to Web" — shows a QR with public keys only'],
              ['5.', 'Scan it here'],
            ].map(([n, s]) => (
              <div key={n} className="flex gap-3">
                <span className="text-cyan-400 font-bold shrink-0">{n}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <a
            href="https://beartec.uk/cold-signer"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-center"
          >
            Install Cold Signer
          </a>
          <button
            onClick={() => setStep('cold-scan')}
            className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white
                       font-semibold flex items-center justify-center gap-3"
          >
            <QrCode size={20} />
            Scan QR from Cold Signer
          </button>
        </div>
      </div>
    );
  }

  // ── Intro (default) ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6 py-10">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <Fingerprint size={40} className="text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">qBTC Wallet</h1>
          <p className="text-slate-400 text-sm mt-2">Quantum-resistant Bitcoin. Choose your setup.</p>
        </div>
        <div className="flex flex-col gap-4">
          <button
            onClick={handleCreateHotWallet}
            className="w-full flex items-start gap-4 p-5 rounded-2xl bg-slate-800 hover:bg-slate-700
                       active:bg-slate-600 border border-slate-700 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 flex items-center justify-center shrink-0 mt-0.5">
              <Fingerprint size={22} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Create Hot Wallet</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Passkey protected. Biometrics unlock your keys. Nothing stored on this device.
              </p>
            </div>
          </button>
          <button
            onClick={() => setStep('cold-intro')}
            className="w-full flex items-start gap-4 p-5 rounded-2xl bg-slate-800 hover:bg-slate-700
                       active:bg-slate-600 border border-slate-700 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
              <Snowflake size={22} className="text-blue-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Use Cold Wallet</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Keys stay offline. Watch balances here, sign on your air-gapped device.
              </p>
            </div>
          </button>
        </div>
        <p className="text-center text-slate-600 text-xs">
          No seed phrases. No passwords. No backups to lose.
        </p>
      </div>
    </div>
  );
}
