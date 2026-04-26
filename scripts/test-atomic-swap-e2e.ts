#!/usr/bin/env tsx
/**
 * scripts/test-atomic-swap-e2e.ts
 *
 * Fully-automated end-to-end test for the QBTC ↔ USDC atomic swap system.
 *
 * Drives every step of the swap protocol without manual wallet interaction:
 *   1. Create offer         (seller signs + POSTs /api/swap/offer)
 *   2. Accept offer         (buyer signs + POSTs /api/swap/accept/:offerId)
 *   3. Seller locks QBTC    (builds P2WSH HTLC, sends via RPC, reports lock)
 *   4. Buyer locks USDC     (approve ERC-20 + calls EVM HTLC, reports lock)
 *   5. Seller reveals secret (calls EVM HTLC withdraw, revealing secret on-chain)
 *   6. Buyer claims QBTC    (builds witness tx with secret, broadcasts via RPC)
 *   7. Report claim txid    (waits for EVM monitor → COMPLETE, reports to server)
 *
 * Usage:
 *   cp .env.test.example .env.test
 *   # Edit .env.test with real values, then run:
 *
 * Requirements: Node.js ≥ 17.3.0 (for AbortSignal.timeout), recommended ≥ 20.
 *
 *   # Option A — Node.js ≥ 20 built-in env file loader:
 *   node --env-file=.env.test --import=tsx/esm scripts/test-atomic-swap-e2e.ts
 *
 *   # Option B — tsx with explicit env vars:
 *   env $(grep -v '^#' .env.test | grep '=' | xargs) tsx scripts/test-atomic-swap-e2e.ts
 *
 *   # Option C — source and run:
 *   set -a && source .env.test && set +a && tsx scripts/test-atomic-swap-e2e.ts
 */

import crypto from 'crypto';
import { ethers } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

bitcoin.initEccLib(ecc);

// ─── Config helpers ──────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name: string, defaultValue = ''): string {
  return process.env[name] || defaultValue;
}

// ─── QBTC network ────────────────────────────────────────────────────────────

const QBTC_NETWORK_NAME = optionalEnv('QBTC_NETWORK', 'testnet') as 'testnet' | 'mainnet';

const QBTC_NETWORKS: Record<string, bitcoin.networks.Network> = {
  testnet: { ...bitcoin.networks.testnet, bech32: 'qbtct' },
  mainnet: { ...bitcoin.networks.bitcoin, bech32: 'qbtc' },
};

const QBTC_NET = QBTC_NETWORKS[QBTC_NETWORK_NAME];
if (!QBTC_NET) throw new Error(`Unknown QBTC_NETWORK: ${QBTC_NETWORK_NAME}`);

// ─── Logging ─────────────────────────────────────────────────────────────────

const HR = '─'.repeat(62);

const log = {
  banner: (msg: string) => {
    console.log(`\n${'═'.repeat(62)}`);
    console.log(`  ${msg}`);
    console.log('═'.repeat(62));
  },
  step: (n: number, msg: string) => {
    console.log(`\n${HR}\nStep ${n}: ${msg}\n${HR}`);
  },
  info: (msg: string) => console.log(`  ${msg}`),
  ok:   (msg: string) => console.log(`  ✅ ${msg}`),
  warn: (msg: string) => console.log(`  ⚠️  ${msg}`),
  err:  (msg: string) => console.error(`  ❌ ${msg}`),
  addr: (label: string, address: string) =>
    console.log(`  ${label.padEnd(30)} ${address}`),
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── QBTC RPC helper ─────────────────────────────────────────────────────────

async function qbtcRpc(
  method: string,
  params: unknown[] = [],
  walletName?: string,
): Promise<unknown> {
  const rpcUrl  = requireEnv('QBTC_RPC_URL');
  const rpcUser = optionalEnv('QBTC_RPC_USER');
  const rpcPass = optionalEnv('QBTC_RPC_PASSWORD');

  const url = walletName
    ? `${rpcUrl.replace(/\/$/, '')}/wallet/${encodeURIComponent(walletName)}`
    : rpcUrl;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(rpcUser || rpcPass
        ? { Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}` }
        : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`QBTC RPC non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  if (data?.error) {
    throw new Error(`QBTC RPC [${method}]: ${JSON.stringify(data.error)}`);
  }
  return data?.result;
}

// ─── Swap API helper ──────────────────────────────────────────────────────────

async function swapApi(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const baseUrl = requireEnv('SWAP_API_URL').replace(/\/$/, '');
  const url = `${baseUrl}${path}`;

  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(url, opts);
  const data = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(`Swap API ${method} ${path} → HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

/** Derive ECDSA compressed public key (33 bytes hex) from a raw hex private key. */
function ecdsaPubKeyHex(privKeyHex: string): string {
  const priv = hexToBytes(privKeyHex.replace(/^0x/, '').padStart(64, '0'));
  const pub  = ecc.pointFromScalar(priv, true);
  if (!pub) throw new Error('Invalid QBTC private key');
  return bytesToHex(pub);
}

// ─── HTLC helpers ────────────────────────────────────────────────────────────

/**
 * Build a P2WSH HTLC redeem script (hash-only / seller-lock-first variant).
 *
 *   OP_IF
 *     OP_SHA256 <secretHash> OP_EQUAL
 *   OP_ELSE
 *     <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <sellerPubKey> OP_CHECKSIG
 *   OP_ENDIF
 *
 * Hash-only mode means anyone who knows the preimage can claim — safe for atomic
 * swaps because the secret is revealed only when the seller withdraws USDC on the
 * EVM chain, at which point the buyer immediately uses it to sweep the QBTC output.
 *
 * @param secretHashHex   64-char hex string (SHA-256 of the 32-byte secret)
 * @param sellerPubKeyHex 66-char compressed secp256k1 public key (for the refund branch)
 * @param locktime        absolute Unix timestamp after which the seller can refund
 */
function buildHTLCScript(
  secretHashHex: string,
  sellerPubKeyHex: string,
  locktime: number,
): Buffer {
  return bitcoin.script.compile([
    bitcoin.opcodes.OP_IF,
      bitcoin.opcodes.OP_SHA256,
      Buffer.from(secretHashHex, 'hex'),
      bitcoin.opcodes.OP_EQUAL,
    bitcoin.opcodes.OP_ELSE,
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      Buffer.from(sellerPubKeyHex, 'hex'),
      bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ENDIF,
  ]);
}

/** Derive the P2WSH bech32 address for a redeem script on the current QBTC network. */
function htlcP2wshAddress(redeemScript: Buffer): string {
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: redeemScript, network: QBTC_NET },
    network: QBTC_NET,
  });
  if (!p2wsh.address) throw new Error('Failed to derive P2WSH HTLC address');
  return p2wsh.address;
}

/**
 * Build a signed QBTC HTLC claim transaction (hash-only path).
 *
 * Witness per input: [ secret(32B) | 0x01(OP_IF truthy) | htlcScript ]
 *
 * The OP_IF branch of the hash-only script evaluates to TRUE when
 * SHA256(secret) == secretHash, requiring no ECDSA/PQC signature.
 */
function buildHTLCClaimTx(
  htlcScript:    Buffer,
  htlcTxid:      string,   // txid of the QBTC lock transaction
  htlcVout:      number,   // vout index of the HTLC output
  htlcValueSats: number,   // value of the HTLC output in satoshis
  secretHex:     string,   // 64-char hex preimage
  destAddress:   string,   // buyer's QBTC receive address
  feeRateSatPerVb = 5,
): string {
  // Weight estimation for 1-input, 1-output hash-only P2WSH claim tx:
  //   Non-witness bytes: 4(ver) + 1(in_count) + 41(input) + 1(out_count)
  //                     + 31(output P2WPKH) + 4(locktime) = 82 bytes
  //   Witness bytes: 1(item_count) + 1+32(secret) + 1+1(0x01) + 3+htlcScript.len
  const secretBuf   = Buffer.from(secretHex, 'hex');
  const witnessBytes = 1 + (1 + secretBuf.length) + (1 + 1) + (3 + htlcScript.length);
  const weight      = (82 * 4) + 2 /* segwit marker+flag */ + witnessBytes;
  const vSize       = Math.ceil(weight / 4);
  const fee         = Math.max(1, vSize * feeRateSatPerVb);
  const outputSats  = htlcValueSats - fee;

  if (outputSats <= 546) {
    throw new Error(
      `Claim output (${outputSats} sats) is below dust threshold after fee (${fee} sats). ` +
      `Increase QBTC_AMOUNT or reduce feeRate.`,
    );
  }

  const tx = new bitcoin.Transaction();
  tx.version  = 2;
  tx.locktime = 0;
  tx.addInput(Buffer.from(htlcTxid, 'hex').reverse(), htlcVout, /* sequence */ 0xffffffff);
  tx.addOutput(bitcoin.address.toOutputScript(destAddress, QBTC_NET), outputSats);

  // Witness: [secret, OP_1 (truthy for OP_IF), htlcScript]
  tx.setWitness(0, [
    secretBuf,
    Buffer.from([0x01]),
    htlcScript,
  ]);

  log.info(`  claim tx: ${vSize} vbytes, fee ${fee} sats, output ${outputSats} sats`);
  return tx.toHex();
}

// ─── EVM ABIs ────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;

const HTLC_ABI: string[] = [
  'function newContract(address receiver, bytes32 hashlock, uint256 timelock, address tokenContract, uint256 amount) returns (bytes32 contractId)',
  'function withdraw(bytes32 contractId, bytes32 preimage) returns (bool)',
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
  'event HTLCERC20New(bytes32 indexed contractId, address indexed sender, address indexed receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock)',
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log.banner('QBTC ↔ USDC Atomic Swap — End-to-End Test');

  // ── Load and validate config ───────────────────────────────────────────────

  const swapApiUrl       = requireEnv('SWAP_API_URL');
  const sellerEvmPriv    = requireEnv('SELLER_EVM_PRIVKEY');
  const buyerEvmPriv     = requireEnv('BUYER_EVM_PRIVKEY');
  const sellerQbtcPriv   = requireEnv('SELLER_QBTC_PRIVKEY');
  const buyerQbtcPriv    = requireEnv('BUYER_QBTC_PRIVKEY');
  const sellerQbtcAddr   = requireEnv('SELLER_QBTC_ADDRESS');
  const buyerQbtcAddr    = requireEnv('BUYER_QBTC_ADDRESS');
  const qbtcAmount       = requireEnv('QBTC_AMOUNT');       // e.g. "0.001"
  const usdcAmount       = requireEnv('USDC_AMOUNT');       // e.g. "10.000000"
  const evmRpcUrl        = requireEnv('EVM_RPC_URL');
  const evmHtlcAddr      = requireEnv('EVM_HTLC_CONTRACT');
  const usdcAddr         = requireEnv('USDC_CONTRACT');
  const sellerQbtcWallet = optionalEnv('SELLER_QBTC_WALLET');

  const minBuyerEth       = parseFloat(optionalEnv('MIN_BUYER_ETH',       '0.005'));
  const minSellerEth      = parseFloat(optionalEnv('MIN_SELLER_ETH',      '0.001'));
  const qbtcLocktimeHours = parseInt(optionalEnv('QBTC_LOCKTIME_HOURS', '48'), 10);

  // EVM providers and wallets
  const evmProvider      = new ethers.JsonRpcProvider(evmRpcUrl);
  const sellerEvmWallet  = new ethers.Wallet(sellerEvmPriv, evmProvider);
  const buyerEvmWallet   = new ethers.Wallet(buyerEvmPriv,  evmProvider);
  const sellerEvmAddress = sellerEvmWallet.address.toLowerCase();
  const buyerEvmAddress  = buyerEvmWallet.address.toLowerCase();

  // QBTC keys (ECDSA only — used for pubkeys in the HTLC script and API calls)
  const sellerQbtcPubKey = ecdsaPubKeyHex(sellerQbtcPriv);
  const buyerQbtcPubKey  = ecdsaPubKeyHex(buyerQbtcPriv);

  // USDC in base units (6 decimals)
  const usdcBaseUnits = BigInt(Math.round(parseFloat(usdcAmount) * 1_000_000));

  log.info(`Swap API:            ${swapApiUrl}`);
  log.info(`QBTC network:        ${QBTC_NETWORK_NAME}`);
  log.info(`QBTC amount:         ${qbtcAmount}`);
  log.info(`USDC amount:         ${usdcAmount}`);

  // Derive network label for user-facing messages (e.g. "Sepolia" on testnet)
  const evmNetworkLabel = QBTC_NETWORK_NAME === 'mainnet' ? 'Ethereum mainnet' : 'Sepolia testnet';

  // ── Print funding addresses ────────────────────────────────────────────────

  console.log('\n📬 Fund these addresses before proceeding:');
  log.addr('Seller QBTC (needs QBTC):', sellerQbtcAddr);
  log.addr('Seller EVM (needs ETH):', sellerEvmAddress);
  log.addr('Buyer EVM (needs USDC + ETH):', buyerEvmAddress);
  log.addr('Buyer QBTC (receives QBTC):', buyerQbtcAddr);

  // ── Pre-condition checks ───────────────────────────────────────────────────

  console.log('\n🔍 Checking pre-conditions...');

  // Buyer ETH (gas for USDC approve + newContract)
  const buyerEthBal = await evmProvider.getBalance(buyerEvmAddress);
  log.info(`Buyer ETH:    ${ethers.formatEther(buyerEthBal)} ETH  (need ≥ ${minBuyerEth})`);
  if (Number(ethers.formatEther(buyerEthBal)) < minBuyerEth) {
    log.err(`Buyer has insufficient ETH on ${evmNetworkLabel}. Fund from a faucet or transfer ETH.`);
    process.exit(1);
  }

  // Seller ETH (gas for HTLC withdraw)
  const sellerEthBal = await evmProvider.getBalance(sellerEvmAddress);
  log.info(`Seller ETH:   ${ethers.formatEther(sellerEthBal)} ETH  (need ≥ ${minSellerEth})`);
  if (Number(ethers.formatEther(sellerEthBal)) < minSellerEth) {
    log.err(`Seller has insufficient ETH on ${evmNetworkLabel} for gas.`);
    process.exit(1);
  }

  // Buyer USDC
  const usdcToken  = new ethers.Contract(usdcAddr, ERC20_ABI, evmProvider);
  const buyerUsdc: bigint = await usdcToken.balanceOf(buyerEvmAddress);
  log.info(`Buyer USDC:   ${(Number(buyerUsdc) / 1_000_000).toFixed(6)} USDC  (need ${usdcAmount})`);
  if (buyerUsdc < usdcBaseUnits) {
    log.err(
      `Buyer has insufficient USDC on ${evmNetworkLabel}. ` +
      (QBTC_NETWORK_NAME === 'testnet' ? 'Get testnet USDC from https://faucet.circle.com' : 'Transfer USDC to the buyer address.'),
    );
    process.exit(1);
  }

  // Seller QBTC (via RPC wallet balance)
  try {
    const qbtcBal = await qbtcRpc(
      'getbalance',
      [],
      sellerQbtcWallet || undefined,
    ) as number;
    const needed = parseFloat(qbtcAmount) + 0.0001; // include ~fee
    log.info(`Seller QBTC:  ${qbtcBal} QBTC  (need ≥ ${needed.toFixed(8)})`);
    if (qbtcBal < needed) {
      log.err(`Seller QBTC balance too low (need ${needed} including fee).`);
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Could not query QBTC balance: ${msg} — continuing...`);
  }

  log.ok('All pre-conditions met');

  // ── Step 1: Create offer (seller) ─────────────────────────────────────────

  log.step(1, 'Seller creates offer');

  // C-3: Secret is generated client-side and never sent to the server.
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secretHex       = bytesToHex(secretBytes);
  const secretHashBytes = sha256(secretBytes);
  const secretHash      = bytesToHex(secretHashBytes);

  log.info(`Secret (store safely!): ${secretHex}`);
  log.info(`Secret hash:            ${secretHash}`);

  const now          = Math.floor(Date.now() / 1000);
  const qbtcLocktime = now + qbtcLocktimeHours * 3600;

  // Canonical message as defined in the server's buildCanonicalMessage('CREATE_OFFER', ...)
  const offerTimestamp = now;
  const offerMsg = `QBTC_SWAP:CREATE_OFFER:${sellerEvmAddress}:${qbtcAmount}:${usdcAmount}:${secretHash}:${offerTimestamp}`;
  log.info(`Signing: "${offerMsg}"`);
  const offerSig = await sellerEvmWallet.signMessage(offerMsg);

  const offerResp = await swapApi('POST', '/api/swap/offer', {
    sellerQbtcAddress:    sellerQbtcAddr,
    sellerEvmAddress,
    sellerPubKeyHex:      sellerQbtcPubKey,
    qbtcAmount,
    usdcAmountRequested:  usdcAmount,
    secretHash,
    qbtcLocktime,
    signature:            offerSig,
    timestamp:            offerTimestamp,
  });

  const offerId = offerResp.id as string;
  log.ok(`Offer created — id: ${offerId}`);

  // ── Step 2: Accept offer (buyer) ──────────────────────────────────────────

  log.step(2, 'Buyer accepts offer');

  const acceptTimestamp = Math.floor(Date.now() / 1000);
  // Canonical message: QBTC_SWAP:ACCEPT:<offerId>:<buyerEvmAddress>:<timestamp>
  const acceptMsg = `QBTC_SWAP:ACCEPT:${offerId}:${buyerEvmAddress}:${acceptTimestamp}`;
  log.info(`Signing: "${acceptMsg}"`);
  const acceptSig = await buyerEvmWallet.signMessage(acceptMsg);

  const acceptResp = await swapApi('POST', `/api/swap/accept/${offerId}`, {
    buyerQbtcAddress: buyerQbtcAddr,
    buyerEvmAddress,
    buyerPubKeyHex:   buyerQbtcPubKey,
    signature:        acceptSig,
    timestamp:        acceptTimestamp,
  });

  const swapId      = acceptResp.swapId as string;
  const evmLocktime = acceptResp.evmLocktime as number;

  log.ok(`Offer accepted — swapId: ${swapId}`);
  log.info(`EVM locktime: ${new Date(evmLocktime * 1000).toISOString()}`);

  // ── Step 3: Seller locks QBTC ─────────────────────────────────────────────

  log.step(3, 'Seller locks QBTC in P2WSH HTLC (hash-only / seller-lock-first)');

  const htlcScript      = buildHTLCScript(secretHash, sellerQbtcPubKey, qbtcLocktime);
  const qbtcHtlcAddress = htlcP2wshAddress(htlcScript);

  log.info(`HTLC redeem script (${htlcScript.length} bytes): ${htlcScript.toString('hex')}`);
  log.info(`HTLC P2WSH address: ${qbtcHtlcAddress}`);

  log.info(`Sending ${qbtcAmount} QBTC → HTLC via wallet "${sellerQbtcWallet || '(default)'}"`);
  let qbtcLockTxid: string;
  try {
    qbtcLockTxid = await qbtcRpc(
      'sendtoaddress',
      [qbtcHtlcAddress, parseFloat(qbtcAmount)],
      sellerQbtcWallet || undefined,
    ) as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.err(`sendtoaddress failed: ${msg}`);
    log.warn('Ensure the QBTC wallet is loaded, unlocked, and funded on the node.');
    process.exit(1);
  }
  log.info(`Lock tx broadcast: ${qbtcLockTxid}`);

  // Wait for ≥ 1 confirmation (QBTC testnet targets ~10 s per block)
  log.info('Waiting for ≥ 1 confirmation (poll every 15 s, max 15 min)...');
  let qbtcLockTx: Record<string, unknown> | null = null;
  for (let attempt = 1; attempt <= 60; attempt++) {
    await sleep(15_000);
    try {
      const tx = await qbtcRpc('getrawtransaction', [qbtcLockTxid, true]) as Record<string, unknown>;
      const confs = (tx?.confirmations as number) ?? 0;
      log.info(`  poll ${attempt}/60: ${confs} confirmation(s)`);
      if (confs >= 1) {
        qbtcLockTx = tx;
        break;
      }
    } catch {
      // tx may not be visible yet — keep polling
    }
  }

  if (!qbtcLockTx) {
    log.err('Lock tx never confirmed after 15 minutes. Aborting.');
    process.exit(1);
  }

  // Locate the HTLC output in the lock transaction
  const vouts = (qbtcLockTx.vout as Array<Record<string, unknown>>) ?? [];
  let htlcVout      = -1;
  let htlcValueSats = 0;

  for (let i = 0; i < vouts.length; i++) {
    const vout = vouts[i];
    const spk  = (vout?.scriptPubKey as Record<string, unknown>) ?? {};
    const addrs: string[] = [
      ...(typeof spk.address === 'string' ? [spk.address] : []),
      ...(Array.isArray(spk.addresses) ? (spk.addresses as string[]) : []),
    ];
    if (addrs.some((a) => a.toLowerCase() === qbtcHtlcAddress.toLowerCase())) {
      htlcVout      = i;
      htlcValueSats = Math.round((vout.value as number) * 1e8);
      break;
    }
  }

  if (htlcVout < 0) {
    log.err('HTLC P2WSH address not found in lock transaction outputs!');
    process.exit(1);
  }
  log.ok(`HTLC output confirmed: vout=${htlcVout}, value=${htlcValueSats} sats`);

  // Report QBTC lock to swap server
  const lockTimestamp = Math.floor(Date.now() / 1000);
  // Canonical message: QBTC_SWAP:LOCK_QBTC:<swapId>:<txid>:<timestamp>
  const lockMsg = `QBTC_SWAP:LOCK_QBTC:${swapId}:${qbtcLockTxid}:${lockTimestamp}`;
  const lockSig = await sellerEvmWallet.signMessage(lockMsg);

  await swapApi('POST', '/api/swap/lock/qbtc', {
    swapId,
    qbtcHtlcTxid:    qbtcLockTxid,
    qbtcHtlcAddress,
    signature:       lockSig,
    timestamp:       lockTimestamp,
  });
  log.ok('Swap server updated: QBTC_LOCKED');

  // ── Step 4: Buyer locks USDC on EVM ───────────────────────────────────────

  log.step(4, `Buyer locks USDC in HashedTimelockERC20 (${evmNetworkLabel})`);

  const buyerSigner      = buyerEvmWallet.connect(evmProvider);
  const usdcTokenWriter  = new ethers.Contract(usdcAddr,     ERC20_ABI, buyerSigner);
  const evmHtlcContract  = new ethers.Contract(evmHtlcAddr,  HTLC_ABI,  buyerSigner);
  const htlcIface        = new ethers.Interface(HTLC_ABI);

  // Approve USDC spend if not already sufficient
  const allowance: bigint = await usdcToken.allowance(buyerEvmAddress, evmHtlcAddr);
  log.info(`Current USDC allowance for HTLC: ${Number(allowance) / 1_000_000}`);
  if (allowance < usdcBaseUnits) {
    log.info(`Approving ${usdcAmount} USDC for the HTLC contract...`);
    const approveTx = await usdcTokenWriter.approve(evmHtlcAddr, usdcBaseUnits);
    await approveTx.wait();
    log.ok('USDC approved');
  } else {
    log.info('Sufficient USDC allowance already in place');
  }

  // Create EVM HTLC
  const hashlockBytes32 = secretHash.startsWith('0x') ? secretHash : `0x${secretHash}`;
  log.info(`Creating EVM HTLC (receiver=${sellerEvmAddress}, timelock=${evmLocktime})...`);
  const newContractTx = await evmHtlcContract.newContract(
    sellerEvmAddress,
    hashlockBytes32,
    BigInt(evmLocktime),
    usdcAddr,
    usdcBaseUnits,
  );
  const newContractReceipt = await newContractTx.wait();

  // Extract contractId from HTLCERC20New event
  let evmContractId: string | null = null;
  for (const entry of newContractReceipt.logs) {
    try {
      const parsed = htlcIface.parseLog({ topics: entry.topics, data: entry.data });
      if (parsed?.name === 'HTLCERC20New') {
        evmContractId = parsed.args.contractId as string;
        break;
      }
    } catch {
      // skip non-matching logs
    }
  }
  if (!evmContractId) {
    log.err('HTLCERC20New event not found in newContract receipt');
    process.exit(1);
  }
  log.ok(`EVM HTLC created — contractId: ${evmContractId}`);

  // Report EVM lock to swap server
  await swapApi('POST', '/api/swap/lock/evm', {
    swapId,
    evmContractId,
  });
  log.ok('Swap server updated: EVM_LOCKED');

  // ── Step 5: Seller reveals secret by withdrawing USDC ─────────────────────

  log.step(5, 'Seller withdraws USDC from EVM HTLC (reveals secret on-chain)');

  const sellerSigner       = sellerEvmWallet.connect(evmProvider);
  const evmHtlcForSeller   = new ethers.Contract(evmHtlcAddr, HTLC_ABI, sellerSigner);
  const preimageBytes32    = secretHex.startsWith('0x') ? secretHex : `0x${secretHex}`;

  log.info(`Calling withdraw(contractId=${evmContractId}, preimage=0x${secretHex.slice(0, 16)}...)...`);
  const withdrawTx = await evmHtlcForSeller.withdraw(evmContractId, preimageBytes32);
  await withdrawTx.wait();
  log.ok('Seller withdrew USDC — secret is now visible on-chain');

  // ── Step 6: Buyer claims QBTC ─────────────────────────────────────────────

  log.step(6, 'Buyer claims QBTC from P2WSH HTLC using revealed secret');

  const claimTxHex = buildHTLCClaimTx(
    htlcScript,
    qbtcLockTxid,
    htlcVout,
    htlcValueSats,
    secretHex,
    buyerQbtcAddr,
  );
  log.info(`Claim tx hex (${claimTxHex.length / 2} bytes): ${claimTxHex.slice(0, 80)}...`);

  let claimTxid: string;
  try {
    claimTxid = await qbtcRpc('sendrawtransaction', [claimTxHex]) as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.err(`sendrawtransaction failed: ${msg}`);
    log.warn('Full claim tx hex:');
    log.warn(claimTxHex);
    process.exit(1);
  }
  log.ok(`QBTC claimed — txid: ${claimTxid}`);

  // ── Step 7: Wait for EVM monitor → COMPLETE, then report claim txid ────────

  log.step(7, 'Waiting for EVM monitor to mark swap COMPLETE');
  log.info('Polling /api/swap/:swapId every 30 s (monitor runs every 60 s)...');

  let swapComplete = false;
  for (let attempt = 1; attempt <= 40; attempt++) {
    await sleep(30_000);
    try {
      const status = await swapApi('GET', `/api/swap/${swapId}`);
      log.info(`  poll ${attempt}/40: status=${status.status}`);
      if (status.status === 'COMPLETE') {
        swapComplete = true;
        break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  poll error: ${msg}`);
    }
  }

  if (!swapComplete) {
    log.warn('Swap did not reach COMPLETE in 20 minutes — reporting claim anyway.');
  }

  // Report the buyer's QBTC claim txid to the server
  const claimTimestamp = Math.floor(Date.now() / 1000);
  // Canonical message: QBTC_SWAP:CLAIM_QBTC:<swapId>:<claimTxid>:<timestamp>
  const claimMsg = `QBTC_SWAP:CLAIM_QBTC:${swapId}:${claimTxid}:${claimTimestamp}`;
  const claimSig = await buyerEvmWallet.signMessage(claimMsg);

  try {
    await swapApi('POST', '/api/swap/claim/qbtc', {
      swapId,
      claimTxid,
      signature: claimSig,
      timestamp: claimTimestamp,
    });
    log.ok('Swap server notified of QBTC claim');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Non-fatal — swap may not be COMPLETE yet on the server
    log.warn(`claim/qbtc report failed (non-fatal): ${msg}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  log.banner('🎉 ATOMIC SWAP COMPLETE!');
  log.info(`Swap ID:              ${swapId}`);
  log.info(`Offer ID:             ${offerId}`);
  log.info(`QBTC lock txid:       ${qbtcLockTxid}`);
  log.info(`QBTC claim txid:      ${claimTxid}`);
  log.info(`EVM HTLC contractId:  ${evmContractId}`);
  log.info(`Secret (preimage):    ${secretHex}`);
  log.info(`Secret hash:          ${secretHash}`);
  console.log();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log.err(msg);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
