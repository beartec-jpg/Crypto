/**
 * QBTC Hybrid Signature Service - Quantum-resistant signing for QuantumBTC
 *
 * QBTC uses a dual-signature scheme:
 *   1. ECDSA (secp256k1) — backwards-compatible with Bitcoin
 *   2. ML-DSA-44 (Dilithium) — post-quantum resistant
 *
 * Both signatures are required for a valid QBTC transaction.
 * Addresses use hybrid format: Hash160(ecdsa_pk || pqc_pk)
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 as sha256Hash } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { initDilithium, dilithium } from './dilithium-wasm/dilithiumWasm';
import { createQBTCFalconCompatibilityProof, type FalconCompatibilityProof } from './falconCompat';
import * as bip39 from 'bip39';

// Required: set HMAC for @noble/secp256k1 v2 deterministic signing (RFC 6979)
ecc.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) => {
  const h = hmac.create(sha256Hash, k);
  m.forEach((b) => h.update(b));
  return h.digest();
};

const QBTC_TESTNET: bitcoin.networks.Network = {
  ...bitcoin.networks.testnet,
  bech32: 'qbtct',
};

const DUST_THRESHOLD = 546;

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
  falconCompatibilityProof?: FalconCompatibilityProof;
}

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function hash160(data: Uint8Array): Buffer {
  return Buffer.from(ripemd160(sha256(data)));
}

function toSats(amount: number): number {
  return Math.round(amount * 100000000);
}

/**
 * Derive QBTC key material from mnemonic using the same derivation
 * as the hot wallet (QBTCKeyPair.fromMnemonic / fromMasterSeed).
 */
function deriveQBTCKeys(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  // Same derivation as QBTCKeyPair.fromMasterSeed(seed, 0)
  const idxBytes = new Uint8Array(4); // pathIndex = 0

  // ECDSA child key — context label 'QBTC' (matches hot wallet)
  const ecdsaContext = new Uint8Array(4 + idxBytes.length);
  ecdsaContext.set(new TextEncoder().encode('QBTC'), 0);
  ecdsaContext.set(idxBytes, 4);
  const ecdsaPriv = hmacSha512(new Uint8Array(seed), ecdsaContext).slice(0, 32);
  const ecdsaPub = ecc.getPublicKey(ecdsaPriv, true);

  // Dilithium seed — derived independently from masterSeed with a separate
  // context label 'QBTC-PQC', matching DilithiumKey.fromIndependentSeed path
  // used in hot wallet QBTCKeyPair.fromMasterSeed (NOT fromECDSAPrivKey).
  const pqcLabel = new TextEncoder().encode('QBTC-PQC');
  const pqcContext = new Uint8Array(pqcLabel.length + idxBytes.length);
  pqcContext.set(pqcLabel, 0);
  pqcContext.set(idxBytes, pqcLabel.length);
  const dilSeed = hmacSha512(new Uint8Array(seed), pqcContext).slice(0, 32);
  const { secretKey: dilPriv, publicKey: dilPub } = dilithium.seedKeygen(dilSeed);

  // Hybrid address hash: Hash160(ecdsa_pk || pqc_pk)
  const combined = Buffer.concat([Buffer.from(ecdsaPub), Buffer.from(dilPub)]);
  const hybridHash = hash160(combined);

  return {
    ecdsaPriv,
    ecdsaPub: Buffer.from(ecdsaPub),
    dilPriv,
    dilPub: Buffer.from(dilPub),
    dilSeed: Buffer.from(dilSeed),
    hybridHash,
  };
}

/**
 * Sign a QBTC transaction with hybrid ECDSA + Dilithium signatures.
 * Produces a real serialized Bitcoin transaction with 4-element witness.
 */
export async function signQBTCTransaction(
  mnemonic: string,
  txData: QBTCUnsignedTransaction
): Promise<QBTCSignedResult> {
  if (!txData.utxos || txData.utxos.length === 0) {
    throw new Error('No UTXOs provided for QBTC transaction');
  }

  await initDilithium();
  const keys = deriveQBTCKeys(mnemonic);
  const network = QBTC_TESTNET;

  const tx = new bitcoin.Transaction();
  tx.version = 2;

  for (const utxo of txData.utxos) {
    tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffd);
  }

  const amountSats = toSats(Number(txData.amount));
  tx.addOutput(bitcoin.address.toOutputScript(txData.to, network), amountSats);

  // Calculate change
  const inputTotal = txData.utxos.reduce((sum, u) => sum + u.value, 0);
  const feeSats = toSats(Number(txData.fee));
  const changeSats = inputTotal - amountSats - feeSats;

  // Change goes to our hybrid address
  if (changeSats > DUST_THRESHOLD) {
    const changeOutput = bitcoin.payments.p2wpkh({ hash: keys.hybridHash, network }).output!;
    tx.addOutput(changeOutput, changeSats);
  }

  // ScriptCode for BIP-143 sighash uses the hybrid witness program
  const scriptCode = bitcoin.payments.p2pkh({ hash: keys.hybridHash, network }).output!;

  // Sign each input
  txData.utxos.forEach((utxo, idx) => {
    const digest = tx.hashForWitnessV0(idx, scriptCode, utxo.value, bitcoin.Transaction.SIGHASH_ALL);

    // ECDSA signature — bitcoinjs-lib accepts compact r||s bytes and appends
    // sighash type while performing DER encoding internally.
    const rawSig = ecc.sign(digest, keys.ecdsaPriv);
    const ecdsaSignature = bitcoin.script.signature.encode(
      Buffer.from(rawSig.toCompactRawBytes()),
      bitcoin.Transaction.SIGHASH_ALL
    );

    // Dilithium signature over the same BIP-143 digest
    const dilithiumSignature = Buffer.from(dilithium.sign(digest, keys.dilPriv));

    tx.setWitness(idx, [
      ecdsaSignature,
      keys.ecdsaPub,
      dilithiumSignature,
      keys.dilPub,
    ]);
  });

  const txHex = tx.toHex();
  const falconCompatibilityProof = await createQBTCFalconCompatibilityProof(
    keys.ecdsaPriv,
    keys.dilSeed,
    sha256(Buffer.from(txHex, 'hex'))
  );

  // `dilSeed` is kept in-memory only for Falcon compatibility sidecar proof
  // derivation in this function. It is never returned to callers.
  return {
    txHex,
    ecdsaPublicKey: keys.ecdsaPub.toString('hex'),
    dilithiumPublicKey: keys.dilPub.toString('hex'),
    falconCompatibilityProof,
  };
}
