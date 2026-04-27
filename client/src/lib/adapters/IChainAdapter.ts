/**
 * IChainAdapter.ts
 *
 * Shared interface and types for chain-specific HTLC adapters.
 * Each adapter handles lock / claim / refund for one chain family.
 *
 * Chain coverage:
 *   EvmAdapter    → ETH, BNB, USDC  (all EVM-compatible)
 *   BitcoinAdapter → QBTC, BTC       (Bitcoin Script P2WSH)
 *   XrplAdapter   → XRP              (XRPL native EscrowCreate)
 */

export type ChainId = 'QBTC' | 'BTC' | 'ETH' | 'BNB' | 'USDC' | 'XRP';

export const SUPPORTED_CHAINS: ChainId[] = ['QBTC', 'BTC', 'ETH', 'BNB', 'USDC', 'XRP'];

/** All valid (base, quote) trading pairs — no SOL for now. */
export const SUPPORTED_PAIRS = new Set([
  'QBTC/USDC', 'QBTC/ETH', 'QBTC/BNB', 'QBTC/BTC', 'QBTC/XRP',
  'ETH/USDC',  'ETH/BNB',  'ETH/BTC',  'ETH/XRP',
  'BNB/USDC',  'BNB/BTC',  'BNB/XRP',
  'USDC/BTC',  'USDC/XRP',
  'BTC/XRP',
]);

export function isPairSupported(base: ChainId, quote: ChainId): boolean {
  return SUPPORTED_PAIRS.has(`${base}/${quote}`);
}

// ─── Lock params ─────────────────────────────────────────────────────────────

export interface LockParams {
  /** 32-byte secret hash, hex-encoded, no 0x prefix */
  secretHash: string;
  /** Amount in native coin units as a decimal string, e.g. "1.50000000" BTC, "45.000000" USDC */
  amount: string;
  /** Seconds from now until the refund (OP_CLTV / EscrowCancel) path unlocks */
  timelockSecs: number;
  /** Address on this chain where the counterparty receives funds when they reveal the secret */
  counterpartyAddress: string;
  /**
   * Chain-specific signing credential.
   * Cast to the concrete type inside each adapter:
   *   EVM     → ethers.Signer
   *   BTC     → BtcSignerKey
   *   QBTC    → QBTCKeyPair (from qbtcService)
   *   XRP     → xrpl.Wallet
   */
  signerKey: unknown;
  /** Address on this chain that receives funds if the HTLC is refunded (i.e. the locker) */
  refundAddress: string;
}

export interface LockResult {
  /**
   * Canonical lock identifier:
   *   EVM   — bytes32 contractId hex string ("0x…")
   *   BTC/QBTC — P2WSH funding txid
   *   XRP   — "account:offerSequence" string
   */
  lockId: string;
  /** P2WSH bech32 address — Bitcoin/QBTC only */
  lockAddress?: string;
  /** Output index in the funding tx — Bitcoin/QBTC only */
  vout?: number;
}

// ─── Claim params ─────────────────────────────────────────────────────────────

export interface ClaimParams {
  lockId: string;
  /** 32-byte preimage (the secret), hex-encoded, no 0x prefix */
  secret: string;
  /** Address on this chain to receive the claimed funds */
  outputAddress: string;
  /** Chain-specific signing credential */
  signerKey: unknown;
  /** Bitcoin/QBTC only — unspent outputs funding the HTLC */
  utxos?: BitcoinUtxo[];
  /** Bitcoin/QBTC only — hex-encoded redeem script */
  htlcScriptHex?: string;
}

// ─── Refund params ────────────────────────────────────────────────────────────

export interface RefundParams {
  lockId: string;
  /** Address on this chain to receive the refunded funds */
  outputAddress: string;
  /** Chain-specific signing credential */
  signerKey: unknown;
  /** Bitcoin/QBTC only — unspent outputs funding the HTLC */
  utxos?: BitcoinUtxo[];
  /** Bitcoin/QBTC only — hex-encoded redeem script */
  htlcScriptHex?: string;
  /** Bitcoin/QBTC only — absolute locktime from the HTLC script (unix timestamp) */
  locktime?: number;
}

// ─── Shared sub-types ─────────────────────────────────────────────────────────

/** UTXO descriptor for Bitcoin / QBTC HTLCs */
export interface BitcoinUtxo {
  txid: string;
  vout: number;
  /** Amount in coin units (not satoshis) e.g. 1.50000000 */
  amount: number;
}

/** Minimal signer key for standard Bitcoin (ECDSA-only, no Dilithium) */
export interface BtcSignerKey {
  /** Compressed secp256k1 private key, 32-byte hex */
  privateKeyHex: string;
  /** Compressed secp256k1 public key, 33-byte hex */
  publicKeyHex: string;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface IChainAdapter {
  readonly chain: ChainId;

  /**
   * Lock funds in an HTLC on this chain.
   *
   * The caller supplies the secret hash and a timelock; the adapter builds,
   * signs, and broadcasts the locking transaction.  Returns a lockId and
   * (for Bitcoin chains) the P2WSH address.
   */
  lockFunds(params: LockParams): Promise<LockResult>;

  /**
   * Claim funds locked in an HTLC by revealing the preimage.
   *
   * Returns the claim transaction ID (Bitcoin / XRPL) or transaction hash (EVM).
   */
  claimFunds(params: ClaimParams): Promise<string>;

  /**
   * Refund locked funds back to the original locker after the timelock expires.
   *
   * Returns the refund transaction ID or hash.
   */
  refundFunds(params: RefundParams): Promise<string>;
}
