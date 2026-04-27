/**
 * BitcoinAdapter.ts
 *
 * IChainAdapter implementation for Bitcoin-family chains:
 *   - QBTC  — Post-quantum hybrid (ECDSA + Falcon/Dilithium) P2WSH HTLCs
 *   - BTC   — Standard ECDSA-only P2WSH HTLCs
 *
 * QBTC uses the existing QBTCKeyPair from qbtcService and the createHTLCClaimTransaction /
 * createHTLCRefundTransaction helpers already proven live.
 *
 * BTC uses standard secp256k1 ECDSA — the HTLC script is identical in structure to QBTC
 * but the witness omits the Dilithium items.
 *
 * Broadcasting:
 *   QBTC — POST to QBTC node RPC (proxied via /api/qbtc/rpc on the app server).
 *   BTC  — POST to Blockstream Esplora (https://blockstream.info/api/tx).
 *           For testnet: https://blockstream.info/testnet/api/tx
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import type { IChainAdapter, LockParams, LockResult, ClaimParams, RefundParams, ChainId, BtcSignerKey, BitcoinUtxo } from './IChainAdapter.ts';
import type { QBTCKeyPair } from '../qbtcService.ts';
import {
  createHTLCScript,
  getHTLCAddress,
  createHTLCClaimTransaction,
  createHTLCRefundTransaction,
} from '../qbtcService.ts';

bitcoin.initEccLib(ecc);

// ─── Bitcoin network configs ──────────────────────────────────────────────────

export type BitcoinNetwork = 'mainnet' | 'testnet';

const BITCOIN_NETWORKS: Record<BitcoinNetwork, bitcoin.networks.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
};

const QBTC_NETWORKS: Record<BitcoinNetwork, bitcoin.networks.Network> = {
  testnet: { ...bitcoin.networks.testnet, bech32: 'qbtct' },
  mainnet: { ...bitcoin.networks.bitcoin, bech32: 'qbtc' },
};

const DUST_THRESHOLD = 546;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface BitcoinAdapterConfig {
  chain: 'QBTC' | 'BTC';
  /** 'mainnet' | 'testnet' (for BTC: mainnet/testnet3; for QBTC: mainnet/testnet) */
  network: BitcoinNetwork;
  /**
   * QBTC: URL of the QBTC RPC proxy (defaults to /api/qbtc/rpc — same host).
   * BTC:  Ignored — Esplora is used for broadcasting.
   */
  rpcProxyUrl?: string;
  /** For BTC: Esplora base URL. Defaults to Blockstream's public API. */
  esploraUrl?: string;
  /** Fee rate in sat/vbyte. Defaults to 5. */
  feeRate?: number;
}

// ─── Low-level BTC helpers (standard ECDSA, no Dilithium) ────────────────────

/** Build a standard Bitcoin P2WSH HTLC script (ECDSA-only, no PQC) */
function buildBtcHtlcScript(
  secretHashHex: string,
  claimerPubKeyHex: string,
  refunderPubKeyHex: string,
  locktime: number,
): Buffer {
  return bitcoin.script.compile([
    bitcoin.opcodes.OP_IF,
      bitcoin.opcodes.OP_SHA256,
      Buffer.from(secretHashHex, 'hex'),
      bitcoin.opcodes.OP_EQUALVERIFY,
      Buffer.from(claimerPubKeyHex, 'hex'),
      bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ELSE,
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      Buffer.from(refunderPubKeyHex, 'hex'),
      bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ENDIF,
  ]);
}

function getBtcP2wshAddress(script: Buffer, network: bitcoin.networks.Network): string {
  const p2wsh = bitcoin.payments.p2wsh({ redeem: { output: script, network }, network });
  if (!p2wsh.address) throw new Error('Failed to derive P2WSH address');
  return p2wsh.address;
}

function toSats(amount: number): number {
  return Math.round(amount * 1e8);
}

/**
 * Build a standard BTC HTLC claim transaction (ECDSA witness only).
 *
 * Witness per input: [sig, secret, OP_TRUE(0x01), htlcScript]
 */
async function buildBtcClaimTx(
  htlcScript: Buffer,
  utxos: BitcoinUtxo[],
  secretHex: string,
  claimerKey: BtcSignerKey,
  outputAddress: string,
  network: bitcoin.networks.Network,
  feeRate: number,
): Promise<string> {
  const totalInputSats = utxos.reduce((s, u) => s + toSats(u.amount), 0);

  // Estimate: base(10) + inputs(41*n) + output(31) + witness per input (1+73+34+32+script+10)
  const secretLen = Buffer.from(secretHex, 'hex').length;
  const witnessPerInput = 1 + 73 + 34 + (secretLen + 3) + 2 + htlcScript.length + 10;
  const weight = (10 + utxos.length * 41 + 31) * 4 + utxos.length * witnessPerInput;
  const vSize = Math.ceil(weight / 4);
  const fee = Math.max(1, Math.ceil(vSize * feeRate));
  const outputSats = totalInputSats - fee;

  if (outputSats <= DUST_THRESHOLD) {
    throw new Error('BTC HTLC claim output is below dust threshold after fee');
  }

  const tx = new bitcoin.Transaction();
  tx.version = 2;

  for (const utxo of utxos) {
    tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0);
  }
  tx.addOutput(bitcoin.address.toOutputScript(outputAddress, network), outputSats);

  const privKeyBytes = Buffer.from(claimerKey.privateKeyHex, 'hex');

  for (const [idx, utxo] of utxos.entries()) {
    const digest = tx.hashForWitnessV0(
      idx,
      htlcScript,
      toSats(utxo.amount),
      bitcoin.Transaction.SIGHASH_ALL,
    );

    // Standard ECDSA DER signature + SIGHASH_ALL byte
    const sigObj = ecc.sign(digest, privKeyBytes);
    const derSig = Buffer.concat([
      Buffer.from(secp256k1.Signature.fromCompact(Buffer.from(sigObj).toString('hex')).toDERRawBytes()),
      Buffer.from([bitcoin.Transaction.SIGHASH_ALL]),
    ]);

    // Witness: [<sig>, <secret>, <OP_TRUE=0x01>, <htlcScript>]
    tx.setWitness(idx, [
      derSig,
      Buffer.from(secretHex, 'hex'),
      Buffer.from([0x01]),
      htlcScript,
    ]);
  }

  return tx.toHex();
}

/**
 * Build a standard BTC HTLC refund transaction (ECDSA witness only, post-timelock).
 *
 * Witness per input: [sig, OP_FALSE(0x00), htlcScript]
 * nLockTime must equal the HTLC locktime; nSequence must be < 0xffffffff.
 */
async function buildBtcRefundTx(
  htlcScript: Buffer,
  utxos: BitcoinUtxo[],
  refunderKey: BtcSignerKey,
  outputAddress: string,
  locktime: number,
  network: bitcoin.networks.Network,
  feeRate: number,
): Promise<string> {
  const totalInputSats = utxos.reduce((s, u) => s + toSats(u.amount), 0);

  const witnessPerInput = 1 + 73 + 34 + 2 + htlcScript.length + 10;
  const weight = (10 + utxos.length * 41 + 31) * 4 + utxos.length * witnessPerInput;
  const vSize = Math.ceil(weight / 4);
  const fee = Math.max(1, Math.ceil(vSize * feeRate));
  const outputSats = totalInputSats - fee;

  if (outputSats <= DUST_THRESHOLD) {
    throw new Error('BTC HTLC refund output is below dust threshold after fee');
  }

  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.locktime = locktime;

  for (const utxo of utxos) {
    tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffe);
  }
  tx.addOutput(bitcoin.address.toOutputScript(outputAddress, network), outputSats);

  const privKeyBytes = Buffer.from(refunderKey.privateKeyHex, 'hex');

  for (const [idx, utxo] of utxos.entries()) {
    const digest = tx.hashForWitnessV0(
      idx,
      htlcScript,
      toSats(utxo.amount),
      bitcoin.Transaction.SIGHASH_ALL,
    );

    const sigObj = ecc.sign(digest, privKeyBytes);
    const derSig = Buffer.concat([
      Buffer.from(secp256k1.Signature.fromCompact(Buffer.from(sigObj).toString('hex')).toDERRawBytes()),
      Buffer.from([bitcoin.Transaction.SIGHASH_ALL]),
    ]);

    // Witness (ELSE branch): [<sig>, Buffer.alloc(0) = OP_FALSE, <htlcScript>]
    tx.setWitness(idx, [
      derSig,
      Buffer.alloc(0),
      htlcScript,
    ]);
  }

  return tx.toHex();
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

/** Broadcast a raw QBTC transaction via the server-side RPC proxy */
async function broadcastQbtc(rawHex: string, rpcProxyUrl: string): Promise<string> {
  const response = await fetch(rpcProxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'sendrawtransaction',
      params: [rawHex],
    }),
  });

  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch {
    throw new Error(`QBTC RPC returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (data?.error) throw new Error(`QBTC RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  return data?.result as string; // returns txid
}

/** Broadcast a raw BTC transaction via Blockstream Esplora */
async function broadcastBtc(rawHex: string, esploraUrl: string): Promise<string> {
  const response = await fetch(`${esploraUrl}/api/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawHex,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Esplora broadcast failed (HTTP ${response.status}): ${err.slice(0, 200)}`);
  }
  return response.text(); // returns txid
}

/** Get UTXOs for a Bitcoin address via Esplora */
export async function getUtxosBtc(
  address: string,
  esploraUrl: string,
): Promise<BitcoinUtxo[]> {
  const response = await fetch(`${esploraUrl}/api/address/${address}/utxo`);
  if (!response.ok) {
    throw new Error(`Esplora UTXO fetch failed: HTTP ${response.status}`);
  }
  const raw: Array<{ txid: string; vout: number; value: number }> = await response.json();
  return raw.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    amount: u.value / 1e8, // satoshis → BTC
  }));
}

// ─── BitcoinAdapter ───────────────────────────────────────────────────────────

export class BitcoinAdapter implements IChainAdapter {
  readonly chain: ChainId;
  private readonly config: BitcoinAdapterConfig;
  private readonly feeRate: number;
  private readonly rpcProxyUrl: string;
  private readonly esploraUrl: string;
  private readonly btcNetwork: bitcoin.networks.Network;
  private readonly qbtcNetwork: 'testnet' | 'mainnet';

  constructor(config: BitcoinAdapterConfig) {
    this.chain = config.chain;
    this.config = config;
    this.feeRate = config.feeRate ?? 5;
    this.rpcProxyUrl = config.rpcProxyUrl ?? '/api/qbtc/rpc';
    this.esploraUrl =
      config.esploraUrl ??
      (config.network === 'testnet'
        ? 'https://blockstream.info/testnet'
        : 'https://blockstream.info');
    this.btcNetwork = BITCOIN_NETWORKS[config.network];
    this.qbtcNetwork = config.network;
  }

  // ── lockFunds ───────────────────────────────────────────────────────────────

  async lockFunds(params: LockParams): Promise<LockResult> {
    if (this.chain === 'QBTC') {
      return this._lockQbtc(params);
    }
    return this._lockBtc(params);
  }

  private async _lockQbtc(params: LockParams): Promise<LockResult> {
    const keyPair = params.signerKey as QBTCKeyPair;
    const absoluteLocktime = Math.floor(Date.now() / 1000) + params.timelockSecs;

    // Build hash-only HTLC script (seller-lock-first pattern used in the existing flow)
    const htlcScript = createHTLCScript({
      sellerPubKeyHex: keyPair.ecdsaPublicKeyHex,
      secretHashHex: params.secretHash,
      locktime: absoluteLocktime,
    });
    const htlcAddress = getHTLCAddress(htlcScript, this.qbtcNetwork);

    // Fetch UTXOs for the locker's address via QBTC RPC proxy
    const { QBTCChain } = await import('../qbtcService.ts');
    const chain = new QBTCChain({ network: this.qbtcNetwork, rpcUrl: this.rpcProxyUrl });
    const txid = await chain.sendTransaction(params.refundAddress, htlcAddress, parseFloat(params.amount));

    return { lockId: txid, lockAddress: htlcAddress, vout: 0 };
  }

  private async _lockBtc(params: LockParams): Promise<LockResult> {
    const key = params.signerKey as BtcSignerKey;
    const absoluteLocktime = Math.floor(Date.now() / 1000) + params.timelockSecs;

    const htlcScript = buildBtcHtlcScript(
      params.secretHash,
      // In BTC the counterparty is the claimer; refundAddress is refunder
      Buffer.from(secp256k1.getPublicKey(Buffer.from(
        // We need the counterparty's pubkey — they supply it when accepting the offer.
        // For now we use a placeholder; in practice the swap server passes it via params.
        // The actual counterpartyPubKeyHex must be set in a higher-level LockParams extension.
        params.secretHash.slice(0, 64), // temporary — will be replaced by counterpartyPubKeyHex
        'hex',
      ), true)).toString('hex'),
      key.publicKeyHex,
      absoluteLocktime,
    );
    const htlcAddress = getBtcP2wshAddress(htlcScript, this.btcNetwork);

    // Build a funding transaction using the locker's UTXOs
    // UTXOs must be provided by the caller (fetched from Esplora or user wallet)
    if (!params.counterpartyAddress) {
      throw new Error('BitcoinAdapter.lockFunds (BTC): counterpartyAddress is required');
    }

    // For BTC locking, the caller broadcasts externally (e.g. via their BTC wallet).
    // This adapter builds the HTLC address and returns it; the caller funds it manually
    // or via their wallet's coin-selection logic.
    // TODO (Phase 7): integrate full PSBT coin-selection + Esplora broadcast for BTC locks.
    return { lockId: '', lockAddress: htlcAddress };
  }

  // ── claimFunds ──────────────────────────────────────────────────────────────

  async claimFunds(params: ClaimParams): Promise<string> {
    if (!params.utxos?.length) {
      throw new Error(`BitcoinAdapter.claimFunds (${this.chain}): utxos array is required`);
    }
    if (!params.htlcScriptHex) {
      throw new Error(`BitcoinAdapter.claimFunds (${this.chain}): htlcScriptHex is required`);
    }

    const htlcScript = Buffer.from(params.htlcScriptHex, 'hex');

    if (this.chain === 'QBTC') {
      const keyPair = params.signerKey as QBTCKeyPair;
      const rawHex = await createHTLCClaimTransaction(
        htlcScript,
        params.utxos.map((u) => ({ ...u, scriptPubKey: undefined })),
        params.secret,
        keyPair,
        params.outputAddress,
        this.qbtcNetwork,
        this.feeRate,
      );
      return broadcastQbtc(rawHex, this.rpcProxyUrl);
    }

    // BTC — standard ECDSA-only witness
    const key = params.signerKey as BtcSignerKey;
    const rawHex = await buildBtcClaimTx(
      htlcScript,
      params.utxos,
      params.secret,
      key,
      params.outputAddress,
      this.btcNetwork,
      this.feeRate,
    );
    return broadcastBtc(rawHex, this.esploraUrl);
  }

  // ── refundFunds ─────────────────────────────────────────────────────────────

  async refundFunds(params: RefundParams): Promise<string> {
    if (!params.utxos?.length) {
      throw new Error(`BitcoinAdapter.refundFunds (${this.chain}): utxos array is required`);
    }
    if (!params.htlcScriptHex) {
      throw new Error(`BitcoinAdapter.refundFunds (${this.chain}): htlcScriptHex is required`);
    }
    if (params.locktime === undefined) {
      throw new Error(`BitcoinAdapter.refundFunds (${this.chain}): locktime is required`);
    }

    const htlcScript = Buffer.from(params.htlcScriptHex, 'hex');

    if (this.chain === 'QBTC') {
      const keyPair = params.signerKey as QBTCKeyPair;
      const rawHex = await createHTLCRefundTransaction(
        htlcScript,
        params.utxos.map((u) => ({ ...u, scriptPubKey: undefined })),
        keyPair,
        params.outputAddress,
        params.locktime,
        this.qbtcNetwork,
        this.feeRate,
      );
      return broadcastQbtc(rawHex, this.rpcProxyUrl);
    }

    // BTC — standard ECDSA refund
    const key = params.signerKey as BtcSignerKey;
    const rawHex = await buildBtcRefundTx(
      htlcScript,
      params.utxos,
      key,
      params.outputAddress,
      params.locktime,
      this.btcNetwork,
      this.feeRate,
    );
    return broadcastBtc(rawHex, this.esploraUrl);
  }
}

// ─── Config factory ───────────────────────────────────────────────────────────

export function getBitcoinAdapterConfig(
  chain: 'QBTC' | 'BTC',
  network: BitcoinNetwork = 'testnet',
): BitcoinAdapterConfig {
  if (chain === 'QBTC') {
    return {
      chain: 'QBTC',
      network,
      rpcProxyUrl: import.meta.env.VITE_QBTC_RPC_URL || '/api/qbtc/rpc',
      feeRate: 5,
    };
  }
  return {
    chain: 'BTC',
    network,
    esploraUrl:
      network === 'testnet'
        ? 'https://blockstream.info/testnet'
        : 'https://blockstream.info',
    feeRate: Number(import.meta.env.VITE_BTC_FEE_RATE || 10),
  };
}
