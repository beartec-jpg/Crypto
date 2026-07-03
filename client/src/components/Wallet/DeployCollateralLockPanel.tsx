// One-time Sepolia deploy: USDC collateral lock contract (bridge vault).
// Uses wallet ETH key + Sepolia ETH for gas — same pattern as DeployHTLCPanel.

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { ethers } from 'ethers';
import { unlockWallet, unlockWalletWithPasskey } from '@/lib/walletService';
import { getSwapNetworkConfig } from '@/lib/evmHTLC';
import {
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
  masterSeed?: Uint8Array | null;
}

export default function DeployCollateralLockPanel({ walletId, masterSeed }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [deployedAddress, setDeployedAddress] = useState('');

  const configured = !!(import.meta.env.VITE_USDC_COLLATERAL_LOCK_CONTRACT || '').trim();

  const handleDeploy = async () => {
    if (!masterSeed && !password.trim()) {
      setError('Enter your wallet password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setStep('Unlocking wallet…');
      const wallet = masterSeed
        ? await unlockWalletWithPasskey(walletId, masterSeed)
        : await unlockWallet(walletId, password);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum private key not found in wallet');

      setStep('Connecting to Sepolia…');
      const config = getSwapNetworkConfig();
      const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);

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

  if (configured) return null;

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
            Set in your bridge wallet env:{' '}
            <code className="text-amber-300">SEPOLIA_LOCK_CONTRACT={deployedAddress}</code>
          </p>
          <p>
            Optional Vercel:{' '}
            <code className="text-amber-300">VITE_USDC_COLLATERAL_LOCK_CONTRACT={deployedAddress}</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-cyan-400" />
        <span className="text-cyan-300 font-bold text-sm">Deploy USDC Collateral Lock (one-time)</span>
      </div>
      <p className="text-xs text-cyan-200/80">
        Deploy the Sepolia lock contract once. Users approve USDC then call{' '}
        <code className="text-cyan-200">deposit(amount, destinationAddress)</code> from any external wallet.
        Requires Sepolia ETH in this wallet for gas.
      </p>
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
      {step && <p className="text-xs text-amber-300">{step}</p>}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 text-xs">{error}</div>
      )}
    </div>
  );
}