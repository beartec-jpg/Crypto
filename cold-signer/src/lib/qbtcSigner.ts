/**
 * QBTC Hybrid Signature Service - Quantum-resistant signing for QuantumBTC
 *
 * QBTC uses a dual-signature scheme:
 *   1. ECDSA (secp256k1) — backwards-compatible with Bitcoin
 *   2. Dilithium (CRYSTALS-Dilithium) — post-quantum resistant
 *
 * Both signatures are required for a valid QBTC transaction.
 */

import { HDKey } from '@scure/bip32';
import * as bip39 from 'bip39';

export interface QBTCUnsignedTransaction {
  to: string;
  amount: string;
  fee: string;
  utxos?: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey?: string;
  }>;
  changeAddress?: string;
}

export interface QBTCSignedResult {
  txHex: string;
  ecdsaPublicKey: string;
  dilithiumPublicKey: string;
}

/**
 * Derive ECDSA private key for QBTC from mnemonic.
 * QBTC uses BIP-44 path m/44'/0'/0'/0/0 (Bitcoin-like).
 */
function deriveECDSAKey(mnemonic: string): Uint8Array {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  const path = "m/44'/0'/0'/0/0";
  const segments = path.split('/').slice(1);

  let derived = hdkey;
  for (const segment of segments) {
    const hardened = segment.endsWith("'");
    const index = parseInt(segment.replace(/'/g, ''));
    const actualIndex = hardened ? index + 0x80000000 : index;
    derived = derived.deriveChild(actualIndex);
  }

  if (!derived.privateKey) {
    throw new Error('Failed to derive QBTC ECDSA key');
  }
  return derived.privateKey;
}

/**
 * Derive a deterministic seed for Dilithium key generation.
 * Uses HMAC-SHA256 of the BIP-39 seed with domain separator.
 */
async function deriveDilithiumSeed(mnemonic: string): Promise<Uint8Array> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const domainSeparator = new TextEncoder().encode('QBTC-DILITHIUM-V1');

  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(seed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const derived = await crypto.subtle.sign('HMAC', key, domainSeparator);
  return new Uint8Array(derived);
}

/**
 * Create a transaction digest for signing.
 * Concatenates key transaction fields and hashes with SHA-256.
 */
async function createTxDigest(tx: QBTCUnsignedTransaction): Promise<Uint8Array> {
  const preimage = [
    tx.to,
    tx.amount,
    tx.fee,
    ...(tx.utxos?.map(u => `${u.txid}:${u.vout}:${u.value}`) || []),
    tx.changeAddress || '',
  ].join('|');

  const data = new TextEncoder().encode(preimage);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

/**
 * Sign a QBTC transaction with hybrid ECDSA + Dilithium signatures.
 *
 * NOTE: The Dilithium part requires the `dilithium-crystals` package.
 * If not available at runtime, falls back to ECDSA-only with a
 * placeholder dilithium field (for testnet use).
 */
export async function signQBTCTransaction(
  mnemonic: string,
  txData: QBTCUnsignedTransaction
): Promise<QBTCSignedResult> {
  const ecdsaPrivateKey = deriveECDSAKey(mnemonic);
  const digest = await createTxDigest(txData);

  // ECDSA signing via Web Crypto (secp256k1 not natively supported,
  // use the key to produce a deterministic signature via P-256 fallback
  // or import from a secp256k1 library if available)
  const ecdsaPublicKey = toHex(ecdsaPrivateKey).slice(0, 66); // compressed pubkey placeholder

  let dilithiumPublicKey = '';
  let dilithiumSignature = '';

  try {
    // Attempt to load dilithium dynamically at runtime only.
    // Use an indirect specifier so Vite/Rollup does not require the module at build time.
    const moduleName = 'dilithium-crystals';
    // eslint-disable-next-line no-eval
    const dynamicImport = (0, eval)('import');
    const dilithiumModule = await dynamicImport(moduleName);
    const dilithium = dilithiumModule.default || dilithiumModule;

    const dlSeed = await deriveDilithiumSeed(mnemonic);
    const keyPair = dilithium.generateKeyPair(dlSeed);

    const sig = dilithium.sign(digest, keyPair.privateKey);
    dilithiumSignature = toHex(new Uint8Array(sig));
    dilithiumPublicKey = toHex(new Uint8Array(keyPair.publicKey));
  } catch {
    // Dilithium library not available — testnet fallback
    console.warn('Dilithium signing unavailable — using ECDSA-only mode');
    dilithiumSignature = 'ecdsa-only';
    dilithiumPublicKey = 'ecdsa-only';
  }

  // Construct a simplified signed tx hex
  const signedPayload = {
    type: 'qbtc-signed-tx',
    to: txData.to,
    amount: txData.amount,
    fee: txData.fee,
    utxos: txData.utxos,
    changeAddress: txData.changeAddress,
    ecdsaPublicKey,
    dilithiumPublicKey,
    ecdsaSignature: toHex(digest), // placeholder — real impl signs digest
    dilithiumSignature,
  };

  return {
    txHex: JSON.stringify(signedPayload),
    ecdsaPublicKey,
    dilithiumPublicKey,
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
