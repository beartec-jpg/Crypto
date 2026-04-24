#!/bin/bash
# Stop the surge test runner gracefully
N1="89.167.109.241"
N1_PASS="Hbxtvw77XErT"

sshpass -p "$N1_PASS" ssh -o StrictHostKeyChecking=no root@"$N1" bash << 'EOF'
if [ -f /root/surge_test/runner.pid ]; then
    PID=$(cat /root/surge_test/runner.pid)
    if kill -0 "$PID" 2>/dev/null; then
        kill -TERM "$PID"
        echo "Sent SIGTERM to PID $PID — waiting up to 10s..."
        for i in $(seq 1 10); do
            sleep 1
            kill -0 "$PID" 2>/dev/null || { echo "Runner stopped."; exit 0; }
        done
        kill -KILL "$PID" && echo "Killed."
    else
        echo "PID $PID not running."
    fi
else
    pkill -f 'runner.py' && echo "Stopped." || echo "Runner not found."
fi
EOF
