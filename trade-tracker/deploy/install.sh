#!/usr/bin/env bash
# Install trade-tracker on the spare host (5.78.142.246).
# Idempotent: safe to re-run.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/trade-tracker}"
PG_CONTAINER="${PG_CONTAINER:-trade-tracker-pg}"
PG_PORT="${PG_PORT:-5433}"
PG_PASS="${PG_PASS:-tracker_$(openssl rand -hex 8)}"
TRACKER_PORT="${TRACKER_PORT:-3101}"
TRACKER_API_KEY="${TRACKER_API_KEY:-$(openssl rand -hex 16)}"

echo "==> Install deps"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg docker.io openssl

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

systemctl enable --now docker

echo "==> Postgres container"
if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  docker start "$PG_CONTAINER" >/dev/null || true
else
  docker run -d --name "$PG_CONTAINER" \
    --restart unless-stopped \
    -e POSTGRES_USER=tracker \
    -e POSTGRES_PASSWORD="$PG_PASS" \
    -e POSTGRES_DB=trade_tracker \
    -p 127.0.0.1:${PG_PORT}:5432 \
    postgres:16-alpine
  # Persist password we just generated
  echo "$PG_PASS" > /root/.trade-tracker-pg-pass
  chmod 600 /root/.trade-tracker-pg-pass
fi

if [[ -f /root/.trade-tracker-pg-pass ]]; then
  PG_PASS="$(cat /root/.trade-tracker-pg-pass)"
fi

# Wait for postgres
for i in $(seq 1 30); do
  if docker exec "$PG_CONTAINER" pg_isready -U tracker -d trade_tracker >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

DATABASE_URL="postgresql://tracker:${PG_PASS}@127.0.0.1:${PG_PORT}/trade_tracker"

echo "==> App files → $APP_DIR"
mkdir -p "$APP_DIR"
# Caller rsyncs sources into APP_DIR first; install expects package present
if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "ERROR: $APP_DIR/package.json missing — rsync trade-tracker/ first"
  exit 1
fi

cd "$APP_DIR"
npm install --omit=dev=false
npm run build

# Preserve existing Discord webhook if re-installing
OLD_WEBHOOK=""
if [[ -f /etc/trade-tracker.env ]]; then
  OLD_WEBHOOK="$(grep -E '^DISCORD_WEBHOOK_URL=' /etc/trade-tracker.env | cut -d= -f2- || true)"
  OLD_KEY="$(grep -E '^TRACKER_API_KEY=' /etc/trade-tracker.env | cut -d= -f2- || true)"
  [[ -n "${OLD_KEY:-}" ]] && TRACKER_API_KEY="$OLD_KEY"
fi

cat > /etc/trade-tracker.env <<EOF
DATABASE_URL=${DATABASE_URL}
PORT=${TRACKER_PORT}
POLL_INTERVAL_MS=15000
WEEKLY_DOW=0
WEEKLY_HOUR_UTC=18
TRACKER_API_KEY=${TRACKER_API_KEY}
DISCORD_WEBHOOK_URL=${OLD_WEBHOOK:-${DISCORD_WEBHOOK_URL:-}}
NODE_ENV=production
EOF
chmod 600 /etc/trade-tracker.env

cat > /etc/systemd/system/trade-tracker.service <<'UNIT'
[Unit]
Description=BearTec AI Trade Tracker
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/trade-tracker.env
WorkingDirectory=/opt/trade-tracker
ExecStart=/usr/bin/node /opt/trade-tracker/dist/src/index.js
Restart=always
RestartSec=3
User=root
# Hardening
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable trade-tracker
systemctl restart trade-tracker
sleep 2
systemctl --no-pager --full status trade-tracker || true

echo "==> Health"
curl -sf "http://127.0.0.1:${TRACKER_PORT}/health" | head -c 400 || true
echo
echo "TRACKER_API_KEY=${TRACKER_API_KEY}"
echo "DATABASE_URL is local on this host (see /etc/trade-tracker.env)"
echo "Set DISCORD_WEBHOOK_URL in /etc/trade-tracker.env then: systemctl restart trade-tracker"
echo "DONE"
