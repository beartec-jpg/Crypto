#!/bin/bash
# qXRP Epoch Test — RewardEpoch Verification Script
# Validates that RewardEpoch SLE was created at boundary

SSH_OPTS="-o StrictHostKeyChecking=no"
SSH_PASS="TCECWmvAdVRr"

PRIMARY_NODE="root@37.27.47.236"

echo "============================================================"
echo "RewardEpoch SLE Validation"
echo "============================================================"
echo ""

# Get current ledger
echo "[*] Getting current ledger..."
LEDGER_INFO=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $PRIMARY_NODE \
  "curl -s -X POST http://127.0.0.1:5005 \
    -H 'Content-Type: application/json' \
    -d '{\"method\":\"server_info\",\"params\":[]}' | \
    python3 -c \"import sys,json; i=json.load(sys.stdin)['result']['info']; print(f\\\"{i['validated_ledger']['seq']}\\\")\"")

echo "Current ledger: $LEDGER_INFO"

if [[ $LEDGER_INFO -lt 86400 ]]; then
  echo "⏳ Not at epoch boundary yet. Need ledger >= 86,400"
  exit 1
fi

echo ""

# Query ledger_data for RewardEpoch
echo "[*] Querying for RewardEpoch SLE..."

REWARD_EPOCH=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $PRIMARY_NODE \
  "curl -s -X POST http://127.0.0.1:5005 \
    -H 'Content-Type: application/json' \
    -d '{\"method\":\"ledger_data\",\"params\":[{\"ledger_index\":\"validated\"}]}' | \
    python3 << 'EOF'
import sys, json
data = json.load(sys.stdin)

if 'result' not in data or 'ledger_data' not in data['result']:
    print('ERROR: No ledger data returned')
    sys.exit(1)

reward_epochs = []
for entry in data['result']['ledger_data']:
    if 'LedgerEntryType' in entry and entry['LedgerEntryType'] == 'RewardEpoch':
        reward_epochs.append(entry)

if reward_epochs:
    print(f'FOUND: {len(reward_epochs)} RewardEpoch SLE(s)')
    for epoch in reward_epochs:
        print(json.dumps(epoch, indent=2))
else:
    print('NOT_FOUND: No RewardEpoch SLE in ledger')
EOF
")

echo "$REWARD_EPOCH"

# Parse result
if echo "$REWARD_EPOCH" | grep -q "FOUND"; then
  echo ""
  echo "✓ RewardEpoch SLE successfully created!"
  echo ""
  
  # Extract key fields
  echo "[Details]"
  echo "$REWARD_EPOCH" | grep -E "EpochNumber|EpochStartLedger|EpochPoolBalance|EmissionRate|CurrentBurnBps" || echo "  (parsing fields...)"
  
  echo ""
  echo "✓ Validation successful - reward system is active"
  
elif echo "$REWARD_EPOCH" | grep -q "NOT_FOUND"; then
  echo ""
  echo "✗ RewardEpoch SLE not found!"
  echo "  This could indicate:"
  echo "    1. applyRewardEpoch() not executing"
  echo "    2. Epoch override not properly compiled"
  echo "    3. Binary not deployed yet"
  echo ""
  exit 1
  
else
  echo ""
  echo "⚠ Query error:"
  echo "$REWARD_EPOCH"
  exit 1
fi

echo ""
echo "============================================================"
