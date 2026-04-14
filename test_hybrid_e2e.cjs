#!/usr/bin/env node
/**
 * End-to-end test: Hybrid address (Hash160(ecdsa_pk || pqc_pk))
 * on QBTC regtest node — same code path as the updated wallet.
 */
const { hmac } = require('@noble/hashes/hmac');
const { sha512 } = require('@noble/hashes/sha512');
const { sha256 } = require('@noble/hashes/sha256');
const { ripemd160 } = require('@noble/hashes/ripemd160');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const axios = require('axios');

const RPC_URL = 'http://127.0.0.1:28443';
const RPC_AUTH = { username: 'test', password: 'test' };

const QBTC_REGTEST = { ...bitcoin.networks.regtest, bech32: 'qbtcrt' };

async function rpc(method, params = []) {
  const { data } = await axios.post(RPC_URL, { jsonrpc: '1.0', method, params }, { auth: RPC_AUTH });
  if (data.error) throw new Error(`RPC ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

function hmacSha512(key, data) {
  return hmac(sha512, key, data);
}

function hash160(buf) {
  return Buffer.from(ripemd160(sha256(buf)));
}

(async () => {
  console.log('=== HYBRID ADDRESS E2E TEST ===\n');

  // 1) Generate fresh ECDSA keypair
  const ecdsaPriv = Buffer.from(require('crypto').randomBytes(32));
  const ecdsaPub = Buffer.from(secp256k1.getPublicKey(ecdsaPriv, true));
  console.log('ECDSA pub:', ecdsaPub.toString('hex').slice(0, 20) + '...');

  // 2) Derive Dilithium from ECDSA (same as hot wallet)
  const dilSeed = hmacSha512(ecdsaPriv, new TextEncoder().encode('QuantBTC-Dilithium')).slice(0, 32);
  const { secretKey: dilPriv, publicKey: dilPub } = ml_dsa44.keygen(dilSeed);
  console.log('PQC pub:', dilPub.length, 'bytes');

  // 3) Compute HYBRID Hash160(ecdsa_pk || pqc_pk)
  const combined = Buffer.concat([ecdsaPub, Buffer.from(dilPub)]);
  const hybridHash = hash160(combined);
  console.log('Hybrid Hash160:', hybridHash.toString('hex'));

  // Also compute legacy for comparison
  const legacyHash = hash160(ecdsaPub);
  console.log('Legacy Hash160:', legacyHash.toString('hex'));
  console.log('Hashes differ:', hybridHash.toString('hex') !== legacyHash.toString('hex'));

  // 4) Generate hybrid P2WPKH address
  const { address: hybridAddr, output: hybridOutput } = bitcoin.payments.p2wpkh({
    hash: hybridHash,
    network: QBTC_REGTEST,
  });
  console.log('\nHybrid address:', hybridAddr);

  // 5) Fund hybrid address: generate some blocks for fee estimation first
  await rpc('generatetoaddress', [10, await rpc('getnewaddress')]);
  const fundTxid = await rpc('sendtoaddress', [hybridAddr, 1.0]);
  await rpc('generatetoaddress', [1, await rpc('getnewaddress')]);
  console.log('Funded 1.0 BTC to hybrid address, funding txid:', fundTxid);
  console.log('Funded 1.0 BTC to hybrid address');

  // 6) Find the UTXO
  const scan = await rpc('scantxoutset', ['start', [`raw(${hybridOutput.toString('hex')})`]]);
  if (!scan.unspents || scan.unspents.length === 0) {
    throw new Error('No UTXO found for hybrid address!');
  }
  const utxo = scan.unspents[0];
  console.log(`UTXO: ${utxo.txid}:${utxo.vout} = ${utxo.amount} BTC`);

  // 7) Build spending transaction
  const destAddr = await rpc('getnewaddress');
  const amountSats = 50000000; // 0.5 BTC
  const feeSats = 5000;
  const changeSats = Math.round(utxo.amount * 1e8) - amountSats - feeSats;

  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffd);
  tx.addOutput(bitcoin.address.toOutputScript(destAddr, QBTC_REGTEST), amountSats);
  if (changeSats > 546) {
    tx.addOutput(hybridOutput, changeSats);
  }

  // 8) Build scriptCode using HYBRID hash (same as node expects)
  const scriptCode = bitcoin.payments.p2pkh({
    hash: hybridHash,
    network: QBTC_REGTEST,
  }).output;

  // 9) Compute BIP-143 sighash
  const digest = tx.hashForWitnessV0(0, scriptCode, Math.round(utxo.amount * 1e8), bitcoin.Transaction.SIGHASH_ALL);
  console.log('\nBIP-143 sighash:', digest.toString('hex'));

  // 10) Sign with ECDSA
  const rawSig = ecc.sign(digest, ecdsaPriv);
  const ecdsaSig = bitcoin.script.signature.encode(Buffer.from(rawSig), bitcoin.Transaction.SIGHASH_ALL);
  console.log('ECDSA sig:', ecdsaSig.length, 'bytes');

  // 11) Sign with Dilithium (same digest)
  const dilSig = Buffer.from(ml_dsa44.sign(digest, dilPriv));
  console.log('PQC sig:', dilSig.length, 'bytes');

  // 12) Set 4-element witness
  tx.setWitness(0, [ecdsaSig, ecdsaPub, dilSig, Buffer.from(dilPub)]);

  const rawHex = tx.toHex();
  console.log('\nRaw tx:', rawHex.length, 'hex chars');

  // 13) Test mempool acceptance first
  try {
    const accept = await rpc('testmempoolaccept', [[rawHex]]);
    console.log('\ntestmempoolaccept:', JSON.stringify(accept));
    if (accept[0] && !accept[0].allowed) {
      console.log('REJECT REASON:', accept[0]['reject-reason']);
    }
  } catch (e) {
    console.log('testmempoolaccept error:', e.response?.data || e.message);
  }

  // 14) Broadcast
  try {
    const txid = await rpc('sendrawtransaction', [rawHex]);
    console.log('\n*** HYBRID ADDRESS TX SUCCESS! ***');
    console.log('txid:', txid);
  } catch (e) {
    console.error('\n*** BROADCAST FAILED ***');
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
})();
