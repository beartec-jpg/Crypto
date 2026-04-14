// Full client-flow replication test
// This generates a fresh keypair, funds the address, and signs EVERYTHING manually
// (both ECDSA and Dilithium) - exactly as the wallet client does.

const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');
const { hmac } = require('@noble/hashes/hmac');
const { sha512 } = require('@noble/hashes/sha512');
const http = require('http');

const QBTC_REGTEST = { ...bitcoin.networks.regtest, bech32: 'qbtcrt' };

function rpc(method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const req = http.request({
      hostname: '127.0.0.1', port: 28443, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from('test:test').toString('base64'),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(JSON.stringify(json.error)));
          else resolve(json.result);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function toSats(amount) { return Math.round(amount * 1e8); }

async function main() {
  console.log('=== FULL CLIENT-FLOW REPLICATION TEST ===\n');

  // Step 1: Generate fresh ECDSA keypair (random)
  const ecdsaPriv = Buffer.from('1111111111111111111111111111111111111111111111111111111111111111', 'hex');
  const ecdsaPub = Buffer.from(ecc.pointFromScalar(ecdsaPriv, true));
  console.log('ECDSA private key:', ecdsaPriv.toString('hex'));
  console.log('ECDSA public key:', ecdsaPub.toString('hex'));

  // Step 2: Derive Dilithium keypair from ECDSA private key (same as client)
  const dilSeed = hmac(sha512, ecdsaPriv, new TextEncoder().encode('QuantBTC-Dilithium')).slice(0, 32);
  const { publicKey: dilPk, secretKey: dilSk } = ml_dsa44.keygen(dilSeed);
  console.log('Dilithium seed:', Buffer.from(dilSeed).toString('hex'));
  console.log('Dilithium PK size:', dilPk.length);

  // Step 3: Derive QBTC address (P2WPKH, legacy -- Hash160 of ECDSA pubkey only)
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: ecdsaPub, network: QBTC_REGTEST });
  const myAddr = p2wpkh.address;
  console.log('Address:', myAddr);
  console.log('Witness program:', p2wpkh.hash.toString('hex'));

  // Step 4: Fund the address -- send from existing wallet UTXO
  console.log('\nFunding our address from existing wallet...');
  // Create raw tx to fund our address (avoids fee estimation issues on regtest)
  const walletUtxos = await rpc('listunspent', [1, 9999]);
  const walletUtxo = walletUtxos.find(u => u.amount >= 0.05 && u.spendable);
  if (!walletUtxo) throw new Error('No suitable wallet UTXO found');
  const fundRaw = await rpc('createrawtransaction', [
    [{ txid: walletUtxo.txid, vout: walletUtxo.vout }],
    { [myAddr]: '0.05', [await rpc('getnewaddress', ['', 'bech32'])]: String((walletUtxo.amount - 0.051).toFixed(8)) }
  ]);
  const fundSigned = await rpc('signrawtransactionwithwallet', [fundRaw]);
  const fundTxid = await rpc('sendrawtransaction', [fundSigned.hex]);
  console.log('Fund tx:', fundTxid);
  // Mine a block to confirm it
  const burnAddr2 = await rpc('getnewaddress', ['', 'bech32']);
  await rpc('generatetoaddress', [1, burnAddr2]);
  
  // Get the spendable UTXO using scantxoutset
  const utxos = await rpc('scantxoutset', ['start', [{ desc: `raw(${bitcoin.address.toOutputScript(myAddr, QBTC_REGTEST).toString('hex')})` }]]);
  // Pick the UTXO with highest amount
  const utxo = utxos.unspents.sort((a, b) => b.amount - a.amount)[0];
  console.log('UTXO txid:', utxo.txid);
  console.log('UTXO vout:', utxo.vout);
  console.log('UTXO amount:', utxo.amount, '=', toSats(utxo.amount), 'sats');
  console.log('UTXO scriptPubKey:', utxo.scriptPubKey);

  // Step 5: Build transaction (exactly as client does)
  const destAddr = await rpc('getnewaddress', ['', 'bech32']);
  const sendAmountSats = toSats(0.04);
  
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout, 0xfffffffd);
  tx.addOutput(bitcoin.address.toOutputScript(destAddr, QBTC_REGTEST), sendAmountSats);

  // Step 6: Compute BIP-143 sighash (exactly as client does)
  const scriptCode = bitcoin.payments.p2pkh({
    pubkey: ecdsaPub,
    network: QBTC_REGTEST,
  }).output;

  console.log('\nscriptCode:', scriptCode.toString('hex'));

  const digest = tx.hashForWitnessV0(0, scriptCode, toSats(utxo.amount), bitcoin.Transaction.SIGHASH_ALL);
  console.log('BIP-143 sighash:', digest.toString('hex'));

  // Step 7: Sign with ECDSA (exactly as client does)
  const rawEcdsaSig = ecc.sign(digest, ecdsaPriv);
  if (!rawEcdsaSig) throw new Error('ECDSA sign failed');
  const ecdsaSignature = bitcoin.script.signature.encode(Buffer.from(rawEcdsaSig), bitcoin.Transaction.SIGHASH_ALL);
  console.log('ECDSA sig length:', ecdsaSignature.length, '(last byte:', ecdsaSignature[ecdsaSignature.length-1], ')');

  // Step 8: Sign with Dilithium (exactly as client does)
  const dilithiumSignature = Buffer.from(ml_dsa44.sign(digest, dilSk));
  const dilithiumPublicKey = Buffer.from(dilPk);
  console.log('Dilithium sig length:', dilithiumSignature.length);
  
  // Local verify
  const localOk = ml_dsa44.verify(dilithiumSignature, digest, dilPk);
  console.log('Noble local verify:', localOk);

  // Step 9: Set 4-element witness (exactly as client does)
  tx.setWitness(0, [
    ecdsaSignature,
    ecdsaPub,
    dilithiumSignature,
    dilithiumPublicKey,
  ]);

  const finalHex = tx.toHex();
  console.log('\nFinal tx hex length:', finalHex.length);

  // Step 10: Test with node
  console.log('\n=== TESTING WITH NODE ===');
  try {
    const result = await rpc('testmempoolaccept', [[finalHex]]);
    console.log('testmempoolaccept:', JSON.stringify(result, null, 2));
    
    if (result[0].allowed) {
      const txid = await rpc('sendrawtransaction', [finalHex]);
      console.log('SUCCESS! txid:', txid);
    } else {
      console.log('REJECTED:', result[0]['reject-reason']);
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }
}

main().catch(console.error);
