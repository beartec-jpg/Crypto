#!/bin/bash
# Start the 72-hr surge test runner on N1
N1="89.167.109.241"
N1_PASS="Hbxtvw77XErT"

echo "→ Killing any existing runner..."
sshpass -p "$N1_PASS" ssh -o StrictHostKeyChecking=no root@"$N1" \
    "pkill -f 'runner.py' 2>/dev/null && echo '  stopped old runner' || echo '  (none running)'"

sleep 2

echo "→ Starting runner..."
sshpass -p "$N1_PASS" ssh -o StrictHostKeyChecking=no root@"$N1" bash << 'EOF'
cd /root/surge_test
nohup python3 runner.py >> /root/surge_test/runner.out 2>&1 &
PID=$!
echo $PID > /root/surge_test/runner.pid
echo "  PID=$PID"
sleep 4
if kill -0 $PID 2>/dev/null; then
    echo "  ✓ Runner is alive"
    tail -5 /root/surge_test/runner.out
else
    echo "  ✗ Runner died — last output:"
    tail -20 /root/surge_test/runner.out
    exit 1
fi
EOF

echo ""
echo "Test running. Monitor with:  bash tests/72hr_surge/monitor.sh"
