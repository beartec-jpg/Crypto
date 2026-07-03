// One-time Sepolia deploy: USDC collateral lock contract (bridge vault).
// Passkey wallets: single Deploy button (biometric). Legacy wallets: password.

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
  BRIDGE_RELAY_OWNER_ADDRESS,
  COLLATERAL_LOCK_BYTECODE,
  COLLATERAL_LOCK_DEPLOY_ABI,
  SEPOLIA_USDC_TOKEN,
} from '@/lib/collateralLockDeploy';

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

export default function DeployCollateralLockPanel({
  walletId,
  userId,
  masterSeed: sessionSeed,
  onMasterSeed,
}: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [deployedAddress, setDeployedAddress] = useState('');
  const [ownershipTransferred, setOwnershipTransferred] = useState(false);
  const [showRedeploy, setShowRedeploy] = useState(false);
  const [walletType, setWalletType] = useState<'passkey' | 'legacy' | 'watch-only' | null>(null);

  const configured = (import.meta.env.VITE_USDC_COLLATERAL_LOCK_CONTRACT || '').trim();
  const isPasskeyWallet = walletType === 'passkey';

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
    if (walletType === 'watch-only') {
      throw new Error('Watch-only wallet cannot sign transactions');
    }
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
    if (!ethPrivateKey) throw new Error('Ethereum private key not found in wallet');
    const config = getSwapNetworkConfig();
    const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
    return new ethers.Wallet('0x' + ethPrivateKey, provider);
  };

  const handleTransferOwnership = async () => {
    if (!deployedAddress) return;
    setLoading(true);
    setError('');
    try {
      const signer = await unlockSigner();
      setStep('Transferring lock ownership to bridge relay…');
      const lock = new ethers.Contract(deployedAddress, COLLATERAL_LOCK_DEPLOY_ABI, signer);
      const tx = await lock.transferOwnership(BRIDGE_RELAY_OWNER_ADDRESS);
      await tx.wait();
      setOwnershipTransferred(true);
      setStep('');
      setPassword('');
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Ownership transfer failed'));
    } finally {
      setLoading(false);
      if (!ownershipTransferred) setStep('');
    }
  };

  const handleDeploy = async () => {
    if (walletType === 'watch-only') {
      setError('Watch-only wallet cannot deploy contracts');
      return;
    }
    if (!isPasskeyWallet && !sessionSeed && !password.trim()) {
      setError('Enter your wallet password');
      return;
    }

    setLoading(true);
    setError('');
    setOwnershipTransferred(false);
    try {
      const signer = await unlockSigner();
      setStep('Connecting to Sepolia…');

      const balance = await provider.getBalance(signer.address);
      if (balance === 0n) {
        throw new Error(`No Sepolia ETH at ${signer.address}. Fund the wallet with Sepolia ETH first.`);
      }

      setStep('Deploying USDC Collateral Lock…');
      const factory = new ethers.ContractFactory(
        COLLATERAL_LOCK_DEPLOY_ABI,
        COLLATERAL_LOCK_BYTECODE,
        signer,
      );
      const contract = await factory.deploy(SEPOLIA_USDC_TOKEN);
      await contract.waitForDeployment();
      const addr = await contract.getAddress();

      setDeployedAddress(addr);
      setStep('');
      setPassword('');
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Deploy failed'));
    } finally {
      setLoading(false);
      if (!deployedAddress) setStep('');
    }
  };

  if (configured && !showRedeploy && !deployedAddress) {
    return (
      <div className="rounded-xl border border-slate-600/50 bg-slate-900/40 p-4 space-y-2">
        <p className="text-xs text-slate-300">
          Lock contract configured:{' '}
          <span className="font-mono break-all">{configured}</span>
        </p>
        <p className="text-xs text-slate-400">
          Bridge-out needs a redeployed lock with <code className="text-amber-300">withdraw()</code>.
          Existing deposits stay in the old contract.
        </p>
        <button
          type="button"
          onClick={() => setShowRedeploy(true)}
          className="text-xs text-cyan-300 hover:text-cyan-200 underline"
        >
          Deploy new lock contract (bridge-out v2)
        </button>
      </div>
    );
  }

  if (deployedAddress) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-300 font-bold text-sm">USDC Collateral Lock Deployed</span>
        </div>
        <p className="text-xs text-emerald-200/80">
          Contract: <span className="font-mono select-all break-all">{deployedAddress}</span>
        </p>
        <p className="text-xs text-slate-400">
          Sepolia USDC token: <span className="font-mono">{SEPOLIA_USDC_TOKEN}</span>
        </p>
        <div className="text-xs text-slate-400 space-y-1">
          <p>
            Set in qXRP-faucet-wallet / Vercel:{' '}
            <code className="text-amber-300">SEPOLIA_LOCK_CONTRACT={deployedAddress}</code>
          </p>
          <p>
            And:{' '}
            <code className="text-amber-300">NEXT_PUBLIC_SEPOLIA_LOCK_CONTRACT={deployedAddress}</code>
          </p>
        </div>
        {!ownershipTransferred ? (
          <button
            type="button"
            onClick={handleTransferOwnership}
            disabled={loading}
            className="w-full mt-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white font-semibold text-sm"
          >
            {loading ? step || 'Working…' : `Transfer ownership → bridge relay`}
          </button>
        ) : (
          <p className="text-xs text-emerald-300">
            Ownership transferred to relay wallet {BRIDGE_RELAY_OWNER_ADDRESS.slice(0, 10)}…
          </p>
        )}
        <p className="text-xs text-slate-500">
          Relay wallet (coordinator): <span className="font-mono">{BRIDGE_RELAY_OWNER_ADDRESS}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-cyan-400" />
        <span className="text-cyan-300 font-bold text-sm">Deploy USDC Collateral Lock (bridge-out)</span>
      </div>
      <p className="text-xs text-cyan-200/80">
        Deploy the Sepolia bridge vault from this passkey wallet. This build includes{' '}
        <code className="text-amber-200">withdraw()</code> for Bridge Out. Requires Sepolia ETH for gas.
        {configured && ' Redeploying creates a new contract — update Vercel lock address after.'}
        {isPasskeyWallet && ' Confirm with your passkey when you tap Deploy.'}
      </p>

      {isPasskeyWallet ? (
        <button
          type="button"
          onClick={handleDeploy}
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {step || 'Working…'}</>
          ) : (
            <><Fingerprint className="w-4 h-4" /> Deploy with Passkey</>
          )}
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wallet password"
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleDeploy()}
          />
          <button
            type="button"
            onClick={handleDeploy}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-semibold text-sm flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Deploy
          </button>
        </div>
      )}

      {step && isPasskeyWallet && <p className="text-xs text-amber-300">{step}</p>}
      {!isPasskeyWallet && step && <p className="text-xs text-amber-300">{step}</p>}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 text-xs">{error}</div>
      )}
    </div>
  );
}