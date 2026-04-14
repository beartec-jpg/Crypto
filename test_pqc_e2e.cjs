// End-to-end PQC transaction test using noble + bitcoinjs-lib
// This replicates what the CryptoSparse client does: build tx, sign with ECDSA + Dilithium,
// and submit to the QBTC node.
//
// Strategy: use the node's signrawtransactionwithwallet to get the ECDSA sig,
// then compute the sighash ourselves and sign with noble Dilithium.
// Compare our sighash with what the node would compute.

const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');
const http = require('http');

const QBTC_REGTEST = { ...bitcoin.networks.regtest, bech32: 'qbtcrt' };

// RPC helper
function rpc(method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 28443,
      method: 'POST',
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

async function main() {
  // Test parameters (from regtest)
  const UTXO_TXID = 'b4ca89fe700ed86e2ac74ddc818c3d4904a1464c4543347c94b2787e0c544577';
  const UTXO_VOUT = 0;
  const UTXO_AMOUNT = 0.08333333; // in BTC
  const UTXO_AMOUNT_SATS = Math.round(UTXO_AMOUNT * 1e8);
  const UTXO_SCRIPTPUBKEY = '0014830ffa15632a1ad52007cdf9d67e66bd27f8deee';
  
  console.log('=== Step 1: Get ECDSA-signed tx from node ===');
  
  // Create destination address
  const destAddr = await rpc('getnewaddress', ['', 'bech32']);
  console.log('Dest:', destAddr);
  
  // Create unsigned raw tx
  const rawTx = await rpc('createrawtransaction', [
    [{ txid: UTXO_TXID, vout: UTXO_VOUT }],
    { [destAddr]: '0.08' },
  ]);
  console.log('Unsigned raw tx:', rawTx.substring(0, 80) + '...');
  
  // Sign with wallet (gets us both ECDSA and PQC from node)
  const signed = await rpc('signrawtransactionwithwallet', [rawTx]);
  console.log('Node-signed complete:', signed.complete);
  
  // Decode to get the ECDSA sig and pubkey
  const decoded = await rpc('decoderawtransaction', [signed.hex]);
  const witness = decoded.vin[0].txinwitness;
  console.log('Node witness items:', witness.length);
  
  const nodeEcdsaSig = Buffer.from(witness[0], 'hex');
  const nodeEcdsaPub = Buffer.from(witness[1], 'hex');
  console.log('ECDSA pubkey:', nodeEcdsaPub.toString('hex'));
  console.log('ECDSA sig len:', nodeEcdsaSig.length);
  
  console.log('\n=== Step 2: Compute BIP-143 sighash using bitcoinjs-lib ===');
  
  // Reconstruct the transaction in bitcoinjs-lib
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(UTXO_TXID, 'hex').reverse(), UTXO_VOUT, 0xfffffffd);
  tx.addOutput(bitcoin.address.toOutputScript(destAddr, QBTC_REGTEST), Math.round(0.08 * 1e8));
  
  // Build scriptCode for BIP-143 (P2PKH equivalent for P2WPKH)
  const scriptCode = bitcoin.payments.p2pkh({
    pubkey: nodeEcdsaPub,
    network: QBTC_REGTEST,
  }).output;
  
  console.log('scriptCode:', scriptCode.toString('hex'));
  console.log('scriptCode length:', scriptCode.length);
  
  // Compute the BIP-143 sighash
  const sighash = tx.hashForWitnessV0(0, scriptCode, UTXO_AMOUNT_SATS, bitcoin.Transaction.SIGHASH_ALL);
  console.log('Our BIP-143 sighash:', sighash.toString('hex'));
  
  console.log('\n=== Step 3: Sign sighash with noble Dilithium ===');
  
  // Generate a fresh Dilithium keypair (any seed will do for testing)
  const testSeed = Buffer.from('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', 'hex');
  const { publicKey: dilPk, secretKey: dilSk } = ml_dsa44.keygen(testSeed);
  console.log('Dilithium PK size:', dilPk.length);
  console.log('Dilithium SK size:', dilSk.length);
  
  // Sign the sighash with Dilithium
  const dilSig = ml_dsa44.sign(sighash, dilSk);
  console.log('Dilithium sig size:', dilSig.length);
  
  // Verify locally
  const localVerify = ml_dsa44.verify(dilSig, sighash, dilPk);
  console.log('Noble local verify:', localVerify);
  
  console.log('\n=== Step 4: Build 4-element witness tx ===');
  
  // Set the witness: [ecdsa_sig, ecdsa_pubkey, dil_sig, dil_pubkey]
  tx.setWitness(0, [
    nodeEcdsaSig,
    nodeEcdsaPub,
    Buffer.from(dilSig),
    Buffer.from(dilPk),
  ]);
  
  const finalHex = tx.toHex();
  console.log('Final tx hex length:', finalHex.length);
  console.log('Final tx hex (first 100):', finalHex.substring(0, 100) + '...');
  
  console.log('\n=== Step 5: Test with node ===');
  
  try {
    const result = await rpc('testmempoolaccept', [[finalHex]]);
    console.log('testmempoolaccept result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('testmempoolaccept error:', e.message);
  }
  
  // Also try to compare with the node's sighash by sending with verbose errors
  try {
    const txid = await rpc('sendrawtransaction', [finalHex]);
    console.log('sendrawtransaction SUCCESS! txid:', txid);
  } catch (e) {
    console.log('sendrawtransaction error:', e.message);
  }

  console.log('\n=== Step 6: Compare with node-signed PQC tx ===');
  // If the node's tx was accepted but ours isn't, the sighash must differ
  // Let's check: is our unsigned tx structure identical to the node's?
  const ourUnsignedHex = tx.toHex();
  console.log('Our tx version:', tx.version);
  console.log('Our tx locktime:', tx.locktime);
  console.log('Our input hash:', tx.ins[0].hash.toString('hex'));
  console.log('Our input index:', tx.ins[0].index);
  console.log('Our input sequence:', tx.ins[0].sequence, '(0x' + tx.ins[0].sequence.toString(16) + ')');
}

main().catch(console.error);
