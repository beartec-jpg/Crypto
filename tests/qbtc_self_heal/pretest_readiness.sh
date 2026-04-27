#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${1:-$SCRIPT_DIR/config.json}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if [ -x "$PWD/.venv/bin/python" ]; then
  PYTHON_BIN="$PWD/.venv/bin/python"
fi

"$PYTHON_BIN" "$SCRIPT_DIR/pretest_readiness.py" \
  --config "$CONFIG" \
  --python-cmd "$PYTHON_BIN" \
  --gate-attempts 3 \
  --gate-interval 8 \
  --stress-target 40 \
  --surge-target 20 \
  --min-trusted-balance 5.0 \
  --max-pending-wallets 0
