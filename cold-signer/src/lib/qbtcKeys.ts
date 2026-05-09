/**
 * qBTC key derivation for the cold signer — works from a raw 32-byte master seed
 * (the passkey PRF output) rather than a BIP39 mnemonic.
 *
 * Derivation logic is identical to qbtc-wallet/src/lib/keys.ts → deriveKeyPair()
 * so the same passkey produces the same address on both devices.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@noble/secp256k1';
import { initFalcon, falcon, SEED_SIZE } from './falcon-wasm/falconWasm';

// Required: set HMAC for @noble/secp256k1 v2 deterministic signing (RFC 6979)
ecc.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) => {
  const h = hmac.create(sha256, k);
  m.forEach((b: Uint8Array) => h.update(b));
  return h.digest();
};

const QBTC_TESTNET: bitcoin.networks.Network = {
  ...bitcoin.networks.testnet,
  bech32: 'qbtct',
};
const QBTC_MAINNET: bitcoin.networks.Network = {
  ...bitcoin.networks.bitcoin,
  bech32: 'qbtc',
};

export type QBTCNetwork = 'testnet' | 'mainnet';

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

export interface ColdKeyPair {
  ecdsaPriv: Uint8Array;   // 32 bytes
  ecdsaPub: Uint8Array;    // 33 bytes compressed
  falconPriv: Uint8Array;  // Falcon-512 secret key
  falconPub: Uint8Array;   // Falcon-512 public key (~897 bytes)
  falconSeed: Uint8Array;  // 48 bytes
  address: string;
}

/**
 * Derive a qBTC key pair from a 32-byte master seed.
 * pathIndex=0 matches the primary key in the web wallet.
 */
export async function deriveKeysFromSeed(
  masterSeed: Uint8Array,
  network: QBTCNetwork = 'testnet',
  pathIndex = 0,
): Promise<ColdKeyPair> {
  await initFalcon();

  const idxBytes = new Uint8Array(4);
  new DataView(idxBytes.buffer).setUint32(0, pathIndex, false);

  // ECDSA — label 'QBTC'
  const ecdsaCtx = new Uint8Array(4 + idxBytes.length);
  ecdsaCtx.set(new TextEncoder().encode('QBTC'), 0);
  ecdsaCtx.set(idxBytes, 4);
  const ecdsaPriv = hmacSha512(masterSeed, ecdsaCtx).slice(0, 32);
  const ecdsaPub = secp256k1.getPublicKey(ecdsaPriv, true);

  // Falcon — label 'QBTC-PQC'
  const pqcCtx = new Uint8Array(8 + idxBytes.length);
  pqcCtx.set(new TextEncoder().encode('QBTC-PQC'), 0);
  pqcCtx.set(idxBytes, 8);
  const falconSeedFull = hmacSha512(masterSeed, pqcCtx);
  const falconSeed = falconSeedFull.slice(0, SEED_SIZE); // 48 bytes

  const { publicKey: falconPub, secretKey: falconPriv } = falcon.seedKeygen(falconSeed);

  // Hybrid address: bech32(ripemd160(sha256(ecdsaPub ∥ falconPub)))
  const combined = new Uint8Array(ecdsaPub.length + falconPub.length);
  combined.set(ecdsaPub, 0);
  combined.set(falconPub, ecdsaPub.length);
  const addrHash = hash160(combined);

  const net = network === 'testnet' ? QBTC_TESTNET : QBTC_MAINNET;
  const p2wpkh = bitcoin.payments.p2wpkh({ hash: Buffer.from(addrHash), network: net });
  if (!p2wpkh.address) throw new Error('Failed to derive qBTC address');

  return {
    ecdsaPriv,
    ecdsaPub,
    falconPriv,
    falconPub,
    falconSeed,
    address: p2wpkh.address,
  };
}

/** Hex helper */
export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}
