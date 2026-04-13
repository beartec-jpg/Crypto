#!/usr/bin/env bash
# ─── QBTC Swap Server — Deploy & Start ──────────────────────────────────
#
# Usage:
#   ./start.sh              # foreground
#   ./start.sh &            # background
#   nohup ./start.sh &      # persistent after logout
#
# Add to systemd for production:
#   See swap-server.service for a ready-made unit file.
# ────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "[swap-server] Installing dependencies..."
  npm install --production
fi

# Check for .env
if [ ! -f .env ]; then
  echo "[swap-server] No .env file found. Copy .env.example and fill in values:"
  echo "  cp .env.example .env"
  exit 1
fi

echo "[swap-server] Starting..."
exec node --import tsx index.ts
