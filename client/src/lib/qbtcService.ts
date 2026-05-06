import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { hexToBytes } from '@noble/hashes/utils';
import { initFalcon, falcon, PK_SIZE, SK_SIZE, SIG_SIZE, SEED_SIZE } from './falcon-wasm/falconWasm';
import {
  falconSign,
  falconVerify,
  generateFalconKeyPair,
  getFalconSeedLength,
} from './falconSigner';

bitcoin.initEccLib(ecc);

export type QBTCNetwork = 'testnet' | 'mainnet';

export interface QBTCRpcSettings {
  network: QBTCNetwork;
  rpcUrl: string;
  username?: string;
  password?: string;
  feeRate?: number;
}

export interface QBTCUtxo {
  txid: string;
  vout: number;
  amount: number;
  address?: string;
  scriptPubKey?: string;
  spendable?: boolean;
}

export interface QBTCTransaction {
  hash: string;
  type: 'send' | 'receive';
  amount: string;
  token: 'QBTC';
  to: string;
  from: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  chain: 'qbtc';
}

export interface QBTCFalconCompatibilityProof {
  algorithm: 'falcon-512-staged-compat';
  mode: 'offchain-sidecar';
  messageDigestHex: string;
  falconPublicKeyHex: string;
  falconSignatureHex: string;
  note: string;
}

const QBTC_SETTINGS_KEY = 'qbtc_rpc_settings';
const QBTC_PQC_SEED_SIZE = 48;
const DILITHIUM_PK_SIZE = PK_SIZE;
const DILITHIUM_SK_SIZE = SK_SIZE;
const DILITHIUM_SIG_SIZE = SIG_SIZE;
const DILITHIUM_SEED_SIZE = SEED_SIZE;
const QBTC_FALCON_PK_SIZE = 897;
const QBTC_FALCON_SK_SIZE = 1281;
const QBTC_FALCON_SIG_SIZE = 666;
const QBTC_FALCON_SEED_SIZE = 48;
// I-1: Use a QBTC-specific coin type (9999) to avoid key reuse with BTC (coin type 0).
// Register a permanent BIP-44 coin type before mainnet launch.
const QBTC_DERIVATION_PATH = "m/44'/9999'/0'/0/0";
const DUST_THRESHOLD = 546;

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

/** Convert a QBTC address to a raw() output descriptor (hex scriptPubKey).
 *  QBTC nodes reject addr() descriptors, so we use raw() instead. */
function addressToRawDescriptor(address: string, network: bitcoin.networks.Network): string {
  const scriptPubKey = bitcoin.address.toOutputScript(address, network);
  return `raw(${scriptPubKey.toString('hex')})`;
}

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function expandCompatibilitySeed(masterSeed: Uint8Array, targetLength: number, label: string): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);
  const out = new Uint8Array(targetLength);
  let written = 0;
  let counter = 0;

  while (written < targetLength) {
    const input = new Uint8Array(masterSeed.length + labelBytes.length + 1);
    input.set(masterSeed, 0);
    input.set(labelBytes, masterSeed.length);
    input[input.length - 1] = counter & 0xff;
    const block = sha256(input);
    const chunk = Math.min(block.length, targetLength - written);
    out.set(block.slice(0, chunk), written);
    written += chunk;
    counter += 1;
  }

  return out;
}

export function getQBTCRpcSettings(): QBTCRpcSettings {
  const defaults: QBTCRpcSettings = {
    network: 'testnet',
    rpcUrl: '/api/qbtc/rpc',
    feeRate: 5,
  };

  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = localStorage.getItem(QBTC_SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      feeRate: Number(parsed.feeRate || defaults.feeRate),
    };
  } catch {
    return defaults;
  }
}

export function setQBTCRpcSettings(settings: Partial<QBTCRpcSettings>): QBTCRpcSettings {
  const next = {
    ...getQBTCRpcSettings(),
    ...settings,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(QBTC_SETTINGS_KEY, JSON.stringify(next));
  }

  return next;
}

function toSats(amount: number): number {
  return Math.round(amount * 100000000);
}

function fromSats(sats: number): string {
  return (sats / 100000000).toFixed(8);
}

// Maximum standard transaction size (QBTC node policy, matches Bitcoin Core default).
const MAX_STANDARD_TX_SIZE = 100_000;
// Per-input raw byte cost: non-witness (41) + witness stack.
// Witness stacks include a varint prefix per item; items > 252 bytes need a 3-byte varint.
// hybrid (4 items): 1 + (1+73) + (1+33) + (3+DILITHIUM_SIG_SIZE) + (3+DILITHIUM_PK_SIZE)
// ecdsa  (3 items): 1 + (1+73) + (1+33)                           + (3+DILITHIUM_PK_SIZE)
function rawBytesPerInput(signMode: 'hybrid' | 'ecdsa'): number {
  const witnessSig = signMode === 'hybrid' ? (3 + DILITHIUM_SIG_SIZE) : 0;
  const witnessStack = 1 + (1 + 73) + (1 + 33) + witnessSig + (3 + DILITHIUM_PK_SIZE);
  return 41 + witnessStack;
}
// Tx base overhead: version(4)+marker(1)+flag(1)+varint_in(1)+varint_out(1)+2 outputs×31+locktime(4) = 74
const TX_BASE_OVERHEAD = 74;
function maxInputsForMode(signMode: 'hybrid' | 'ecdsa'): number {
  return Math.floor((MAX_STANDARD_TX_SIZE - TX_BASE_OVERHEAD) / rawBytesPerInput(signMode));
}

function estimateTxVSize(inputCount: number, outputCount: number, signMode: 'hybrid' | 'ecdsa' = 'hybrid'): number {
  const baseBytes = 10 + (inputCount * 41) + (outputCount * 31);
  // 3-element ECDSA: [ecdsaSig(73) + ecdsaPub(34) + dilPub(1312)] + stack size byte
  // 4-element hybrid: [ecdsaSig(73) + ecdsaPub(34) + dilSig(2420) + dilPub(1312)] + stack size byte
  const witnessBytesPerInput = signMode === 'ecdsa'
    ? 1 + 73 + 34 + DILITHIUM_PK_SIZE
    : 1 + 73 + 34 + DILITHIUM_SIG_SIZE + DILITHIUM_PK_SIZE;
  const weight = (baseBytes * 4) + (inputCount * witnessBytesPerInput);
  return Math.ceil(weight / 4);
}

function selectUtxos(utxos: QBTCUtxo[], amountSats: number, feeRate: number, signMode: 'hybrid' | 'ecdsa' = 'hybrid'): {
  selected: QBTCUtxo[];
  totalInput: number;
  fee: number;
  change: number;
} {
  const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
  const selected: QBTCUtxo[] = [];
  let totalInput = 0;
  const maxInputs = maxInputsForMode(signMode);

  for (const utxo of sorted) {
    if (selected.length >= maxInputs) {
      // We've hit the tx-size limit. If we still haven't funded the amount it means the
      // wallet is too fragmented — the user must consolidate UTXOs first.
      const needed = (amountSats / 1e8).toFixed(8);
      const have   = (totalInput / 1e8).toFixed(8);
      throw new Error(
        `Wallet is too fragmented: need ${needed} QBTC but only ${have} QBTC can fit in a single ` +
        `transaction (${maxInputs} UTXO limit in ${signMode} mode). ` +
        `Run a UTXO consolidation pass first (e.g. sendtoaddress to yourself in small batches ` +
        `using the QBTC node RPC, or the /tmp/consolidate2.py script on the server).`
      );
    }

    selected.push(utxo);
    totalInput += toSats(utxo.amount);

    const outputCount = 2;
    const vSize = estimateTxVSize(selected.length, outputCount, signMode);
    const fee = Math.max(1, Math.ceil(vSize * feeRate));
    const required = amountSats + fee;

    if (totalInput >= required) {
      let change = totalInput - required;
      if (change > 0 && change < DUST_THRESHOLD) {
        change = 0;
      }
      return { selected, totalInput, fee: totalInput - amountSats - change, change };
    }
  }

  throw new Error('Insufficient QBTC funds for amount + fee');
}

export class DilithiumKey {
  seed: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;

  private constructor(seed: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) {
    this.seed = seed;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  /**
   * Legacy class name retained for compatibility.
   * The actual on-chain PQC witness now uses Falcon-padded-512.
   */
  static async fromIndependentSeed(seed: Uint8Array): Promise<DilithiumKey> {
    if (seed.length < QBTC_PQC_SEED_SIZE) {
      throw new Error(`QBTC Falcon seed must be at least ${QBTC_PQC_SEED_SIZE} bytes`);
    }
    await initFalcon();
    const falconSeed = seed.slice(0, DILITHIUM_SEED_SIZE);
    const { publicKey, secretKey } = falcon.seedKeygen(falconSeed);
    return new DilithiumKey(falconSeed, publicKey, secretKey);
  }

  /**
   * @deprecated Fallback for legacy reconstruction flows where only the ECDSA
   * private key is available.
   */
  static async fromECDSAPrivKey(ecdsaPriv: Uint8Array): Promise<DilithiumKey> {
    await initFalcon();
    const seed = hmacSha512(ecdsaPriv, new TextEncoder().encode('QuantBTC-Falcon')).slice(0, DILITHIUM_SEED_SIZE);
    const { publicKey, secretKey } = falcon.seedKeygen(seed);
    return new DilithiumKey(seed, publicKey, secretKey);
  }

  sign(message: Uint8Array): Uint8Array {
    return falcon.sign(message, this.privateKey);
  }
}

export class QBTCKeyPair {
  readonly ecdsaPrivateKeyHex: string;
  readonly ecdsaPublicKeyHex: string;
  readonly dilithiumPublicKeyHex: string;
  readonly dilithiumPrivateKeyHex: string;
  private readonly dilKey: DilithiumKey;

  private constructor(
    ecdsaPrivateKeyHex: string,
    ecdsaPublicKeyHex: string,
    dilithiumPublicKeyHex: string,
    dilithiumPrivateKeyHex: string,
    dilKey: DilithiumKey
  ) {
    this.ecdsaPrivateKeyHex = ecdsaPrivateKeyHex;
    this.ecdsaPublicKeyHex = ecdsaPublicKeyHex;
    this.dilithiumPublicKeyHex = dilithiumPublicKeyHex;
    this.dilithiumPrivateKeyHex = dilithiumPrivateKeyHex;
    this.dilKey = dilKey;
  }

  static async fromECDSAPrivateKey(ecdsaPrivateKeyHex: string): Promise<QBTCKeyPair> {
    const privateKeyBytes = Buffer.from(ecdsaPrivateKeyHex, 'hex');
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    const dil = await DilithiumKey.fromECDSAPrivKey(privateKeyBytes);

    return new QBTCKeyPair(
      ecdsaPrivateKeyHex,
      Buffer.from(publicKey).toString('hex'),
      Buffer.from(dil.publicKey).toString('hex'),
      Buffer.from(dil.privateKey).toString('hex'),
      dil
    );
  }

  static async fromMasterSeed(masterSeed: Uint8Array, pathIndex = 0): Promise<QBTCKeyPair> {
    const idxBytes = new Uint8Array(4);
    const dv = new DataView(idxBytes.buffer);
    dv.setUint32(0, pathIndex, false);

    // ECDSA child key — context label 'QBTC'
    const ecdsaContext = new Uint8Array(4 + idxBytes.length);
    ecdsaContext.set(new TextEncoder().encode('QBTC'), 0);
    ecdsaContext.set(idxBytes, 4);
    const ecdsaChild = hmacSha512(masterSeed, ecdsaContext).slice(0, 32);

    // Falcon seed material — derived independently from masterSeed with a separate
    // context label 'QBTC-PQC'. This keeps the Falcon key independent even if
    // the ECDSA key is compromised.
    const pqcContext = new Uint8Array(8 + idxBytes.length);
    pqcContext.set(new TextEncoder().encode('QBTC-PQC'), 0);
    pqcContext.set(idxBytes, 8);
    const dilithiumSeed = hmacSha512(masterSeed, pqcContext);

    const privateKeyBytes = Buffer.from(ecdsaChild);
    const ecdsaPrivateKeyHex = privateKeyBytes.toString('hex');
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    const dil = await DilithiumKey.fromIndependentSeed(dilithiumSeed);

    return new QBTCKeyPair(
      ecdsaPrivateKeyHex,
      Buffer.from(publicKey).toString('hex'),
      Buffer.from(dil.publicKey).toString('hex'),
      Buffer.from(dil.privateKey).toString('hex'),
      dil,
    );
  }

  static async fromMnemonic(mnemonic: string, _derivationPath = QBTC_DERIVATION_PATH, pathIndex = 0): Promise<QBTCKeyPair> {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    return QBTCKeyPair.fromMasterSeed(seed, pathIndex);
  }

  getHybridHash(): Buffer {
    const ecdsaPub = Buffer.from(this.ecdsaPublicKeyHex, 'hex');
    const pqcPub = Buffer.from(this.dilithiumPublicKeyHex, 'hex');
    const combined = Buffer.concat([ecdsaPub, pqcPub]);
    return Buffer.from(ripemd160(sha256(combined)));
  }

  getAddress(network: QBTCNetwork): string {
    const net = QBTC_NETWORKS[network];
    const hybridHash = this.getHybridHash();
    const p2wpkh = bitcoin.payments.p2wpkh({
      hash: hybridHash,
      network: net,
    });
    if (!p2wpkh.address) {
      throw new Error('Failed to derive QBTC bech32 address');
    }
    return p2wpkh.address;
  }

  /**
   * Split the key material (ECDSA private key + Falcon seed) into 2-of-3
   * Shamir shares.
   *
   * The 80-byte payload encodes [ecdsaPrivKey (32 B) || falconSeed (48 B)].
   * This ensures reconstruction via `reconstructFromShares` can rebuild the
   * Falcon key using `DilithiumKey.fromIndependentSeed`, producing the same
   * hybrid address as the original hot-wallet key pair.
   *
   * NOTE: shares from the previous 32-byte and 64-byte legacy formats are
   * still accepted by `reconstructFromShares`.
   */
  splitECDSAPrivateKey(shares = 3, threshold = 2): string[] {
    if (shares !== 3 || threshold !== 2) {
      throw new Error('QBTC split requires 2-of-3 shares to match node tooling');
    }
    const ecdsaBytes = Buffer.from(this.ecdsaPrivateKeyHex, 'hex');  // 32 bytes
    const dilSeedBytes = Buffer.from(this.dilKey.seed);              // 48 bytes for Falcon-512
    if (ecdsaBytes.length !== 32) {
      throw new Error(`Unexpected ECDSA key length: ${ecdsaBytes.length} (expected 32)`);
    }
    if (dilSeedBytes.length !== 48) {
      throw new Error(`Unexpected QBTC Falcon seed length: ${dilSeedBytes.length} (expected 48)`);
    }
    const secret = Buffer.concat([ecdsaBytes, dilSeedBytes]);        // 80 bytes

    const coeffs = crypto.getRandomValues(new Uint8Array(secret.length));
    const out = [new Uint8Array(secret.length), new Uint8Array(secret.length), new Uint8Array(secret.length)];

    for (let i = 0; i < secret.length; i++) {
      for (let j = 0; j < 3; j++) {
        const x = j + 1;
        out[j][i] = secret[i] ^ gf256Mul(coeffs[i], x);
      }
    }

    return out.map((s) => Buffer.from(s).toString('hex'));
  }

  static async reconstructFromShares(shareAHex: string, idxA: 1 | 2 | 3, shareBHex: string, idxB: 1 | 2 | 3): Promise<QBTCKeyPair> {
    if (idxA === idxB) {
      throw new Error('Share indices must be distinct — cannot reconstruct from duplicate shares');
    }
    const shareA = Buffer.from(shareAHex, 'hex');
    const shareB = Buffer.from(shareBHex, 'hex');
    if (shareA.length !== shareB.length) {
      throw new Error('Invalid share lengths for QBTC recovery');
    }
    const out = new Uint8Array(shareA.length);
    const denom = idxA ^ idxB;
    const la = gf256Mul(idxB, gf256Inv(denom));
    const lb = gf256Mul(idxA, gf256Inv(denom));
    for (let i = 0; i < shareA.length; i++) {
      out[i] = gf256Mul(shareA[i], la) ^ gf256Mul(shareB[i], lb);
    }

    if (out.length === 80) {
      // Falcon format (80 bytes): first 32 bytes = ECDSA private key,
      // next 48 bytes = Falcon seed.
      const ecdsaPrivHex = Buffer.from(out.slice(0, 32)).toString('hex');
      const dilSeed = new Uint8Array(out.slice(32, 80));
      const privateKeyBytes = Buffer.from(ecdsaPrivHex, 'hex');
      const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
      const dil = await DilithiumKey.fromIndependentSeed(dilSeed);
      return new QBTCKeyPair(
        ecdsaPrivHex,
        Buffer.from(publicKey).toString('hex'),
        Buffer.from(dil.publicKey).toString('hex'),
        Buffer.from(dil.privateKey).toString('hex'),
        dil,
      );
    }

    if (out.length === 64) {
      // Legacy hybrid format: first 32 bytes = ECDSA private key,
      // next 32 bytes = legacy PQC seed.
      const ecdsaPrivHex = Buffer.from(out.slice(0, 32)).toString('hex');
      const dilSeed = new Uint8Array(out.slice(32, 64));
      const privateKeyBytes = Buffer.from(ecdsaPrivHex, 'hex');
      const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
      const dil = await DilithiumKey.fromIndependentSeed(dilSeed);
      return new QBTCKeyPair(
        ecdsaPrivHex,
        Buffer.from(publicKey).toString('hex'),
        Buffer.from(dil.publicKey).toString('hex'),
        Buffer.from(dil.privateKey).toString('hex'),
        dil,
      );
    }

    // Legacy format (32 bytes): ECDSA private key only — PQC key
    // re-derived via the deprecated coupled path.
    return QBTCKeyPair.fromECDSAPrivateKey(Buffer.from(out).toString('hex'));
  }

  signDigestForWitness(digest: Buffer): {
    ecdsaSignature: Buffer;
    ecdsaPublicKey: Buffer;
    dilithiumSignature: Buffer;
    dilithiumPublicKey: Buffer;
  } {
    const rawSig = ecc.sign(digest, Buffer.from(this.ecdsaPrivateKeyHex, 'hex'));
    if (!rawSig) {
      throw new Error('Failed to produce ECDSA signature for QBTC witness');
    }

    const ecdsaSignature = bitcoin.script.signature.encode(Buffer.from(rawSig), bitcoin.Transaction.SIGHASH_ALL);
    const ecdsaPublicKey = Buffer.from(this.ecdsaPublicKeyHex, 'hex');
    const dilithiumSignature = Buffer.from(this.dilKey.sign(digest));
    const dilithiumPublicKey = Buffer.from(this.dilithiumPublicKeyHex, 'hex');

    return {
      ecdsaSignature,
      ecdsaPublicKey,
      dilithiumSignature,
      dilithiumPublicKey,
    };
  }

  /**
   * ECDSA-only witness for hybrid addresses — 3-element witness stack.
   * [ecdsaSignature, ecdsaPublicKey, falconPublicKey]
   * PQC pubkey included for address matching (Hash160(ecdsa_pk || pqc_pk))
   * but NO PQC signature — ECDSA verification only.
   */
  signDigestECDSAOnly(digest: Buffer): {
    ecdsaSignature: Buffer;
    ecdsaPublicKey: Buffer;
    dilithiumPublicKey: Buffer;
  } {
    const rawSig = ecc.sign(digest, Buffer.from(this.ecdsaPrivateKeyHex, 'hex'));
    if (!rawSig) {
      throw new Error('Failed to produce ECDSA signature for QBTC witness');
    }
    return {
      ecdsaSignature: bitcoin.script.signature.encode(Buffer.from(rawSig), bitcoin.Transaction.SIGHASH_ALL),
      ecdsaPublicKey: Buffer.from(this.ecdsaPublicKeyHex, 'hex'),
      dilithiumPublicKey: Buffer.from(this.dilithiumPublicKeyHex, 'hex'),
    };
  }

  async createFalconCompatibilityProof(messageDigest: Uint8Array): Promise<QBTCFalconCompatibilityProof> {
    const falconSeedBytes = await getFalconSeedLength();
    const master = Buffer.concat([
      Buffer.from(this.ecdsaPrivateKeyHex, 'hex'),
      Buffer.from(this.dilKey.seed),
    ]);
    const falconSeed = expandCompatibilitySeed(
      new Uint8Array(master),
      falconSeedBytes,
      'QBTC-FALCON-COMPAT'
    );
    const falcon = await generateFalconKeyPair(falconSeed);
    const falconSig = await falconSign(messageDigest, falcon.secretKey);

    return {
      algorithm: 'falcon-512-staged-compat',
      mode: 'offchain-sidecar',
      messageDigestHex: Buffer.from(messageDigest).toString('hex'),
      falconPublicKeyHex: Buffer.from(falcon.publicKey).toString('hex'),
      falconSignatureHex: Buffer.from(falconSig).toString('hex'),
      note: 'Derived from the same Falcon material used in the live QBTC hybrid witness.',
    };
  }
}

function gf256Mul(a: number, b: number): number {
  let p = 0;
  let aa = a;
  let bb = b;
  for (let i = 0; i < 8; i++) {
    if (bb & 1) p ^= aa;
    const carry = aa & 0x80;
    aa = (aa << 1) & 0xff;
    if (carry) aa ^= 0x1b;
    bb >>= 1;
  }
  return p;
}

function gf256Inv(a: number): number {
  if (a === 0) throw new Error('gf256Inv: zero has no multiplicative inverse — share indices must be distinct');
  let r = a;
  for (let i = 0; i < 6; i++) {
    r = gf256Mul(r, r);
    r = gf256Mul(r, a);
  }
  r = gf256Mul(r, r);
  return r;
}

export class QBTCChain {
  private settings: QBTCRpcSettings;
  private useLiveSettings: boolean;

  constructor(settings?: Partial<QBTCRpcSettings>) {
    this.useLiveSettings = !settings;
    this.settings = this.useLiveSettings
      ? getQBTCRpcSettings()
      : {
          ...getQBTCRpcSettings(),
          ...settings,
        };
  }

  updateSettings(next: Partial<QBTCRpcSettings>): QBTCRpcSettings {
    this.settings = setQBTCRpcSettings({ ...this.settings, ...next });
    return this.settings;
  }

  getSettings(): QBTCRpcSettings {
    return this.settings;
  }

  async rpcCall<T>(method: string, params: any[] = []): Promise<T> {
    if (this.useLiveSettings) {
      this.settings = getQBTCRpcSettings();
    }

    let response;
    try {
      response = await axios.post('/api/qbtc/rpc', {
        method,
        params,
        network: this.settings.network,
      }, {
        timeout: 30000,
      });
    } catch (axiosErr: any) {
      // Extract the RPC error message from the response body if available
      const rpcMsg = axiosErr?.response?.data?.error?.message;
      throw new Error(rpcMsg || axiosErr?.message || `QBTC RPC error on ${method}`);
    }

    if (response.data?.error) {
      throw new Error(response.data.error.message || `QBTC RPC error on ${method}`);
    }

    return response.data.result as T;
  }

  async getBalance(address: string): Promise<string> {
    const network = QBTC_NETWORKS[this.settings.network];
    const result = await this.rpcCall<{ total_amount: number }>('scantxoutset', ['start', [{ desc: addressToRawDescriptor(address, network) }]]);
    return (result?.total_amount ?? 0).toFixed(8);
  }

  async scanUTXOs(address: string): Promise<QBTCUtxo[]> {
    const network = QBTC_NETWORKS[this.settings.network];
    const result = await this.rpcCall<{ unspents: Array<{ txid: string; vout: number; amount: number; height: number; scriptPubKey: string }> }>(
      'scantxoutset', ['start', [{ desc: addressToRawDescriptor(address, network) }]]
    );
    return (result?.unspents ?? []).map(u => ({
      txid: u.txid,
      vout: u.vout,
      amount: u.amount,
      address,
      scriptPubKey: u.scriptPubKey,
    }));
  }

  async listTransactions(address: string, count = 20): Promise<QBTCTransaction[]> {
    const network = QBTC_NETWORKS[this.settings.network];
    const result = await this.rpcCall<{ unspents: Array<{ txid: string; vout: number; amount: number; height: number }> }>(
      'scantxoutset', ['start', [{ desc: addressToRawDescriptor(address, network) }]]
    );
    if (!result?.unspents) return [];

    // Group UTXOs by txid — multiple outputs in one tx should be one transaction
    const txGroups = new Map<string, { totalAmount: number; height: number; vouts: number[] }>();
    for (const u of result.unspents) {
      const existing = txGroups.get(u.txid);
      if (existing) {
        existing.totalAmount += u.amount;
        existing.vouts.push(u.vout);
      } else {
        txGroups.set(u.txid, { totalAmount: u.amount, height: u.height, vouts: [u.vout] });
      }
    }

    // Take only the requested count of unique transactions
    const uniqueTxEntries = Array.from(txGroups.entries()).slice(0, count);

    // Pre-fetch block times for all unique heights (always works, no txindex needed)
    const uniqueHeights = [...new Set(uniqueTxEntries.map(([, g]) => g.height))];
    const blockTimeMap = new Map<number, number>();
    await Promise.all(
      uniqueHeights.map(async (height) => {
        try {
          const hash = await this.rpcCall<string>('getblockhash', [height]);
          const block = await this.rpcCall<{ time: number }>('getblock', [hash, 1]);
          blockTimeMap.set(height, block.time);
        } catch {
          // Fallback handled below
        }
      })
    );

    // Build transaction list
    const transactions: QBTCTransaction[] = [];
    await Promise.all(
      uniqueTxEntries.map(async ([txid, group]) => {
        const blockTime = blockTimeMap.get(group.height);
        const fallbackTimestamp = blockTime ? new Date(blockTime * 1000) : new Date();

        try {
          const rawTx = await this.rpcCall<{
            txid: string;
            vin: Array<{ txid?: string; vout?: number; coinbase?: string }>;
            vout: Array<{ value: number; n: number; scriptPubKey: { address?: string } }>;
            time?: number;
            blocktime?: number;
          }>('getrawtransaction', [txid, true]);

          // Sum all outputs belonging to this address
          const myOutputs = rawTx.vout.filter((out) => out.scriptPubKey.address === address);
          const amount = myOutputs.length > 0
            ? myOutputs.reduce((sum, out) => sum + out.value, 0)
            : group.totalAmount;

          // Determine sender from first input (skip coinbase)
          let fromAddress = '';
          const firstInput = rawTx.vin[0];
          if (firstInput && firstInput.txid && !firstInput.coinbase) {
            try {
              const inputTx = await this.rpcCall<{
                vout: Array<{ scriptPubKey: { address?: string } }>;
              }>('getrawtransaction', [firstInput.txid, true]);
              const inputVout = firstInput.vout ?? 0;
              fromAddress = inputTx.vout[inputVout]?.scriptPubKey?.address || '';
            } catch {
              // Can't resolve sender
            }
          }

          const isSend = fromAddress && fromAddress.toLowerCase() === address.toLowerCase();

          transactions.push({
            hash: txid,
            type: isSend ? 'send' : 'receive',
            amount: amount.toFixed(8),
            token: 'QBTC' as const,
            to: isSend ? (rawTx.vout.find(out => out.scriptPubKey.address !== address)?.scriptPubKey.address || address) : address,
            from: fromAddress,
            timestamp: rawTx.blocktime ? new Date(rawTx.blocktime * 1000) : fallbackTimestamp,
            status: 'confirmed' as const,
            chain: 'qbtc' as const,
          });
        } catch {
          // getrawtransaction failed (no txindex) — use block header time + UTXO data
          transactions.push({
            hash: txid,
            type: 'receive',
            amount: group.totalAmount.toFixed(8),
            token: 'QBTC' as const,
            to: address,
            from: '',
            timestamp: fallbackTimestamp,
            status: 'confirmed' as const,
            chain: 'qbtc' as const,
          });
        }
      })
    );

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return transactions;
  }

  async getBlockCount(): Promise<number | null> {
    try {
      return await this.rpcCall<number>('getblockcount');
    } catch {
      return null;
    }
  }

  async createAndSignTransaction(
    keyPair: QBTCKeyPair,
    toAddress: string,
    amount: string,
    signMode: 'hybrid' | 'ecdsa' = 'hybrid'
  ): Promise<{ hex: string; fee: number; falconCompatibilityProof?: QBTCFalconCompatibilityProof }> {
    const fromAddress = keyPair.getAddress(this.settings.network);
    const scanResult = await this.rpcCall<{ height: number; unspents: Array<{ txid: string; vout: number; amount: number; height: number; scriptPubKey: string }> }>(
      'scantxoutset', ['start', [{ desc: addressToRawDescriptor(fromAddress, QBTC_NETWORKS[this.settings.network]) }]]
    );
    const chainHeight = scanResult?.height ?? 0;
    // Filter out coinbase UTXOs that haven't matured (need 100 confirmations)
    const COINBASE_MATURITY = 100;
    const utxos: QBTCUtxo[] = (scanResult?.unspents ?? [])
      .filter(u => (chainHeight - u.height) >= COINBASE_MATURITY)
      .map(u => ({
        txid: u.txid,
        vout: u.vout,
        amount: u.amount,
        address: fromAddress,
        scriptPubKey: u.scriptPubKey,
      }));

    const amountSats = toSats(Number(amount));
    const feeRate = Math.max(5, Number(this.settings.feeRate || 5));
    const { selected, fee, change } = selectUtxos(utxos, amountSats, feeRate, signMode);

    const tx = new bitcoin.Transaction();
    tx.version = 2;

    for (const utxo of selected) {
      tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffd);
    }

    const network = QBTC_NETWORKS[this.settings.network];
    tx.addOutput(bitcoin.address.toOutputScript(toAddress, network), amountSats);
    if (change > DUST_THRESHOLD) {
      tx.addOutput(bitcoin.address.toOutputScript(fromAddress, network), change);
    }

    const hybridHash = keyPair.getHybridHash();
    const scriptCode = bitcoin.payments.p2pkh({
      hash: hybridHash,
      network,
    }).output;

    if (!scriptCode) {
      throw new Error('Failed to construct QBTC scriptCode for witness signing');
    }

    for (const [idx, utxo] of selected.entries()) {
      const digest = tx.hashForWitnessV0(idx, scriptCode, toSats(utxo.amount), bitcoin.Transaction.SIGHASH_ALL);

      if (signMode === 'ecdsa') {
        // 3-element witness: ECDSA sig + pubkey + PQC pubkey (for address matching)
        const witness = keyPair.signDigestECDSAOnly(digest);
        tx.setWitness(idx, [
          witness.ecdsaSignature,
          witness.ecdsaPublicKey,
          witness.dilithiumPublicKey,
        ]);
      } else {
        // PQC hybrid — ECDSA + Falcon-512 witness format
        const witness = keyPair.signDigestForWitness(digest);
        tx.setWitness(idx, [
          witness.ecdsaSignature,
          witness.ecdsaPublicKey,
          witness.dilithiumSignature,
          witness.dilithiumPublicKey,
        ]);
      }
    }

    const hex = tx.toHex();

    // Safety check: ensure the raw tx doesn't exceed the node's standard tx size limit.
    // selectUtxos already enforces the input cap, but this catches any unexpected overhead.
    if (hex.length / 2 > MAX_STANDARD_TX_SIZE) {
      throw new Error(
        `Transaction too large (${hex.length / 2} bytes > ${MAX_STANDARD_TX_SIZE} byte limit). ` +
        `Consolidate UTXOs first before sending.`
      );
    }

    const falconCompatibilityProof = signMode === 'hybrid'
      ? await keyPair.createFalconCompatibilityProof(sha256(hexToBytes(hex)))
      : undefined;

    return { hex, fee, falconCompatibilityProof };
  }

  async broadcastRawTransaction(rawHex: string): Promise<string> {
    return this.rpcCall<string>('sendrawtransaction', [rawHex]);
  }

  async sendTransaction(
    keyPair: QBTCKeyPair,
    toAddress: string,
    amount: string,
    signMode: 'hybrid' | 'ecdsa' = 'hybrid'
  ): Promise<{ txid: string; fee: number; falconCompatibilityProof?: QBTCFalconCompatibilityProof }> {
    const { hex, fee, falconCompatibilityProof } = await this.createAndSignTransaction(keyPair, toAddress, amount, signMode);
    const txid = await this.broadcastRawTransaction(hex);
    return { txid, fee, falconCompatibilityProof };
  }

  async getTransactionConfirmations(txid: string): Promise<number> {
    try {
      const result = await this.rpcCall<{ confirmations?: number }>('getrawtransaction', [txid, true]);
      return result.confirmations ?? 0;
    } catch {
      return 0;
    }
  }
}

export async function verifyQBTCFalconCompatibilityProof(
  proof: QBTCFalconCompatibilityProof
): Promise<boolean> {
  return falconVerify(
    hexToBytes(proof.falconSignatureHex),
    hexToBytes(proof.messageDigestHex),
    hexToBytes(proof.falconPublicKeyHex)
  );
}

// ─── HTLC support ───────────────────────────────────────────────────────────

export interface QBTCHtlcParams {
  buyerPubKeyHex?: string; // optional — omit for hash-only (seller-lock-first) variant
  sellerPubKeyHex: string;
  secretHashHex: string; // SHA-256 hash of the secret, hex-encoded
  locktime: number;      // absolute block height or unix timestamp (use timestamp for CLTV)
}

/**
 * Builds a P2WSH HTLC redeem script.
 *
 * If buyerPubKeyHex is provided (standard mode):
 *   OP_IF
 *     OP_SHA256 <secretHash> OP_EQUALVERIFY <buyerPubKey> OP_CHECKSIG
 *   OP_ELSE
 *     <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <sellerPubKey> OP_CHECKSIG
 *   OP_ENDIF
 *
 * If buyerPubKeyHex is omitted (hash-only / seller-lock-first mode):
 *   OP_IF
 *     OP_SHA256 <secretHash> OP_EQUAL
 *   OP_ELSE
 *     <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <sellerPubKey> OP_CHECKSIG
 *   OP_ENDIF
 *
 * In hash-only mode anyone with the secret can claim. This is safe for atomic
 * swaps because the secret is only revealed when the seller claims EVM USDC,
 * at which point the buyer immediately uses it to claim QBTC.
 */
export function createHTLCScript(params: QBTCHtlcParams): Buffer {
  const { buyerPubKeyHex, sellerPubKeyHex, secretHashHex, locktime } = params;

  const claimBranch = buyerPubKeyHex
    ? [
        bitcoin.opcodes.OP_SHA256,
        Buffer.from(secretHashHex, 'hex'),
        bitcoin.opcodes.OP_EQUALVERIFY,
        Buffer.from(buyerPubKeyHex, 'hex'),
        bitcoin.opcodes.OP_CHECKSIG,
      ]
    : [
        bitcoin.opcodes.OP_SHA256,
        Buffer.from(secretHashHex, 'hex'),
        bitcoin.opcodes.OP_EQUAL,
      ];

  return bitcoin.script.compile([
    bitcoin.opcodes.OP_IF,
      ...claimBranch,
    bitcoin.opcodes.OP_ELSE,
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      Buffer.from(sellerPubKeyHex, 'hex'),
      bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ENDIF,
  ]);
}

/**
 * Derives the P2WSH bech32 address for an HTLC redeem script.
 */
export function getHTLCAddress(htlcScript: Buffer, network: QBTCNetwork): string {
  const net = QBTC_NETWORKS[network];
  const p2wsh = bitcoin.payments.p2wsh({ redeem: { output: htlcScript, network: net }, network: net });
  if (!p2wsh.address) {
    throw new Error('Failed to derive P2WSH address for HTLC');
  }
  return p2wsh.address;
}

/**
 * Builds and signs a P2WSH HTLC claim transaction (buyer path).
 *
 * Supports two modes:
 * 1. Standard (claimerKeyPair provided): witness = [secret, ecdsaSig, ecdsaPub, dilSig, dilPub, htlcScript]
 * 2. Hash-only (claimerKeyPair omitted): witness = [secret, OP_1, htlcScript]
 *    Used for seller-lock-first HTLCs where anyone with the secret can claim.
 */
export async function createHTLCClaimTransaction(
  htlcScript: Buffer,
  utxos: QBTCUtxo[],
  secretHex: string,
  claimerKeyPair: QBTCKeyPair | null,
  outputAddress: string,
  network: QBTCNetwork,
  feeRate = 5,
): Promise<string> {
  const net = QBTC_NETWORKS[network];
  const totalInput = utxos.reduce((s, u) => s + toSats(u.amount), 0);

  const secretLen = Buffer.from(secretHex, 'hex').length;
  const witnessOverhead = claimerKeyPair
    ? 1 + (secretLen + 3) + 73 + 34 + DILITHIUM_SIG_SIZE + DILITHIUM_PK_SIZE + htlcScript.length + 10
    : 1 + (secretLen + 3) + 2 + htlcScript.length + 10;
  const weight = (10 + utxos.length * 41 + 31) * 4 + utxos.length * witnessOverhead;
  const vSize = Math.ceil(weight / 4);
  const fee = Math.max(1, Math.ceil(vSize * feeRate));
  const outputSats = totalInput - fee;

  if (outputSats <= DUST_THRESHOLD) {
    throw new Error('HTLC claim output below dust threshold after fee');
  }

  const tx = new bitcoin.Transaction();
  tx.version = 2;

  for (const utxo of utxos) {
    tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0);
  }
  tx.addOutput(bitcoin.address.toOutputScript(outputAddress, net), outputSats);

  for (const [idx, utxo] of utxos.entries()) {
    if (claimerKeyPair) {
      // Standard mode: signature required
      const digest = tx.hashForWitnessV0(idx, htlcScript, toSats(utxo.amount), bitcoin.Transaction.SIGHASH_ALL);
      const witness = claimerKeyPair.signDigestForWitness(digest);
      tx.setWitness(idx, [
        Buffer.alloc(0),
        Buffer.from(secretHex, 'hex'),
        witness.ecdsaSignature,
        witness.ecdsaPublicKey,
        witness.dilithiumSignature,
        witness.dilithiumPublicKey,
        htlcScript,
      ]);
    } else {
      // Hash-only mode: secret is enough to claim
      tx.setWitness(idx, [
        Buffer.from(secretHex, 'hex'),
        Buffer.from([0x01]),
        htlcScript,
      ]);
    }
  }

  return tx.toHex();
}

/**
 * Builds and signs a P2WSH HTLC refund transaction (seller path, post-timelock).
 *
 * Witness structure per input:
 *   [OP_1 (truthy but not the secret), ecdsaSig, ecdsaPubkey, dilSig, dilPubkey, htlcScript]
 *
 * nLockTime must be >= the HTLC locktime; nSequence must be < 0xffffffff.
 */
export async function createHTLCRefundTransaction(
  htlcScript: Buffer,
  utxos: QBTCUtxo[],
  refunderKeyPair: QBTCKeyPair,
  outputAddress: string,
  locktime: number,
  network: QBTCNetwork,
  feeRate = 5,
): Promise<string> {
  const net = QBTC_NETWORKS[network];
  const totalInput = utxos.reduce((s, u) => s + toSats(u.amount), 0);

  const witnessOverhead = 1 + 73 + 34 + DILITHIUM_SIG_SIZE + DILITHIUM_PK_SIZE + htlcScript.length + 10;
  const weight = (10 + utxos.length * 41 + 31) * 4 + utxos.length * witnessOverhead;
  const vSize = Math.ceil(weight / 4);
  const fee = Math.max(1, Math.ceil(vSize * feeRate));
  const outputSats = totalInput - fee;

  if (outputSats <= DUST_THRESHOLD) {
    throw new Error('HTLC refund output below dust threshold after fee');
  }

  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.locktime = locktime;

  for (const utxo of utxos) {
    tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffe); // nSequence < 0xffffffff to enable CLTV
  }
  tx.addOutput(bitcoin.address.toOutputScript(outputAddress, net), outputSats);

  for (const [idx, utxo] of utxos.entries()) {
    const digest = tx.hashForWitnessV0(idx, htlcScript, toSats(utxo.amount), bitcoin.Transaction.SIGHASH_ALL);
    const witness = refunderKeyPair.signDigestForWitness(digest);
    tx.setWitness(idx, [
      Buffer.alloc(0),
      witness.ecdsaSignature,
      witness.ecdsaPublicKey,
      witness.dilithiumSignature,
      witness.dilithiumPublicKey,
      htlcScript,
    ]);
  }

  return tx.toHex();
}

// ─────────────────────────────────────────────────────────────────────────────

export function isValidQBTCAddress(address: string, network: QBTCNetwork): boolean {
  const prefix = network === 'testnet' ? 'qbtct1' : 'qbtc1';
  const lower = address.toLowerCase();
  if (!lower.startsWith(prefix)) return false;
  const bech32Pattern = new RegExp(`^${prefix}[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38,}$`);
  return bech32Pattern.test(lower);
}

export function qbtcPubKeyHash160(compressedPubKeyHex: string): string {
  const pub = Buffer.from(compressedPubKeyHex, 'hex');
  return Buffer.from(ripemd160(sha256(pub))).toString('hex');
}

/**
 * @deprecated Derives a standard P2WPKH address from an ECDSA-only compressed
 * public key. This is NOT a valid QBTC hybrid address — full QBTC addresses use
 * Hash160(ecdsaPub || pqcPub) (see QBTCKeyPair.getAddress). Only use this
 * function for legacy migration / address-reconstruction fallback where the
 * QBTC PQC public key is unavailable.
 */
export function qbtcAddressFromCompressedPubKey(compressedPubKeyHex: string, network: QBTCNetwork = 'testnet'): string {
  const net = QBTC_NETWORKS[network];
  const payment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(compressedPubKeyHex, 'hex'),
    network: net,
  });

  if (!payment.address) {
    throw new Error('Failed to derive QBTC address from compressed public key');
  }

  return payment.address;
}
