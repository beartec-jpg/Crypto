// Recover USDC still locked in the v1 collateral lock (owner: this wallet's Sepolia key).

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Fingerprint, Loader2, Send } from 'lucide-react';
import { ethers } from 'ethers';
import {
  unlockWallet,
  unlockWalletWithPasskey,
  getWalletType,
  getWalletCredentialId,
} from '@/lib/walletService';
import { authenticateWithPasskeyPRF } from '@/lib/passkeyService';
import { getSwapNetworkConfig } from '@/lib/evmHTLC';
import {
  FALCON_QUC_ISSUER,
  LEGACY_DEPOSITS,
  LEGACY_LOCK_CONTRACT,
  LEGACY_LOCK_RELEASE_ABI,
  LEGACY_RELEASE_RECIPIENT,
} from '@/lib/legacyLockCleanup';

function getDisplayError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

interface Props {
  walletId: string;
  userId: string;
  masterSeed?: Uint8Array | null;
  onMasterSeed?: (seed: Uint8Array) => void;
}

export default function ReleaseLegacyLockPanel({
  walletId,
  userId,
  masterSeed: sessionSeed,
  onMasterSeed,
}: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [done, setDone] = useState(false);
  const [walletType, setWalletType] = useState<'passkey' | 'legacy' | 'watch-only' | null>(null);

  const isPasskeyWallet = walletType === 'passkey';
  const totalUsdc = LEGACY_DEPOSITS.reduce((s, d) => s + d.amountUsdc, 0);

  useEffect(() => {
    getWalletType(userId).then(setWalletType).catch(() => setWalletType('legacy'));
  }, [userId]);

  const resolveMasterSeed = async (): Promise<Uint8Array> => {
    if (sessionSeed) return sessionSeed;
    const credId = await getWalletCredentialId(userId);
    const { masterSeed } = await authenticateWithPasskeyPRF(credId ?? undefined);
    onMasterSeed?.(masterSeed);
    return masterSeed;
  };

  const unlockSigner = async () => {
    if (walletType === 'watch-only') throw new Error('Watch-only wallet cannot sign');
    if (!isPasskeyWallet && !sessionSeed && !password.trim()) {
      throw new Error('Enter your wallet password');
    }
    setStep(isPasskeyWallet && !sessionSeed ? 'Confirm with passkey…' : 'Unlocking wallet…');
    const wallet = sessionSeed
      ? await unlockWalletWithPasskey(walletId, sessionSeed)
      : isPasskeyWallet
        ? await unlockWalletWithPasskey(walletId, await resolveMasterSeed())
        : await unlockWallet(walletId, password);
    const ethPrivateKey = wallet.privateKeys.ethereum;
    if (!ethPrivateKey) throw new Error('Ethereum private key not found');
    const config = getSwapNetworkConfig();
    const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
    return new ethers.Wallet('0x' + ethPrivateKey, provider);
  };

  const handleReleaseAll = async () => {
    setLoading(true);
    setError('');
    try {
      const signer = await unlockSigner();
      const lock = new ethers.Contract(LEGACY_LOCK_CONTRACT, LEGACY_LOCK_RELEASE_ABI, signer);
      const owner = await lock.owner();
      if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error(
          `This wallet (${signer.address.slice(0, 10)}…) is not the legacy lock owner (${owner.slice(0, 10)}…)`,
        );
      }
      for (const dep of LEGACY_DEPOSITS) {
        setStep(`Releasing ${dep.amountUsdc} USDC…`);
        const tx = await lock.release(dep.depositId, LEGACY_RELEASE_RECIPIENT);
        await tx.wait();
      }
      setDone(true);
      setStep('');
      setPassword('');
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Release failed'));
    } finally {
      setLoading(false);
      if (!done) setStep('');
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-300 font-bold text-sm">Legacy lock cleared</span>
        </div>
        <p className="text-xs text-slate-300">
          {totalUsdc} USDC released to{' '}
          <span className="font-mono">{LEGACY_RELEASE_RECIPIENT.slice(0, 10)}…</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <span className="text-amber-300 font-bold text-sm">Clear legacy lock ({totalUsdc} USDC)</span>
      </div>
      <p className="text-xs text-amber-200/80">
        Old contract <span className="font-mono">{LEGACY_LOCK_CONTRACT.slice(0, 10)}…</span> still holds{' '}
        {totalUsdc} USDC from early bridge tests. Release it back to your faucet Sepolia wallet.
      </p>
      <p className="text-xs text-slate-400">
        <strong className="text-slate-300">First:</strong> in the Falcon faucet wallet, send ~{totalUsdc} F-USDC
        back to issuer <span className="font-mono">{FALCON_QUC_ISSUER.slice(0, 12)}…</span> so you are not
        double-funded after release.
      </p>
      {isPasskeyWallet ? (
        <button
          type="button"
          onClick={handleReleaseAll}
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {step || 'Working…'}</>
          ) : (
            <><Fingerprint className="w-4 h-4" /> Release legacy USDC with Passkey</>
          )}
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wallet password"
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm"
          />
          <button
            type="button"
            onClick={handleReleaseAll}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white text-sm flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Release
          </button>
        </div>
      )}
      {step && <p className="text-xs text-amber-300">{step}</p>}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 text-xs">{error}</div>
      )}
    </div>
  );
}