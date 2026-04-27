#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${1:-$SCRIPT_DIR/config.json}"
TIMEOUT_MIN="${TIMEOUT_MIN:-60}"
INTERVAL_S="${INTERVAL_S:-20}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if [ -x "$PWD/.venv/bin/python" ]; then
  PYTHON_BIN="$PWD/.venv/bin/python"
fi

DEADLINE=$(( $(date +%s) + TIMEOUT_MIN * 60 ))

echo "[info] waiting for readiness (timeout=${TIMEOUT_MIN}m, interval=${INTERVAL_S}s)"

while true; do
  NOW=$(date +%s)
  if [ "$NOW" -ge "$DEADLINE" ]; then
    echo "[error] readiness timeout reached"
    exit 2
  fi

  if "$PYTHON_BIN" "$SCRIPT_DIR/pretest_readiness.py" \
      --config "$CONFIG" \
      --python-cmd "$PYTHON_BIN" \
      --gate-attempts 3 \
      --gate-interval 8 \
      --stress-target 40 \
      --surge-target 20 \
      --min-trusted-balance 4.9 \
      --max-pending-wallets 60; then
    echo "[ok] readiness passed; launching ramp"
    exec bash "$SCRIPT_DIR/launch_ramp_guarded.sh" "$CONFIG"
  fi

  echo "[info] not ready yet; sleeping ${INTERVAL_S}s"
  sleep "$INTERVAL_S"
done
