/**
 * qBTC key derivation — ported from client/src/lib/qbtcService.ts
 *
 * Derives ECDSA (secp256k1) + Falcon-512 key pairs from a master seed.
 * The hybrid public key hash (RIPEMD160(SHA256(ecdsaPub || falconPub)))
 * is encoded as a bech32 address matching the main wallet exactly.
 */
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { initFalcon, falcon, SEED_SIZE } from './falcon-wasm/falconWasm';

bitcoin.initEccLib(ecc);

export type QBTCNetwork = 'testnet' | 'mainnet';

const QBTC_NETWORKS: Record<QBTCNetwork, bitcoin.networks.Network> = {
  testnet: {
    ...bitcoin.networks.testnet,
    bech32: 'qbtct',
  },
  mainnet: {
    ...bitcoin.networks.bitcoin,
    bech32: 'qbtc',
  },
};

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

export interface QBTCKeyPair {
  ecdsaPrivateKeyHex: string;
  ecdsaPublicKeyHex: string;
  falconPublicKeyHex: string;
  falconPrivateKeyHex: string;
  falconSeed: Uint8Array;
}

/**
 * Derive a qBTC key pair from a 32-byte master seed at the given path index.
 * Matches QBTCKeyPair.fromMasterSeed() in qbtcService.ts exactly.
 */
export async function deriveKeyPair(
  masterSeed: Uint8Array,
  pathIndex = 0,
): Promise<QBTCKeyPair> {
  await initFalcon();

  const idxBytes = new Uint8Array(4);
  new DataView(idxBytes.buffer).setUint32(0, pathIndex, false);

  // ECDSA child key — context label 'QBTC'
  const ecdsaContext = new Uint8Array(4 + idxBytes.length);
  ecdsaContext.set(new TextEncoder().encode('QBTC'), 0);
  ecdsaContext.set(idxBytes, 4);
  const ecdsaChildBytes = hmacSha512(masterSeed, ecdsaContext).slice(0, 32);

  // Falcon seed — context label 'QBTC-PQC'
  const pqcContext = new Uint8Array(8 + idxBytes.length);
  pqcContext.set(new TextEncoder().encode('QBTC-PQC'), 0);
  pqcContext.set(idxBytes, 8);
  const falconSeedFull = hmacSha512(masterSeed, pqcContext);
  const falconSeed = falconSeedFull.slice(0, SEED_SIZE); // 48 bytes

  const ecdsaPublicKey = secp256k1.getPublicKey(ecdsaChildBytes, true);
  const { publicKey: falconPub, secretKey: falconSk } = falcon.seedKeygen(falconSeed);

  return {
    ecdsaPrivateKeyHex: bytesToHex(ecdsaChildBytes),
    ecdsaPublicKeyHex: bytesToHex(ecdsaPublicKey),
    falconPublicKeyHex: bytesToHex(falconPub),
    falconPrivateKeyHex: bytesToHex(falconSk),
    falconSeed,
  };
}

/**
 * Derive the bech32 qBTC address from a key pair.
 * Uses RIPEMD160(SHA256(ecdsaPub || falconPub)) as the witness program,
 * encoded as p2wpkh-style with the qBTC bech32 prefix.
 */
export function getAddress(keyPair: QBTCKeyPair, network: QBTCNetwork): string {
  const ecdsaPub = hexToBytes(keyPair.ecdsaPublicKeyHex);
  const falconPub = hexToBytes(keyPair.falconPublicKeyHex);
  const combined = new Uint8Array(ecdsaPub.length + falconPub.length);
  combined.set(ecdsaPub, 0);
  combined.set(falconPub, ecdsaPub.length);
  const hybridHash = Buffer.from(ripemd160(sha256(combined)));

  const net = QBTC_NETWORKS[network];
  const p2wpkh = bitcoin.payments.p2wpkh({ hash: hybridHash, network: net });
  if (!p2wpkh.address) throw new Error('Failed to derive qBTC address');
  return p2wpkh.address;
}

/**
 * Derive a P-256 ECDH key pair for messenger encryption from the master seed.
 * Label 'MSG-ECDH' keeps it independent from the signing key.
 */
export async function deriveMessagingKeyPair(
  masterSeed: Uint8Array,
): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicKeyRaw: Uint8Array }> {
  const label = new TextEncoder().encode('MSG-ECDH');
  const material = hmacSha512(masterSeed, label).slice(0, 32);

  // Import as raw PKCS8 via SubtleCrypto (P-256)
  // We derive a proper EC key by using the scalar as HKDF input for the private key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    material,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('QBTC-MSG-P256') },
    baseKey,
    256,
  );

  // Use the derived bits as a P-256 private scalar via PKCS8 wrapping
  const pkcs8 = buildPkcs8P256(new Uint8Array(derivedBits));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );
  const publicKey = await getPublicKeyFromPrivate(privateKey);
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', publicKey),
  );

  return { privateKey, publicKey, publicKeyRaw };
}

// ── internal utilities ─────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

/** Build a minimal PKCS8 DER structure for a P-256 private key scalar. */
function buildPkcs8P256(privateScalar: Uint8Array): ArrayBuffer {
  // PKCS#8 AlgorithmIdentifier for P-256: OID 1.2.840.10045.2.1 + OID 1.2.840.10045.3.1.7
  const algId = new Uint8Array([
    0x30, 0x13,                              // SEQUENCE
      0x06, 0x07,                            // OID ecPublicKey
        0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08,                            // OID prime256v1
        0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  ]);

  // ECPrivateKey (SEC1) — version 1, private key only (no public key field needed)
  const scalar = privateScalar.length === 32 ? privateScalar : privateScalar.slice(0, 32);
  const ecPrivKey = new Uint8Array([
    0x30, 0x31,              // SEQUENCE
      0x02, 0x01, 0x01,      // version = 1
      0x04, 0x20,            // OCTET STRING (32 bytes)
      ...scalar,
      0xa0, 0x0a,            // [0] context — named curve (optional but required by some impls)
        0x06, 0x08,
          0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  ]);

  const privateKeyInfo = new Uint8Array([
    0x30,                    // SEQUENCE
    0x00,                    // length placeholder
    0x02, 0x01, 0x00,        // version = 0
    ...algId,
    0x04,                    // OCTET STRING (ecPrivKey)
    ecPrivKey.length,
    ...ecPrivKey,
  ]);
  // fix up outer SEQUENCE length
  privateKeyInfo[1] = privateKeyInfo.length - 2;
  return privateKeyInfo.buffer;
}

async function getPublicKeyFromPrivate(privateKey: CryptoKey): Promise<CryptoKey> {
  // Derive the public key by performing ECDH with ourselves (the subtle API
  // doesn't expose a direct "get public key from private" for ECDH, but we
  // can re-import the key pair using JWK which gives us the public key fields).
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  return crypto.subtle.importKey(
    'jwk',
    pubJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,  // extractable — we need to export raw bytes
    [],
  );
}
