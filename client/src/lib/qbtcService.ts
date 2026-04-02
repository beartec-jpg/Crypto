import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

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

const QBTC_SETTINGS_KEY = 'qbtc_rpc_settings';
const DILITHIUM_PK_SIZE = 1312;
const DILITHIUM_SK_SIZE = 2528;
const DILITHIUM_SIG_SIZE = 2420;
const DILITHIUM_BODY_SIZE = DILITHIUM_SIG_SIZE - 64;
const QBTC_DERIVATION_PATH = "m/44'/0'/0'/0/0";
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

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function expandToSize(seed: Uint8Array, context: Uint8Array, outLen: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let produced = 0;
  let counter = 0;

  while (produced < outLen) {
    const counterLe = new Uint8Array(4);
    const dv = new DataView(counterLe.buffer);
    dv.setUint32(0, counter, true);

    const blockInput = new Uint8Array(context.length + 4);
    blockInput.set(context, 0);
    blockInput.set(counterLe, context.length);

    const block = hmacSha512(seed, blockInput);
    chunks.push(block);
    produced += block.length;
    counter += 1;
  }

  const merged = new Uint8Array(produced);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged.slice(0, outLen);
}

export function getQBTCRpcSettings(): QBTCRpcSettings {
  const defaults: QBTCRpcSettings = {
    network: 'testnet',
    rpcUrl: 'http://localhost:28332',
    feeRate: 10,
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

function estimateHybridTxVSize(inputCount: number, outputCount: number): number {
  const baseBytes = 10 + (inputCount * 41) + (outputCount * 31);
  const witnessBytesPerInput = 1 + 73 + 34 + 2423 + 1315;
  const weight = (baseBytes * 4) + (inputCount * witnessBytesPerInput);
  return Math.ceil(weight / 4);
}

function selectUtxos(utxos: QBTCUtxo[], amountSats: number, feeRate: number): {
  selected: QBTCUtxo[];
  totalInput: number;
  fee: number;
  change: number;
} {
  const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
  const selected: QBTCUtxo[] = [];
  let totalInput = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalInput += toSats(utxo.amount);

    const outputCount = 2;
    const vSize = estimateHybridTxVSize(selected.length, outputCount);
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
  expanded: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;

  private constructor(seed: Uint8Array, expanded: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) {
    this.seed = seed;
    this.expanded = expanded;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  static fromECDSAPrivKey(ecdsaPriv: Uint8Array): DilithiumKey {
    const seed = hmacSha512(ecdsaPriv, new TextEncoder().encode('QuantBTC-Dilithium')).slice(0, 32);
    const expanded = sha256(seed);
    const privateKey = new Uint8Array(DILITHIUM_SK_SIZE);
    privateKey.set(seed, 0);
    privateKey.set(expanded, 32);
    const publicKey = expandToSize(expanded, new TextEncoder().encode('dilithium-pk'), DILITHIUM_PK_SIZE);
    return new DilithiumKey(seed, expanded, publicKey, privateKey);
  }

  sign(message: Uint8Array): Uint8Array {
    const sigContext = new Uint8Array(13 + message.length);
    sigContext.set(new TextEncoder().encode('dilithium-sig'), 0);
    sigContext.set(message, 13);

    const sigBody = expandToSize(this.expanded, sigContext, DILITHIUM_BODY_SIZE);
    const tagInput = new Uint8Array(sigBody.length + message.length);
    tagInput.set(sigBody, 0);
    tagInput.set(message, sigBody.length);
    const tag = hmacSha512(this.publicKey, tagInput);

    const signature = new Uint8Array(DILITHIUM_SIG_SIZE);
    signature.set(tag, 0);
    signature.set(sigBody, 64);
    return signature;
  }
}

export class QBTCKeyPair {
  readonly ecdsaPrivateKeyHex: string;
  readonly ecdsaPublicKeyHex: string;
  readonly dilithiumPublicKeyHex: string;
  readonly dilithiumPrivateKeyHex: string;
  private readonly dilithium: DilithiumKey;

  private constructor(
    ecdsaPrivateKeyHex: string,
    ecdsaPublicKeyHex: string,
    dilithiumPublicKeyHex: string,
    dilithiumPrivateKeyHex: string,
    dilithium: DilithiumKey
  ) {
    this.ecdsaPrivateKeyHex = ecdsaPrivateKeyHex;
    this.ecdsaPublicKeyHex = ecdsaPublicKeyHex;
    this.dilithiumPublicKeyHex = dilithiumPublicKeyHex;
    this.dilithiumPrivateKeyHex = dilithiumPrivateKeyHex;
    this.dilithium = dilithium;
  }

  static fromECDSAPrivateKey(ecdsaPrivateKeyHex: string): QBTCKeyPair {
    const privateKeyBytes = Buffer.from(ecdsaPrivateKeyHex, 'hex');
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    const dil = DilithiumKey.fromECDSAPrivKey(privateKeyBytes);

    return new QBTCKeyPair(
      ecdsaPrivateKeyHex,
      Buffer.from(publicKey).toString('hex'),
      Buffer.from(dil.publicKey).toString('hex'),
      Buffer.from(dil.privateKey).toString('hex'),
      dil
    );
  }

  static fromMasterSeed(masterSeed: Uint8Array, pathIndex = 0): QBTCKeyPair {
    const idxBytes = new Uint8Array(4);
    const dv = new DataView(idxBytes.buffer);
    dv.setUint32(0, pathIndex, false);

    const context = new Uint8Array(4 + idxBytes.length);
    context.set(new TextEncoder().encode('QBTC'), 0);
    context.set(idxBytes, 4);

    const child = hmacSha512(masterSeed, context).slice(0, 32);
    return QBTCKeyPair.fromECDSAPrivateKey(Buffer.from(child).toString('hex'));
  }

  static async fromMnemonic(mnemonic: string, _derivationPath = QBTC_DERIVATION_PATH, pathIndex = 0): Promise<QBTCKeyPair> {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    return QBTCKeyPair.fromMasterSeed(seed, pathIndex);
  }

  getAddress(network: QBTCNetwork): string {
    const net = QBTC_NETWORKS[network];
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(this.ecdsaPublicKeyHex, 'hex'),
      network: net,
    });
    if (!p2wpkh.address) {
      throw new Error('Failed to derive QBTC bech32 address');
    }
    return p2wpkh.address;
  }

  splitECDSAPrivateKey(shares = 3, threshold = 2): string[] {
    if (shares !== 3 || threshold !== 2) {
      throw new Error('QBTC split requires 2-of-3 shares to match node tooling');
    }
    const secret = Buffer.from(this.ecdsaPrivateKeyHex, 'hex');
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

  static reconstructFromShares(shareAHex: string, idxA: 1 | 2 | 3, shareBHex: string, idxB: 1 | 2 | 3): QBTCKeyPair {
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
    const dilithiumSignature = Buffer.from(this.dilithium.sign(digest));
    const dilithiumPublicKey = Buffer.from(this.dilithiumPublicKeyHex, 'hex');

    return {
      ecdsaSignature,
      ecdsaPublicKey,
      dilithiumSignature,
      dilithiumPublicKey,
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
  if (a === 0) return 0;
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

    const response = await axios.post('/api/qbtc/rpc', {
      rpcUrl: this.settings.rpcUrl,
      username: this.settings.username,
      password: this.settings.password,
      method,
      params,
    }, {
      timeout: 20000,
    });

    if (response.data?.error) {
      throw new Error(response.data.error.message || `QBTC RPC error on ${method}`);
    }

    return response.data.result as T;
  }

  async getBalance(address: string): Promise<string> {
    const utxos = await this.rpcCall<QBTCUtxo[]>('listunspent', [0, 9999999, [address]]);
    const total = utxos.reduce((sum, utxo) => sum + toSats(utxo.amount), 0);
    return fromSats(total);
  }

  async listTransactions(address: string, count = 20): Promise<QBTCTransaction[]> {
    const txs = await this.rpcCall<any[]>('listtransactions', ['*', count, 0, true]);

    return txs
      .filter((tx) => tx.address === address || tx.from === address)
      .map((tx) => ({
        hash: tx.txid,
        type: tx.category === 'receive' ? 'receive' : 'send',
        amount: Math.abs(Number(tx.amount || 0)).toFixed(8),
        token: 'QBTC' as const,
        to: tx.address || '',
        from: tx.from || '',
        timestamp: new Date((tx.time || Math.floor(Date.now() / 1000)) * 1000),
        status: tx.confirmations > 0 ? 'confirmed' : 'pending',
        chain: 'qbtc' as const,
      }));
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
    amount: string
  ): Promise<string> {
    const fromAddress = keyPair.getAddress(this.settings.network);
    const utxos = await this.rpcCall<QBTCUtxo[]>('listunspent', [0, 9999999, [fromAddress]]);

    const amountSats = toSats(Number(amount));
    const feeRate = Math.max(10, Number(this.settings.feeRate || 10));
    const { selected, change } = selectUtxos(utxos, amountSats, feeRate);

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

    const scriptCode = bitcoin.payments.p2pkh({
      pubkey: Buffer.from(keyPair.ecdsaPublicKeyHex, 'hex'),
      network,
    }).output;

    if (!scriptCode) {
      throw new Error('Failed to construct QBTC scriptCode for witness signing');
    }

    selected.forEach((utxo, idx) => {
      const digest = tx.hashForWitnessV0(idx, scriptCode, toSats(utxo.amount), bitcoin.Transaction.SIGHASH_ALL);
      const witness = keyPair.signDigestForWitness(digest);

      tx.setWitness(idx, [
        witness.ecdsaSignature,
        witness.ecdsaPublicKey,
        witness.dilithiumSignature,
        witness.dilithiumPublicKey,
      ]);
    });

    return tx.toHex();
  }

  async broadcastRawTransaction(rawHex: string): Promise<string> {
    return this.rpcCall<string>('sendrawtransaction', [rawHex]);
  }

  async sendTransaction(keyPair: QBTCKeyPair, toAddress: string, amount: string): Promise<string> {
    const raw = await this.createAndSignTransaction(keyPair, toAddress, amount);
    return this.broadcastRawTransaction(raw);
  }
}

export function isValidQBTCAddress(address: string, network: QBTCNetwork): boolean {
  const prefix = network === 'testnet' ? 'qbtct1' : 'qbtc1';
  return address.toLowerCase().startsWith(prefix) && /^[a-z0-9]{14,90}$/i.test(address);
}

export function qbtcPubKeyHash160(compressedPubKeyHex: string): string {
  const pub = Buffer.from(compressedPubKeyHex, 'hex');
  return Buffer.from(ripemd160(sha256(pub))).toString('hex');
}

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