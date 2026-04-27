/**
 * XrplAdapter.ts
 *
 * IChainAdapter implementation for XRP using XRPL native escrow.
 *
 * XRP has no smart contracts.  Instead, the ledger has a native EscrowCreate /
 * EscrowFinish / EscrowCancel mechanism that is cryptographically equivalent to
 * an HTLC when the Condition + Fulfillment fields are set.
 *
 * We use PREIMAGE-SHA-256 crypto-conditions (RFC draft):
 *   lockFunds   → EscrowCreate with Condition = sha256(preimage) encoded
 *   claimFunds  → EscrowFinish with Fulfillment = preimage encoded
 *   refundFunds → EscrowCancel after CancelAfter ledger timestamp
 *
 * lockId format:  "account:offerSequence"
 *   e.g. "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh:12345"
 *
 * Dependency: xrpl npm package (already in root package.json).
 *
 * IMPORTANT: XRPL timestamps are Ripple Epoch (seconds since 2000-01-01 00:00 UTC).
 * Conversion: rippleEpoch = unixTimestamp - 946_684_800
 */

import { Client, Wallet, AccountOfferCancelRequest } from 'xrpl';
import { sha256 } from '@noble/hashes/sha256';
import type { IChainAdapter, LockParams, LockResult, ClaimParams, RefundParams, ChainId } from './IChainAdapter.ts';

// ─── XRPL time helpers ────────────────────────────────────────────────────────

const RIPPLE_EPOCH_OFFSET = 946_684_800;

function toRippleEpoch(unixTimestamp: number): number {
  return unixTimestamp - RIPPLE_EPOCH_OFFSET;
}

function rippleEpochNow(): number {
  return toRippleEpoch(Math.floor(Date.now() / 1000));
}

// ─── Crypto-condition helpers (PREIMAGE-SHA-256) ──────────────────────────────
//
// Spec: https://datatracker.ietf.org/doc/html/draft-thomas-crypto-conditions
//
// DER encoding for PREIMAGE-SHA-256 type (tag = 0):
//   Fulfillment: A0 [len] 80 [preimage_len] [preimage]
//   Condition:   A0 [len] 80 20 [sha256_32] 81 [cost_len] [cost]
//
// For a 32-byte preimage:
//   Fulfillment  = A0 22 80 20 [32 bytes] (36 bytes total)
//   Condition    = A0 27 80 20 [32 bytes] 81 01 20 (41 bytes total, cost=0x20=32)

function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x81, n]);
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
}

/** Minimal unsigned DER integer encoding (big-endian, no leading zeros unless high bit set) */
function derUint(n: number): Buffer {
  if (n === 0) return Buffer.from([0x00]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  if (bytes[0] & 0x80) bytes.unshift(0x00); // ensure positive
  return Buffer.from(bytes);
}

/**
 * Encode a preimage as a PREIMAGE-SHA-256 fulfillment.
 * XRPL requires the hex to be uppercase.
 */
export function encodeFulfillment(preimage: Buffer): string {
  const inner = Buffer.concat([Buffer.from([0x80]), derLength(preimage.length), preimage]);
  const outer = Buffer.concat([Buffer.from([0xa0]), derLength(inner.length), inner]);
  return outer.toString('hex').toUpperCase();
}

/**
 * Encode a preimage as a PREIMAGE-SHA-256 condition.
 * XRPL requires the hex to be uppercase.
 */
export function encodeCondition(preimage: Buffer): string {
  const fingerprint = Buffer.from(sha256(preimage));
  const costBytes = derUint(preimage.length);

  const fingerprintField = Buffer.concat([
    Buffer.from([0x80]),
    derLength(fingerprint.length),
    fingerprint,
  ]);
  const costField = Buffer.concat([
    Buffer.from([0x81]),
    derLength(costBytes.length),
    costBytes,
  ]);

  const inner = Buffer.concat([fingerprintField, costField]);
  const outer = Buffer.concat([Buffer.from([0xa0]), derLength(inner.length), inner]);
  return outer.toString('hex').toUpperCase();
}

/**
 * Decode the 32-byte preimage from a PREIMAGE-SHA-256 fulfillment hex string.
 * Returns null if the encoding is unrecognised or the data is malformed.
 */
export function decodeFulfillmentPreimage(fulfillmentHex: string): Buffer | null {
  try {
    const buf = Buffer.from(fulfillmentHex, 'hex');
    // Outer tag must be 0xA0 (PREIMAGE type)
    if (buf[0] !== 0xa0) return null;
    let outerIdx = 1;
    // Skip outer length field
    if (buf[outerIdx] & 0x80) outerIdx += (buf[outerIdx] & 0x7f) + 1;
    else outerIdx += 1;
    // Inner tag must be 0x80 (preimage field)
    if (buf[outerIdx] !== 0x80) return null;
    outerIdx += 1;
    const preimageLen = buf[outerIdx] & 0x80
      ? buf.readUIntBE(outerIdx + 1, buf[outerIdx] & 0x7f)
      : buf[outerIdx];
    const preimageStart = buf[outerIdx] & 0x80
      ? outerIdx + 1 + (buf[outerIdx] & 0x7f)
      : outerIdx + 1;
    return buf.slice(preimageStart, preimageStart + preimageLen);
  } catch {
    return null;
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface XrplAdapterConfig {
  /** XRPL WebSocket URL. Defaults to Mainnet. */
  wsUrl?: string;
}

const DEFAULT_XRPL_MAINNET_URL = 'wss://xrplcluster.com';
const DEFAULT_XRPL_TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';

// ─── XrplAdapter ──────────────────────────────────────────────────────────────

export class XrplAdapter implements IChainAdapter {
  readonly chain: ChainId = 'XRP';
  private readonly wsUrl: string;

  constructor(config: XrplAdapterConfig = {}) {
    this.wsUrl = config.wsUrl ?? DEFAULT_XRPL_MAINNET_URL;
  }

  private async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client(this.wsUrl);
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.disconnect();
    }
  }

  // ── lockFunds ───────────────────────────────────────────────────────────────

  /**
   * Lock XRP in an EscrowCreate.
   *
   * signerKey must be an xrpl.Wallet instance.
   * amount is in XRP (e.g. "10.5").
   * counterpartyAddress is the XRPL address of the party who will claim with the secret.
   */
  async lockFunds(params: LockParams): Promise<LockResult> {
    const wallet = params.signerKey as Wallet;
    if (!wallet || !wallet.classicAddress) {
      throw new Error('XrplAdapter.lockFunds: signerKey must be an xrpl.Wallet');
    }

    const preimage = Buffer.from(params.secretHash, 'hex');
    const condition = encodeCondition(preimage);
    const cancelAfterRipple = rippleEpochNow() + params.timelockSecs;
    const amountDrops = String(Math.round(parseFloat(params.amount) * 1_000_000));

    const lockId = await this.withClient(async (client) => {
      const prepared = await client.autofill({
        TransactionType: 'EscrowCreate',
        Account: wallet.classicAddress,
        Destination: params.counterpartyAddress,
        Amount: amountDrops,
        Condition: condition,
        CancelAfter: cancelAfterRipple,
      });

      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      if ((result.result.meta as any)?.TransactionResult !== 'tesSUCCESS') {
        throw new Error(
          `EscrowCreate failed: ${(result.result.meta as any)?.TransactionResult}`,
        );
      }

      const seq: number = (result.result as any).Sequence;
      return `${wallet.classicAddress}:${seq}`;
    });

    return { lockId };
  }

  // ── claimFunds ──────────────────────────────────────────────────────────────

  /**
   * Claim XRP from an escrow by submitting EscrowFinish with the fulfillment.
   *
   * signerKey must be an xrpl.Wallet (the claimer — who receives the XRP).
   * lockId format: "ownerAccount:offerSequence"
   */
  async claimFunds(params: ClaimParams): Promise<string> {
    const wallet = params.signerKey as Wallet;
    if (!wallet || !wallet.classicAddress) {
      throw new Error('XrplAdapter.claimFunds: signerKey must be an xrpl.Wallet');
    }

    const [ownerAccount, seqStr] = params.lockId.split(':');
    const offerSequence = parseInt(seqStr, 10);
    if (!ownerAccount || isNaN(offerSequence)) {
      throw new Error(`XrplAdapter.claimFunds: invalid lockId format — expected "account:seq"`);
    }

    const secretBuf = Buffer.from(params.secret, 'hex');
    const fulfillment = encodeFulfillment(secretBuf);
    const condition = encodeCondition(secretBuf);

    return this.withClient(async (client) => {
      const prepared = await client.autofill({
        TransactionType: 'EscrowFinish',
        Account: wallet.classicAddress,
        Owner: ownerAccount,
        OfferSequence: offerSequence,
        Condition: condition,
        Fulfillment: fulfillment,
      });

      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      if ((result.result.meta as any)?.TransactionResult !== 'tesSUCCESS') {
        throw new Error(
          `EscrowFinish failed: ${(result.result.meta as any)?.TransactionResult}`,
        );
      }

      return (result.result as any).hash as string;
    });
  }

  // ── refundFunds ─────────────────────────────────────────────────────────────

  /**
   * Cancel an escrow after its CancelAfter time has passed.
   *
   * signerKey must be an xrpl.Wallet (the original escrow creator).
   * lockId format: "ownerAccount:offerSequence"
   */
  async refundFunds(params: RefundParams): Promise<string> {
    const wallet = params.signerKey as Wallet;
    if (!wallet || !wallet.classicAddress) {
      throw new Error('XrplAdapter.refundFunds: signerKey must be an xrpl.Wallet');
    }

    const [ownerAccount, seqStr] = params.lockId.split(':');
    const offerSequence = parseInt(seqStr, 10);
    if (!ownerAccount || isNaN(offerSequence)) {
      throw new Error(`XrplAdapter.refundFunds: invalid lockId format — expected "account:seq"`);
    }

    return this.withClient(async (client) => {
      const prepared = await client.autofill({
        TransactionType: 'EscrowCancel',
        Account: wallet.classicAddress,
        Owner: ownerAccount,
        OfferSequence: offerSequence,
      } as any);

      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      if ((result.result.meta as any)?.TransactionResult !== 'tesSUCCESS') {
        throw new Error(
          `EscrowCancel failed: ${(result.result.meta as any)?.TransactionResult}`,
        );
      }

      return (result.result as any).hash as string;
    });
  }
}

// ─── Config factory ───────────────────────────────────────────────────────────

export function getXrplAdapterConfig(isTestnet = false): XrplAdapterConfig {
  return {
    wsUrl:
      import.meta.env.VITE_XRPL_WS_URL ||
      (isTestnet ? DEFAULT_XRPL_TESTNET_URL : DEFAULT_XRPL_MAINNET_URL),
  };
}
