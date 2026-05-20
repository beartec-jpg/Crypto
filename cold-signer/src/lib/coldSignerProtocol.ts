/**
 * Cold Signer QR Protocol — payload types shared between the web wallet and cold signer.
 *
 * All payloads are JSON. Keys use base64url encoding (no padding) for binary data.
 * Designed to fit within a single QR code at version 28+ (binary mode, ~1568 bytes max).
 *
 * Protocol version: 1
 */

// ── Inbound payloads (cold signer RECEIVES from web wallet) ──────────────────

/**
 * Flow A — web-first setup.
 * Web wallet sends master seed to cold signer ONE TIME.
 * Cold signer stores seed under passkey PRF then discards the QR data.
 * Web wallet must wipe seed after cold signer confirms.
 */
export interface ColdSetupPayload {
  type: 'qbtc-cold-setup';
  v: 1;
  seed: string;       // base64url(masterSeed 32 bytes)
  address: string;    // qBTC address (bech32)
  network: 'testnet' | 'mainnet';
}

/**
 * Unsigned transaction for cold signing.
 * Sent from web wallet → cold signer.
 */
export interface ColdUnsignedTxPayload {
  type: 'qbtc-unsigned-tx';
  v: 1;
  to: string;
  amountSats: number;
  feeRate: number;
  utxos: Array<{
    txid: string;
    vout: number;
    amount: number;  // satoshis
  }>;
  network: 'testnet' | 'mainnet';
}

// ── Outbound payloads (cold signer SENDS to web wallet) ─────────────────────

/**
 * Flow A — confirmation after cold signer setup.
 * Cold signer proves it has the private key by signing the challenge string.
 * Web wallet verifies ECDSA sig before wiping its own seed.
 */
export interface ColdConfirmPayload {
  type: 'qbtc-cold-confirm';
  v: 1;
  address: string;         // qBTC address
  ecdsaPub: string;        // base64url(compressed 33-byte ECDSA pub key)
  falconPub: string;       // base64url(Falcon-512 public key ~897 bytes)
  sig: string;             // base64url(ECDSA signature over CONFIRM_CHALLENGE)
  network: 'testnet' | 'mainnet';
}

/**
 * Flow B — cold-first: cold signer shares public keys with a blank web wallet.
 * Contains NO secrets — pub keys only.
 */
export interface ColdPubKeysPayload {
  type: 'qbtc-cold-pubkeys';
  v: 1;
  address: string;      // qBTC address
  ecdsaPub: string;     // base64url(compressed 33-byte ECDSA pub key)
  falconPub: string;    // base64url(Falcon-512 public key)
  network: 'testnet' | 'mainnet';
}

/**
 * Signed transaction from cold signer → web wallet for broadcast.
 */
export interface ColdSignedTxPayload {
  type: 'qbtc-signed-tx';
  v: 1;
  hex: string;   // fully signed raw transaction hex
}

// ── Union types ──────────────────────────────────────────────────────────────

export type ColdInboundPayload = ColdSetupPayload | ColdUnsignedTxPayload;
export type ColdOutboundPayload = ColdConfirmPayload | ColdPubKeysPayload | ColdSignedTxPayload;
export type AnyPayload = ColdInboundPayload | ColdOutboundPayload;

// ── Challenge constant ───────────────────────────────────────────────────────

/** Fixed string cold signer ECDSA-signs to prove key ownership in Flow A */
export const CONFIRM_CHALLENGE = 'QBTC-COLD-CONFIRM-V1';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function encodePayload(payload: AnyPayload): string {
  return JSON.stringify(payload);
}

export function decodePayload(raw: string): AnyPayload {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('Invalid QR payload — not valid JSON');
  }
  if (typeof obj !== 'object' || obj === null || !('type' in obj)) {
    throw new Error('Invalid QR payload — missing type field');
  }
  const p = obj as AnyPayload;
  if (p.v !== 1) throw new Error(`Unsupported protocol version: ${p.v}`);
  return p;
}

/** base64url (no padding) encode */
export function b64uEncode(bytes: Uint8Array): string {
  let b = btoa(String.fromCharCode(...bytes));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** base64url (no padding) decode */
export function b64uDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - padded.length % 4) % 4;
  const b = atob(padded + '='.repeat(padLen));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
