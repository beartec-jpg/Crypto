/**
 * Cold Signer Service - Hot wallet side helpers for QR-based cold signing flow.
 *
 * Handles:
 *  - Building unsigned transaction payloads for QR encoding
 *  - Retrieving the hot share (Share 1) from localStorage
 *  - Broadcasting signed transactions returned from the cold signer
 */

import type { Chain } from './balanceService';

export interface ColdUnsignedTx {
  tx: {
    chain: string;
    to: string;
    amount: string;
    fee: string;
    nonce?: number;
    gasLimit?: string;
    maxFeePerGas?: string;
    chainId?: number;
    destination?: string;
    destinationTag?: number;
    sequence?: number;
    utxos?: Array<{
      txid: string;
      vout: number;
      value: number;
      scriptPubKey?: string;
    }>;
    changeAddress?: string;
    recentBlockhash?: string;
    lamportsPerSignature?: number;
  };
  hotShare: string;
}

const SHARE_STORAGE_KEY = 'cold_signer_hot_share';

/**
 * Store the hot share (Share 1) in localStorage.
 * Called during ColdSignerSetup after splitting.
 */
export function storeHotShare(share: string): void {
  localStorage.setItem(SHARE_STORAGE_KEY, share);
}

/**
 * Retrieve the hot share from localStorage.
 */
export function getHotShare(): string | null {
  return localStorage.getItem(SHARE_STORAGE_KEY);
}

/**
 * Check if cold signer has been set up (hot share exists).
 */
export function isColdSignerConfigured(): boolean {
  return !!localStorage.getItem(SHARE_STORAGE_KEY);
}

/**
 * Remove the hot share (used during wallet reset).
 */
export function clearHotShare(): void {
  localStorage.removeItem(SHARE_STORAGE_KEY);
}

/**
 * Build an unsigned transaction payload for QR encoding.
 * The payload includes the transaction data and the hot share so the cold signer
 * can reconstruct the mnemonic (hotShare + coldShare = 2-of-3 threshold).
 */
export function buildUnsignedTxPayload(
  chain: Chain,
  txParams: {
    to: string;
    amount: string;
    fee: string;
    nonce?: number;
    gasLimit?: string;
    maxFeePerGas?: string;
    chainId?: number;
    destination?: string;
    destinationTag?: number;
    sequence?: number;
    utxos?: ColdUnsignedTx['tx']['utxos'];
    changeAddress?: string;
    recentBlockhash?: string;
    lamportsPerSignature?: number;
  }
): ColdUnsignedTx {
  const hotShare = getHotShare();
  if (!hotShare) {
    throw new Error('Cold signer not configured — hot share missing');
  }

  return {
    tx: {
      chain,
      ...txParams,
    },
    hotShare,
  };
}

/**
 * Serialize an unsigned tx payload to a JSON string for QR encoding.
 * Verifies the result is within reasonable QR capacity.
 */
export function serializeForQR(payload: ColdUnsignedTx): string {
  const json = JSON.stringify(payload);
  // QR codes can hold ~4296 alphanumeric / ~2953 bytes in binary mode
  if (json.length > 2500) {
    console.warn(`Cold signer QR payload is ${json.length} bytes — may require chunking`);
  }
  return json;
}
