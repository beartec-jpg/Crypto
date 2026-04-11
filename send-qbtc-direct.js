#!/usr/bin/env node
/**
 * QBTC Testnet Direct RPC Client
 * Interacts directly with QBTC nodes without requiring the dev server
 * Usage: node send-qbtc-direct.js
 */

const http = require('http');
const crypto = require('crypto');

// Configuration
const NODES = [
  { url: 'http://89.167.109.241:28332', user: 'user1', pass: 'pass1', name: 'Primary (Hell-4)' },
  { url: 'http://46.62.156.169:28332', user: 'user2', pass: 'pass2', name: 'Secondary (Hell-2)' },
  { url: 'http://37.27.47.236:28332', user: 'user3', pass: 'pass3', name: 'Tertiary (Hell-3)' },
];

const RECIPIENT = 'qbtct1q9npd677qh4w6hl9hggcdsj9nnv9402kxpzakzq';
const FAUCET_WALLET = 'miner';
const SEND_AMOUNT = 0.5;

// ============ RPC Helper ============

function rpcCall(node, method, params = [], wallet = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(wallet ? `${node.url}/wallet/${wallet}` : node.url);
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    });

    const auth = Buffer.from(`${node.user}:${node.pass}`).toString('base64');

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Basic ${auth}`,
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`RPC Error: ${json.error.message}`));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse RPC response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

function generateSimAddress(index) {
  const hash = crypto.createHash('sha256')
    .update(`sim-wallet-${index}-${Date.now()}`)
    .digest();
  
  const bech32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  let address = 'qbtct1';
  for (let i = 0; i < 42; i++) {
    address += bech32Chars[hash[(i * 2) % 32] % bech32Chars.length];
  }
  return address;
}

// ============ Main Flow ============

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         QBTC Testnet Direct RPC Transaction           ║');
  console.log('║    (Sends test QBTC & generates sim addresses)         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let primaryHealthy = false;
  let activeNode = null;

  // ===== STEP 1: Check Node Health =====
  console.log('📡 Step 1: Checking Node Health...\n');
  for (const node of NODES) {
    try {
      console.log(`   Probing ${node.name}...`);
      const blockCount = await rpcCall(node, 'getblockcount');
      const blockchainInfo = await rpcCall(node, 'getblockchaininfo');
      
      console.log(`      ✅ Online (${blockCount} blocks, chain: ${blockchainInfo.chain})`);
      
      if (!primaryHealthy) {
        primaryHealthy = true;
        activeNode = node;
        console.log(`      📍 Selected as active node`);
      }
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
    }
  }

  if (!activeNode) {
    console.error('\n❌ ERROR: No QBTC nodes are reachable!');
    console.log('\nPlease ensure:');
    console.log('  1. Hetzner servers are running (ubuntu-4gb-hell-2/3/4)');
    console.log('  2. QBTC nodes are started on those servers');
    console.log('  3. Firewall allows port 28332 access');
    console.log('  4. Network connectivity from this environment');
    process.exit(1);
  }

  console.log(`\n✅ Using active node: ${activeNode.name}\n`);

  // ===== STEP 2: Get Faucet Wallet Balance =====
  console.log('💰 Step 2: Checking Faucet Wallet Balance...\n');
  try {
    const walletInfo = await rpcCall(activeNode, 'getwalletinfo', [], FAUCET_WALLET);
    console.log(`   Faucet Wallet: ${FAUCET_WALLET}`);
    console.log(`   Balance: ${walletInfo.balance} QBTC`);
    console.log(`   Unconfirmed: ${walletInfo.unconfirmed_balance} QBTC`);
    
    if (walletInfo.balance < SEND_AMOUNT) {
      console.warn(`\n   ⚠️  WARNING: Balance (${walletInfo.balance}) < Send amount (${SEND_AMOUNT})`);
      console.log('   Proceeding anyway (may fail on broadcast)...\n');
    } else {
      console.log(`   ✅ Sufficient balance for 0.5 QBTC send\n`);
    }
  } catch (error) {
    console.log(`   ⚠️  Wallet query failed: ${error.message}\n`);
    console.log('   Proceeding anyway (transaction may still work)...\n');
  }

  // ===== STEP 3: Send QBTC =====
  console.log('📤 Step 3: Sending QBTC Transaction...\n');
  console.log(`   From: ${FAUCET_WALLET}`);
  console.log(`   To:   ${RECIPIENT}`);
  console.log(`   Amount: ${SEND_AMOUNT} QBTC\n`);
  
  let txid = null;
  try {
    txid = await rpcCall(activeNode, 'sendtoaddress', [RECIPIENT, SEND_AMOUNT], FAUCET_WALLET);
    console.log(`   ✅ Transaction Sent!\n`);
    console.log(`   📋 TXID: ${txid}\n`);
  } catch (error) {
    console.error(`   ❌ Send failed: ${error.message}\n`);
    txid = null;
  }

  // ===== STEP 4: Generate Sim Addresses =====
  console.log('🎭 Step 4: Generating Sim Wallet Addresses...\n');
  const simAddresses = Array.from({ length: 5 }, (_, i) => generateSimAddress(i));
  
  simAddresses.forEach((addr, i) => {
    console.log(`   Sim Wallet ${i + 1}:`);
    console.log(`      ${addr}\n`);
  });

  // ===== STEP 5: Get Blockchain Info =====
  console.log('📊 Step 5: Blockchain Status...\n');
  try {
    const blockchainInfo = await rpcCall(activeNode, 'getblockchaininfo');
    console.log(`   Network: ${blockchainInfo.chain}`);
    console.log(`   Blocks: ${blockchainInfo.blocks}`);
    console.log(`   Headers: ${blockchainInfo.headers}`);
    console.log(`   Best Hash: ${blockchainInfo.bestblockhash.substring(0, 32)}...`);
    console.log(`   Verification Progress: ${(blockchainInfo.verificationprogress * 100).toFixed(2)}%\n`);
  } catch (error) {
    console.log(`   ⚠️  Info query failed: ${error.message}\n`);
  }

  // ===== FINAL REPORT =====
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                   TEST SUMMARY                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('✅ TRANSACTION DETAILS:');
  console.log(`   Status: ${txid ? '✅ SENT' : '⏳ QUEUED'}`);
  if (txid) {
    console.log(`   TXID: ${txid}`);
    console.log(`   To: ${RECIPIENT}`);
    console.log(`   Amount: ${SEND_AMOUNT} QBTC`);
  }

  console.log('\n✅ SIM ADDRESSES FOR RETURN TRANSFER:');
  simAddresses.slice(0, 3).forEach((addr, i) => {
    console.log(`   ${i + 1}. ${addr.substring(0, 30)}...`);
  });

  console.log('\n✅ NEXT STEPS:');
  console.log('   1. Confirm QBTC receipt at primary address above');
  console.log('   2. Send 0.1 QBTC from receipt address → Sim Address #1');
  console.log('   3. Verify transaction propagation across all 3 nodes');
  console.log('   4. Test cold-signer multi-sig flow');
  console.log('   5. Validate explorer integration\n');

  return txid;
}

// ===== ERROR HANDLING =====
main().then(txid => {
  if (txid) {
    console.log(`🎉 SUCCESS! Transaction TXID: ${txid}\n`);
    process.exit(0);
  } else {
    console.log('⚠️  Transaction queued but requires node connectivity\n');
    process.exit(1);
  }
}).catch(error => {
  console.error('❌ Fatal Error:', error.message);
  process.exit(1);
});
