/**
 * IChainAdapter.ts  (server-side)
 *
 * Server-side interface for chain monitors.  Monitors are read-only: they
 * never hold keys.  Their job is to detect when a secret is revealed on-chain
 * so the swap server can:
 *   1. Update swap status → COMPLETE
 *   2. Store the revealed preimage in the DB
 *   3. Expose the preimage to the other party via the /api/swap/:id endpoint
 *
 * Each monitor is implemented as a class that can be started with a polling
 * interval.  All chain-specific logic lives in the monitor; swap-server/index.ts
 * only calls startAll() and never needs to know which chains are active.
 */

import type { Pool } from 'pg';

export type ChainId = 'QBTC' | 'BTC' | 'ETH' | 'BNB' | 'USDC' | 'XRP';

export interface LockVerification {
  /** true if the lock is confirmed on-chain with the expected amount and secret hash */
  valid: boolean;
  /** Human-readable reason when valid=false */
  reason?: string;
}

export interface IChainMonitor {
  readonly chain: ChainId;

  /**
   * Verify that a lock transaction is confirmed on-chain with the expected
   * amount and secret hash.
   *
   * @param lockId          txid (Bitcoin), contractId (EVM), or "account:seq" (XRP)
   * @param expectedAmount  Decimal string in native coin units
   * @param expectedHash    32-byte secret hash, hex-encoded (no 0x)
   */
  verifyLock(
    lockId: string,
    expectedAmount: string,
    expectedHash: string,
  ): Promise<LockVerification>;

  /**
   * Poll for a revealed preimage on this chain.
   *
   * Returns the 32-byte preimage as a hex string (no 0x) if found, or null
   * if the HTLC has not yet been claimed.
   *
   * @param lockId  The lock identifier returned by the client adapter's lockFunds
   */
  getRevealedSecret(lockId: string): Promise<string | null>;

  /**
   * Check whether the timelock has expired and/or the funds have been refunded.
   *
   * @param lockId        The lock identifier
   * @param timelockUnix  The locktime unix timestamp from the swap record
   */
  isExpiredOrRefunded(lockId: string, timelockUnix: number): Promise<boolean>;
}

/**
 * Base class with common polling logic for all chain monitors.
 *
 * Subclasses implement `pollSwaps(pool)` which runs once per interval.
 */
export abstract class BaseMonitor {
  protected pool!: Pool;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Start the monitor loop.
   *
   * @param pool       Postgres connection pool (shared with swap-server)
   * @param pollMs     Polling interval in milliseconds
   */
  start(pool: Pool, pollMs = 60_000): void {
    this.pool = pool;
    // Fire once immediately, then on schedule
    void this.safePoll();
    this.intervalHandle = setInterval(() => void this.safePoll(), pollMs);
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async safePoll(): Promise<void> {
    try {
      await this.pollSwaps();
    } catch (err: any) {
      console.error(`[${this.constructor.name}] Poll error:`, err?.message);
    }
  }

  /**
   * Query the DB for active swaps on this chain's side, detect revealed secrets,
   * and update swap status → COMPLETE / EXPIRED.
   *
   * Called once per poll interval.  Implement in each concrete monitor.
   */
  protected abstract pollSwaps(): Promise<void>;
}
