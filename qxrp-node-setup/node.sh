#!/usr/bin/env bash
# =============================================================================
#  qXRP Node Installer — One-Command Setup
#  Usage:
#    curl -sSL https://get.qxrp.network/node.sh | bash -s -- --reward-address rYOURWALLETADDRESS
#
#  Or download and run:
#    bash node.sh --reward-address rYOURWALLETADDRESS
#
#  What this script does:
#    1. Installs required packages
#    2. Creates qxrp user + directories
#    3. Downloads the qxrpd binary
#    4. Generates a validator keypair (stays on server, only consensus key)
#    5. Writes xrpld.cfg pointing to the mainnet genesis + UNL
#    6. Creates and starts the systemd service
#    7. Waits for the node to sync
#    8. Bonds the validator (1000 XRP) — prompts for funding if needed
#    9. Configures auto-sweep of rewards to your --reward-address wallet
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[qXRP]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"; echo -e "${BOLD}${CYAN}  $*${NC}"; echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
QXRP_VERSION="${QXRP_VERSION:-latest}"
QXRP_NETWORK_ID="${QXRP_NETWORK_ID:-1}"           # 1 = mainnet
QXRP_DATA_DIR="${QXRP_DATA_DIR:-/var/lib/qxrp}"
QXRP_BIN_DIR="${QXRP_BIN_DIR:-/opt/qxrp/bin}"
QXRP_PEER_PORT="${QXRP_PEER_PORT:-51235}"
QXRP_RPC_PORT="${QXRP_RPC_PORT:-5005}"
QXRP_WS_PORT="${QXRP_WS_PORT:-6005}"
QXRP_BOND_AMOUNT="${QXRP_BOND_AMOUNT:-1000}"      # XRP
QXRP_SWEEP_THRESHOLD="${QXRP_SWEEP_THRESHOLD:-100}" # Sweep when balance > bond + reserve + this
GENESIS_ACCOUNT="rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
UNL_URL="https://vl.qxrp.network/vl.json"
BOOTSTRAP_PEERS="37.27.47.236:51235,37.27.47.237:51235,37.27.47.238:51235"
REWARD_ADDRESS=""

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reward-address)
      REWARD_ADDRESS="$2"; shift 2 ;;
    --reward-address=*)
      REWARD_ADDRESS="${1#*=}"; shift ;;
    --network-id)
      QXRP_NETWORK_ID="$2"; shift 2 ;;
    --bond-amount)
      QXRP_BOND_AMOUNT="$2"; shift 2 ;;
    --version)
      QXRP_VERSION="$2"; shift 2 ;;
    --data-dir)
      QXRP_DATA_DIR="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 --reward-address <rXXXXXX> [options]"
      echo ""
      echo "Options:"
      echo "  --reward-address ADDR   Your wallet address — validator rewards are sent here"
      echo "  --bond-amount XRP       Bond amount in XRP (default: 1000)"
      echo "  --network-id ID         Network ID (default: 1 = mainnet)"
      echo "  --version VER           Binary version to install (default: latest)"
      echo "  --data-dir PATH         Data directory (default: /var/lib/qxrp)"
      exit 0 ;;
    *)
      warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
header "qXRP Validator Node Setup"
echo ""

if [[ -z "$REWARD_ADDRESS" ]]; then
  echo -e "${YELLOW}No --reward-address provided.${NC}"
  echo -n "Enter your qXRP wallet address to receive validator rewards: "
  read -r REWARD_ADDRESS
fi

if [[ ! "$REWARD_ADDRESS" =~ ^r[1-9A-HJ-NP-Za-km-z]{25,34}$ ]]; then
  error "Invalid qXRP address format: $REWARD_ADDRESS (must start with 'r')"
fi

echo ""
info "Reward address : ${BOLD}$REWARD_ADDRESS${NC}"
info "Bond amount    : ${BOLD}${QXRP_BOND_AMOUNT} XRP${NC}"
info "Network ID     : ${BOLD}$QXRP_NETWORK_ID${NC}"
info "Data directory : ${BOLD}$QXRP_DATA_DIR${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root (use: sudo bash $0 ...)"
fi

# ── Step 1: OS Check ──────────────────────────────────────────────────────────
header "Step 1/9 — Checking System"
OS_ID=$(. /etc/os-release 2>/dev/null && echo "$ID")
OS_VER=$(. /etc/os-release 2>/dev/null && echo "$VERSION_ID")
ARCH=$(uname -m)

info "OS: $OS_ID $OS_VER  Arch: $ARCH"

[[ "$ARCH" != "x86_64" ]] && error "Only x86_64 is supported (detected: $ARCH)"
[[ "$OS_ID" != "ubuntu" && "$OS_ID" != "debian" ]] && warn "Untested OS: $OS_ID. Continuing anyway."

# Minimum RAM check
TOTAL_RAM_MB=$(($(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024))
if [[ $TOTAL_RAM_MB -lt 3000 ]]; then
  warn "Low RAM: ${TOTAL_RAM_MB}MB detected. Recommended: 4GB+ for validator operation."
else
  success "RAM: ${TOTAL_RAM_MB}MB — sufficient"
fi

# Disk check (need at least 20GB free)
FREE_DISK_GB=$(df -BG / | awk 'NR==2 {gsub("G","",$4); print $4}')
if [[ $FREE_DISK_GB -lt 20 ]]; then
  warn "Low disk space: ${FREE_DISK_GB}GB free. Recommended: 50GB+ for a validator."
fi
success "Disk: ${FREE_DISK_GB}GB free"

# ── Step 2: Install Dependencies ─────────────────────────────────────────────
header "Step 2/9 — Installing Dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget jq python3 python3-pip \
  libssl3 libgomp1 libstdc++6 libgcc-s1 \
  systemd coreutils
success "Dependencies installed"

# ── Step 3: Download Binary ───────────────────────────────────────────────────
header "Step 3/9 — Downloading qXRP Binary"
mkdir -p "$QXRP_BIN_DIR"

if [[ "$QXRP_VERSION" == "latest" ]]; then
  DOWNLOAD_URL="https://releases.qxrp.network/latest/linux-x86_64/xrpld"
else
  DOWNLOAD_URL="https://releases.qxrp.network/${QXRP_VERSION}/linux-x86_64/xrpld"
fi

info "Downloading from: $DOWNLOAD_URL"
if ! curl -fsSL --progress-bar "$DOWNLOAD_URL" -o "$QXRP_BIN_DIR/xrpld.tmp"; then
  error "Failed to download xrpld. Check your internet connection or try again."
fi

# Verify checksum if available
CHECKSUM_URL="${DOWNLOAD_URL}.sha256"
if curl -fsSL "$CHECKSUM_URL" -o /tmp/xrpld.sha256 2>/dev/null; then
  EXPECTED=$(cat /tmp/xrpld.sha256 | awk '{print $1}')
  ACTUAL=$(sha256sum "$QXRP_BIN_DIR/xrpld.tmp" | awk '{print $1}')
  if [[ "$EXPECTED" != "$ACTUAL" ]]; then
    rm -f "$QXRP_BIN_DIR/xrpld.tmp"
    error "Checksum mismatch! Binary may be corrupted or tampered with."
  fi
  success "Checksum verified"
fi

mv "$QXRP_BIN_DIR/xrpld.tmp" "$QXRP_BIN_DIR/xrpld"
chmod +x "$QXRP_BIN_DIR/xrpld"
success "Binary installed: $QXRP_BIN_DIR/xrpld"

# ── Step 4: Create User and Directories ──────────────────────────────────────
header "Step 4/9 — Creating qXRP User & Directories"
if ! id qxrp &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin qxrp
  success "Created system user: qxrp"
else
  info "User qxrp already exists"
fi

mkdir -p \
  "$QXRP_DATA_DIR/db" \
  "$QXRP_DATA_DIR/nudb" \
  "$QXRP_DATA_DIR/debug" \
  /var/log/qxrp \
  /etc/qxrp

chown -R qxrp:qxrp "$QXRP_DATA_DIR" /var/log/qxrp /etc/qxrp
success "Directories created"

# ── Step 5: Generate Validator Keypair ────────────────────────────────────────
header "Step 5/9 — Generating Validator Keypair"

# Use the xrpld binary to generate a fresh keypair
KEYGEN_OUTPUT=$("$QXRP_BIN_DIR/xrpld" --conf /dev/null keygen 2>/dev/null || true)

# Fall back to RPC-based keygen via a temporary node startup if keygen subcommand unavailable
if [[ -z "$KEYGEN_OUTPUT" ]]; then
  warn "Inline keygen not available — will generate via wallet_propose after node starts"
  VALIDATOR_SEED=""
  VALIDATOR_ADDRESS=""
  VALIDATOR_PUBLIC_KEY=""
  DEFER_KEYGEN=1
else
  VALIDATOR_SEED=$(echo "$KEYGEN_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['master_seed'])")
  VALIDATOR_ADDRESS=$(echo "$KEYGEN_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['account_id'])")
  VALIDATOR_PUBLIC_KEY=$(echo "$KEYGEN_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['master_seed_hex'])")
  DEFER_KEYGEN=0
  success "Validator address: $VALIDATOR_ADDRESS"
fi

# ── Step 6: Write Configuration ───────────────────────────────────────────────
header "Step 6/9 — Writing Configuration"

# Download validator list (UNL) public key
UNL_PUBKEY=$(curl -fsSL "$UNL_URL" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('public_key',''))" 2>/dev/null || echo "")

cat > /etc/qxrp/xrpld.cfg << CFGEOF
[server]
port_rpc_admin_local
port_peer
port_ws_public

[port_rpc_admin_local]
port = ${QXRP_RPC_PORT}
ip = 127.0.0.1
admin = 127.0.0.1
protocol = http

[port_peer]
port = ${QXRP_PEER_PORT}
ip = 0.0.0.0
protocol = peer

[port_ws_public]
port = ${QXRP_WS_PORT}
ip = 0.0.0.0
protocol = ws,wss

[node_size]
medium

[node_db]
type=NuDB
path=${QXRP_DATA_DIR}/nudb

[database_path]
${QXRP_DATA_DIR}/db

[debug_logfile]
/var/log/qxrp/debug.log

[sntp_servers]
time.windows.com
time.apple.com
pool.ntp.org

[network_id]
${QXRP_NETWORK_ID}

[validators_file]
/etc/qxrp/validators.txt

[online_delete]
512

[ledger_history]
1024

[transaction_limit]
250

[peer_private]
0

[compression]
1

[ips]
$(echo "$BOOTSTRAP_PEERS" | tr ',' '\n')
CFGEOF

# Write validators file
if [[ -n "$UNL_PUBKEY" ]]; then
  echo "[validators]" > /etc/qxrp/validators.txt
  echo "$UNL_PUBKEY" >> /etc/qxrp/validators.txt
  echo "" >> /etc/qxrp/validators.txt
  echo "[validator_list_sites]" >> /etc/qxrp/validators.txt
  echo "$UNL_URL" >> /etc/qxrp/validators.txt
  echo "" >> /etc/qxrp/validators.txt
  echo "[validator_list_keys]" >> /etc/qxrp/validators.txt
  echo "$UNL_PUBKEY" >> /etc/qxrp/validators.txt
else
  warn "Could not fetch UNL — writing empty validators.txt. Update manually after sync."
  echo "[validators]" > /etc/qxrp/validators.txt
fi

chown qxrp:qxrp /etc/qxrp/xrpld.cfg /etc/qxrp/validators.txt
success "Configuration written to /etc/qxrp/xrpld.cfg"

# ── Step 7: Create Systemd Service ────────────────────────────────────────────
header "Step 7/9 — Installing systemd Service"

cat > /etc/systemd/system/qxrp.service << SVCEOF
[Unit]
Description=qXRP Validator Node
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=qxrp
Group=qxrp
ExecStart=${QXRP_BIN_DIR}/xrpld --conf /etc/qxrp/xrpld.cfg
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=qxrp
LimitNOFILE=65536
LimitNPROC=65536
# Memory limit safety net (prevents OOM kills from taking out the whole server)
MemoryMax=14G

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable qxrp
systemctl start qxrp
success "Service started: qxrp.service"

# ── Step 8: Wait for Sync ─────────────────────────────────────────────────────
header "Step 8/9 — Waiting for Node to Sync"
info "This can take 2–10 minutes on first run. Downloading ledger history..."

SYNC_TIMEOUT=600  # 10 minutes
ELAPSED=0
SYNCED=0

while [[ $ELAPSED -lt $SYNC_TIMEOUT ]]; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  
  RPC_RESP=$(curl -s -X POST "http://127.0.0.1:${QXRP_RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d '{"method":"server_info","params":[{}]}' 2>/dev/null || echo "")
  
  if [[ -z "$RPC_RESP" ]]; then
    echo -n "."
    continue
  fi
  
  STATE=$(echo "$RPC_RESP" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)['result']['info']
  print(d['server_state'])
except:
  print('connecting')
" 2>/dev/null || echo "connecting")
  
  SEQ=$(echo "$RPC_RESP" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)['result']['info']
  print(d['validated_ledger']['seq'])
except:
  print(0)
" 2>/dev/null || echo "0")
  
  printf "\r${CYAN}[qXRP]${NC} State: %-15s Ledger: %-8s Elapsed: %ds  " "$STATE" "$SEQ" "$ELAPSED"
  
  if [[ "$STATE" == "proposing" || "$STATE" == "full" ]]; then
    echo ""
    SYNCED=1
    break
  fi
done

echo ""
if [[ $SYNCED -eq 0 ]]; then
  warn "Node did not reach 'proposing' state within ${SYNC_TIMEOUT}s."
  warn "It may still be syncing. Check: journalctl -u qxrp -f"
  warn "Once synced, run the bond script manually:"
  warn "  qxrp-bond --seed YOUR_SEED --reward-address $REWARD_ADDRESS"
  exit 0
fi

success "Node synced! State: proposing"

# ── Step 9: Bond the Validator ────────────────────────────────────────────────
header "Step 9/9 — Bonding Validator"

# If keygen was deferred, do it now via wallet_propose
if [[ "${DEFER_KEYGEN:-1}" -eq 1 ]]; then
  info "Generating validator keypair via RPC..."
  WALLET=$(curl -s -X POST "http://127.0.0.1:${QXRP_RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d '{"method":"wallet_propose","params":[{"key_type":"secp256k1"}]}')
  VALIDATOR_SEED=$(echo "$WALLET" | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print(d['master_seed'])")
  VALIDATOR_ADDRESS=$(echo "$WALLET" | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print(d['account_id'])")
  success "Validator address: $VALIDATOR_ADDRESS"
fi

# Save validator credentials (seed is sensitive — restrict permissions)
cat > /etc/qxrp/validator.json << VJSON
{
  "validator_address": "$VALIDATOR_ADDRESS",
  "reward_address": "$REWARD_ADDRESS",
  "bond_amount_xrp": $QXRP_BOND_AMOUNT,
  "sweep_threshold_xrp": $QXRP_SWEEP_THRESHOLD,
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
VJSON
# Store seed separately with tighter permissions
echo "$VALIDATOR_SEED" > /etc/qxrp/validator.seed
chmod 600 /etc/qxrp/validator.seed /etc/qxrp/validator.json
chown qxrp:qxrp /etc/qxrp/validator.json
chown root:root /etc/qxrp/validator.seed  # root only

# Check if validator address already funded
BOND_XRP_DROPS=$((QXRP_BOND_AMOUNT * 1000000))
RESERVE_DROPS=10000000  # 10 XRP base reserve

echo ""
info "Validator address: ${BOLD}$VALIDATOR_ADDRESS${NC}"
info "To activate your validator, this address needs to be funded with:"
info "  ${BOLD}$((QXRP_BOND_AMOUNT + 15)) XRP${NC}  (${QXRP_BOND_AMOUNT} bond + 15 reserve/fees)"
echo ""
echo -e "${YELLOW}┌─────────────────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│  ACTION REQUIRED: Fund your validator                   │${NC}"
echo -e "${YELLOW}│                                                         │${NC}"
echo -e "${YELLOW}│  Send $((QXRP_BOND_AMOUNT + 15)) XRP to:                              │${NC}"
echo -e "${YELLOW}│  ${BOLD}$VALIDATOR_ADDRESS${NC}${YELLOW}  │${NC}"
echo -e "${YELLOW}│                                                         │${NC}"
echo -e "${YELLOW}│  Rewards will be sent to:                               │${NC}"
echo -e "${YELLOW}│  ${BOLD}$REWARD_ADDRESS${NC}${YELLOW}  │${NC}"
echo -e "${YELLOW}└─────────────────────────────────────────────────────────┘${NC}"
echo ""
info "Waiting for funding... (press Ctrl+C to skip and bond manually later)"

FUNDED=0
FUND_TIMEOUT=3600  # Wait up to 1 hour
FUND_ELAPSED=0

while [[ $FUND_ELAPSED -lt $FUND_TIMEOUT ]]; do
  sleep 10
  FUND_ELAPSED=$((FUND_ELAPSED + 10))
  
  BALANCE_RESP=$(curl -s -X POST "http://127.0.0.1:${QXRP_RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d "{\"method\":\"account_info\",\"params\":[{\"account\":\"$VALIDATOR_ADDRESS\",\"ledger_index\":\"current\"}]}" 2>/dev/null || echo "")
  
  BALANCE=$(echo "$BALANCE_RESP" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  bal=int(d['result']['account_data']['Balance'])
  print(bal)
except:
  print(0)
" 2>/dev/null || echo "0")
  
  NEEDED=$((BOND_XRP_DROPS + RESERVE_DROPS + 5000000))  # bond + 10 reserve + 5 XRP fees
  
  printf "\r${CYAN}[qXRP]${NC} Balance: %-15s Needed: %-15s Elapsed: %ds  " \
    "$((BALANCE / 1000000)) XRP" "$((NEEDED / 1000000)) XRP" "$FUND_ELAPSED"
  
  if [[ $BALANCE -ge $NEEDED ]]; then
    echo ""
    FUNDED=1
    break
  fi
done

echo ""

if [[ $FUNDED -eq 0 ]]; then
  warn "Address not funded within timeout. To bond manually later, run:"
  warn "  qxrp-bond --seed $(cat /etc/qxrp/validator.seed) --reward-address $REWARD_ADDRESS"
  echo ""
  echo "Setup complete (bonding pending). Your node is running and synced."
else
  success "Validator funded! Running bond transaction..."
  
  # Run the bond script
  python3 /etc/qxrp/bond.py "$VALIDATOR_SEED" "$VALIDATOR_ADDRESS" "$REWARD_ADDRESS" \
    "$QXRP_BOND_AMOUNT" "$QXRP_RPC_PORT" 2>&1
fi

# ── Install auto-sweep service ────────────────────────────────────────────────
cat > /etc/qxrp/sweep.py << 'SWEEPEOF'
#!/usr/bin/env python3
"""
Auto-sweeps validator rewards to the configured reward_address.
Runs as a systemd timer, every hour.
"""
import json, sys, time, urllib.request, urllib.error

CONFIG_FILE = "/etc/qxrp/validator.json"
SEED_FILE   = "/etc/qxrp/validator.seed"

def rpc(port, method, params):
    body = json.dumps({"method": method, "params": [params]}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def main():
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)
    with open(SEED_FILE) as f:
        seed = f.read().strip()

    validator_address = cfg["validator_address"]
    reward_address    = cfg["reward_address"]
    bond_xrp          = cfg["bond_amount_xrp"]
    threshold_xrp     = cfg.get("sweep_threshold_xrp", 100)
    rpc_port          = cfg.get("rpc_port", 5005)

    # Minimum balance to keep: bond + 10 XRP reserve + 5 XRP fees buffer
    min_keep_drops = (bond_xrp + 10 + 5) * 1_000_000

    # Get current balance
    resp = rpc(rpc_port, "account_info", {
        "account": validator_address,
        "ledger_index": "validated"
    })
    if "error" in resp.get("result", {}):
        print(f"Account not found or not funded yet: {validator_address}")
        return

    balance_drops = int(resp["result"]["account_data"]["Balance"])
    balance_xrp   = balance_drops / 1_000_000

    # Calculate how much we can sweep
    sweep_drops = balance_drops - min_keep_drops - 12  # 12 drops = tx fee
    sweep_xrp   = sweep_drops / 1_000_000

    if sweep_xrp < threshold_xrp:
        print(f"Balance {balance_xrp:.2f} XRP — below sweep threshold "
              f"({threshold_xrp} XRP above min). Nothing to sweep.")
        return

    print(f"Sweeping {sweep_xrp:.2f} XRP from {validator_address} → {reward_address}")

    # Get sequence number
    seq = resp["result"]["account_data"]["Sequence"]

    # Build and submit payment
    tx_resp = rpc(rpc_port, "submit", {
        "secret": seed,
        "tx_json": {
            "TransactionType": "Payment",
            "Account": validator_address,
            "Destination": reward_address,
            "Amount": str(sweep_drops),
            "Sequence": seq,
            "Fee": "12",
            "Flags": 0
        }
    })

    result = tx_resp.get("result", {})
    eng_result = result.get("engine_result", "UNKNOWN")
    if eng_result == "tesSUCCESS":
        print(f"Sweep successful: {sweep_xrp:.2f} XRP sent to {reward_address}")
    else:
        print(f"Sweep failed: {eng_result} — {result.get('engine_result_message','')}")

if __name__ == "__main__":
    main()
SWEEPEOF

chmod 700 /etc/qxrp/sweep.py

# Create sweep systemd timer
cat > /etc/systemd/system/qxrp-sweep.service << 'SWEEPSVCEOF'
[Unit]
Description=qXRP Validator Reward Sweep
After=qxrp.service

[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /etc/qxrp/sweep.py
StandardOutput=journal
StandardError=journal
SWEEPSVCEOF

cat > /etc/systemd/system/qxrp-sweep.timer << 'SWEEPTIMEOF'
[Unit]
Description=Run qXRP reward sweep hourly
Requires=qxrp-sweep.service

[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
SWEEPTIMEOF

systemctl daemon-reload
systemctl enable qxrp-sweep.timer
systemctl start qxrp-sweep.timer
success "Auto-sweep timer installed (runs hourly)"

# ── Bond script ───────────────────────────────────────────────────────────────
cat > /etc/qxrp/bond.py << 'BONDEOF'
#!/usr/bin/env python3
"""
Bond a qXRP validator.
Usage: python3 bond.py <seed> <validator_address> <reward_address> <bond_xrp> <rpc_port>
"""
import json, sys, time, urllib.request

def rpc(port, method, params):
    body = json.dumps({"method": method, "params": [params]}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def wait_validated(port, tx_hash, timeout=30):
    for _ in range(timeout):
        time.sleep(1)
        resp = rpc(port, "tx", {"transaction": tx_hash})
        if resp.get("result", {}).get("validated"):
            return resp["result"].get("meta", {}).get("TransactionResult", "UNKNOWN")
    return "TIMEOUT"

def main(seed, validator_address, reward_address, bond_xrp, rpc_port):
    bond_drops = int(float(bond_xrp)) * 1_000_000
    rpc_port   = int(rpc_port)

    print(f"Bonding validator: {validator_address}")
    print(f"Reward address:    {reward_address}")
    print(f"Bond amount:       {bond_xrp} XRP")

    # Step 1: ValidatorRegister
    print("\n[1/2] Submitting ValidatorRegister...")
    reg_resp = rpc(rpc_port, "submit", {
        "secret": seed,
        "tx_json": {
            "TransactionType": "ValidatorRegister",
            "Account": validator_address,
            "Fee": "12",
            "Flags": 0
        }
    })
    reg_result = reg_resp["result"]
    if reg_result.get("engine_result") not in ("tesSUCCESS", "terQUEUED"):
        print(f"ValidatorRegister failed: {reg_result.get('engine_result')} "
              f"— {reg_result.get('engine_result_message')}")
        sys.exit(1)

    reg_hash = reg_result.get("tx_json", {}).get("hash", "")
    if reg_hash:
        result = wait_validated(rpc_port, reg_hash)
        print(f"ValidatorRegister: {result}")
        if result != "tesSUCCESS":
            print("Registration failed — aborting bond")
            sys.exit(1)

    time.sleep(2)

    # Step 2: ValidatorBond
    print("\n[2/2] Submitting ValidatorBond...")
    bond_resp = rpc(rpc_port, "submit", {
        "secret": seed,
        "tx_json": {
            "TransactionType": "ValidatorBond",
            "Account": validator_address,
            "BondAmount": str(bond_drops),
            "Fee": "12",
            "Flags": 0
        }
    })
    bond_result = bond_resp["result"]
    if bond_result.get("engine_result") not in ("tesSUCCESS", "terQUEUED"):
        print(f"ValidatorBond failed: {bond_result.get('engine_result')} "
              f"— {bond_result.get('engine_result_message')}")
        sys.exit(1)

    bond_hash = bond_result.get("tx_json", {}).get("hash", "")
    if bond_hash:
        result = wait_validated(rpc_port, bond_hash)
        print(f"ValidatorBond: {result}")
        if result == "tesSUCCESS":
            print(f"\n✓ Validator bonded successfully!")
            print(f"  Address:    {validator_address}")
            print(f"  Bond:       {bond_xrp} XRP")
            print(f"  Rewards →   {reward_address}")
        else:
            print(f"Bond failed: {result}")
            sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: bond.py <seed> <validator_address> <reward_address> <bond_xrp> <rpc_port>")
        sys.exit(1)
    main(*sys.argv[1:])
BONDEOF

chmod 700 /etc/qxrp/bond.py

# ── Install qxrp CLI helper ───────────────────────────────────────────────────
cat > /usr/local/bin/qxrp << 'CLIEOF'
#!/usr/bin/env bash
# qXRP node management CLI
CONFIG="/etc/qxrp/validator.json"
RPC_PORT=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('rpc_port',5005))" 2>/dev/null || echo 5005)

case "$1" in
  status)
    curl -s -X POST "http://127.0.0.1:$RPC_PORT" \
      -H "Content-Type: application/json" \
      -d '{"method":"server_info","params":[{}]}' \
      | python3 -c "
import sys,json
d=json.load(sys.stdin)['result']['info']
print(f'State:    {d[\"server_state\"]}')
print(f'Ledger:   {d[\"validated_ledger\"][\"seq\"]}')
print(f'Complete: {d.get(\"complete_ledgers\",\"?\")}')
print(f'Peers:    {d[\"peers\"]}')
print(f'Uptime:   {d.get(\"uptime\",0)}s')
"
    ;;
  bond)
    SEED=$(cat /etc/qxrp/validator.seed 2>/dev/null) || { echo "No seed found"; exit 1; }
    ADDR=$(python3 -c "import json; print(json.load(open('$CONFIG'))['validator_address'])")
    RWRD=$(python3 -c "import json; print(json.load(open('$CONFIG'))['reward_address'])")
    BOND=$(python3 -c "import json; print(json.load(open('$CONFIG'))['bond_amount_xrp'])")
    python3 /etc/qxrp/bond.py "$SEED" "$ADDR" "$RWRD" "$BOND" "$RPC_PORT"
    ;;
  sweep)
    python3 /etc/qxrp/sweep.py
    ;;
  logs)
    journalctl -u qxrp -f --no-pager
    ;;
  restart)
    systemctl restart qxrp
    echo "Restarted qxrp.service"
    ;;
  stop)
    systemctl stop qxrp
    echo "Stopped qxrp.service"
    ;;
  start)
    systemctl start qxrp
    echo "Started qxrp.service"
    ;;
  info)
    cat "$CONFIG" 2>/dev/null | python3 -m json.tool
    ;;
  *)
    echo "qXRP Node Manager"
    echo ""
    echo "Usage: qxrp <command>"
    echo ""
    echo "Commands:"
    echo "  status    Show node sync state, ledger, peers"
    echo "  bond      Bond this validator (run after funding)"
    echo "  sweep     Manually sweep rewards to reward address"
    echo "  logs      Follow the node log"
    echo "  restart   Restart the node"
    echo "  start     Start the node"
    echo "  stop      Stop the node"
    echo "  info      Show validator configuration"
    ;;
esac
CLIEOF

chmod +x /usr/local/bin/qxrp
success "CLI installed: qxrp status | qxrp bond | qxrp sweep | qxrp logs"

# ── Final Summary ─────────────────────────────────────────────────────────────
header "Setup Complete"
echo ""
echo -e "${GREEN}${BOLD}Your qXRP validator node is running!${NC}"
echo ""
echo -e "  ${BOLD}Validator address:${NC}  $VALIDATOR_ADDRESS"
echo -e "  ${BOLD}Reward address:${NC}     $REWARD_ADDRESS"
echo -e "  ${BOLD}Bond required:${NC}      $QXRP_BOND_AMOUNT XRP"
echo -e "  ${BOLD}Auto-sweep:${NC}         Every hour → $REWARD_ADDRESS"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    qxrp status     — check node state"
echo -e "    qxrp bond       — bond after funding"
echo -e "    qxrp sweep      — sweep rewards now"
echo -e "    qxrp logs       — view live logs"
echo ""
echo -e "${YELLOW}${BOLD}Next step:${NC} Fund $VALIDATOR_ADDRESS with $((QXRP_BOND_AMOUNT + 15)) XRP"
echo -e "           then run: ${BOLD}qxrp bond${NC}"
echo ""
