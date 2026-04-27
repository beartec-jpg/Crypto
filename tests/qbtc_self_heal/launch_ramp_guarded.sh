#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${1:-$SCRIPT_DIR/config.json}"
DURATION="${DURATION:-3600}"
N2_PEAK="${N2_PEAK:-40}"
N3_PEAK="${N3_PEAK:-60}"
N4_PEAK="${N4_PEAK:-55}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if [ -x "$PWD/.venv/bin/python" ]; then
  PYTHON_BIN="$PWD/.venv/bin/python"
fi

"$PYTHON_BIN" "$SCRIPT_DIR/launch_ramp_guarded.py" \
  --config "$CONFIG" \
  --duration "$DURATION" \
  --n2-peak "$N2_PEAK" \
  --n3-peak "$N3_PEAK" \
  --n4-peak "$N4_PEAK" \
  --auto-start-self-heal \
  --python-cmd "$PYTHON_BIN"
