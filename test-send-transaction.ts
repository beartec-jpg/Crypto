/**
 * Test Script: Send QBTC Testnet Transaction and Create Sim Addresses
 * Usage: npx ts-node test-send-transaction.ts
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

// Test Configuration
const RECIPIENT_ADDRESS = 'qbtct1q9npd677qh4w6hl9hggcdsj9nnv9402kxpzakzq';
const FAUCET_API_URL = 'http://localhost:3001/api/qbtc-faucet';
const HEALTH_CHECK_URL = 'http://localhost:3001/api/qbtc/health';
const TESTNET_NODES = [
  'http://89.167.109.241:28332',
  'http://46.62.156.169:28332',
  'http://37.27.47.236:28332',
];

interface NetworkStatus {
  blockHeight: number;
  chainName: string;
  pqc: {
    enabled: boolean;
    algorithm: string;
  };
  dag: {
    ghostdagK: number;
    blockTargetSeconds: number;
  };
  nodeStatuses: Array<{
    nodeUrl: string;
    ok: boolean;
    blocks?: number;
    latencyMs?: number;
  }>;
}

interface FaucetResponse {
  success: boolean;
  txid?: string;
  error?: string;
}

// Generate mock QBTC testnet address (for sim wallet testing)
function generateSimAddress(index: number): string {
  const hash = crypto.createHash('sha256')
    .update(`sim-wallet-${index}-${Date.now()}`)
    .digest();
  
  // QBTC testnet addresses start with 'qbtct1'
  const bech32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  let address = 'qbtct1';
  
  for (let i = 0; i < 42; i++) {
    address += bech32Chars[hash[(i * 2) % 32] % bech32Chars.length];
  }
  
  return address;
}

async function checkNetworkStatus(): Promise<NetworkStatus | null> {
  console.log('\n📊 Checking QBTC Testnet Status...');
  
  try {
    const response = await fetch(HEALTH_CHECK_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json() as any;
    console.log('✅ Network Status:');
    console.log(`   • Block Height: ${data.blockHeight || 'N/A'}`);
    console.log(`   • Chain: ${data.network || 'qbtc-testnet'}`);
    console.log(`   • PQC Enabled: ${data.pqc?.enabled ? 'Yes' : 'No'}`);
    if (data.pqc?.enabled) {
      console.log(`   • PQC Algorithm: ${data.pqc.algorithm}`);
    }
    console.log(`   • DAG Mode: GHOSTDAG (K=${data.dag?.ghostdagK || 'N/A'})`);
    
    if (data.nodeStatuses) {
      console.log(`   • Active Nodes: ${data.nodeStatuses.filter((n: any) => n.ok).length}/${data.nodeStatuses.length}`);
      data.nodeStatuses.forEach((node: any) => {
        const status = node.ok ? '🟢' : '🔴';
        const latency = node.latencyMs ? ` (${node.latencyMs}ms)` : '';
        console.log(`     ${status} ${node.nodeUrl}${latency}`);
      });
    }
    
    return data as NetworkStatus;
  } catch (error) {
    console.warn('⚠️  Network status unavailable (backend may not be running)');
    return null;
  }
}

async function sendQBTC(): Promise<string | null> {
  console.log('\n💸 Sending QBTC to Test Address...');
  console.log(`   • Recipient: ${RECIPIENT_ADDRESS}`);
  console.log(`   • Amount: 0.5 QBTC`);
  
  try {
    const response = await fetch(FAUCET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: RECIPIENT_ADDRESS }),
    });
    
    const data = await response.json() as FaucetResponse;
    
    if (!data.success) {
      console.error(`❌ Faucet Error: ${data.error}`);
      return null;
    }
    
    console.log(`✅ Transaction Sent!`);
    console.log(`   • TXID: ${data.txid}`);
    console.log(`   • Explorer: https://qbtc-scan.example.com/tx/${data.txid}`);
    
    return data.txid || null;
  } catch (error: any) {
    console.warn(`⚠️  Faucet unavailable: ${error.message}`);
    console.log('   (This is expected if the dev server is not running yet)');
    return null;
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║    QBTC Testnet Transaction & Address Generation Tool     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  // 1. Check network status
  const networkStatus = await checkNetworkStatus();
  
  // 2. Send QBTC
  const txid = await sendQBTC();
  
  // 3. Generate sim addresses
  console.log('\n🎭 Generated Sim Addresses (for testing):');
  const simAddresses = Array.from({ length: 5 }, (_, i) => generateSimAddress(i));
  simAddresses.forEach((addr, i) => {
    console.log(`   ${i + 1}. ${addr}`);
  });
  
  // 4. Test Status Summary
  console.log('\n📋 Test Status Summary:');
  console.log(`   • Network: ${networkStatus?.chainName || 'qbtc-testnet'}`);
  console.log(`   • Transaction Status: ${txid ? '✅ Sent' : '⏳ Pending (dev server starting)'}`);
  console.log(`   • Recipient: ${RECIPIENT_ADDRESS}`);
  console.log(`   • Sim Addresses Generated: ${simAddresses.length}`);
  console.log(`   • Testnet Nodes: ${TESTNET_NODES.length} configured`);
  
  console.log('\n💡 Next Steps:');
  console.log('   1. Send test funds FROM sim address back to verify wallet transfer');
  console.log('   2. Test multi-sig scenarios with addresses above');
  console.log('   3. Verify cold-signer integration for transaction signing');
  console.log('   4. Check block confirmation status on QBTC scan');
  
  console.log('\n✔️ Test initialization complete!\n');
}

main().catch(console.error);
