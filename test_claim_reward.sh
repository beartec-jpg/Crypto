#!/bin/bash
# qXRP Epoch Test — ClaimReward Transaction Test
# Submits ClaimReward from each validator

SSH_OPTS="-o StrictHostKeyChecking=no"
SSH_PASS="TCECWmvAdVRr"

PRIMARY_NODE="root@37.27.47.236"

# Validator addresses (from network setup)
declare -A VALIDATORS=(
  ["Node1"]="rhTyFgd1P6VN8YdXB9buQUCb47KcgPkSEA"
  ["Node2"]="r81WCrNbt5vkboNvUVtGRX9dvogQ3EBGC"
  ["Node3"]="rw2PexMh8vgcjriMv4fGT85J8nMCePMQCW"
  ["Node4"]="rUnB1yVhL1wui6eGuTjSPxe2RWTyXeUT6D"
)

# Corresponding seed sources (for signing)
declare -A SEEDS=(
  ["Node1"]="snoPBrXtMeMyMHUVTgbuqAfg1S89Dn"  # Genesis seed
  ["Node2"]="snoPBrXtMeMyMHUVTgbuqAfg1S89Dn"
  ["Node3"]="snoPBrXtMeMyMHUVTgbuqAfg1S89Dn"
  ["Node4"]="snoPBrXtMeMyMHUVTgbuqAfg1S89Dn"
)

echo "============================================================"
echo "ClaimReward Transaction Test"
echo "============================================================"
echo ""

# Verify RewardEpoch exists first
echo "[0] Verifying RewardEpoch SLE exists..."
EPOCH_CHECK=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $PRIMARY_NODE \
  "curl -s -X POST http://127.0.0.1:5005 \
    -H 'Content-Type: application/json' \
    -d '{\"method\":\"ledger_data\",\"params\":[{\"ledger_index\":\"validated\"}]}' | \
    python3 -c \"import sys,json; data=json.load(sys.stdin); epochs=[e for e in data['result'].get('ledger_data',[]) if e.get('LedgerEntryType')=='RewardEpoch']; print('EXISTS' if epochs else 'MISSING')\" 2>/dev/null || echo 'ERROR'")

if [[ "$EPOCH_CHECK" != "EXISTS" ]]; then
  echo "✗ RewardEpoch SLE not found. Run verify_reward_epoch.sh first."
  exit 1
fi

echo "✓ RewardEpoch SLE confirmed"
echo ""

# Get current epoch number
EPOCH_NUM=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $PRIMARY_NODE \
  "curl -s -X POST http://127.0.0.1:5005 \
    -H 'Content-Type: application/json' \
    -d '{\"method\":\"ledger_data\",\"params\":[{\"ledger_index\":\"validated\"}]}' | \
    python3 << 'EOF'
import sys, json
data = json.load(sys.stdin)
for entry in data['result'].get('ledger_data', []):
    if entry.get('LedgerEntryType') == 'RewardEpoch':
        epoch_num = entry.get('EpochNumber', '?')
        print(epoch_num)
        break
else:
    print('?')
EOF
")

echo "[*] Current epoch: $EPOCH_NUM"
echo ""

# Test ClaimReward for each validator
echo "[*] Submitting ClaimReward transactions..."
SUCCESS=0
FAILED=0

for NAME in "${!VALIDATORS[@]}"; do
  ACCOUNT="${VALIDATORS[$NAME]}"
  
  echo ""
  echo "  → $NAME ($ACCOUNT)"
  
  # Get account sequence
  SEQ=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $PRIMARY_NODE \
    "curl -s -X POST http://127.0.0.1:5005 \
      -H 'Content-Type: application/json' \
      -d '{\"method\":\"account_info\",\"params\":[{\"account\":\"$ACCOUNT\",\"ledger_index\":\"current\"}]}' | \
      python3 -c \"import sys,json; print(json.load(sys.stdin)['result']['account_data']['Sequence'])\" 2>/dev/null || echo '?'")
  
  if [[ "$SEQ" == "?" ]]; then
    echo "    ✗ Could not get account sequence"
    ((FAILED++))
    continue
  fi
  
  echo "    Account sequence: $SEQ"
  
  # Create ClaimReward transaction
  TX_JSON="{
    \"TransactionType\": \"ClaimReward\",
    \"Account\": \"$ACCOUNT\",
    \"Sequence\": $SEQ,
    \"Fee\": \"12\"
  }"
  
  # Sign and submit
  RESULT=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $PRIMARY_NODE \
    "python3 << 'EOFPYTHON'
import json, urllib.request
tx_json = $TX_JSON

# Sign
sign_req = urllib.request.Request(
    'http://127.0.0.1:5005',
    data=json.dumps({
        'method': 'sign',
        'params': [{'tx_json': tx_json, 'secret': 'snoPBrXtMeMyMHUVTgbuqAfg1S89Dn'}]
    }).encode(),
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(sign_req, timeout=10) as resp:
        sign_result = json.load(resp)
    
    if 'result' not in sign_result or 'tx_blob' not in sign_result['result']:
        print('ERROR: Sign failed')
    else:
        tx_blob = sign_result['result']['tx_blob']
        
        # Submit
        submit_req = urllib.request.Request(
            'http://127.0.0.1:5005',
            data=json.dumps({
                'method': 'submit',
                'params': [{'tx_blob': tx_blob}]
            }).encode(),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(submit_req, timeout=10) as resp:
            submit_result = json.load(resp)
        
        if 'result' in submit_result:
            engine_result = submit_result['result'].get('engine_result', '?')
            tx_id = submit_result['result'].get('tx_hash', '?')
            print(f'{engine_result}:{tx_id}')
        else:
            print('ERROR: Submit failed')
except Exception as e:
    print(f'ERROR: {e}')
EOFPYTHON
" 2>/dev/null || echo 'ERROR: RPC failed')
  
  # Parse result
  ENGINE_RESULT=$(echo "$RESULT" | cut -d: -f1)
  TX_ID=$(echo "$RESULT" | cut -d: -f2)
  
  if [[ "$ENGINE_RESULT" == "tesSUCCESS" ]]; then
    echo "    ✓ Submitted: $TX_ID"
    ((SUCCESS++))
  elif [[ "$ENGINE_RESULT" == "terQUEUED" ]]; then
    echo "    ✓ Queued: $TX_ID"
    ((SUCCESS++))
  else
    echo "    ✗ Failed: $ENGINE_RESULT"
    ((FAILED++))
  fi
done

echo ""
echo "============================================================"
echo "Results: $SUCCESS successful, $FAILED failed"
echo "============================================================"
echo ""

if [[ $SUCCESS -eq ${#VALIDATORS[@]} ]]; then
  echo "✓ All ClaimReward transactions submitted successfully!"
else
  echo "⚠ Some transactions failed. Check network/account status."
fi

echo ""
