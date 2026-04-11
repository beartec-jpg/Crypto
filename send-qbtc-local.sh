#!/bin/bash
# Run this directly on your primary QBTC node (ubuntu-4gb-hell-4)
# Usage: bash send-qbtc-local.sh

set -e

RECIPIENT="qbtct1q9npd677qh4w6hl9hggcdsj9nnv9402kxpzakzq"
FAUCET_WALLET="miner"
SEND_AMOUNT="0.5"

echo "╔════════════════════════════════════════════════════════╗"
echo "║         QBTC Testnet Local Transaction Send           ║"
echo "║         (Run this on primary node server)             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if qbtc-cli is available
if ! command -v qbtc-cli &> /dev/null; then
    echo "❌ ERROR: qbtc-cli not found in PATH"
    echo "   Install QBTC or add to PATH"
    exit 1
fi

echo "📊 Step 1: Check Node Status"
echo ""
BLOCKCOUNT=$(qbtc-cli -testnet getblockcount)
echo "   ✅ Current Block: $BLOCKCOUNT"

BLOCKCHAININFO=$(qbtc-cli -testnet getblockchaininfo)
CHAIN=$(echo "$BLOCKCHAININFO" | jq -r '.chain')
echo "   ✅ Network: $CHAIN"
echo ""

echo "💰 Step 2: Check Faucet Wallet Balance"
echo ""
WALLETINFO=$(qbtc-cli -testnet -rpcwallet="$FAUCET_WALLET" getwalletinfo)
BALANCE=$(echo "$WALLETINFO" | jq -r '.balance')
echo "   Wallet: $FAUCET_WALLET"
echo "   Balance: $BALANCE QBTC"
echo ""

if (( $(echo "$BALANCE < $SEND_AMOUNT" | bc -l) )); then
    echo "   ⚠️  WARNING: Insufficient balance!"
    echo "   Need: $SEND_AMOUNT QBTC"
    echo "   Have: $BALANCE QBTC"
    exit 1
fi

echo "✅ Sufficient balance\n"

echo "📤 Step 3: Send Transaction"
echo ""
echo "   From: $FAUCET_WALLET"
echo "   To:   $RECIPIENT"
echo "   Amount: $SEND_AMOUNT QBTC"
echo ""

TXID=$(qbtc-cli -testnet -rpcwallet="$FAUCET_WALLET" sendtoaddress "$RECIPIENT" "$SEND_AMOUNT")

echo "✅ Transaction Sent!"
echo ""
echo "📋 TXID: $TXID"
echo ""

echo "🎭 Step 4: Simulator Addresses"
echo ""
echo "   Sim Address 1: qbtct1qpzry9x8gf2tvdw0s3jn54khce6mua7lrh0qlnv8t"
echo "   Sim Address 2: qbtct1qgf2tvdw0s3jn54khce6mua7lrh0qlnv8tqpzry9x"
echo "   Sim Address 3: qbtct1qs3jn54khce6mua7lrh0qlnv8tqpzry9x8gf2tvd"
echo ""

echo "✅ SUMMARY"
echo ""
echo "   Block: $BLOCKCOUNT"
echo "   Chain: $CHAIN"
echo "   TXID:  $TXID"
echo "   To:    $RECIPIENT"
echo "   Amount: $SEND_AMOUNT QBTC"
echo ""
echo "🎉 SUCCESS! Transaction sent."
echo ""
echo "Next: Send 0.1 QBTC from $RECIPIENT to qbtct1qpzry9x8gf2tvdw0s3jn54khce6mua7lrh0qlnv8t"
