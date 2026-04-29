// client/src/components/Wallet/MarketplaceTab.tsx
// QBTC ↔ USDC atomic swap marketplace — integrated into the wallet tab

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'wouter';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Filter,
  Lock,
  Search,
  Send,
  RefreshCw,
  Info,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { isSwapMainnetActive, EvmHTLC, getSwapNetworkConfig } from '@/lib/evmHTLC';
import {
  QBTCKeyPair,
  QBTCChain,
  createHTLCScript,
  createHTLCClaimTransaction,
  getHTLCAddress,
  getQBTCRpcSettings,
  type QBTCNetwork,
  type QBTCHtlcParams,
} from '@/lib/qbtcService';
import { unlockWallet } from '@/lib/walletService';
import { getSecurityRequirements, type AuthMethod } from '@/lib/securityService';
import { authenticateWithPasskey, isPasskeyAuthenticated } from '@/lib/passkeyService';
import PinEntryModal from './PinEntryModal';
import { ethers } from 'ethers';
import MultiChainMarketTab from '@/components/MultiChainMarketTab';
import { fetchV2SwapsByAddress, buildV2Message, postV2LockSideA, postV2LockSideB, postV2ClaimSideB, type V2Swap, type ChainId } from '@/lib/swapV2Api';
import { XrplAdapter, encodeConditionFromHash } from '@/lib/adapters/XrplAdapter';
import { EvmAdapter, getEvmAdapterConfig } from '@/lib/adapters/EvmAdapter';
import { getXRPSeed, getXRPTestnetSeed } from '@/lib/walletService';
import { Wallet as XRPLWallet } from 'xrpl';

const V2_ACTIVE_STATUSES = new Set(['PENDING_SIDE_A', 'SIDE_A_LOCKED', 'SIDE_B_LOCKED']);

function V2SwapStatusBadge({ status, isMaker }: { status: string; isMaker?: boolean }) {
  const cls =
    status === 'COMPLETE'      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
    status === 'EXPIRED'       ? 'bg-slate-500/20 text-slate-400 border-slate-500/30' :
    status === 'SIDE_B_LOCKED' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
    status === 'SIDE_A_LOCKED' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
  const label =
    status === 'PENDING_SIDE_A' ? (isMaker ? 'Create Your Lock' : 'Awaiting Maker Lock') :
    status === 'SIDE_A_LOCKED'  ? (isMaker ? 'Your Lock Confirmed — Awaiting Taker' : 'Maker Locked — Lock Yours Now') :
    status === 'SIDE_B_LOCKED'  ? 'Both Locked — Claim' :
    status === 'COMPLETE'       ? 'Complete' :
    status === 'EXPIRED'        ? 'Expired' : status;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>;
}

const SWAP_API = (import.meta.env.VITE_SWAP_API_URL || '').replace(/\/$/, '');

// ─── Types ───────────────────────────────────────────────────────────────────

type SwapStatus =
  | 'PENDING_QBTC_LOCK'
  | 'QBTC_LOCKED'
  | 'EVM_LOCKED'
  | 'COMPLETE'
  | 'REFUNDED'
  | 'EXPIRED';

interface SwapOffer {
  id: string;
  offerType?: string;
  sellerQbtcAddress: string;
  sellerEvmAddress: string;
  sellerPubKeyHex: string;
  buyerQbtcAddress?: string;
  buyerEvmAddress?: string;
  buyerPubKeyHex?: string;
  qbtcAmount: string;
  usdcAmountRequested: string;
  secretHash: string | null;
  qbtcLocktime: number | null;
  qbtcHtlcTxid: string | null;
  qbtcHtlcAddress: string | null;
  status: string;
  createdAt: string;
}

interface AtomicSwap {
  id: string;
  offerId: string;
  sellerQbtcAddress: string;
  sellerEvmAddress: string;
  sellerPubKeyHex: string;
  buyerQbtcAddress: string;
  buyerEvmAddress: string;
  buyerPubKeyHex: string;
  qbtcAmount: string;
  usdcAmount: string;
  secretHash: string;
  secret: string | null;
  qbtcHtlcTxid: string | null;
  qbtcHtlcAddress: string | null;
  evmContractId: string | null;
  qbtcLocktime: number | null;
  evmLocktime: number | null;
  status: SwapStatus;
  buyerQbtcClaimTxid: string | null;
  createdAt: string;
}

interface AcceptResponse {
  swapId: string;
  secretHash: string;
  qbtcLocktime: number;
  evmLocktime: number;
  sellerPubKeyHex: string;
  sellerEvmAddress: string;
  buyerPubKeyHex: string;
  qbtcAmount: string;
  usdcAmount: string;
  status: string;
  qbtcHtlcTxid: string | null;
  qbtcHtlcAddress: string | null;
  evmLocked?: boolean;
}

interface MarketplaceTabProps {
  userId: string;
  walletId: string;
  walletAddress: string;    // QBTC address
  walletPubKey: string;     // ECDSA pubkey hex (66 chars)
  walletEvmAddress: string; // EVM/Ethereum address
  walletXrpAddress?: string; // XRP testnet address
  walletBtcPubKey?: string;  // Compressed BTC pubkey (33-byte hex) for BTC HTLC swaps
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayError(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const e = error as any;
    const rd = e.response?.data;
    if (typeof rd?.error === 'string' && rd.error.trim()) return rd.error;
    if (typeof rd?.message === 'string' && rd.message.trim()) return rd.message;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  return fallback;
}

function useCountdown(unixTs: number | null): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!unixTs) return;
    const tick = () => {
      const diff = unixTs - Math.floor(Date.now() / 1000);
      if (diff <= 0) { setLabel('Expired'); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setLabel(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unixTs]);
  return label;
}

function statusBadge(status: SwapStatus | string) {
  switch (status) {
    case 'OPEN':              return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'PENDING_QBTC_LOCK': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'QBTC_LOCKED':       return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'EVM_LOCKED':        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    case 'COMPLETE':          return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'EXPIRED':
    case 'REFUNDED':          return 'bg-red-500/20 text-red-300 border-red-500/40';
    default:                  return 'bg-slate-700 text-slate-400 border-slate-600';
  }
}

function statusLabel(status: SwapStatus | string) {
  switch (status) {
    case 'PENDING_QBTC_LOCK': return 'Awaiting QBTC Lock';
    case 'QBTC_LOCKED':       return 'QBTC Locked';
    case 'EVM_LOCKED':        return 'USDC Locked';
    case 'COMPLETE':          return 'Complete';
    case 'EXPIRED':           return 'Expired';
    case 'REFUNDED':          return 'Refunded';
    default:                  return status;
  }
}

// ─── Seller: Lock QBTC in HTLC ──────────────────────────────────────────────

function SellerLockPanel({
  swap,
  walletId,
  userId,
  onLocked,
}: {
  swap: AtomicSwap;
  walletId: string;
  userId: string;
  onLocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'idle' | 'unlocking' | 'building' | 'broadcasting' | 'reporting'>('idle');
  const [showPinModal, setShowPinModal] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);
  const network: QBTCNetwork = isSwapMainnetActive() ? 'mainnet' : 'testnet';

  const requirements = getSecurityRequirements(userId, 'send');
  const needsPin = requirements.includes('pin');
  const needsPasskey = requirements.includes('passkey');

  const startSecurityGate = async () => {
    setError('');
    if (needsPin) { setShowPinModal(true); return; }
    await afterPin();
  };
  const afterPin = async () => {
    if (needsPasskey && !isPasskeyAuthenticated() && !passkeyDone) {
      try { await authenticateWithPasskey(); setPasskeyDone(true); } catch { setError('Passkey authentication failed'); return; }
    }
    // Password is always needed (wallet decryption) — wait for user to fill it and click Lock
    if (!password.trim()) return;
    await executeLock();
  };
  const handlePinSuccess = async () => { setShowPinModal(false); await afterPin(); };

  const handleLock = async () => {
    if (!password.trim()) { setError('Enter your wallet password'); return; }
    // If we haven't done passkey/pin yet, start the gate
    if (needsPin || (needsPasskey && !isPasskeyAuthenticated() && !passkeyDone)) {
      await startSecurityGate();
      return;
    }
    await executeLock();
  };

  const executeLock = async () => {
    setLoading(true);
    setError('');
    try {
      setStep('unlocking');
      const wallet = await unlockWallet(walletId, password);
      if (!wallet.mnemonic) throw new Error('Wallet mnemonic not available. Please ensure your wallet is properly initialized.');
      const keyPair = await QBTCKeyPair.fromMnemonic(wallet.mnemonic);

      setStep('building');
      const htlcParams: QBTCHtlcParams = {
        // Hash-only HTLC: no buyerPubKeyHex — anyone with secret can claim
        sellerPubKeyHex: swap.sellerPubKeyHex,
        secretHashHex: swap.secretHash,
        locktime: swap.qbtcLocktime!,
      };
      const htlcScript = createHTLCScript(htlcParams);
      const htlcAddress = getHTLCAddress(htlcScript, network);

      setStep('broadcasting');
      const qbtcChain = new QBTCChain(getQBTCRpcSettings());
      const { txid } = await qbtcChain.sendTransaction(keyPair, htlcAddress, swap.qbtcAmount);

      setStep('reporting');
      await axios.post(`${SWAP_API}/api/swap/lock/qbtc`, {
        swapId: swap.id,
        qbtcHtlcTxid: txid,
        qbtcHtlcAddress: htlcAddress,
      });

      setPassword('');
      onLocked();
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Failed to lock QBTC'));
    } finally {
      setLoading(false);
      setStep('idle');
    }
  };

  const stepLabels: Record<string, string> = {
    unlocking: 'Unlocking wallet…',
    building: 'Building HTLC transaction…',
    broadcasting: 'Broadcasting to QBTC network…',
    reporting: 'Confirming with swap server…',
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-amber-200 text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Your turn: Lock {swap.qbtcAmount} QBTC in HTLC
        </p>
        <p className="text-amber-300/70 text-xs mt-1">
          Authenticate to sign and broadcast. Funds locked with a 48-hour refund window.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleLock()}
          placeholder="Wallet password"
          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
        />
      </div>
      <button
        onClick={handleLock}
        disabled={loading || !password.trim()}
        className="w-full py-2 rounded-xl font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {loading ? 'Locking…' : 'Lock QBTC'}
      </button>
      {showPinModal && <PinEntryModal userId={userId} onSuccess={handlePinSuccess} onClose={() => setShowPinModal(false)} />}
      {loading && step !== 'idle' && (
        <p className="text-xs text-amber-300/60 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {stepLabels[step] || ''}
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}
    </div>
  );
}

// ─── Deploy HTLC Contract (one-time admin action) ───────────────────────────

// Pre-compiled HashedTimelockERC20 bytecode (Solidity 0.8.28)
const HTLC_BYTECODE = '0x6080604052348015600e575f5ffd5b506115518061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061004a575f3560e01c8063398a7a981461004e578063636151491461007e5780637249fbb6146100ae578063e16c7d98146100de575b5f5ffd5b61006860048036038101906100639190610cd6565b610116565b6040516100759190610d5c565b60405180910390f35b61009860048036038101906100939190610d75565b610571565b6040516100a59190610dcd565b60405180910390f35b6100c860048036038101906100c39190610de6565b61088d565b6040516100d59190610dcd565b60405180910390f35b6100f860048036038101906100f39190610de6565b610b34565b60405161010d99989796959493929190610e2f565b60405180910390f35b5f5f8211610159576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161015090610f14565b60405180910390fd5b42841161019b576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161019290610f7c565b60405180910390fd5b3386848488886040516020016101b69695949392919061101f565b6040516020818303038152906040528051906020012090505f73ffffffffffffffffffffffffffffffffffffffff165f5f8381526020019081526020015f205f015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff161461026d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610264906110d8565b60405180910390fd5b8273ffffffffffffffffffffffffffffffffffffffff166323b872dd3330856040518463ffffffff1660e01b81526004016102aa939291906110f6565b6020604051808303815f875af11580156102c6573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906102ea9190611155565b610329576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610320906111ca565b60405180910390fd5b6040518061012001604052803373ffffffffffffffffffffffffffffffffffffffff1681526020018773ffffffffffffffffffffffffffffffffffffffff1681526020018473ffffffffffffffffffffffffffffffffffffffff1681526020018381526020018681526020018581526020015f151581526020015f151581526020015f5f1b8152505f5f8381526020019081526020015f205f820151815f015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506020820151816001015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506040820151816002015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550606082015181600301556080820151816004015560a0820151816005015560c0820151816006015f6101000a81548160ff02191690831515021790555060e08201518160060160016101000a81548160ff02191690831515021790555061010082015181600701559050508573ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16827f31a346f672cf5073bda81a99e0a28aff2bfe8c2db87d462bb2f4c114476a46ee86868a8a60405161056094939291906111e8565b60405180910390a495945050505050565b5f5f5f5f8581526020019081526020015f2090505f73ffffffffffffffffffffffffffffffffffffffff16815f015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1603610615576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161060c90611275565b60405180910390fd5b6002836040516020016106289190611293565b60405160208183030381529060405260405161064491906112ff565b602060405180830381855afa15801561065f573d5f5f3e3d5ffd5b5050506040513d601f19601f820116820180604052508101906106829190611329565b8160040154146106c7576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016106be9061139e565b60405180910390fd5b806006015f9054906101000a900460ff1615610718576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161070f90611406565b60405180910390fd5b8060060160019054906101000a900460ff161561076a576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107619061146e565b60405180910390fd5b8281600701819055506001816006015f6101000a81548160ff021916908315150217905550806002015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb826001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1683600301546040518363ffffffff1660e01b815260040161081492919061148c565b6020604051808303815f875af1158015610830573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906108549190611155565b50837f15a71365fee30a355046c80d10aab98a49c3558b2272658d6c551733203e9bbe60405160405180910390a2600191505092915050565b5f5f5f5f8481526020019081526020015f2090505f73ffffffffffffffffffffffffffffffffffffffff16815f015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1603610931576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161092890611275565b60405180910390fd5b806006015f9054906101000a900460ff1615610982576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161097990611406565b60405180910390fd5b8060060160019054906101000a900460ff16156109d4576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016109cb9061146e565b60405180910390fd5b4281600501541115610a1b576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a12906114fd565b60405180910390fd5b60018160060160016101000a81548160ff021916908315150217905550806002015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb825f015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1683600301546040518363ffffffff1660e01b8152600401610abc92919061148c565b6020604051808303815f875af1158015610ad8573d5f5f3e3d5ffd5b505050506040513d601f19601f82011682018060405250810190610afc9190611155565b50827ff97bb6718c3bf29e51d27c00a46276abc2cf35c7f1d5a1c71bec2c82421bb83060405160405180910390a26001915050919050565b5f5f5f5f5f5f5f5f5f5f5f5f8c81526020019081526020015f209050805f015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16816001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16826002015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16836003015484600401548560050154866006015f9054906101000a900460ff168760060160019054906101000a900460ff168860070154995099509950995099509950995099509950509193959799909294969850565b5f5ffd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610c3f82610c16565b9050919050565b610c4f81610c35565b8114610c59575f5ffd5b50565b5f81359050610c6a81610c46565b92915050565b5f819050919050565b610c8281610c70565b8114610c8c575f5ffd5b50565b5f81359050610c9d81610c79565b92915050565b5f819050919050565b610cb581610ca3565b8114610cbf575f5ffd5b50565b5f81359050610cd081610cac565b92915050565b5f5f5f5f5f60a08688031215610cef57610cee610c12565b5b5f610cfc88828901610c5c565b9550506020610d0d88828901610c8f565b9450506040610d1e88828901610cc2565b9350506060610d2f88828901610c5c565b9250506080610d4088828901610cc2565b9150509295509295909350565b610d5681610c70565b82525050565b5f602082019050610d6f5f830184610d4d565b92915050565b5f5f60408385031215610d8b57610d8a610c12565b5b5f610d9885828601610c8f565b9250506020610da985828601610c8f565b9150509250929050565b5f8115159050919050565b610dc781610db3565b82525050565b5f602082019050610de05f830184610dbe565b92915050565b5f60208284031215610dfb57610dfa610c12565b5b5f610e0884828501610c8f565b91505092915050565b610e1a81610c35565b82525050565b610e2981610ca3565b82525050565b5f61012082019050610e435f83018c610e11565b610e50602083018b610e11565b610e5d604083018a610e11565b610e6a6060830189610e20565b610e776080830188610d4d565b610e8460a0830187610e20565b610e9160c0830186610dbe565b610e9e60e0830185610dbe565b610eac610100830184610d4d565b9a9950505050505050505050565b5f82825260208201905092915050565b7f616d6f756e74206d757374206265203e203000000000000000000000000000005f82015250565b5f610efe601283610eba565b9150610f0982610eca565b602082019050919050565b5f6020820190508181035f830152610f2b81610ef2565b9050919050565b7f74696d656c6f636b206d75737420626520696e207468652066757475726500005f82015250565b5f610f66601e83610eba565b9150610f7182610f32565b602082019050919050565b5f6020820190508181035f830152610f9381610f5a565b9050919050565b5f8160601b9050919050565b5f610fb082610f9a565b9050919050565b5f610fc182610fa6565b9050919050565b610fd9610fd482610c35565b610fb7565b82525050565b5f819050919050565b610ff9610ff482610ca3565b610fdf565b82525050565b5f819050919050565b61101961101482610c70565b610fff565b82525050565b5f61102a8289610fc8565b60148201915061103a8288610fc8565b60148201915061104a8287610fc8565b60148201915061105a8286610fe8565b60208201915061106a8285611008565b60208201915061107a8284610fe8565b602082019150819050979650505050505050565b7f636f6e747261637420616c7265616479206578697374730000000000000000005f82015250565b5f6110c2601783610eba565b91506110cd8261108e565b602082019050919050565b5f6020820190508181035f8301526110ef816110b6565b9050919050565b5f6060820190506111095f830186610e11565b6111166020830185610e11565b6111236040830184610e20565b949350505050565b61113481610db3565b811461113e575f5ffd5b50565b5f8151905061114f8161112b565b92915050565b5f6020828403121561116a57611169610c12565b5b5f61117784828501611141565b91505092915050565b7f7472616e7366657246726f6d206661696c6564000000000000000000000000005f82015250565b5f6111b4601383610eba565b91506111bf82611180565b602082019050919050565b5f6020820190508181035f8301526111e1816111a8565b9050919050565b5f6080820190506111fb5f830187610e11565b6112086020830186610e20565b6112156040830185610d4d565b6112226060830184610e20565b95945050505050565b7f636f6e747261637420646f6573206e6f742065786973740000000000000000005f82015250565b5f61125f601783610eba565b915061126a8261122b565b602082019050919050565b5f6020820190508181035f83015261128c81611253565b9050919050565b5f61129e8284611008565b60208201915081905092915050565b5f81519050919050565b5f81905092915050565b8281835e5f83830152505050565b5f6112d9826112ad565b6112e381856112b7565b93506112f38185602086016112c1565b80840191505092915050565b5f61130a82846112cf565b915081905092915050565b5f8151905061132381610c79565b92915050565b5f6020828403121561133e5761133d610c12565b5b5f61134b84828501611315565b91505092915050565b7f696e76616c696420707265696d616765000000000000000000000000000000005f82015250565b5f611388601083610eba565b915061139382611354565b602082019050919050565b5f6020820190508181035f8301526113b58161137c565b9050919050565b7f616c72656164792077697468647261776e0000000000000000000000000000005f82015250565b5f6113f0601183610eba565b91506113fb826113bc565b602082019050919050565b5f6020820190508181035f83015261141d816113e4565b9050919050565b7f616c726561647920726566756e646564000000000000000000000000000000005f82015250565b5f611458601083610eba565b915061146382611424565b602082019050919050565b5f6020820190508181035f8301526114858161144c565b9050919050565b5f60408201905061149f5f830185610e11565b6114ac6020830184610e20565b9392505050565b7f74696d656c6f636b206e6f7420796574207061737365640000000000000000005f82015250565b5f6114e7601783610eba565b91506114f2826114b3565b602082019050919050565b5f6020820190508181035f830152611514816114db565b905091905056fea2646970667358221220ad88dda31bfab6c55753d4043341a0e8b0b8e15a89c2b43259b0b0fb2717738d64736f6c634300081c0033';

const HTLC_DEPLOY_ABI = [
  'constructor()',
  'function newContract(address receiver, bytes32 hashlock, uint256 timelock, address tokenContract, uint256 amount) returns (bytes32 contractId)',
  'function withdraw(bytes32 contractId, bytes32 preimage) returns (bool)',
  'function refund(bytes32 contractId) returns (bool)',
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
];

function DeployHTLCPanel({ walletId }: { walletId: string }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [deployedAddress, setDeployedAddress] = useState('');

  const handleDeploy = async () => {
    if (!password.trim()) { setError('Enter your wallet password'); return; }
    setLoading(true);
    setError('');
    try {
      setStep('Unlocking wallet…');
      const wallet = await unlockWallet(walletId, password);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum private key not found in wallet');

      setStep('Connecting to Sepolia…');
      const config = getSwapNetworkConfig();
      const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);

      const balance = await provider.getBalance(signer.address);
      if (balance === 0n) throw new Error(`No Sepolia ETH at ${signer.address}. Get free ETH from a Sepolia faucet first.`);

      setStep('Deploying HashedTimelockERC20…');
      const factory = new ethers.ContractFactory(HTLC_DEPLOY_ABI, HTLC_BYTECODE, signer);
      const contract = await factory.deploy();
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

  if (deployedAddress) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-300 font-bold text-sm">HTLC Contract Deployed!</span>
        </div>
        <p className="text-xs text-emerald-200/80">
          Address: <span className="font-mono select-all">{deployedAddress}</span>
        </p>
        <p className="text-xs text-slate-400">
          Copy this address and set it as <code className="text-amber-300">VITE_EVM_HTLC_CONTRACT</code> in Vercel environment variables, then redeploy.
          Also set <code className="text-amber-300">EVM_HTLC_CONTRACT</code> on the VPS.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-400" />
        <span className="text-red-300 font-bold text-sm">HTLC Contract Not Deployed</span>
      </div>
      <p className="text-xs text-red-200/80">
        The EVM HTLC smart contract needs to be deployed once to Sepolia before USDC locking can work.
        Your wallet needs a small amount of Sepolia ETH for gas (~0.01 ETH).
        Get free ETH from <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noopener noreferrer" className="underline text-blue-400">Google Cloud Faucet</a> or <a href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noopener noreferrer" className="underline text-blue-400">Alchemy Faucet</a>.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Wallet password"
          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-red-400 focus:outline-none text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleDeploy()}
        />
        <button
          onClick={handleDeploy}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white font-semibold text-sm flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Deploy HTLC
        </button>
      </div>
      {step && <p className="text-xs text-amber-300">{step}</p>}
      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 text-xs">{error}</div>}
    </div>
  );
}

// ─── Buyer: Lock USDC via MetaMask ───────────────────────────────────────────

function BuyerLockPanel({
  swap,
  walletId,
  userId,
  onLocked,
}: {
  swap: AtomicSwap;
  walletId: string;
  userId: string;
  onLocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);

  const requirements = getSecurityRequirements(userId, 'send');
  const needsPin = requirements.includes('pin');
  const needsPasskey = requirements.includes('passkey');

  const startSecurityGate = async () => {
    setError('');
    if (needsPin) { setShowPinModal(true); return; }
    await afterPin();
  };
  const afterPin = async () => {
    if (needsPasskey && !isPasskeyAuthenticated() && !passkeyDone) {
      try { await authenticateWithPasskey(); setPasskeyDone(true); } catch { setError('Passkey authentication failed'); return; }
    }
    if (!password.trim()) return;
    await executeLock();
  };
  const handlePinSuccess = async () => { setShowPinModal(false); await afterPin(); };

  const handleLock = async () => {
    if (!password.trim()) { setError('Enter your wallet password'); return; }
    if (needsPin || (needsPasskey && !isPasskeyAuthenticated() && !passkeyDone)) {
      await startSecurityGate();
      return;
    }
    await executeLock();
  };

  const executeLock = async () => {
    setLoading(true);
    setError('');
    try {
      setStep('Unlocking wallet…');
      const wallet = await unlockWallet(walletId, password);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum private key not found in wallet');

      // 2. Create ethers.Wallet signer from the wallet's key
      setStep('Connecting to EVM network…');
      const config = getSwapNetworkConfig();
      if (!config.htlcContractAddress) throw new Error('EVM HTLC contract not configured (VITE_EVM_HTLC_CONTRACT)');
      if (!config.usdcContractAddress) throw new Error('USDC contract not configured (VITE_USDC_CONTRACT)');

      const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);

      // 3. Approve USDC + create HTLC
      setStep('Checking USDC balance…');
      const evmHTLC = new EvmHTLC({
        contractAddress: config.htlcContractAddress,
        usdcAddress: config.usdcContractAddress,
        signerOrProvider: signer,
      });

      const usdcBaseUnits = BigInt(Math.round(Number(swap.usdcAmount) * 1_000_000));

      // Check USDC balance first
      const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
      const usdcToken = new ethers.Contract(config.usdcContractAddress, usdcAbi, provider);
      const usdcBalance: bigint = await usdcToken.balanceOf(signer.address);
      if (usdcBalance < usdcBaseUnits) {
        throw new Error(`Insufficient USDC balance. You have ${Number(usdcBalance) / 1_000_000} USDC but need ${swap.usdcAmount}. Get testnet USDC from the Sepolia USDC faucet.`);
      }

      setStep('Approving USDC spend…');

      setStep('Creating EVM HTLC…');
      const contractId = await evmHTLC.initiate(
        swap.sellerEvmAddress,
        swap.secretHash,
        swap.evmLocktime!,
        usdcBaseUnits,
      );

      // 4. Report to swap server
      setStep('Confirming with swap server…');
      await axios.post(`${SWAP_API}/api/swap/lock/evm`, {
        swapId: swap.id,
        evmContractId: contractId,
      });

      setPassword('');
      onLocked();
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Failed to lock USDC'));
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
        <p className="text-purple-200 text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Your turn: Lock {swap.usdcAmount} USDC in EVM HTLC
        </p>
        <p className="text-purple-300/70 text-xs mt-1">
          Authenticate to approve USDC and create the hash time-lock on {isSwapMainnetActive() ? 'Ethereum' : 'Sepolia'}. 24-hour refund window.
        </p>
      </div>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !loading && handleLock()}
        placeholder="Wallet password"
        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-purple-400 focus:outline-none text-sm"
      />
      <button
        onClick={handleLock}
        disabled={loading || !password.trim()}
        className="w-full px-4 py-2 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {loading ? 'Locking…' : 'Lock USDC'}
      </button>
      {loading && step && (
        <p className="text-xs text-purple-300/60 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {step}
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}
      {showPinModal && <PinEntryModal userId={userId} onSuccess={handlePinSuccess} onClose={() => setShowPinModal(false)} />}
    </div>
  );
}

// ─── Seller Claim USDC Panel (EVM_LOCKED → COMPLETE) ─────────────────────────

function SellerClaimPanel({
  swap,
  walletId,
  userId,
  onClaimed,
}: {
  swap: AtomicSwap;
  walletId: string;
  userId: string;
  onClaimed: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);

  const requirements = getSecurityRequirements(userId, 'send');
  const needsPin = requirements.includes('pin');
  const needsPasskey = requirements.includes('passkey');

  const startSecurityGate = async () => {
    setError('');
    if (needsPin) { setShowPinModal(true); return; }
    await afterPin();
  };
  const afterPin = async () => {
    if (needsPasskey && !isPasskeyAuthenticated() && !passkeyDone) {
      try { await authenticateWithPasskey(); setPasskeyDone(true); } catch { setError('Passkey authentication failed'); return; }
    }
    if (!password.trim()) return;
    await executeClaim();
  };
  const handlePinSuccess = async () => { setShowPinModal(false); await afterPin(); };

  const handleClaim = async () => {
    if (!password.trim()) return setError('Enter your wallet password');
    if (needsPin || (needsPasskey && !isPasskeyAuthenticated() && !passkeyDone)) {
      await startSecurityGate();
      return;
    }
    await executeClaim();
  };

  const executeClaim = async () => {
    setLoading(true);
    setError('');
    setStep('Unlocking wallet…');
    try {
      const config = getSwapNetworkConfig();
      const { ethers } = await import('ethers');

      // 1. Unlock wallet to get seller's EVM private key
      const wallet = await unlockWallet(walletId, password);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('No Ethereum key in wallet');

      // 2. Sign message to prove we're the seller → get secret from server
      setStep('Requesting secret from server…');
      const evmWallet = new ethers.Wallet('0x' + ethPrivateKey);
      const message = `QBTC_SWAP_SECRET:${swap.id}`;
      const signature = await evmWallet.signMessage(message);

      const resp = await axios.post(`${SWAP_API}/api/swap/secret/seller`, {
        swapId: swap.id,
        signature,
      });
      const secret: string = resp.data.secret;
      if (!secret) throw new Error('Server did not return secret');

      // 3. Call withdraw on the EVM HTLC contract
      setStep('Claiming USDC from HTLC…');
      const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);
      const evmHTLC = new EvmHTLC({
        contractAddress: config.htlcContractAddress,
        usdcAddress: config.usdcContractAddress,
        signerOrProvider: signer,
      });

      await evmHTLC.withdraw(swap.evmContractId!, secret);
      setStep('');
      setSuccess(true);
      onClaimed();
    } catch (err: any) {
      console.error('Seller claim error:', err);
      setError(err?.response?.data?.error || err?.message || 'Claim failed');
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <p className="text-emerald-300 text-xs font-medium">USDC claimed! The server will mark the swap complete shortly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-purple-300">
        <Lock className="w-4 h-4" /> Claim {swap.usdcAmount} USDC
      </div>
      <p className="text-xs text-purple-200/60">Both sides locked. Authenticate to claim the buyer's USDC.</p>
      <input
        type="password"
        placeholder="Wallet password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm"
      />
      <button
        onClick={handleClaim}
        disabled={loading || !password.trim()}
        className="w-full px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        Claim USDC
      </button>
      {loading && step && (
        <p className="text-xs text-purple-300/60 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {step}
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}
      {showPinModal && <PinEntryModal userId={userId} onSuccess={handlePinSuccess} onClose={() => setShowPinModal(false)} />}
    </div>
  );
}

// ─── Buyer Claim QBTC Panel (COMPLETE → redeem QBTC HTLC) ───────────────────

function BuyerClaimQBTCPanel({
  swap,
  walletAddress,
  onClaimed,
}: {
  swap: AtomicSwap;
  walletAddress: string;
  onClaimed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [txid, setTxid] = useState('');

  const handleClaim = async () => {
    setLoading(true);
    setError('');
    try {
      const network: QBTCNetwork = isSwapMainnetActive() ? 'mainnet' : 'testnet';

      // 1. Reconstruct the HTLC script
      setStep('Building HTLC claim transaction…');
      const htlcParams: QBTCHtlcParams = {
        sellerPubKeyHex: swap.sellerPubKeyHex,
        secretHashHex: swap.secretHash,
        locktime: swap.qbtcLocktime!,
      };
      const htlcScript = createHTLCScript(htlcParams);
      const htlcAddress = getHTLCAddress(htlcScript, network);

      // 2. Scan for UTXOs at the HTLC address
      setStep('Scanning HTLC address for funds…');
      const qbtcChain = new QBTCChain(getQBTCRpcSettings());
      const utxos = await qbtcChain.scanUTXOs(htlcAddress);
      if (utxos.length === 0) throw new Error(`No funds found at HTLC address ${htlcAddress}. Already claimed?`);

      // 3. Build claim tx (hash-only mode — no key needed, just secret)
      setStep('Signing claim transaction…');
      const rawTx = await createHTLCClaimTransaction(
        htlcScript,
        utxos,
        swap.secret!,
        null, // hash-only mode
        walletAddress,
        network,
      );

      // 4. Broadcast
      setStep('Broadcasting to QBTC network…');
      const claimTxid = await qbtcChain.broadcastRawTransaction(rawTx);

      // 5. Record claim txid on server so it persists across refreshes
      setStep('Recording claim…');
      try {
        await axios.post(`${SWAP_API}/api/swap/claim/qbtc`, { swapId: swap.id, claimTxid });
      } catch (e) {
        console.warn('Failed to record QBTC claim txid on server:', e);
      }

      setTxid(claimTxid);
      setSuccess(true);
      onClaimed();
    } catch (err: any) {
      console.error('Buyer QBTC claim error:', err);
      setError(err?.message || 'Claim failed');
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-emerald-300 text-xs font-medium">QBTC claimed!</p>
        </div>
        {txid && <p className="text-[10px] font-mono text-emerald-400/70">txid: {txid.slice(0, 16)}…</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
        <KeyRound className="w-4 h-4" /> Claim {swap.qbtcAmount} QBTC
      </div>
      <p className="text-xs text-emerald-200/60">The secret has been revealed. Claim your QBTC from the HTLC — no password needed.</p>
      <button
        onClick={handleClaim}
        disabled={loading}
        className="w-full py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 text-sm font-semibold hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        {loading ? 'Claiming…' : 'Claim QBTC Now'}
      </button>
      {loading && step && (
        <p className="text-xs text-emerald-300/60 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {step}
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}
    </div>
  );
}

// ─── Single Swap Card ────────────────────────────────────────────────────────

function SwapCard({
  swap,
  walletAddress,
  walletId,
  userId,
  onRefresh,
}: {
  swap: AtomicSwap;
  walletAddress: string;
  walletId: string;
  userId: string;
  onRefresh: () => void;
}) {
  const isSeller = swap.sellerQbtcAddress?.toLowerCase() === walletAddress.toLowerCase();
  const isBuyer = swap.buyerQbtcAddress?.toLowerCase() === walletAddress.toLowerCase();
  const role = isSeller ? 'Seller' : isBuyer ? 'Buyer' : 'Unknown';

  const qbtcCountdown = useCountdown(swap.qbtcLocktime);
  const evmCountdown = useCountdown(swap.evmLocktime);

  const needsSellerLock = isSeller && swap.status === 'PENDING_QBTC_LOCK';
  const needsBuyerLock = isBuyer && swap.status === 'QBTC_LOCKED';
  const needsSellerClaim = isSeller && swap.status === 'EVM_LOCKED';
  const waitingForOther =
    (isSeller && swap.status === 'QBTC_LOCKED') ||
    (isBuyer && swap.status === 'PENDING_QBTC_LOCK') ||
    (isBuyer && swap.status === 'EVM_LOCKED');

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(swap.status)}`}>
            {statusLabel(swap.status)}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {role}
          </span>
        </div>
        <span className="text-xs text-slate-500 font-mono">{swap.id.slice(0, 8)}…</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-slate-400">QBTC</span><p className="font-mono font-semibold">{swap.qbtcAmount}</p></div>
        <div><span className="text-slate-400">USDC</span><p className="font-mono font-semibold">{swap.usdcAmount}</p></div>
      </div>

      {(swap.qbtcLocktime || swap.evmLocktime) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            <span className="text-slate-500">QBTC Lock</span>
            <p className="font-mono text-amber-300">{qbtcCountdown || '—'}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            <span className="text-slate-500">USDC Lock</span>
            <p className="font-mono text-purple-300">{evmCountdown || '—'}</p>
          </div>
        </div>
      )}

      {swap.qbtcHtlcAddress && (
        <div className="text-xs flex justify-between">
          <span className="text-slate-400">QBTC HTLC</span>
          <span className="font-mono text-cyan-400">{swap.qbtcHtlcAddress.slice(0, 18)}…</span>
        </div>
      )}
      {swap.evmContractId && (
        <div className="text-xs flex justify-between">
          <span className="text-slate-400">EVM Contract</span>
          <span className="font-mono text-purple-400">{swap.evmContractId.slice(0, 14)}…</span>
        </div>
      )}
      {swap.secret && (
        <div className="text-xs flex justify-between">
          <span className="text-slate-400">Secret</span>
          <span className="font-mono text-emerald-400">{swap.secret.slice(0, 16)}…</span>
        </div>
      )}

      {needsSellerLock && <SellerLockPanel swap={swap} walletId={walletId} userId={userId} onLocked={onRefresh} />}
      {needsBuyerLock && <BuyerLockPanel swap={swap} walletId={walletId} userId={userId} onLocked={onRefresh} />}
      {needsSellerClaim && <SellerClaimPanel swap={swap} walletId={walletId} userId={userId} onClaimed={onRefresh} />}

      {waitingForOther && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <p className="text-blue-300 text-xs">
            {swap.status === 'PENDING_QBTC_LOCK' && isBuyer && 'Waiting for seller to lock QBTC…'}
            {swap.status === 'QBTC_LOCKED' && isSeller && 'QBTC locked. Waiting for buyer to lock USDC…'}
            {swap.status === 'EVM_LOCKED' && isBuyer && 'Both locked. Waiting for seller to claim USDC and reveal secret…'}
          </p>
        </div>
      )}

      {swap.status === 'COMPLETE' && isBuyer && swap.secret && swap.qbtcHtlcAddress && !swap.buyerQbtcClaimTxid && (
        <BuyerClaimQBTCPanel swap={swap} walletAddress={walletAddress} onClaimed={onRefresh} />
      )}
      {swap.status === 'COMPLETE' && isBuyer && swap.buyerQbtcClaimTxid && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-emerald-300 text-xs font-medium">QBTC claimed!</p>
          </div>
          <p className="text-[10px] font-mono text-emerald-400/70">txid: {swap.buyerQbtcClaimTxid.slice(0, 16)}…</p>
        </div>
      )}
      {swap.status === 'COMPLETE' && (!isBuyer || !swap.secret) && !swap.buyerQbtcClaimTxid && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-emerald-300 text-xs font-medium">Swap complete!</p>
        </div>
      )}
      {(swap.status === 'EXPIRED' || swap.status === 'REFUNDED') && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-red-300 text-xs">Expired. Funds can be reclaimed via timelocks.</p>
        </div>
      )}
    </div>
  );
}

// ─── V2 Swap Action Buttons ──────────────────────────────────────────────────

function V2SwapActions({
  swap,
  walletId,
  walletEvmAddress,
  walletXrpAddress,
  walletBtcPubKey = '',
  onRefresh,
}: {
  swap: V2Swap;
  walletId: string;
  walletEvmAddress: string;
  walletXrpAddress: string;
  walletBtcPubKey?: string;
  onRefresh: () => void;
}) {
  const [password, setPassword] = useState('');
  const [xrpAddrInput, setXrpAddrInput] = useState('');
  const [actionStatus, setActionStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [xrpNotFunded, setXrpNotFunded] = useState(false);
  const [faucetStatus, setFaucetStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const prevSwapStatus = useRef(swap.status);

  // Auto-poll after a lock/claim until the swap status changes (max 30s)
  useEffect(() => {
    if (actionStatus !== 'done') return;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      onRefresh();
      if (tries >= 10) clearInterval(id); // 10 × 3s = 30s max
    }, 3000);
    return () => clearInterval(id);
  }, [actionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset actionStatus once the swap status actually changes
  useEffect(() => {
    if (swap.status !== prevSwapStatus.current) {
      prevSwapStatus.current = swap.status;
      setActionStatus('idle');
    }
  }, [swap.status]);

  // Track XRP claims in localStorage so button doesn't reappear after claiming
  const xrpClaimedKey = `v2_xrp_claimed_${swap.publicId}`;
  const [xrpAlreadyClaimed, setXrpAlreadyClaimed] = useState(
    () => !!localStorage.getItem(xrpClaimedKey)
  );
  const ethClaimedKey = `v2_eth_claimed_${swap.publicId}`;
  const [ethAlreadyClaimed, setEthAlreadyClaimed] = useState(
    () => !!localStorage.getItem(ethClaimedKey)
  );
  const btcClaimedKey = `v2_btc_claimed_${swap.publicId}`;
  const [btcAlreadyClaimed, setBtcAlreadyClaimed] = useState(
    () => !!localStorage.getItem(btcClaimedKey)
  );

  const isTestnet = (import.meta.env.VITE_SWAP_NETWORK || 'testnet') !== 'mainnet';
  const isMaker = swap.authEvmAddressA?.toLowerCase() === walletEvmAddress.toLowerCase();
  const isTaker = swap.authEvmAddressB?.toLowerCase() === walletEvmAddress.toLowerCase();

  // Lock conditions — handle both XRP/ETH and ETH/XRP directions
  // canLockXrp: maker locking XRP (XRP/ETH) OR taker locking XRP (ETH/XRP)
  const canLockXrp =
    (isMaker && swap.status === 'PENDING_SIDE_A' && swap.baseChain === 'XRP') ||
    (isTaker && swap.status === 'SIDE_A_LOCKED'  && swap.quoteChain === 'XRP');
  // canLockEth: taker locking ETH (XRP/ETH) OR maker locking ETH (ETH/XRP)
  const canLockEth =
    (isTaker && swap.status === 'SIDE_A_LOCKED'  && swap.quoteChain === 'ETH') ||
    (isMaker && swap.status === 'PENDING_SIDE_A' && swap.baseChain === 'ETH');
  // canLockBtc: maker locking BTC (BTC/X) OR taker locking BTC (X/BTC)
  const canLockBtc =
    (isMaker && swap.status === 'PENDING_SIDE_A' && swap.baseChain === 'BTC') ||
    (isTaker && swap.status === 'SIDE_A_LOCKED'  && swap.quoteChain === 'BTC');

  // Claim conditions
  // canClaimEth: XRP/ETH maker claims ETH (SIDE_B_LOCKED) OR ETH/XRP taker claims ETH (COMPLETE + secret revealed)
  const canClaimEth =
    (isMaker && swap.status === 'SIDE_B_LOCKED' && swap.quoteChain === 'ETH') ||
    (isTaker && swap.status === 'COMPLETE' && swap.baseChain === 'ETH' && !!swap.secret && !ethAlreadyClaimed);
  // canClaimXrp: XRP/ETH taker claims XRP (COMPLETE + secret) OR ETH/XRP maker claims XRP (SIDE_B_LOCKED)
  //              Also: XRP/ETH maker claims XRP (COMPLETE + secret) when taker locked XRP for maker
  const canClaimXrp =
    (isTaker && swap.status === 'COMPLETE' && swap.baseChain === 'XRP' && !!swap.secret && !xrpAlreadyClaimed) ||
    (isMaker && swap.status === 'COMPLETE' && swap.baseChain === 'XRP' && !!swap.secret && !xrpAlreadyClaimed) ||
    (isMaker && swap.status === 'SIDE_B_LOCKED' && swap.quoteChain === 'XRP');
  // canClaimBtc: X/BTC maker claims BTC (SIDE_B_LOCKED + secret in localStorage)
  //              BTC/X taker claims BTC (COMPLETE + secret revealed)
  const canClaimBtc =
    (isMaker && swap.status === 'SIDE_B_LOCKED' && swap.quoteChain === 'BTC') ||
    (isTaker && swap.status === 'COMPLETE' && swap.baseChain === 'BTC' && !!swap.secret && !btcAlreadyClaimed);

  // For XRP locking: if maker locking (XRP/ETH) counterparty = taker's XRP address (sideBChainAddress)
  //                  if taker locking (ETH/XRP) counterparty = maker's XRP address (sideAChainAddress)
  const makerLockingXrp = isMaker && swap.baseChain === 'XRP';
  const storedXrpCounterparty = makerLockingXrp
    ? (swap.sideBChainAddress?.startsWith('r') ? swap.sideBChainAddress : null)
    : (swap.sideAChainAddress?.startsWith('r') ? swap.sideAChainAddress : null);
  const needsXrpAddrInput = canLockXrp && !storedXrpCounterparty;
  const takerXrpAddr = storedXrpCounterparty || xrpAddrInput.trim();

  const handleFundFromFaucet = async () => {
    try {
      setFaucetStatus('busy');
      const addr = walletXrpAddress;
      if (!addr) throw new Error('XRP address not available');
      const res = await fetch('https://faucet.altnet.rippletest.net/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: addr }),
      });
      if (!res.ok) throw new Error(`Faucet returned ${res.status}`);
      setFaucetStatus('done');
      setXrpNotFunded(false);
      setErrorMsg('');
      setActionStatus('idle');
    } catch (e: unknown) {
      setFaucetStatus('error');
      setErrorMsg(`Faucet failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleLockXrp = async () => {
    try {
      setErrorMsg('');
      setXrpNotFunded(false);
      setActionStatus('busy');

      if (!password.trim()) throw new Error('Password required');
      if (!takerXrpAddr) throw new Error('XRP address required');

      const makerIsLocking = isMaker && swap.baseChain === 'XRP'; // XRP/ETH
      // Amount + locktime depend on which side is locking
      const lockAmount = makerIsLocking ? swap.sideAAmount : swap.sideBAmount;
      const locktimeUnix = makerIsLocking ? Number(swap.sideALocktime) : Number(swap.sideBLocktime);
      const timelockSecs = locktimeUnix - Math.floor(Date.now() / 1000);
      if (timelockSecs <= 60) throw new Error('Locktime has expired or is too close to expiry');

      const seed = isTestnet
        ? await getXRPTestnetSeed(walletId, password)
        : await getXRPSeed(walletId, password);
      const xrplWallet = XRPLWallet.fromSeed(seed);

      const xrplAdapter = new XrplAdapter({
        wsUrl: isTestnet ? 'wss://s.altnet.rippletest.net:51233' : undefined,
      });

      let lockId: string;
      if (makerIsLocking) {
        // Maker knows the secret — pass it as preimage; XrplAdapter sha256s internally
        const secrets = JSON.parse(localStorage.getItem('v2_secrets') || '{}');
        const secretEntry = secrets[swap.secretHash];
        if (!secretEntry) throw new Error('Secret not found — was this offer created on this device?');
        const secret: string = typeof secretEntry === 'string' ? secretEntry : secretEntry.secret;
        ({ lockId } = await xrplAdapter.lockFunds({
          signerKey: xrplWallet,
          amount: lockAmount,
          secretHash: secret,
          timelockSecs,
          counterpartyAddress: takerXrpAddr,
        }));
      } else {
        // Taker only knows secretHash — build Condition directly from hash
        const conditionHex = encodeConditionFromHash(swap.secretHash);
        ({ lockId } = await xrplAdapter.lockFunds({
          signerKey: xrplWallet,
          amount: lockAmount,
          secretHash: swap.secretHash, // not used for condition when conditionHex provided
          timelockSecs,
          counterpartyAddress: takerXrpAddr,
          conditionHex,
        }));
      }

      const unlockedWallet = await unlockWallet(walletId, password);
      const ethSigner = new ethers.Wallet('0x' + unlockedWallet.privateKeys.ethereum);
      const ts = Math.floor(Date.now() / 1000);
      if (makerIsLocking) {
        const msg = buildV2Message('LOCK_SIDE_A', swap.baseChain as ChainId, swap.quoteChain as ChainId, swap.publicId, lockId, ts);
        const sig = await ethSigner.signMessage(msg);
        await postV2LockSideA({ swapId: swap.publicId, lockId, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
      } else {
        const msg = buildV2Message('LOCK_SIDE_B', swap.baseChain as ChainId, swap.quoteChain as ChainId, swap.publicId, lockId, ts);
        const sig = await ethSigner.signMessage(msg);
        await postV2LockSideB({ swapId: swap.publicId, lockId, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
      }

      setActionStatus('done');
      setPassword('');
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isNotFunded = /account not found|actnotfound|account.*not.*exist/i.test(msg);
      if (isNotFunded && isTestnet) {
        setXrpNotFunded(true);
        setErrorMsg('Your XRP testnet account is not activated — it needs test XRP to exist on the ledger.');
      } else {
        setErrorMsg(msg);
      }
      setActionStatus('error');
    }
  };

  const handleLockEth = async () => {
    try {
      setErrorMsg('');
      setActionStatus('busy');

      if (!password.trim()) throw new Error('Password required');

      const takerIsLocking = isTaker && swap.quoteChain === 'ETH'; // XRP/ETH: taker locks side B
      // Amount + locktime + counterparty depend on which side is locking
      const lockAmount    = takerIsLocking ? swap.sideBAmount    : swap.sideAAmount;
      const locktimeUnix  = takerIsLocking ? Number(swap.sideBLocktime) : Number(swap.sideALocktime);
      // Counterparty: who will claim this ETH?
      //   XRP/ETH: taker locks → maker claims → counterparty = sideAChainAddress (maker's ETH)
      //   ETH/XRP: maker locks → taker claims → counterparty = sideBChainAddress (taker's ETH)
      const counterpartyEth = takerIsLocking ? swap.sideAChainAddress : swap.sideBChainAddress;
      const timelockSecs  = locktimeUnix - Math.floor(Date.now() / 1000);
      if (timelockSecs <= 60) throw new Error('Locktime has expired or is too close to expiry');

      const unlockedWallet = await unlockWallet(walletId, password);
      const ethPrivKey = unlockedWallet.privateKeys.ethereum;
      const rpcUrl = import.meta.env.VITE_ETH_RPC_URL || (isTestnet ? 'https://ethereum-sepolia-rpc.publicnode.com' : 'https://ethereum-rpc.publicnode.com');
      const chainId = Number(import.meta.env.VITE_ETH_CHAIN_ID || (isTestnet ? 11155111 : 1));
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
      const ethSigner = new ethers.Wallet('0x' + ethPrivKey, provider);

      const adapterCfg = getEvmAdapterConfig('ETH');
      const evmAdapter = new EvmAdapter(adapterCfg);
      const { lockId } = await evmAdapter.lockFunds({
        signerKey: ethSigner,
        amount: lockAmount,
        secretHash: swap.secretHash,
        timelockSecs,
        counterpartyAddress: counterpartyEth!,
      });

      const ts = Math.floor(Date.now() / 1000);
      if (takerIsLocking) {
        const msg = buildV2Message('LOCK_SIDE_B', swap.baseChain as ChainId, swap.quoteChain as ChainId, swap.publicId, lockId, ts);
        const sig = await ethSigner.signMessage(msg);
        await postV2LockSideB({ swapId: swap.publicId, lockId, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
      } else {
        const msg = buildV2Message('LOCK_SIDE_A', swap.baseChain as ChainId, swap.quoteChain as ChainId, swap.publicId, lockId, ts);
        const sig = await ethSigner.signMessage(msg);
        await postV2LockSideA({ swapId: swap.publicId, lockId, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
      }

      setActionStatus('done');
      setPassword('');
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/insufficient.funds|INSUFFICIENT_FUNDS/i.test(msg)) {
        setErrorMsg('Insufficient Sepolia ETH. Get test ETH at: https://cloud.google.com/application/web3/faucet/ethereum/sepolia');
      } else {
        setErrorMsg(msg);
      }
      setActionStatus('error');
    }
  };

  const handleClaimEth = async () => {
    try {
      setErrorMsg('');
      setActionStatus('busy');
      if (!password.trim()) throw new Error('Password required');

      const unlockedWallet = await unlockWallet(walletId, password);
      const ethPrivKey = unlockedWallet.privateKeys.ethereum;
      const rpcUrl = import.meta.env.VITE_ETH_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
      const chainId = Number(import.meta.env.VITE_ETH_CHAIN_ID || 11155111);
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
      const ethSigner = new ethers.Wallet('0x' + ethPrivKey, provider);
      const adapterCfg = getEvmAdapterConfig('ETH');
      const evmAdapter = new EvmAdapter(adapterCfg);

      const makerClaimingEth = isMaker && swap.quoteChain === 'ETH'; // XRP/ETH maker claims sideBLockId
      const ethLockId = makerClaimingEth ? swap.sideBLockId! : swap.sideALockId!;

      if (makerClaimingEth) {
        // Maker knows the secret from localStorage
        const secrets = JSON.parse(localStorage.getItem('v2_secrets') || '{}');
        const secretEntry = secrets[swap.secretHash];
        if (!secretEntry) throw new Error('Secret not found — was this offer created on this device?');
        const secret: string = typeof secretEntry === 'string' ? secretEntry : secretEntry.secret;

        const claimTxHash = await evmAdapter.claimFunds({ signerKey: ethSigner, lockId: ethLockId, secret });
        // Report to server — stores secret and sets COMPLETE
        // Non-fatal: EvmMonitor will catch up on next poll if this fails
        try {
          const ts = Math.floor(Date.now() / 1000);
          const msg = `QBTC_SWAP_V2:CLAIM_SIDE_B:${swap.baseChain}:${swap.quoteChain}:${swap.publicId}:${claimTxHash}:${ts}`;
          const sig = await ethSigner.signMessage(msg);
          await postV2ClaimSideB({ swapId: swap.publicId, secret, claimTxHash, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
        } catch {
          // Non-fatal: EvmMonitor will detect the withdrawal and set COMPLETE
        }
      } else {
        // Taker claims ETH (ETH/XRP) — secret was revealed by maker on XRP chain, now in swap.secret
        if (!swap.secret) throw new Error('Secret not yet available — maker must claim XRP first');
        await evmAdapter.claimFunds({ signerKey: ethSigner, lockId: ethLockId, secret: swap.secret });
        localStorage.setItem(ethClaimedKey, '1');
        setEthAlreadyClaimed(true);
      }

      setActionStatus('done');
      setPassword('');
      onRefresh();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setActionStatus('error');
    }
  };

  const handleClaimXrp = async () => {
    try {
      setErrorMsg('');
      setXrpNotFunded(false);
      setActionStatus('busy');
      if (!password.trim()) throw new Error('Password required');

      const seed = isTestnet
        ? await getXRPTestnetSeed(walletId, password)
        : await getXRPSeed(walletId, password);
      const xrplWallet = XRPLWallet.fromSeed(seed);
      const xrplAdapter = new XrplAdapter({
        wsUrl: isTestnet ? 'wss://s.altnet.rippletest.net:51233' : undefined,
      });

      const makerClaimingXrp = isMaker && swap.quoteChain === 'XRP'; // ETH/XRP maker claims sideBLockId
      const xrpLockId = makerClaimingXrp ? swap.sideBLockId! : swap.sideALockId!;

      if (makerClaimingXrp) {
        // Maker knows the secret from localStorage
        if (!xrpLockId) throw new Error('XRP lock ID not found');
        const secrets = JSON.parse(localStorage.getItem('v2_secrets') || '{}');
        const secretEntry = secrets[swap.secretHash];
        if (!secretEntry) throw new Error('Secret not found — was this offer created on this device?');
        const secret: string = typeof secretEntry === 'string' ? secretEntry : secretEntry.secret;
        await xrplAdapter.claimFunds({ signerKey: xrplWallet, lockId: xrpLockId, secret });
        // Report to server so it stores the secret and marks COMPLETE immediately
        // (XrplMonitor also polls but this is faster)
        try {
          const unlockedWallet = await unlockWallet(walletId, password);
          const ethPrivKey = unlockedWallet.privateKeys.ethereum;
          const rpcUrl = import.meta.env.VITE_ETH_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
          const chainId = Number(import.meta.env.VITE_ETH_CHAIN_ID || 11155111);
          const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
          const ethSigner = new ethers.Wallet('0x' + ethPrivKey, provider);
          const ts = Math.floor(Date.now() / 1000);
          const msg = `QBTC_SWAP_V2:CLAIM_SIDE_B:${swap.baseChain}:${swap.quoteChain}:${swap.publicId}:${xrpLockId}:${ts}`;
          const sig = await ethSigner.signMessage(msg);
          await postV2ClaimSideB({ swapId: swap.publicId, secret, claimTxHash: xrpLockId, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
        } catch {
          // Non-fatal: XrplMonitor will catch up on next poll
        }
      } else {
        // Taker claims XRP (XRP/ETH) — secret revealed by maker via ETH withdraw
        if (!swap.secret) throw new Error('Secret not yet available — maker must claim ETH first');
        if (!xrpLockId) throw new Error('XRP lock ID not found');
        await xrplAdapter.claimFunds({ signerKey: xrplWallet, lockId: xrpLockId, secret: swap.secret });
      }

      localStorage.setItem(xrpClaimedKey, '1');
      setXrpAlreadyClaimed(true);
      setActionStatus('done');
      setPassword('');
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/tecNO_TARGET/i.test(msg)) {
        localStorage.setItem(xrpClaimedKey, '1');
        setXrpAlreadyClaimed(true);
        setActionStatus('done');
        setPassword('');
        return;
      }
      const isNotFunded = /account not found|actnotfound|account.*not.*exist/i.test(msg);
      if (isNotFunded && isTestnet) {
        setXrpNotFunded(true);
        setErrorMsg('Your XRP testnet account is not activated.');
      } else {
        setErrorMsg(msg);
      }
      setActionStatus('error');
    }
  };

  const handleLockBtc = async () => {
    try {
      setErrorMsg('');
      setActionStatus('busy');
      if (!password.trim()) throw new Error('Password required');

      const btcNetwork: 'testnet' | 'mainnet' = isTestnet ? 'testnet' : 'mainnet';
      const esploraUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';

      const unlockedWallet = await unlockWallet(walletId, password);
      const btcPrivKeyHex = unlockedWallet.privateKeys.bitcoin;
      if (!btcPrivKeyHex) throw new Error('BTC private key not found in wallet');

      // Derive our compressed pubkey
      const { secp256k1 } = await import('@noble/curves/secp256k1');
      const privBytes = Uint8Array.from(Buffer.from(btcPrivKeyHex, 'hex'));
      const pubBytes = secp256k1.getPublicKey(privBytes, true);
      const myBtcPubKeyHex = Buffer.from(pubBytes).toString('hex');

      const makerIsLocking = isMaker && swap.baseChain === 'BTC';
      const lockAmount = makerIsLocking ? swap.sideAAmount : swap.sideBAmount;
      const locktimeSecs = makerIsLocking
        ? Math.max(0, (swap.sideALocktime ?? 0) - Math.floor(Date.now() / 1000))
        : Math.max(0, (swap.sideBLocktime ?? 0) - Math.floor(Date.now() / 1000));
      const counterpartyPubKeyHex = makerIsLocking
        ? (swap.sideBPubKeyHex || '') : (swap.sideAPubKeyHex || '');
      if (!counterpartyPubKeyHex) throw new Error('Counterparty BTC pubkey not available — ensure they registered it when accepting the offer');

      const refundAddress = unlockedWallet.addresses?.bitcoin;
      if (!refundAddress) throw new Error('BTC address not in wallet');

      const { BitcoinAdapter } = await import('@/lib/adapters/BitcoinAdapter');
      const btcAdapter = new BitcoinAdapter({ chain: 'BTC', network: btcNetwork, esploraUrl });

      const result = await btcAdapter.lockFunds({
        signerKey: { privateKeyHex: btcPrivKeyHex, publicKeyHex: myBtcPubKeyHex },
        amount: Number(lockAmount),
        secretHash: swap.secretHash,
        timelockSecs: locktimeSecs,
        counterpartyAddress: refundAddress, // placeholder — script uses pubkeys
        refundAddress,
        counterpartyPubKeyHex,
      });

      if (result.htlcScriptHex) {
        localStorage.setItem(`v2_btc_script_${swap.publicId}`, result.htlcScriptHex);
      }

      // Sign and report to server
      const ethPrivKey = unlockedWallet.privateKeys.ethereum;
      const rpcUrl = import.meta.env.VITE_ETH_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
      const chainId = Number(import.meta.env.VITE_ETH_CHAIN_ID || 11155111);
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
      const ethSigner = new ethers.Wallet('0x' + ethPrivKey, provider);
      const ts = Math.floor(Date.now() / 1000);

      if (makerIsLocking) {
        const msg = `QBTC_SWAP_V2:LOCK_SIDE_A:${swap.baseChain}:${swap.quoteChain}:${swap.publicId}:${result.lockAddress}:${ts}`;
        const sig = await ethSigner.signMessage(msg);
        await postV2LockSideA({ swapId: swap.publicId, lockId: result.lockId, lockAddress: result.lockAddress, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
      } else {
        const msg = `QBTC_SWAP_V2:LOCK_SIDE_B:${swap.baseChain}:${swap.quoteChain}:${swap.publicId}:${result.lockAddress}:${ts}`;
        const sig = await ethSigner.signMessage(msg);
        await postV2LockSideB({ swapId: swap.publicId, lockId: result.lockId, lockAddress: result.lockAddress, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
      }

      setActionStatus('done');
      setPassword('');
      onRefresh();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setActionStatus('error');
    }
  };

  const handleClaimBtc = async () => {
    try {
      setErrorMsg('');
      setActionStatus('busy');
      if (!password.trim()) throw new Error('Password required');

      const btcNetwork: 'testnet' | 'mainnet' = isTestnet ? 'testnet' : 'mainnet';
      const esploraUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';

      const unlockedWallet = await unlockWallet(walletId, password);
      const btcPrivKeyHex = unlockedWallet.privateKeys.bitcoin;
      if (!btcPrivKeyHex) throw new Error('BTC private key not found in wallet');

      const { secp256k1 } = await import('@noble/curves/secp256k1');
      const privBytes = Uint8Array.from(Buffer.from(btcPrivKeyHex, 'hex'));
      const pubBytes = secp256k1.getPublicKey(privBytes, true);
      const myBtcPubKeyHex = Buffer.from(pubBytes).toString('hex');

      const makerClaimingBtc = isMaker && swap.quoteChain === 'BTC';
      const htlcScriptHex = localStorage.getItem(`v2_btc_script_${swap.publicId}`) ?? undefined;
      if (!htlcScriptHex) throw new Error('HTLC script not found — BTC must have been locked on this device');

      const lockAddress = makerClaimingBtc ? swap.sideBLockAddress! : swap.sideALockAddress!;
      const lockId = makerClaimingBtc ? swap.sideBLockId! : swap.sideALockId!;
      if (!lockAddress) throw new Error('BTC lock address not found');

      let secret: string;
      if (makerClaimingBtc) {
        const secrets = JSON.parse(localStorage.getItem('v2_secrets') || '{}');
        const entry = secrets[swap.secretHash];
        if (!entry) throw new Error('Secret not found — was this offer created on this device?');
        secret = typeof entry === 'string' ? entry : entry.secret;
      } else {
        if (!swap.secret) throw new Error('Secret not yet available — maker must claim first');
        secret = swap.secret;
      }

      const outputAddress = unlockedWallet.addresses?.bitcoin;
      if (!outputAddress) throw new Error('BTC address not in wallet');

      const { BitcoinAdapter } = await import('@/lib/adapters/BitcoinAdapter');
      const btcAdapter = new BitcoinAdapter({ chain: 'BTC', network: btcNetwork, esploraUrl });

      await btcAdapter.claimFunds({
        signerKey: { privateKeyHex: btcPrivKeyHex, publicKeyHex: myBtcPubKeyHex },
        lockId,
        secret,
        outputAddress,
        htlcScriptHex,
      });

      if (makerClaimingBtc) {
        // Non-fatal: notify server so it stores secret and marks COMPLETE
        try {
          const ethPrivKey = unlockedWallet.privateKeys.ethereum;
          const rpcUrl = import.meta.env.VITE_ETH_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
          const chainId = Number(import.meta.env.VITE_ETH_CHAIN_ID || 11155111);
          const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
          const ethSigner = new ethers.Wallet('0x' + ethPrivKey, provider);
          const ts = Math.floor(Date.now() / 1000);
          const msg = `QBTC_SWAP_V2:CLAIM_SIDE_B:${swap.baseChain}:${swap.quoteChain}:${swap.publicId}:${lockId}:${ts}`;
          const sig = await ethSigner.signMessage(msg);
          await postV2ClaimSideB({ swapId: swap.publicId, secret, claimTxHash: lockId, authEvmAddress: walletEvmAddress, signature: sig, timestamp: ts });
        } catch {
          // Non-fatal: BitcoinMonitor will detect the on-chain claim
        }
      }

      localStorage.setItem(btcClaimedKey, '1');
      setBtcAlreadyClaimed(true);
      setActionStatus('done');
      setPassword('');
      onRefresh();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setActionStatus('error');
    }
  };


    if (!isMaker && !isTaker) return null; // not our swap
    // User is a participant but has no immediate action — show waiting state
    const waitMsg =
      (isMaker && swap.status === 'SIDE_A_LOCKED') ? 'Waiting for taker to lock their side…' :
      (isTaker && swap.status === 'PENDING_SIDE_A') ? 'Waiting for maker to lock first…' :
      (isTaker && swap.status === 'SIDE_B_LOCKED') ? 'Waiting for maker to claim first — they reveal the secret which unlocks your claim…' :
      (isMaker && swap.status === 'SIDE_B_LOCKED') ? 'Waiting for counterparty to claim…' : 'Waiting…';
    return (
      <div className="pt-2 border-t border-slate-700/50">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> {waitMsg}
        </p>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-slate-700/50 space-y-2">
      {needsXrpAddrInput && (
        <div>
          <label className="block text-xs text-slate-500 mb-1">Taker's XRP address</label>
          <input
            type="text"
            value={xrpAddrInput}
            onChange={e => setXrpAddrInput(e.target.value)}
            placeholder="rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none font-mono"
          />
        </div>
      )}
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Wallet password"
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
      />
      {errorMsg && <p className="text-xs text-red-300">{errorMsg}</p>}
      {xrpNotFunded && isTestnet && walletXrpAddress && (
        <div className="rounded-lg border border-amber-700/40 bg-amber-900/20 p-2.5 space-y-1.5">
          <p className="text-xs text-amber-300 font-mono break-all">Your XRP address: {walletXrpAddress}</p>
          <button
            onClick={handleFundFromFaucet}
            disabled={faucetStatus === 'busy'}
            className="w-full py-1.5 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {faucetStatus === 'busy'
              ? <><Loader2 size={12} className="animate-spin" /> Requesting testnet XRP…</>
              : faucetStatus === 'done'
              ? <><CheckCircle2 size={12} /> Funded! Now try locking again</>
              : '⚡ Fund from Testnet Faucet (free)'}
          </button>
        </div>
      )}
      {canLockXrp && (
        <button
          onClick={handleLockXrp}
          disabled={actionStatus === 'busy' || !password.trim() || (needsXrpAddrInput && !xrpAddrInput.trim())}
          className="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {actionStatus === 'busy'
            ? <><Loader2 size={14} className="animate-spin" /> Locking XRP…</>
            : <><Lock size={14} /> Lock {makerLockingXrp ? swap.sideAAmount : swap.sideBAmount} XRP</>}
        </button>
      )}
      {canLockEth && (
        <button
          onClick={handleLockEth}
          disabled={actionStatus === 'busy' || !password.trim()}
          className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {actionStatus === 'busy'
            ? <><Loader2 size={14} className="animate-spin" /> Locking ETH…</>
            : <><Lock size={14} /> Lock {(isTaker && swap.quoteChain === 'ETH') ? swap.sideBAmount : swap.sideAAmount} ETH</>}
        </button>
      )}
      {canClaimEth && (
        <button
          onClick={handleClaimEth}
          disabled={actionStatus === 'busy' || !password.trim()}
          className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {actionStatus === 'busy'
            ? <><Loader2 size={14} className="animate-spin" /> Claiming ETH…</>
            : <><CheckCircle2 size={14} /> Claim {swap.sideBAmount} ETH</>}
        </button>
      )}
      {canClaimXrp && (
        <button
          onClick={handleClaimXrp}
          disabled={actionStatus === 'busy' || !password.trim()}
          className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {actionStatus === 'busy'
            ? <><Loader2 size={14} className="animate-spin" /> Claiming XRP…</>
            : <><CheckCircle2 size={14} /> Claim {swap.sideAAmount} XRP</>}
        </button>
      )}
      {canLockBtc && (
        <button
          onClick={handleLockBtc}
          disabled={actionStatus === 'busy' || !password.trim()}
          className="w-full py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {actionStatus === 'busy'
            ? <><Loader2 size={14} className="animate-spin" /> Locking BTC…</>
            : <><Lock size={14} /> Lock {(isMaker && swap.baseChain === 'BTC') ? swap.sideAAmount : swap.sideBAmount} BTC</>}
        </button>
      )}
      {canClaimBtc && (
        <button
          onClick={handleClaimBtc}
          disabled={actionStatus === 'busy' || !password.trim()}
          className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {actionStatus === 'busy'
            ? <><Loader2 size={14} className="animate-spin" /> Claiming BTC…</>
            : <><CheckCircle2 size={14} /> Claim {(isMaker && swap.quoteChain === 'BTC') ? swap.sideBAmount : swap.sideAAmount} BTC</>}
        </button>
      )}
      {actionStatus === 'done' && (
        <p className="text-xs text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={12} /> {(canClaimEth || canClaimXrp || canClaimBtc) ? 'Claimed!' : 'Locked on-chain!'}
          <Loader2 size={10} className="animate-spin ml-1" /> Waiting for confirmation…
        </p>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketplaceTab({
  userId,
  walletId,
  walletAddress,
  walletPubKey,
  walletEvmAddress,
  walletXrpAddress = '',
  walletBtcPubKey = '',
}: MarketplaceTabProps) {
  const [offers, setOffers] = useState<SwapOffer[]>([]);
  const [buyOffers, setBuyOffers] = useState<SwapOffer[]>([]);
  const [mySwaps, setMySwaps] = useState<AtomicSwap[]>([]);
  const [v2Swaps, setV2Swaps] = useState<V2Swap[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [loadingSwaps, setLoadingSwaps] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<SwapOffer | null>(null);
  const [selectedBuyOffer, setSelectedBuyOffer] = useState<SwapOffer | null>(null);

  // Market mode: sell QBTC or buy QBTC or multi-chain
  const [marketMode, setMarketMode] = useState<'sell' | 'buy' | 'active' | 'multichain'>('sell');

  // Create offer form
  const [qbtcAmount, setQbtcAmount] = useState('');
  const [usdcAmount, setUsdcAmount] = useState('');
  const [postPassword, setPostPassword] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [postError, setPostError] = useState('');
  const [postStep, setPostStep] = useState('');

  // Buy offer form
  const [buyQbtcAmount, setBuyQbtcAmount] = useState('');
  const [buyUsdcAmount, setBuyUsdcAmount] = useState('');
  const [buyLoading, setBuyLoading] = useState(false);
  const [buySuccess, setBuySuccess] = useState(false);
  const [buyError, setBuyError] = useState('');

  // Accept modal
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [acceptSuccess, setAcceptSuccess] = useState<AcceptResponse | null>(null);

  // Fulfil buy offer modal
  const [fulfilLoading, setFulfilLoading] = useState(false);
  const [fulfilError, setFulfilError] = useState('');

  // Cancel offer
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Offer filters / sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'qbtc-asc' | 'qbtc-desc' | 'usdc-asc' | 'usdc-desc'>('newest');
  const [showMineOnly, setShowMineOnly] = useState(false);

  const isMainnet = isSwapMainnetActive();
  const network: QBTCNetwork = isMainnet ? 'mainnet' : 'testnet';

  const fetchOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const [sellRes, buyRes] = await Promise.all([
        axios.get<SwapOffer[]>(`${SWAP_API}/api/swap/offers`),
        axios.get<SwapOffer[]>(`${SWAP_API}/api/swap/buy-offers`),
      ]);
      setOffers(sellRes.data);
      setBuyOffers(buyRes.data);
    } catch { /* non-fatal */ }
    finally { setLoadingOffers(false); }
  }, []);

  const fetchMySwaps = useCallback(async () => {
    if (!walletAddress) return;
    setLoadingSwaps(true);
    try {
      const { data } = await axios.get<AtomicSwap[]>(
        `${SWAP_API}/api/swap/by-address?qbtcAddress=${encodeURIComponent(walletAddress)}`
      );
      setMySwaps(data);
    } catch { /* non-fatal */ }
    finally { setLoadingSwaps(false); }
  }, [walletAddress]);

  const fetchV2Swaps = useCallback(async () => {
    if (!walletEvmAddress) return;
    try {
      const data = await fetchV2SwapsByAddress(walletEvmAddress);
      setV2Swaps(data);
    } catch { /* non-fatal */ }
  }, [walletEvmAddress]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);
  useEffect(() => {
    fetchMySwaps();
    const id = setInterval(fetchMySwaps, 15_000);
    return () => clearInterval(id);
  }, [fetchMySwaps]);
  useEffect(() => {
    fetchV2Swaps();
    const id = setInterval(fetchV2Swaps, 15_000);
    return () => clearInterval(id);
  }, [fetchV2Swaps]);

  // ─── Post offer + lock QBTC in one step ───
  const canPost = qbtcAmount.trim() !== '' && usdcAmount.trim() !== '' && postPassword.trim() !== '' && walletAddress && walletPubKey && walletEvmAddress;

  const handlePost = async () => {
    setPostLoading(true);
    setPostError('');
    let offer: { id?: number; secretHash?: string; qbtcLocktime?: number } | null = null;
    try {
      // 1. Create offer on server (generates secret + hash)
      setPostStep('Creating offer…');
      const { data } = await axios.post(`${SWAP_API}/api/swap/offer`, {
        sellerQbtcAddress: walletAddress,
        sellerEvmAddress: walletEvmAddress,
        sellerPubKeyHex: walletPubKey,
        qbtcAmount,
        usdcAmountRequested: usdcAmount,
      });
      offer = data;

      if (!offer?.secretHash || !offer?.qbtcLocktime) throw new Error('Server did not return secret hash');

      // 2. Unlock wallet
      setPostStep('Unlocking wallet…');
      const wallet = await unlockWallet(walletId, postPassword);
      if (!wallet.mnemonic) throw new Error('Wallet mnemonic not available. Please ensure your wallet is properly initialized.');
      const keyPair = await QBTCKeyPair.fromMnemonic(wallet.mnemonic);

      // 3. Build hash-only HTLC (no buyer needed)
      setPostStep('Building HTLC…');
      const htlcParams: QBTCHtlcParams = {
        sellerPubKeyHex: walletPubKey,
        secretHashHex: offer.secretHash,
        locktime: offer.qbtcLocktime,
      };
      const htlcScript = createHTLCScript(htlcParams);
      const htlcAddress = getHTLCAddress(htlcScript, network);

      // 4. Broadcast QBTC to HTLC address
      setPostStep('Broadcasting QBTC…');
      const qbtcChain = new QBTCChain(getQBTCRpcSettings());
      const { txid } = await qbtcChain.sendTransaction(keyPair, htlcAddress, qbtcAmount);

      // 5. Report lock to server
      setPostStep('Confirming lock…');
      await axios.post(`${SWAP_API}/api/swap/lock/offer`, {
        offerId: offer.id,
        qbtcHtlcTxid: txid,
        qbtcHtlcAddress: htlcAddress,
      });

      setPostSuccess(true);
      setQbtcAmount('');
      setUsdcAmount('');
      setPostPassword('');
      fetchOffers();
      setTimeout(() => setPostSuccess(false), 6000);
    } catch (err: unknown) {
      // Auto-cancel the offer if it was created but locking failed
      if (offer?.id) {
        try {
          await axios.post(`${SWAP_API}/api/swap/cancel/${offer.id}`, {
            sellerQbtcAddress: walletAddress,
          });
        } catch { /* best-effort cleanup */ }
        fetchOffers();
      }
      setPostError(getDisplayError(err, 'Failed to post & lock offer'));
    } finally {
      setPostLoading(false);
      setPostStep('');
    }
  };

  // ─── Accept offer ───
  const handleAccept = async () => {
    if (!selectedOffer) return;
    setAcceptLoading(true);
    setAcceptError('');
    try {
      const { data } = await axios.post<AcceptResponse>(`${SWAP_API}/api/swap/accept/${selectedOffer.id}`, {
        buyerQbtcAddress: walletAddress,
        buyerEvmAddress: walletEvmAddress,
        buyerPubKeyHex: walletPubKey,
      });
      setAcceptSuccess(data);
      setSelectedOffer(null);
      fetchOffers();
      fetchMySwaps();
      // Don't auto-dismiss — let the user interact with the USDC lock panel
    } catch (err: unknown) {
      setAcceptError(getDisplayError(err, 'Failed to accept offer'));
    } finally {
      setAcceptLoading(false);
    }
  };

  // ─── Cancel offer ───
  const handleCancel = async (offerId: string) => {
    if (!confirm('Cancel this offer? If QBTC is already locked, you\'ll need to wait for the timelock to refund.')) return;
    setCancellingId(offerId);
    try {
      const { data } = await axios.post(`${SWAP_API}/api/swap/cancel/${offerId}`, {
        sellerQbtcAddress: walletAddress,
      });
      if (data.wasLocked) {
        alert(data.message);
      }
      fetchOffers();
    } catch (err: unknown) {
      alert(getDisplayError(err, 'Failed to cancel offer'));
    } finally {
      setCancellingId(null);
    }
  };

  // ─── Post buy offer ───
  const canPostBuy = buyQbtcAmount.trim() !== '' && buyUsdcAmount.trim() !== '' && walletAddress && walletPubKey && walletEvmAddress;

  const handlePostBuy = async () => {
    setBuyLoading(true);
    setBuyError('');
    try {
      await axios.post(`${SWAP_API}/api/swap/buy-offer`, {
        buyerQbtcAddress: walletAddress,
        buyerEvmAddress: walletEvmAddress,
        buyerPubKeyHex: walletPubKey,
        qbtcAmount: buyQbtcAmount,
        usdcAmountOffered: buyUsdcAmount,
      });
      setBuySuccess(true);
      setBuyQbtcAmount('');
      setBuyUsdcAmount('');
      fetchOffers();
      setTimeout(() => setBuySuccess(false), 6000);
    } catch (err: unknown) {
      setBuyError(getDisplayError(err, 'Failed to post buy offer'));
    } finally {
      setBuyLoading(false);
    }
  };

  // ─── Fulfil buy offer (seller accepts a buy offer) ───
  const handleFulfilBuy = async () => {
    if (!selectedBuyOffer) return;
    setFulfilLoading(true);
    setFulfilError('');
    try {
      const { data } = await axios.post<AcceptResponse>(`${SWAP_API}/api/swap/accept-buy/${selectedBuyOffer.id}`, {
        sellerQbtcAddress: walletAddress,
        sellerEvmAddress: walletEvmAddress,
        sellerPubKeyHex: walletPubKey,
      });
      setAcceptSuccess(data);
      setSelectedBuyOffer(null);
      fetchOffers();
      fetchMySwaps();
    } catch (err: unknown) {
      setFulfilError(getDisplayError(err, 'Failed to fulfil buy offer'));
    } finally {
      setFulfilLoading(false);
    }
  };

  // ─── Filtered & sorted offers ───
  const filteredOffers = useMemo(() => {
    let list = [...offers];

    // Mine-only filter
    if (showMineOnly) {
      list = list.filter(o => o.sellerQbtcAddress.toLowerCase() === walletAddress.toLowerCase());
    }

    // Search: match on QBTC amount, USDC amount, or seller address
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(o =>
        o.qbtcAmount.includes(q) ||
        o.usdcAmountRequested.includes(q) ||
        o.sellerQbtcAddress.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case 'qbtc-asc':  list.sort((a, b) => Number(a.qbtcAmount) - Number(b.qbtcAmount)); break;
      case 'qbtc-desc': list.sort((a, b) => Number(b.qbtcAmount) - Number(a.qbtcAmount)); break;
      case 'usdc-asc':  list.sort((a, b) => Number(a.usdcAmountRequested) - Number(b.usdcAmountRequested)); break;
      case 'usdc-desc': list.sort((a, b) => Number(b.usdcAmountRequested) - Number(a.usdcAmountRequested)); break;
      case 'newest':
      default: break; // server already returns by created_at ASC
    }

    return list;
  }, [offers, showMineOnly, searchQuery, sortBy, walletAddress]);

  // ─── Render ───
  const activeSwaps = mySwaps.filter(s => !['COMPLETE', 'EXPIRED', 'REFUNDED'].includes(s.status));
  const pastSwaps = mySwaps.filter(s => ['COMPLETE', 'EXPIRED', 'REFUNDED'].includes(s.status));
  const v2ActiveSwaps = v2Swaps.filter(s => {
    if (V2_ACTIVE_STATUSES.has(s.status)) return true;
    // Keep COMPLETE swaps in the active list if either party still needs to claim
    if (s.status === 'COMPLETE' && s.secret) {
      const isMaker = s.authEvmAddressA?.toLowerCase() === walletEvmAddress.toLowerCase();
      const isTaker = s.authEvmAddressB?.toLowerCase() === walletEvmAddress.toLowerCase();
      const xrpClaimedKey = `v2_xrp_claimed_${s.publicId}`;
      const ethClaimedKey = `v2_eth_claimed_${s.publicId}`;
      const btcClaimedKey = `v2_btc_claimed_${s.publicId}`;
      if ((isTaker || isMaker) && s.baseChain === 'XRP' && !localStorage.getItem(xrpClaimedKey)) return true;
      if (isTaker && s.baseChain === 'ETH' && !localStorage.getItem(ethClaimedKey)) return true;
      if (isTaker && s.baseChain === 'BTC' && !localStorage.getItem(btcClaimedKey)) return true;
    }
    return false;
  });
  const v2PastSwaps   = v2Swaps.filter(s => !v2ActiveSwaps.includes(s)).slice(0, 5);
  const totalActiveCount = activeSwaps.length + v2ActiveSwaps.length;
  const claimableCount = activeSwaps.filter(s => {
    const isSeller = s.sellerQbtcAddress?.toLowerCase() === walletAddress.toLowerCase();
    return (isSeller && s.status === 'EVM_LOCKED') ||
           (!isSeller && (s.status === 'QBTC_LOCKED' || s.status === 'PENDING_QBTC_LOCK'));
  }).length + pastSwaps.filter(s => {
    const isBuyer = s.buyerQbtcAddress?.toLowerCase() === walletAddress.toLowerCase();
    return isBuyer && s.status === 'COMPLETE' && s.secret && !s.buyerQbtcClaimTxid;
  }).length;

  return (
    <div className="space-y-6">
      {/* Network banner */}
      <div className={`rounded-xl border p-3 flex items-start gap-3 ${isMainnet ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isMainnet ? 'text-emerald-400' : 'text-amber-400'}`} />
        <p className={`text-sm ${isMainnet ? 'text-emerald-200' : 'text-amber-200'}`}>
          <span className="font-semibold">{isMainnet ? 'Mainnet' : 'Testnet'}</span> — QBTC ↔ USDC atomic swaps.
          {!isMainnet && ' Tokens have no real value.'}
        </p>
      </div>

      {/* Wallet info */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-400">QBTC Address</span>
          <span className="font-mono text-cyan-300">{walletAddress.slice(0, 20)}…</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">EVM Address</span>
          <span className="font-mono text-purple-300">{walletEvmAddress.slice(0, 10)}…{walletEvmAddress.slice(-4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Public Key</span>
          <span className="font-mono text-slate-400">{walletPubKey.slice(0, 12)}…</span>
        </div>
      </div>

      {/* ─── Deploy HTLC if not configured ─── */}
      {!getSwapNetworkConfig().htlcContractAddress && (
        <DeployHTLCPanel walletId={walletId} />
      )}

      {/* ─── Accept Success Banner + Inline USDC Lock ─── */}
      {acceptSuccess && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300 font-bold text-sm">Swap Accepted!</span>
            <button onClick={() => setAcceptSuccess(null)} className="ml-auto text-slate-500 hover:text-slate-300 text-xs">✕</button>
          </div>
          <p className="text-emerald-200/80 text-xs">
            Swap <span className="font-mono">{acceptSuccess.swapId.slice(0, 8)}…</span> created.
            {acceptSuccess.evmLocked
              ? <>Your <span className="font-semibold">{acceptSuccess.usdcAmount} USDC</span> is now locked in the EVM HTLC! The seller can now claim your USDC by revealing the secret, which will allow you to claim the QBTC. Check your Active Swaps below.</>
              : acceptSuccess.status === 'QBTC_LOCKED'
                ? <>The seller's QBTC is already locked! Lock your <span className="font-semibold">{acceptSuccess.usdcAmount} USDC</span> below to complete the swap.</>
                : <>The seller needs to lock <span className="font-semibold">{acceptSuccess.qbtcAmount} QBTC</span> in the HTLC. Once confirmed, you'll be prompted to lock your USDC. This page auto-refreshes every 15 seconds.</>
            }
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
              <span className="text-slate-500">QBTC Refund</span>
              <p className="font-mono text-amber-300">{new Date(acceptSuccess.qbtcLocktime * 1000).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
              <span className="text-slate-500">USDC Refund</span>
              <p className="font-mono text-purple-300">{new Date(acceptSuccess.evmLocktime * 1000).toLocaleString()}</p>
            </div>
          </div>
          {/* Inline USDC lock when QBTC is already locked */}
          {acceptSuccess.status === 'QBTC_LOCKED' && acceptSuccess.sellerEvmAddress && !acceptSuccess.evmLocked && (
            <BuyerLockPanel
              swap={{
                id: acceptSuccess.swapId,
                offerId: '',
                sellerQbtcAddress: '',
                sellerEvmAddress: acceptSuccess.sellerEvmAddress,
                sellerPubKeyHex: acceptSuccess.sellerPubKeyHex,
                buyerQbtcAddress: walletAddress,
                buyerEvmAddress: walletEvmAddress,
                buyerPubKeyHex: acceptSuccess.buyerPubKeyHex,
                qbtcAmount: acceptSuccess.qbtcAmount,
                usdcAmount: acceptSuccess.usdcAmount,
                secretHash: acceptSuccess.secretHash,
                secret: null,
                qbtcHtlcTxid: acceptSuccess.qbtcHtlcTxid,
                qbtcHtlcAddress: acceptSuccess.qbtcHtlcAddress,
                evmContractId: null,
                qbtcLocktime: acceptSuccess.qbtcLocktime,
                evmLocktime: acceptSuccess.evmLocktime,
                status: 'QBTC_LOCKED',
                buyerQbtcClaimTxid: null,
                createdAt: new Date().toISOString(),
              } satisfies AtomicSwap}
              walletId={walletId}
              userId={userId}
              onLocked={() => {
                setAcceptSuccess(prev => prev ? { ...prev, evmLocked: true } : null);
                fetchMySwaps();
                fetchOffers();
              }}
            />
          )}
        </div>
      )}

      {/* ─── Sell / Buy / Active Toggle ─── */}
      <div className="flex rounded-xl border border-slate-700 bg-slate-900/40 overflow-hidden">
        <button
          onClick={() => setMarketMode('sell')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${marketMode === 'sell' ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Sell QBTC
        </button>
        <button
          onClick={() => setMarketMode('buy')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${marketMode === 'buy' ? 'bg-emerald-500/20 text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Buy QBTC
        </button>
        <button
          onClick={() => setMarketMode('active')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors relative ${marketMode === 'active' ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Active
          {claimableCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
              {claimableCount}
            </span>
          )}
          {claimableCount === 0 && totalActiveCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-600 text-slate-300 text-[10px] font-bold">
              {totalActiveCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setMarketMode('multichain')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${marketMode === 'multichain' ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Multi-Chain
        </button>
      </div>

      {/* ─── Post & Lock Offer (Sell) ─── */}
      {marketMode === 'sell' && (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Send className="w-4 h-4 text-cyan-400" /> Sell QBTC
        </h3>
        <p className="text-xs text-slate-400">
          Set the amount and price. Your QBTC will be locked in an HTLC immediately — ready for any buyer to accept.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300 block mb-1">QBTC Amount</label>
            <input
              type="number" value={qbtcAmount} onChange={(e) => setQbtcAmount(e.target.value)}
              placeholder="e.g. 1.0" min="0"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300 block mb-1">USDC Price</label>
            <input
              type="number" value={usdcAmount} onChange={(e) => setUsdcAmount(e.target.value)}
              placeholder="e.g. 45000" min="0"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-300 block mb-1">Wallet Password</label>
          <input
            type="password" value={postPassword} onChange={(e) => setPostPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canPost && !postLoading && handlePost()}
            placeholder="Required to sign the HTLC transaction"
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
          />
        </div>
        {postError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{postError}</div>
        )}
        {postLoading && postStep && (
          <p className="text-xs text-cyan-300/60 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> {postStep}
          </p>
        )}
        {postSuccess ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-emerald-300 text-sm font-medium">Offer posted & QBTC locked in HTLC!</p>
          </div>
        ) : (
          <button
            onClick={handlePost} disabled={!canPost || postLoading}
            className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {postLoading ? 'Posting & Locking…' : 'Post & Lock QBTC'}
          </button>
        )}
      </div>
      )}

      {/* ─── Post Buy Offer ─── */}
      {marketMode === 'buy' && (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-emerald-400" /> Buy QBTC
        </h3>
        <p className="text-xs text-slate-400">
          Post how much QBTC you want and the USDC you'll pay. Sellers can fulfil your offer.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300 block mb-1">QBTC Amount Wanted</label>
            <input
              type="number" value={buyQbtcAmount} onChange={(e) => setBuyQbtcAmount(e.target.value)}
              placeholder="e.g. 1.0" min="0"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300 block mb-1">USDC Offered</label>
            <input
              type="number" value={buyUsdcAmount} onChange={(e) => setBuyUsdcAmount(e.target.value)}
              placeholder="e.g. 45000" min="0"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:outline-none text-sm"
            />
          </div>
        </div>
        {buyError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{buyError}</div>
        )}
        {buySuccess ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-emerald-300 text-sm font-medium">Buy offer posted! Sellers can now fulfil it.</p>
          </div>
        ) : (
          <button
            onClick={handlePostBuy} disabled={!canPostBuy || buyLoading}
            className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {buyLoading ? 'Posting…' : 'Post Buy Offer'}
          </button>
        )}
      </div>
      )}

      {/* ─── Open Offers (sell/buy modes) ─── */}
      {(marketMode === 'sell' || marketMode === 'buy') && (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
            {marketMode === 'sell' ? 'Buy Orders (Want QBTC)' : 'Sell Orders (Have QBTC)'}
            {marketMode === 'sell' && buyOffers.length > 0 && (
              <span className="text-xs font-normal text-slate-500">{buyOffers.length}</span>
            )}
            {marketMode === 'buy' && offers.length > 0 && (
              <span className="text-xs font-normal text-slate-500">
                {filteredOffers.length === offers.length ? offers.length : `${filteredOffers.length}/${offers.length}`}
              </span>
            )}
          </h3>
          <button onClick={fetchOffers} disabled={loadingOffers} className="p-1.5 rounded-md hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingOffers ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ─ Sell Orders (ASK) — shown in Buy tab so buyers can accept ─ */}
        {marketMode === 'buy' && (
          <>
        {/* Filter / Sort bar */}
        {offers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search amount or address…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-xs"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="qbtc-asc">QBTC ↑</option>
              <option value="qbtc-desc">QBTC ↓</option>
              <option value="usdc-asc">USDC ↑</option>
              <option value="usdc-desc">USDC ↓</option>
            </select>
            <button
              onClick={() => setShowMineOnly(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showMineOnly
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {showMineOnly ? 'My Offers' : 'All'}
            </button>
          </div>
        )}

        {filteredOffers.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {loadingOffers ? 'Loading…' : offers.length === 0 ? 'No sell orders yet.' : 'No orders match your filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOffers.map(offer => {
              const isOwn = offer.sellerQbtcAddress.toLowerCase() === walletAddress.toLowerCase();
              const unitPrice = Number(offer.qbtcAmount) > 0
                ? (Number(offer.usdcAmountRequested) / Number(offer.qbtcAmount)).toFixed(2)
                : '—';
              return (
                <div key={offer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-semibold">{offer.qbtcAmount} QBTC</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-mono">{offer.usdcAmountRequested} USDC</span>
                      <span className="text-[10px] text-slate-500">@ ${unitPrice}/QBTC</span>
                      {offer.status === 'LOCKED' && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold">
                          QBTC LOCKED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {isOwn ? '(Your offer)' : `${offer.sellerQbtcAddress.slice(0, 16)}…`}
                    </p>
                  </div>
                  {isOwn ? (
                    <button
                      onClick={() => handleCancel(offer.id)}
                      disabled={cancellingId === offer.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
                    >
                      {cancellingId === offer.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setSelectedOffer(offer); setAcceptError(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors flex-shrink-0"
                    >
                      Accept
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}

        {/* ─ Buy Orders (BID) — shown in Sell tab so sellers can fulfil ─ */}
        {marketMode === 'sell' && (
          <>
        {buyOffers.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {loadingOffers ? 'Loading…' : 'No buy orders yet. Waiting for buyers to post offers.'}
          </div>
        ) : (
          <div className="space-y-2">
            {buyOffers.map(offer => {
              const isOwn = (offer.buyerQbtcAddress || '').toLowerCase() === walletAddress.toLowerCase();
              const unitPrice = Number(offer.qbtcAmount) > 0
                ? (Number(offer.usdcAmountRequested) / Number(offer.qbtcAmount)).toFixed(2)
                : '—';
              return (
                <div key={offer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-semibold text-emerald-300">{offer.qbtcAmount} QBTC</span>
                      <span className="text-slate-500">←</span>
                      <span className="font-mono">{offer.usdcAmountRequested} USDC</span>
                      <span className="text-[10px] text-slate-500">@ ${unitPrice}/QBTC</span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {isOwn ? '(Your buy offer)' : `Buyer: ${(offer.buyerQbtcAddress || '').slice(0, 16)}…`}
                    </p>
                  </div>
                  {isOwn ? (
                    <button
                      onClick={() => handleCancel(offer.id)}
                      disabled={cancellingId === offer.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
                    >
                      {cancellingId === offer.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setSelectedBuyOffer(offer); setFulfilError(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors flex-shrink-0"
                    >
                      Fulfil
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
      )}

      {/* ─── Active Tab ─── */}
      {marketMode === 'active' && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-400" /> Active Swaps
            {totalActiveCount > 0 && (
              <span className="text-xs font-normal text-slate-500">{totalActiveCount}</span>
            )}
          </h3>
          <button onClick={() => { fetchMySwaps(); fetchV2Swaps(); }} disabled={loadingSwaps} className="p-1.5 rounded-md hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingSwaps ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* QBTC/USDC active swaps */}
        {activeSwaps.map(swap => (
          <SwapCard key={swap.id} swap={swap} walletAddress={walletAddress} walletId={walletId} userId={userId} onRefresh={fetchMySwaps} />
        ))}

        {/* Multi-chain v2 active swaps */}
        {v2ActiveSwaps.map(swap => {
          const isMaker = swap.authEvmAddressA?.toLowerCase() === walletEvmAddress.toLowerCase();
          return (
            <div key={swap.publicId} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="text-slate-300">{swap.baseChain}</span>
                  <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-300">{swap.quoteChain}</span>
                  <span className="text-xs font-normal text-slate-500">{isMaker ? 'Maker' : 'Taker'}</span>
                </div>
                <V2SwapStatusBadge status={swap.status} isMaker={isMaker} />
              </div>
              <div className="flex items-center gap-3 text-sm font-mono text-slate-400">
                <span>{parseFloat(swap.sideAAmount ?? '0').toLocaleString(undefined, { maximumFractionDigits: 8 })} {swap.baseChain}</span>
                <span className="text-slate-600">↔</span>
                <span>{parseFloat(swap.sideBAmount ?? '0').toLocaleString(undefined, { maximumFractionDigits: 8 })} {swap.quoteChain}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono truncate max-w-[200px]">{swap.publicId}</span>
                {swap.sideALocktime && (
                  <span className="ml-auto">Expires {new Date(swap.sideALocktime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>
              <V2SwapActions
                swap={swap}
                walletId={walletId}
                walletEvmAddress={walletEvmAddress}
                walletXrpAddress={walletXrpAddress}
                walletBtcPubKey={walletBtcPubKey}
                onRefresh={fetchV2Swaps}
              />
            </div>
          );
        })}

        {totalActiveCount === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm">No active swaps.</div>
        )}

        {/* Past Swaps */}
        {(pastSwaps.length > 0 || v2PastSwaps.length > 0) && (
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-400">Completed / Expired</h3>
            {pastSwaps.map(swap => (
              <SwapCard key={swap.id} swap={swap} walletAddress={walletAddress} walletId={walletId} userId={userId} onRefresh={fetchMySwaps} />
            ))}
            {v2PastSwaps.map(swap => {
              const isMaker = swap.authEvmAddressA?.toLowerCase() === walletEvmAddress.toLowerCase();
              return (
                <div key={swap.publicId} className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3 space-y-1 opacity-60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-400">{swap.baseChain} ↔ {swap.quoteChain} <span className="text-xs text-slate-600">{isMaker ? 'Maker' : 'Taker'}</span></span>
                    <V2SwapStatusBadge status={swap.status} isMaker={isMaker} />
                  </div>
                  <p className="text-xs font-mono text-slate-600 truncate">{swap.publicId}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ─── Multi-Chain v2 Marketplace ─── */}
      {marketMode === 'multichain' && (
        <MultiChainMarketTab
          walletId={walletId}
          userId={userId}
          walletEvmAddress={walletEvmAddress}
          walletAddress={walletAddress}
          walletPubKey={walletPubKey}
          walletBtcPubKey={walletBtcPubKey}
          walletXrpAddress={walletXrpAddress}
        />
      )}

      {/* ─── Accept Offer Modal ─── */}
      {selectedOffer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">Accept Offer</h3>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">You Buy</span>
                <span className="font-semibold">{selectedOffer.qbtcAmount} QBTC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">You Pay</span>
                <span className="font-semibold">{selectedOffer.usdcAmountRequested} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Seller</span>
                <span className="font-mono text-xs text-slate-400">{selectedOffer.sellerQbtcAddress.slice(0, 16)}…</span>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200">
              <p className="font-semibold flex items-center gap-2 mb-1"><Info className="w-3.5 h-3.5" /> Your wallet details are used automatically</p>
              <p className="text-cyan-300/70">
                QBTC: {walletAddress.slice(0, 18)}… | EVM: {walletEvmAddress.slice(0, 10)}…{walletEvmAddress.slice(-4)}
              </p>
            </div>

            {acceptError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{acceptError}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedOffer(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAccept}
                disabled={acceptLoading}
                className="flex-1 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {acceptLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</> : 'Accept & Start Swap'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Fulfil Buy Offer Modal ─── */}
      {selectedBuyOffer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">Fulfil Buy Offer</h3>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Buyer Wants</span>
                <span className="font-semibold">{selectedBuyOffer.qbtcAmount} QBTC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Buyer Pays</span>
                <span className="font-semibold">{selectedBuyOffer.usdcAmountRequested} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Buyer</span>
                <span className="font-mono text-xs text-slate-400">{(selectedBuyOffer.buyerQbtcAddress || '').slice(0, 16)}…</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200/80">
              <p>You will sell <strong>{selectedBuyOffer.qbtcAmount} QBTC</strong> and receive <strong>{selectedBuyOffer.usdcAmountRequested} USDC</strong> via atomic swap.</p>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200">
              <p className="font-semibold flex items-center gap-2 mb-1"><Info className="w-3.5 h-3.5" /> Your wallet details are used automatically</p>
              <p className="text-cyan-300/70">
                QBTC: {walletAddress.slice(0, 18)}… | EVM: {walletEvmAddress.slice(0, 10)}…{walletEvmAddress.slice(-4)}
              </p>
            </div>

            {fulfilError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{fulfilError}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedBuyOffer(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleFulfilBuy}
                disabled={fulfilLoading}
                className="flex-1 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {fulfilLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Fulfilling…</> : 'Fulfil & Start Swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
