/**
 * swapV2Api.ts
 *
 * Typed client helpers for the multi-chain atomic swap v2 API.
 * All EVM auth signatures are built and signed client-side before calling.
 */

import { ethers } from 'ethers';

const SWAP_API = (import.meta.env.VITE_SWAP_API_URL || '').replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChainId = 'QBTC' | 'BTC' | 'ETH' | 'BNB' | 'USDC' | 'XRP';

export interface V2Offer {
  id: string;
  publicId?: string;
  baseChain: ChainId;
  quoteChain: ChainId;
  baseAmount: string;
  quoteAmount: string;
  secretHash: string;
  makerLocktime: number;
  makerChainAddress: string;
  makerPubKeyHex?: string;
  authEvmAddress: string;
  offerType: 'ASK' | 'BID';
  status: 'OPEN' | 'MATCHED' | 'LOCKED' | 'COMPLETE' | 'EXPIRED';
  createdAt: string;
}

export interface V2Swap {
  id: string;
  publicId: string;
  offerId: string;
  baseChain: ChainId;
  quoteChain: ChainId;
  sideAAmount: string;
  sideBAmount: string;
  sideAChainAddress: string;
  sideBChainAddress: string;
  authEvmAddressA: string;
  authEvmAddressB: string;
  secretHash: string;
  sideALocktime: number;
  sideBLocktime: number;
  sideALockId?: string;
  sideALockAddress?: string;
  sideBLockId?: string;
  status: 'PENDING_SIDE_A' | 'SIDE_A_LOCKED' | 'SIDE_B_LOCKED' | 'COMPLETE' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
}

export interface V2PairInfo {
  baseChain: ChainId;
  quoteChain: ChainId;
  openOffers: number;
  bestAsk?: number;
  bestBid?: number;
}

export interface V2Stats {
  swaps: {
    baseChain: ChainId;
    quoteChain: ChainId;
    total: number;
    completed: number;
    expired: number;
    active: number;
  }[];
  offers: {
    baseChain: ChainId;
    quoteChain: ChainId;
    open: number;
    matched: number;
  }[];
}

export interface CreateOfferParams {
  baseChain: ChainId;
  quoteChain: ChainId;
  baseAmount: string;
  quoteAmount: string;
  secretHash: string;
  makerLocktime: number;
  makerChainAddress: string;
  makerPubKeyHex?: string;
  authEvmAddress: string;
  signature: string;
  timestamp: number;
}

export interface AcceptOfferParams {
  offerId: string;
  takerChainAddress: string;
  authEvmAddress: string;
  signature: string;
  timestamp: number;
}

export interface RecordLockParams {
  swapId: string;
  lockId: string;
  lockAddress?: string;
  authEvmAddress: string;
  signature: string;
  timestamp: number;
}

// ─── Canonical message builders (must match server exactly) ──────────────────

export type V2Action =
  | 'CREATE_OFFER'
  | 'ACCEPT_OFFER'
  | 'LOCK_SIDE_A'
  | 'LOCK_SIDE_B';

/**
 * Build a canonical message string for EVM personal_sign.
 * Must match `buildV2Message` in swap-server/index.ts exactly.
 */
export function buildV2Message(
  action: 'CREATE_OFFER',
  baseChain: ChainId,
  quoteChain: ChainId,
  authEvmAddress: string,
  baseAmount: string,
  quoteAmount: string,
  secretHash: string,
  makerLocktime: number,
  timestamp: number,
): string;

export function buildV2Message(
  action: 'ACCEPT_OFFER',
  baseChain: ChainId,
  quoteChain: ChainId,
  offerId: string,
  authEvmAddress: string,
  timestamp: number,
): string;

export function buildV2Message(
  action: 'LOCK_SIDE_A' | 'LOCK_SIDE_B',
  baseChain: ChainId,
  quoteChain: ChainId,
  swapId: string,
  lockId: string,
  timestamp: number,
): string;

export function buildV2Message(
  action: V2Action,
  baseChain: ChainId,
  quoteChain: ChainId,
  ...parts: (string | number)[]
): string {
  return `QBTC_SWAP_V2:${action}:${baseChain}:${quoteChain}:${parts.join(':')}`;
}

// ─── EVM signing helpers ──────────────────────────────────────────────────────

/**
 * Sign a message using window.ethereum (MetaMask) personal_sign.
 * Returns the hex signature string.
 */
export async function evmSignMessage(message: string, address: string): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask (or compatible wallet) not found');
  const provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
  const signer = await provider.getSigner(address);
  return signer.signMessage(message);
}

/**
 * Get the connected EVM address from MetaMask.
 * Requests connection if not already connected.
 */
export async function getEvmAddress(): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask not found');
  const provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
  const signer = await provider.getSigner();
  return signer.getAddress();
}

/**
 * Generate a cryptographically random 32-byte secret.
 * Returns { secret: hex string, secretHash: SHA-256(secret) hex string }
 */
export async function generateSecret(): Promise<{ secret: string; secretHash: string }> {
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);
  const secretHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { secret, secretHash };
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchV2Pairs(): Promise<V2PairInfo[]> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/pairs`);
  if (!res.ok) throw new Error(`Failed to fetch pairs: ${res.statusText}`);
  return res.json();
}

export async function fetchV2Offers(base: ChainId, quote: ChainId, limit = 50): Promise<V2Offer[]> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/offers?base=${base}&quote=${quote}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch offers: ${res.statusText}`);
  return res.json();
}

export async function fetchV2Stats(base?: ChainId, quote?: ChainId): Promise<V2Stats> {
  const q = base && quote ? `?base=${base}&quote=${quote}` : '';
  const res = await fetch(`${SWAP_API}/api/swap/v2/stats${q}`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  return res.json();
}

export async function fetchV2Swap(swapId: string): Promise<V2Swap> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/${swapId}`);
  if (!res.ok) throw new Error(`Swap not found: ${res.statusText}`);
  return res.json();
}

export async function fetchV2SwapsByAddress(evmAddress: string): Promise<V2Swap[]> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/by-address?evmAddress=${encodeURIComponent(evmAddress)}`);
  if (!res.ok) throw new Error(`Failed to fetch swaps: ${res.statusText}`);
  return res.json();
}

export async function postV2Offer(params: CreateOfferParams): Promise<V2Offer> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function postV2Accept(params: AcceptOfferParams): Promise<{
  swapId: string;
  secretHash: string;
  sideALocktime: number;
  sideBLocktime: number;
  baseChain: ChainId;
  quoteChain: ChainId;
  baseAmount: string;
  quoteAmount: string;
}> {
  const { offerId, ...body } = params;
  const res = await fetch(`${SWAP_API}/api/swap/v2/accept/${offerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function postV2LockSideA(params: RecordLockParams): Promise<{ status: string; swapId: string; lockId: string }> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/lock/side-a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function postV2LockSideB(params: RecordLockParams): Promise<{ status: string; swapId: string; lockId: string }> {
  const res = await fetch(`${SWAP_API}/api/swap/v2/lock/side-b`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}
