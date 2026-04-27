#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${1:-$SCRIPT_DIR/config.json}"

if [ ! -f "$CONFIG" ]; then
  echo "Config not found: $CONFIG"
  echo "Copy config.example.json to config.json and fill ssh_password values."
  exit 1
fi

PYTHONUNBUFFERED=1 python3 -u "$SCRIPT_DIR/self_heal.py" --config "$CONFIG"
