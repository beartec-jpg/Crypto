/**
 * XrplMonitor.ts
 *
 * Server-side monitor for the XRP Ledger.
 *
 * Polls for XRPL EscrowFinish transactions targeting active swap escrows.
 * Extracts the preimage from the `Fulfillment` field (PREIMAGE-SHA-256
 * crypto-condition DER encoding) using the same decoder as XrplAdapter.ts.
 *
 * The lockId format expected in the DB is: "account:offerSequence"
 * where `account` is the escrow creator and `offerSequence` is the escrow's
 * OfferSequence / CreateSequence value.
 *
 * XRPL native escrow notes:
 *   - Once an EscrowFinish is submitted the escrow is gone — no second claim
 *   - Once the CancelAfter time passes any party can submit EscrowCancel
 *   - We poll `account_tx` for the owner account looking for EscrowFinish
 *     transactions that match our OfferSequence
 */

import type { Client as XrplClient, AccountTxTransaction } from 'xrpl';
import type { Pool } from 'pg';
import { BaseMonitor } from './IChainAdapter.ts';
import type { IChainMonitor, LockVerification, ChainId } from './IChainAdapter.ts';

// ─── Preimage decoder (mirrors XrplAdapter.ts) ─────────────────────────────

/**
 * Decode the 32-byte preimage from a PREIMAGE-SHA-256 crypto-condition
 * Fulfillment.  The DER encoding is:
 *   A0 <len> A0 <len> 04 <len> <preimage bytes>
 *
 * Returns the preimage as a hex string (lowercase, no 0x), or null if the
 * fulfillment is missing or malformed.
 */
export function decodeFulfillmentPreimage(fulfillmentHex: string): string | null {
  try {
    const normalized = fulfillmentHex.startsWith('0x')
      ? fulfillmentHex.slice(2)
      : fulfillmentHex;
    const buf = Buffer.from(normalized, 'hex');
    // PREIMAGE-SHA-256 crypto-condition fulfillment: A0 [len] 80 [len] [preimage]
    let offset = 0;
    // Outer PREIMAGE-SHA-256 type (0xA0)
    if (buf[offset++] !== 0xa0) return null;
    offset = skipDerLen(buf, offset);
    // Inner preimage bytes field (0x80, primitive context-specific 0)
    if (buf[offset++] !== 0x80) return null;
    const preimageLen = buf[offset++];
    if (preimageLen !== 32) return null;
    return buf.slice(offset, offset + 32).toString('hex');
  } catch {
    return null;
  }
}

function skipDerLen(buf: Buffer, offset: number): number {
  const b = buf[offset++];
  if (b < 0x80) return offset;          // short form
  const extra = b & 0x7f;               // number of length bytes
  return offset + extra;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface XrplMonitorConfig {
  /** XRPL WebSocket URL */
  wsUrl: string;
  /** Grace period in seconds after escrow CancelAfter before declaring EXPIRED */
  graceSecs?: number;
}

// ─── XrplMonitor ─────────────────────────────────────────────────────────────

export class XrplMonitor extends BaseMonitor implements IChainMonitor {
  readonly chain: ChainId = 'XRP';
  private readonly config: XrplMonitorConfig;
  private readonly graceSecs: number;

  constructor(config: XrplMonitorConfig) {
    super();
    this.config    = config;
    this.graceSecs = config.graceSecs ?? 3600;
  }

  // ── IChainMonitor ───────────────────────────────────────────────────────────

  async verifyLock(
    lockId: string,
    _expectedAmount: string,
    _expectedHash: string,
  ): Promise<LockVerification> {
    const [account, seqStr] = lockId.split(':');
    if (!account || !seqStr) return { valid: false, reason: 'Invalid lockId format (expected account:sequence)' };

    try {
      const client = await this._connect();
      try {
        const resp = await client.request({
          command: 'account_objects',
          account,
          type:    'escrow',
        } as any);
        const objects = (resp.result as any).account_objects as any[];
        const seq = parseInt(seqStr, 10);
        const escrow = objects.find(
          (o: any) => o.LedgerEntryType === 'Escrow' && o.Sequence === seq,
        );
        if (!escrow) return { valid: false, reason: 'Escrow not found on ledger' };
        return { valid: true };
      } finally {
        await client.disconnect();
      }
    } catch (err: any) {
      return { valid: false, reason: `XRPL error: ${err.message}` };
    }
  }

  async getRevealedSecret(lockId: string): Promise<string | null> {
    const [account, seqStr] = lockId.split(':');
    if (!account || !seqStr) return null;

    const client = await this._connect();
    try {
      const txs = await this._getAccountTxs(client, account);
      const offerSeq = parseInt(seqStr, 10);

      for (const tx of txs) {
        const txData: any = tx.tx_json || tx.tx || tx;
        if (txData.TransactionType !== 'EscrowFinish') continue;
        if (txData.Owner !== account) continue;
        if (txData.OfferSequence !== offerSeq) continue;

        // This EscrowFinish targets our escrow — extract preimage
        const fulfillment: string | undefined = txData.Fulfillment;
        if (!fulfillment) continue;
        const preimage = decodeFulfillmentPreimage(fulfillment);
        if (preimage) return preimage;
      }
      return null;
    } finally {
      await client.disconnect();
    }
  }

  async isExpiredOrRefunded(lockId: string, timelockUnix: number): Promise<boolean> {
    // Check if the escrow still exists (if not, it was either claimed or cancelled)
    const [account, seqStr] = lockId.split(':');
    if (!account || !seqStr) return true;

    const client = await this._connect();
    try {
      const resp = await client.request({
        command: 'account_objects',
        account,
        type:    'escrow',
      } as any);
      const objects = (resp.result as any).account_objects as any[];
      const seq     = parseInt(seqStr, 10);
      const exists  = objects.some(
        (o: any) => o.LedgerEntryType === 'Escrow' && o.Sequence === seq,
      );
      if (!exists) return true; // gone — was claimed or cancelled

      const now = Math.floor(Date.now() / 1000);
      return now > timelockUnix + this.graceSecs;
    } finally {
      await client.disconnect();
    }
  }

  // ── BaseMonitor.pollSwaps ───────────────────────────────────────────────────

  protected async pollSwaps(): Promise<void> {
    const wsUrl = this.config.wsUrl;
    if (!wsUrl) return;

    const result = await this.pool.query(`
      SELECT * FROM atomic_swaps
      WHERE status IN ('SIDE_B_LOCKED', 'XRP_LOCKED')
        AND (
          quote_chain = 'XRP'
          OR base_chain = 'XRP'
        )
    `);

    if (result.rows.length === 0) return;

    const client = await this._connect();
    try {
      for (const swap of result.rows) {
        await this._processSwap(swap, client);
      }
    } finally {
      await client.disconnect();
    }
  }

  private async _processSwap(swap: any, client: any): Promise<void> {
    // Determine which lockId to watch for revealed preimage
    const isBaseSideXrp  = swap.base_chain  === 'XRP';
    const lockId: string = isBaseSideXrp
      ? (swap.side_a_lock_id || '')
      : (swap.side_b_lock_id || '');

    if (!lockId) return;

    const [account, seqStr] = lockId.split(':');
    if (!account || !seqStr) return;

    const offerSeq = parseInt(seqStr, 10);
    const locktime: number = swap.side_a_locktime || swap.side_b_locktime || 0;

    try {
      const txs = await this._getAccountTxs(client, account);

      for (const tx of txs) {
        const txData: any = tx.tx_json || tx.tx || tx;
        if (txData.TransactionType !== 'EscrowFinish') continue;
        if (txData.Owner !== account) continue;
        if (txData.OfferSequence !== offerSeq) continue;

        const fulfillment: string | undefined = txData.Fulfillment;
        if (!fulfillment) continue;

        const preimage = decodeFulfillmentPreimage(fulfillment);
        if (!preimage) continue;

        await this.pool.query(
          `UPDATE atomic_swaps SET secret = $1, status = 'COMPLETE', updated_at = NOW() WHERE id = $2`,
          [preimage, swap.id],
        );
        console.log(`[XrplMonitor] Swap ${swap.id} → COMPLETE`);
        return;
      }

      // Check for EscrowCancel → EXPIRED
      for (const tx of txs) {
        const txData: any = tx.tx_json || tx.tx || tx;
        if (txData.TransactionType !== 'EscrowCancel') continue;
        if (txData.Owner !== account) continue;
        if (txData.OfferSequence !== offerSeq) continue;
        await this.pool.query(
          `UPDATE atomic_swaps SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
          [swap.id],
        );
        console.log(`[XrplMonitor] Swap ${swap.id} → EXPIRED (cancelled)`);
        return;
      }

      // Grace period fallback
      if (locktime > 0) {
        const now = Math.floor(Date.now() / 1000);
        if (now > locktime + this.graceSecs) {
          await this.pool.query(
            `UPDATE atomic_swaps SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
            [swap.id],
          );
          console.log(`[XrplMonitor] Swap ${swap.id} → EXPIRED (timeout)`);
        }
      }
    } catch (err: any) {
      console.error(`[XrplMonitor] Swap ${swap.id}:`, err?.message);
    }
  }

  // ── XRPL helpers ────────────────────────────────────────────────────────────

  private async _connect(): Promise<any> {
    // Dynamic import — xrpl is in root package.json but may not be in swap-server
    // If not installed in swap-server, add: cd swap-server && npm install xrpl
    const { Client } = await import('xrpl') as any;
    const client = new Client(this.config.wsUrl);
    await client.connect();
    return client;
  }

  private async _getAccountTxs(client: any, account: string): Promise<any[]> {
    const resp = await client.request({
      command:        'account_tx',
      account,
      limit:          200,
      forward:        false,
    });
    return (resp.result?.transactions as any[]) || [];
  }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

export function createXrplMonitor(): XrplMonitor | null {
  const wsUrl = process.env.XRPL_WS_URL;
  if (!wsUrl) return null;
  return new XrplMonitor({ wsUrl });
}
