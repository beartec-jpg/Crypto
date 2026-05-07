/**
 * Lightweight transaction builder for qBTC PWA.
 * Uses ECDSA-only signing (3-element witness) which is valid for hybrid addresses.
 */
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import type { UtxoEntry } from './rpc';
import type { QBTCKeyPair } from './keys';

bitcoin.initEccLib(ecc);

export type QBTCNetwork = 'testnet' | 'mainnet';

const QBTC_NETWORKS: Record<QBTCNetwork, bitcoin.networks.Network> = {
  testnet: { ...bitcoin.networks.testnet, bech32: 'qbtct' },
  mainnet: { ...bitcoin.networks.bitcoin, bech32: 'qbtc' },
};

const DUST_THRESHOLD = 546; // satoshis
const BYTES_PER_INPUT = 41 + 1 + 73 + 33 + 3 + 897; // ecdsa witness w/ falcon pubkey
const BYTES_PER_OUTPUT = 31;
const TX_OVERHEAD = 10;

function toSats(amount: number): number {
  return Math.round(amount * 1e8);
}

function estimateFee(inputCount: number, outputCount: number, feeRate: number): number {
  const vsize = TX_OVERHEAD + inputCount * BYTES_PER_INPUT + outputCount * BYTES_PER_OUTPUT;
  return Math.ceil(vsize * feeRate);
}

export interface BuildResult {
  hex: string;
  fee: number;
  feeSats: number;
}

export async function buildAndSignTx(
  keyPair: QBTCKeyPair,
  utxos: UtxoEntry[],
  toAddress: string,
  amountSats: number,
  feeRate: number,
  network: QBTCNetwork,
): Promise<BuildResult> {
  const net = QBTC_NETWORKS[network];

  // Select UTXOs (largest first — simple coin selection)
  const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
  const selected: UtxoEntry[] = [];
  let totalInput = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalInput += toSats(utxo.amount);
    const fee = estimateFee(selected.length, 2, feeRate);
    if (totalInput >= amountSats + fee) break;
  }

  const fee = estimateFee(selected.length, 2, feeRate);
  const change = totalInput - amountSats - fee;

  if (change < 0) {
    throw new Error('Insufficient funds');
  }

  // Build transaction
  const tx = new bitcoin.Transaction();
  tx.version = 2;

  for (const utxo of selected) {
    tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffd);
  }

  tx.addOutput(bitcoin.address.toOutputScript(toAddress, net), amountSats);
  if (change > DUST_THRESHOLD) {
    // change back to sender
    const fromScript = bitcoin.address.toOutputScript(
      getAddressFromKeyPair(keyPair, network),
      net,
    );
    tx.addOutput(fromScript, change);
  }

  // Build scriptCode for witness signing (p2pkh of hybrid hash)
  const hybridHash = getHybridHash(keyPair);
  const scriptCode = bitcoin.payments.p2pkh({ hash: hybridHash, network: net }).output;
  if (!scriptCode) throw new Error('Failed to build scriptCode');

  // Sign each input
  for (const [idx, utxo] of selected.entries()) {
    const inputSats = toSats(utxo.amount);
    const digest = tx.hashForWitnessV0(idx, scriptCode, inputSats, bitcoin.Transaction.SIGHASH_ALL);
    const privKeyBytes = Buffer.from(keyPair.ecdsaPrivateKeyHex, 'hex');
    const rawSig = ecc.sign(digest, privKeyBytes);
    if (!rawSig) throw new Error('ECDSA signing failed');

    const ecdsaSig = bitcoin.script.signature.encode(Buffer.from(rawSig), bitcoin.Transaction.SIGHASH_ALL);
    const ecdsaPub = Buffer.from(keyPair.ecdsaPublicKeyHex, 'hex');
    const falconPub = Buffer.from(keyPair.falconPublicKeyHex, 'hex');

    // 3-element witness: [ecdsaSig, ecdsaPub, falconPub]
    tx.setWitness(idx, [ecdsaSig, ecdsaPub, falconPub]);
  }

  return { hex: tx.toHex(), fee: fee / 1e8, feeSats: fee };
}

function getHybridHash(keyPair: QBTCKeyPair): Buffer {
  const ecdsaPub = Buffer.from(keyPair.ecdsaPublicKeyHex, 'hex');
  const falconPub = Buffer.from(keyPair.falconPublicKeyHex, 'hex');
  const combined = Buffer.concat([ecdsaPub, falconPub]);
  return Buffer.from(ripemd160(sha256(combined)));
}

function getAddressFromKeyPair(keyPair: QBTCKeyPair, network: QBTCNetwork): string {
  const net = QBTC_NETWORKS[network];
  const hybridHash = getHybridHash(keyPair);
  const p2wpkh = bitcoin.payments.p2wpkh({ hash: hybridHash, network: net });
  if (!p2wpkh.address) throw new Error('Failed to derive address');
  return p2wpkh.address;
}
