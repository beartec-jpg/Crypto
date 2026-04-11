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

export interface ColdSignerShareImportPayload {
  type: 'cold-share-import';
  mode: 'recover' | 'rotate';
  share: string;
  fingerprint: string;
  createdAt: string;
}

const SHARE_STORAGE_KEY = 'cold_signer_hot_share';
const SHARE_SALT_KEY = 'cold_signer_hot_share_salt';

/**
 * Derive an AES-256-GCM key from a password + salt via PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const keyBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return crypto.subtle.importKey(
    'raw',
    keyBits,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/**
 * Encrypt and store the hot share (Share 1) in localStorage.
 * Called during ColdSignerSetup / rotation after splitting.
 */
export async function storeHotShare(share: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, 'encrypt');
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(share)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  localStorage.setItem(SHARE_STORAGE_KEY, bufToHex(combined));
  localStorage.setItem(SHARE_SALT_KEY, bufToHex(salt));
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Retrieve and decrypt the hot share from localStorage.
 * Returns null if not stored, throws on wrong password.
 */
export async function getHotShare(password: string): Promise<string | null> {
  const encryptedHex = localStorage.getItem(SHARE_STORAGE_KEY);
  const saltHex = localStorage.getItem(SHARE_SALT_KEY);
  if (!encryptedHex || !saltHex) return null;

  const salt = hexToBuf(saltHex);
  const combined = hexToBuf(encryptedHex);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await deriveKey(password, salt, 'decrypt');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
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
  localStorage.removeItem(SHARE_SALT_KEY);
}

/**
 * Build a QR payload that a cold signer device can scan to import or replace its stored share.
 */
export function createColdSignerShareImportPayload(
  share: string,
  mode: 'recover' | 'rotate'
): string {
  const payload: ColdSignerShareImportPayload = {
    type: 'cold-share-import',
    mode,
    share,
    fingerprint: share.slice(0, 8),
    createdAt: new Date().toISOString(),
  };

  return JSON.stringify(payload);
}

/**
 * Build an unsigned transaction payload for QR encoding.
 * The payload includes the transaction data and the hot share so the cold signer
 * can reconstruct the mnemonic (hotShare + coldShare = 2-of-3 threshold).
 */
export async function buildUnsignedTxPayload(
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
  },
  password: string
): Promise<ColdUnsignedTx> {
  const hotShare = await getHotShare(password);
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
