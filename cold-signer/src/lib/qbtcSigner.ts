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
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import * as bip39 from 'bip39';

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
  const context = new Uint8Array(8);
  context.set(new TextEncoder().encode('QBTC'), 0);
  context.set(idxBytes, 4);

  const ecdsaPriv = hmacSha512(new Uint8Array(seed), context).slice(0, 32);
  const ecdsaPub = ecc.getPublicKey(ecdsaPriv, true);

  // Same derivation as DilithiumKey.fromECDSAPrivKey
  const dilSeed = hmacSha512(ecdsaPriv, new TextEncoder().encode('QuantBTC-Dilithium')).slice(0, 32);
  const { secretKey: dilPriv, publicKey: dilPub } = ml_dsa44.keygen(dilSeed);

  // Hybrid address hash: Hash160(ecdsa_pk || pqc_pk)
  const combined = Buffer.concat([Buffer.from(ecdsaPub), Buffer.from(dilPub)]);
  const hybridHash = hash160(combined);

  return { ecdsaPriv, ecdsaPub: Buffer.from(ecdsaPub), dilPriv, dilPub: Buffer.from(dilPub), hybridHash };
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

    // ECDSA signature
    const rawSig = ecc.sign(digest, keys.ecdsaPriv);
    const ecdsaSignature = bitcoin.script.signature.encode(
      Buffer.from(rawSig.toCompactRawBytes()),
      bitcoin.Transaction.SIGHASH_ALL
    );

    // Dilithium signature over the same BIP-143 digest
    const dilithiumSignature = Buffer.from(ml_dsa44.sign(digest, keys.dilPriv));

    tx.setWitness(idx, [
      ecdsaSignature,
      keys.ecdsaPub,
      dilithiumSignature,
      keys.dilPub,
    ]);
  });

  return {
    txHex: tx.toHex(),
    ecdsaPublicKey: keys.ecdsaPub.toString('hex'),
    dilithiumPublicKey: keys.dilPub.toString('hex'),
  };
}
