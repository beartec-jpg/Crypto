import { useEffect, useState } from 'react';
import { Check, Copy, HardDrive, QrCode, RefreshCw, Shield, Snowflake } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { getCurrentWallet, deriveAddressesFromMnemonic } from '@/lib/walletService';
import { splitMnemonic, reconstructMnemonic, getShareFingerprint } from '@/lib/shamirService';
import { storeHotShare, getHotShare, createColdSignerShareImportPayload } from '@/lib/coldSignerService';

interface ShamirRecoveryPanelProps {
  userId: string;
}

type RecoveryMode = 'recover' | 'rotate';

export default function ShamirRecoveryPanel({ userId }: ShamirRecoveryPanelProps) {
  const [mode, setMode] = useState<RecoveryMode>('recover');
  const [shareInputs, setShareInputs] = useState(['', '', '']);
  const [generatedShares, setGeneratedShares] = useState<string[] | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShare2Qr, setShowShare2Qr] = useState(true);
  const [walletAddresses, setWalletAddresses] = useState<Record<string, string> | null>(null);
  const [share2ImportPayload, setShare2ImportPayload] = useState<string>('');

  useEffect(() => {
    async function loadWallet() {
      const wallet = await getCurrentWallet(userId);
      setWalletAddresses(wallet?.addresses ?? null);
    }

    void loadWallet();
  }, [userId]);

  const handleShareInputChange = (index: number, value: string) => {
    setShareInputs((previous) => previous.map((entry, currentIndex) => (
      currentIndex === index ? value.trim() : entry
    )));
    setError(null);
    setSuccess(null);
  };

  const handleGenerate = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const providedShares = shareInputs.map((share) => share.trim()).filter(Boolean);

      if (providedShares.length < 2) {
        throw new Error('Enter at least 2 Shamir shares to recover or rotate the cold setup.');
      }

      if (!walletAddresses) {
        throw new Error('No active wallet found on this device.');
      }

      const mnemonic = reconstructMnemonic(providedShares);
      const derived = await deriveAddressesFromMnemonic(mnemonic);

      if (derived.addresses.ethereum !== walletAddresses.ethereum) {
        throw new Error('The provided shares do not match the active wallet on this device.');
      }

      const nextShares = splitMnemonic(mnemonic, { shares: 3, threshold: 2 });
      storeHotShare(nextShares[0]);
      setGeneratedShares(nextShares);
      setShare2ImportPayload(createColdSignerShareImportPayload(nextShares[1], mode));
      setShowShare2Qr(true);
      setSuccess(
        mode === 'rotate'
          ? 'New Shamir set generated. Share 1 replaced on this device, and the Share 2 QR below will replace the cold signer share.'
          : 'Recovery set generated. Share 1 is stored on this device and Share 2 can now provision a replacement cold signer device.'
      );
    } catch (err) {
      setGeneratedShares(null);
      setError(err instanceof Error ? err.message : 'Failed to generate replacement shares');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedItem(key);
    window.setTimeout(() => setCopiedItem(null), 2000);
  };

  const populateShare1FromDevice = () => {
    const hotShare = getHotShare();
    if (hotShare) {
      setShareInputs((prev) => [hotShare, prev[1], prev[2]]);
    } else {
      setError('No hot share found on this device. You may need to set up cold signing first.');
    }
  };

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-sky-950/80 via-blue-950/70 to-cyan-950/80 p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-cyan-400/15 p-3 text-cyan-300">
          <Snowflake className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Cold Device Recovery & Rotation</h3>
          <p className="mt-1 text-sm text-cyan-100/80">
            Rebuild a fresh 2-of-3 Shamir set for the active wallet using any 2 or 3 existing shares.
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('recover')}
          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
            mode === 'recover'
              ? 'border-cyan-300 bg-cyan-400/15 text-white'
              : 'border-white/10 bg-gray-950/40 text-gray-300 hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Shield className="h-4 w-4" />
            Recover New Cold Device
          </div>
          <p className="mt-1 text-xs text-gray-300">
            Use when the old cold device is lost or broken and you need to provision a replacement device.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode('rotate')}
          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
            mode === 'rotate'
              ? 'border-cyan-300 bg-cyan-400/15 text-white'
              : 'border-white/10 bg-gray-950/40 text-gray-300 hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <RefreshCw className="h-4 w-4" />
            Rotate Existing Shamir Set
          </div>
          <p className="mt-1 text-xs text-gray-300">
            Use when you still control the cold device and want to replace the old cold share with a fresh one.
          </p>
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {shareInputs.map((share, index) => (
          <label key={index} className="block">
            <div className="mb-2 flex items-center justify-between">
              <span className="block text-xs font-semibold uppercase tracking-wide text-cyan-200">
                Existing Share {index + 1}
              </span>
              {index === 0 && (
                <button
                  type="button"
                  onClick={populateShare1FromDevice}
                  className="inline-flex items-center gap-1 rounded-lg bg-cyan-400/15 px-2 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-400/25"
                >
                  <HardDrive className="h-3 w-3" />
                  Populate from device
                </button>
              )}
            </div>
            <textarea
              value={share}
              onChange={(event) => handleShareInputChange(index, event.target.value)}
              placeholder={index === 0 ? 'Paste share 1 or populate from device' : `Paste existing share ${index + 1}`}
              rows={5}
              className="w-full rounded-xl border border-white/10 bg-gray-950/60 px-3 py-2 font-mono text-xs text-gray-200 outline-none transition-colors focus:border-cyan-400"
            />
          </label>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isProcessing}
          className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
        >
          {isProcessing ? 'Generating...' : mode === 'rotate' ? 'Rotate Shamir Set' : 'Recover New Shamir Set'}
        </Button>
      </div>

      {generatedShares && (
        <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-gray-950/55 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-white">Fresh share set generated</p>
              <p className="mt-1 text-sm text-gray-300">
                Share 1 has already replaced the hot-wallet share on this device. Share 3 must now be written down or printed as a new offline hard-copy backup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowShare2Qr((visible) => !visible)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
            >
              <QrCode className="h-4 w-4" />
              {showShare2Qr ? 'Hide Share 2 QR' : 'Show Share 2 QR'}
            </button>
          </div>

          {showShare2Qr && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <p className="text-sm font-semibold text-cyan-200">
                {mode === 'rotate' ? 'Cold signer replacement QR' : 'New cold signer provisioning QR'}
              </p>
              <p className="mt-1 text-xs text-cyan-100/90">
                {mode === 'rotate'
                  ? 'Scan this on the existing cold signer device using Replace Stored Share to overwrite the old cold share.'
                  : 'Scan this on a new cold signer device to import the replacement cold share.'}
              </p>
              <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-white p-4">
                <QRCodeSVG value={share2ImportPayload} size={220} bgColor="#ffffff" fgColor="#000000" level="M" />
                <p className="text-center text-[11px] font-medium text-gray-800">
                  Mode: {mode === 'rotate' ? 'Rotate existing cold share' : 'Recover to new cold device'}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {generatedShares.map((share, index) => {
              const label = index === 0
                ? 'Share 1 (saved on this device)'
                : index === 1
                ? 'Share 2 (cold signer)'
                : 'Share 3 (paper backup)';
              const copyKey = `share-${index}`;
              const copyText = index === 1 ? share2ImportPayload : share;

              return (
                <div key={label} className="rounded-xl border border-white/10 bg-gray-900/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">{label}</p>
                      <p className="text-[11px] text-gray-500">Fingerprint: {getShareFingerprint(share)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy(copyText, copyKey)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
                    >
                      {copiedItem === copyKey ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                  </div>
                  <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-gray-400">
                    {index === 1 ? share2ImportPayload : share}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="font-semibold">Important</p>
            <p className="mt-1">Old shares should be considered retired once the new set is fully deployed. Replace the cold signer share and destroy obsolete paper or digital copies you no longer need.</p>
          </div>
        </div>
      )}
    </div>
  );
}
