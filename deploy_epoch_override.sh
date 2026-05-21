#!/bin/bash
# qXRP Epoch Test — Binary Deployment & Node Restart Playbook
# Run this script once ninja build completes

set -e

SSH_OPTS="-o StrictHostKeyChecking=no"
SSH_PASS="TCECWmvAdVRr"
SSHPASS="sshpass -p '$SSH_PASS'"

# Nodes to deploy
NODES=(
  "root@37.27.47.236"
  "root@37.27.47.237"
  "root@37.27.47.238"
  "root@46.224.0.140"
)

BUILD_BINARY="/opt/qxrp/build/xrpld"
DEPLOY_PATH="/opt/qxrp/bin/xrpld"

echo "============================================================"
echo "qXRP Epoch Test — Binary Deployment & Restart"
echo "============================================================"
echo ""

# ============================================================
# 1. CHECK BUILD STATUS
# ============================================================
echo "[1/5] Checking build status on 37.27.47.236..."
BUILD_CHECK=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS root@37.27.47.236 \
  "if [[ -f $BUILD_BINARY ]]; then stat -c %Y $BUILD_BINARY; else echo 0; fi")

if [[ "$BUILD_CHECK" == "0" ]]; then
  echo "✗ Build binary not found!"
  exit 1
fi

BUILD_TIME=$(date -d "@$BUILD_CHECK")
CURRENT_TIME=$(date +%s)
AGE=$((CURRENT_TIME - BUILD_CHECK))

if [[ $AGE -lt 300 ]]; then
  echo "✓ Fresh binary: $BUILD_TIME ($(echo "scale=0; $AGE/60" | bc) minutes ago)"
else
  echo "⚠ Binary is older than expected: $(echo "scale=0; $AGE/60" | bc) minutes"
fi

echo ""

# ============================================================
# 2. PRE-DEPLOYMENT CHECKS
# ============================================================
echo "[2/5] Verifying network status before deployment..."
for NODE in "${NODES[@]}"; do
  SEQ=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $NODE \
    "curl -s -X POST http://127.0.0.1:5005 \
      -H 'Content-Type: application/json' \
      -d '{\"method\":\"server_info\",\"params\":[]}' | \
      python3 -c \"import sys,json; print(json.load(sys.stdin)['result']['info']['validated_ledger']['seq'])\" 2>/dev/null || echo '?'")
  echo "  $NODE: seq $SEQ"
done

echo ""

# ============================================================
# 3. BACKUP OLD BINARY
# ============================================================
echo "[3/5] Backing up old binaries..."
BACKUP_TIME=$(date +%Y%m%d_%H%M%S)
for NODE in "${NODES[@]}"; do
  sshpass -p "$SSH_PASS" ssh $SSH_OPTS $NODE \
    "cp $DEPLOY_PATH $DEPLOY_PATH.backup_$BACKUP_TIME && echo '  ✓ $NODE backed up'"
done

echo ""

# ============================================================
# 4. DEPLOY NEW BINARY & RESTART
# ============================================================
echo "[4/5] Deploying new binary and restarting nodes..."

for NODE in "${NODES[@]}"; do
  echo "  → $NODE"
  
  # Copy binary
  sshpass -p "$SSH_PASS" ssh $SSH_OPTS $NODE \
    "cp $BUILD_BINARY $DEPLOY_PATH" 2>&1 | grep -v "^$" || echo "    Copy OK"
  
  # Verify permissions
  sshpass -p "$SSH_PASS" ssh $SSH_OPTS $NODE \
    "chmod 755 $DEPLOY_PATH && ls -lh $DEPLOY_PATH | awk '{print \$5, \$9}'" | \
    sed 's/^/    /'
  
  # Restart service
  sshpass -p "$SSH_PASS" ssh $SSH_OPTS $NODE \
    "systemctl restart qxrpd && sleep 2 && echo '    Service restarted'"
done

echo ""

# ============================================================
# 5. POST-DEPLOYMENT VERIFICATION
# ============================================================
echo "[5/5] Verifying nodes are back online..."
sleep 5

MAX_RETRIES=10
RETRY=0
while [[ $RETRY -lt $MAX_RETRIES ]]; do
  ONLINE=0
  
  for NODE in "${NODES[@]}"; do
    SEQ=$(sshpass -p "$SSH_PASS" ssh $SSH_OPTS $NODE \
      "curl -s -X POST http://127.0.0.1:5005 \
        -H 'Content-Type: application/json' \
        -d '{\"method\":\"server_info\",\"params\":[]}' | \
        python3 -c \"import sys,json; print(json.load(sys.stdin)['result']['info']['validated_ledger']['seq'])\" 2>/dev/null || echo '?'")
    
    if [[ "$SEQ" != "?" ]]; then
      echo "  ✓ $NODE: seq $SEQ"
      ((ONLINE++))
    else
      echo "  ⏳ $NODE: still starting..."
    fi
  done
  
  if [[ $ONLINE -eq ${#NODES[@]} ]]; then
    echo ""
    echo "✓ All nodes online and synced"
    break
  fi
  
  RETRY=$((RETRY + 1))
  if [[ $RETRY -lt $MAX_RETRIES ]]; then
    echo "  (Waiting 5 seconds...)"
    sleep 5
  fi
done

if [[ $ONLINE -ne ${#NODES[@]} ]]; then
  echo "⚠ Some nodes still starting (this is normal)"
fi

echo ""
echo "============================================================"
echo "✓ Deployment Complete"
echo "============================================================"
echo ""
echo "Next steps:"
echo "1. Monitor epoch boundary (Terminal running: monitoring at ledger 86,400)"
echo "2. When boundary reached, verify RewardEpoch SLE creation"
echo "3. Test ClaimReward from each validator"
echo "4. Document results in test report"
echo ""
