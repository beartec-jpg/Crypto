#!/usr/bin/env bash
# =============================================================================
#  qXRP Testnet Node Installer
#  Run this on a fresh Ubuntu server:
#
#    bash <(curl -sSL https://raw.githubusercontent.com/beartec-jpg/Crypto/main/qxrp-node-setup/testnet-install.sh) \
#         --reward-address rYOURWALLETADDRESS
#
#  What this does (fully automatic):
#    1. Copies the qXRP binary from the testnet source server
#    2. Creates qxrp user, directories, config
#    3. Installs and starts systemd service
#    4. Waits for the node to sync to the testnet (seq ~1400+)
#    5. Generates a fresh validator keypair for this server
#    6. Funds the validator account from genesis (testnet only)
#    7. Funds your reward address from genesis (so it exists on-chain)
#    8. Bonds the validator (1000 qXRP)
#    9. Installs hourly auto-sweep of rewards → your wallet
#   10. Installs the `qxrp` CLI helper
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[qXRP]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"; \
            echo -e "${BOLD}${CYAN}  $*${NC}"; \
            echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"; }

# ── Testnet Config ────────────────────────────────────────────────────────────
TESTNET_SOURCE_IP="37.27.47.236"
TESTNET_SOURCE_PASS="TCECWmvAdVRr"
TESTNET_PEERS="${TESTNET_SOURCE_IP}:51235 ${TESTNET_SOURCE_IP}:51236 ${TESTNET_SOURCE_IP}:51237"
NETWORK_ID="999"
GENESIS_SEED="snoPBrXtMeMyMHUVTgbuqAfg1SUTb"
GENESIS_ADDRESS="rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"

# Trusted validator public keys (all 3 testnet nodes)
VALIDATOR_KEYS=(
  "n94RNoyd8qLHjn7FbvtpWWumSSs2S7XGncejjLLJ2FofDrBZ1Ff6"
  "n9MuP4C9zqXjZx18Jw7gaSSQ9bi4R7TBxn9LfmPR9Mb9JgG9sLR6"
  "n9KX6hNjxiyKSPi1vptDFsuqAMSe9dpZ5uehEnT6GdkmRvzWYMwp"
)

QXRP_DATA_DIR="/var/lib/qxrp"
QXRP_BIN="/usr/local/bin/xrpld"
QXRP_CFG_DIR="/etc/qxrp"
RPC_PORT="5005"
PEER_PORT="51235"
WS_PORT="7005"
HTTP_PORT="6005"
BOND_AMOUNT_XRP="1000"
SWEEP_THRESHOLD_XRP="50"
REWARD_ADDRESS=""

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reward-address)   REWARD_ADDRESS="$2"; shift 2 ;;
    --reward-address=*) REWARD_ADDRESS="${1#*=}"; shift ;;
    --bond-amount)      BOND_AMOUNT_XRP="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── Checks ────────────────────────────────────────────────────────────────────
header "qXRP Testnet Node Setup"
echo ""
[[ $EUID -ne 0 ]] && error "Must run as root"

if [[ -z "$REWARD_ADDRESS" ]]; then
  echo -n "Enter your qXRP reward wallet address: "
  read -r REWARD_ADDRESS
fi
[[ ! "$REWARD_ADDRESS" =~ ^r[1-9A-HJ-NP-Za-km-z]{24,34}$ ]] && \
  error "Invalid address: $REWARD_ADDRESS"

info "Reward address : ${BOLD}$REWARD_ADDRESS${NC}"
info "Bond amount    : ${BOLD}${BOND_AMOUNT_XRP} qXRP${NC}"
info "Network ID     : ${BOLD}$NETWORK_ID (testnet)${NC}"
echo ""

# ── Step 1: Install tools ─────────────────────────────────────────────────────
header "Step 1/9 — Installing Tools"
apt-get update -qq
apt-get install -y -qq sshpass curl python3 jq
success "Tools ready"

# ── Step 2: Copy binary from testnet server ───────────────────────────────────
header "Step 2/9 — Copying qXRP Binary"
info "Copying from ${TESTNET_SOURCE_IP}..."
sshpass -p "$TESTNET_SOURCE_PASS" \
  scp -o StrictHostKeyChecking=no \
  root@${TESTNET_SOURCE_IP}:/opt/qxrp/bin/xrpld \
  "$QXRP_BIN"
chmod +x "$QXRP_BIN"
VERSION=$("$QXRP_BIN" --version 2>/dev/null | head -1 || echo "unknown")
success "Binary installed: $QXRP_BIN  ($VERSION)"

# ── Step 3: Create user and directories ───────────────────────────────────────
header "Step 3/9 — Creating User & Directories"
id qxrp &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin qxrp
mkdir -p "$QXRP_DATA_DIR/db" "$QXRP_DATA_DIR/nudb" "$QXRP_CFG_DIR" /var/log/qxrp
chown -R qxrp:qxrp "$QXRP_DATA_DIR" /var/log/qxrp "$QXRP_CFG_DIR"
success "Directories created"

# ── Step 4: Generate validator keypair ────────────────────────────────────────
header "Step 4/9 — Generating Validator Keypair"
# Start a temporary minimal node to use wallet_propose, OR use validation_create
# We use a Python script to call the testnet RPC for keygen (no local node yet)
WALLET_JSON=$(sshpass -p "$TESTNET_SOURCE_PASS" \
  ssh -o StrictHostKeyChecking=no root@${TESTNET_SOURCE_IP} \
  'curl -s -X POST http://127.0.0.1:5005 -H "Content-Type: application/json" \
   -d '"'"'{"method":"wallet_propose","params":[{"key_type":"secp256k1"}]}'"'"' \
   | python3 -c "import sys,json; d=json.load(sys.stdin)[\"result\"]; print(d[\"master_seed\"],d[\"account_id\"])"')

VALIDATOR_SEED=$(echo "$WALLET_JSON" | awk '{print $1}')
VALIDATOR_ADDRESS=$(echo "$WALLET_JSON" | awk '{print $2}')

# Generate validation (consensus) keypair
VAL_KEY_JSON=$(sshpass -p "$TESTNET_SOURCE_PASS" \
  ssh -o StrictHostKeyChecking=no root@${TESTNET_SOURCE_IP} \
  "curl -s -X POST http://127.0.0.1:5005 -H 'Content-Type: application/json' \
   -d '{\"method\":\"validation_create\",\"params\":[{}]}' \
   | python3 -c \"import sys,json; d=json.load(sys.stdin)['result']; print(d['validation_seed'],d['validation_public_key'])\"")

VALIDATION_SEED=$(echo "$VAL_KEY_JSON" | awk '{print $1}')
VALIDATION_PUBKEY=$(echo "$VAL_KEY_JSON" | awk '{print $2}')

# Save credentials
cat > "$QXRP_CFG_DIR/validator.json" << VJSON
{
  "validator_address": "$VALIDATOR_ADDRESS",
  "validation_public_key": "$VALIDATION_PUBKEY",
  "reward_address": "$REWARD_ADDRESS",
  "bond_amount_qxrp": $BOND_AMOUNT_XRP,
  "sweep_threshold_qxrp": $SWEEP_THRESHOLD_XRP,
  "rpc_port": $RPC_PORT,
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
VJSON
echo "$VALIDATOR_SEED" > "$QXRP_CFG_DIR/validator.seed"
chmod 600 "$QXRP_CFG_DIR/validator.seed" "$QXRP_CFG_DIR/validator.json"

success "Validator address:    $VALIDATOR_ADDRESS"
success "Consensus public key: $VALIDATION_PUBKEY"

# ── Step 5: Write config ──────────────────────────────────────────────────────
header "Step 5/9 — Writing Config"

cat > "$QXRP_CFG_DIR/xrpld.cfg" << CFGEOF
[network_id]
${NETWORK_ID}

[node_size]
small

[ledger_history]
512

[server]
port_rpc_admin_local
port_rpc_public
port_peer_public
port_ws_public

[port_rpc_admin_local]
port = ${RPC_PORT}
ip = 127.0.0.1
admin = 127.0.0.1
protocol = http

[port_rpc_public]
port = ${HTTP_PORT}
ip = 0.0.0.0
protocol = http

[port_peer_public]
port = ${PEER_PORT}
ip = 0.0.0.0
protocol = peer

[port_ws_public]
port = ${WS_PORT}
ip = 0.0.0.0
protocol = ws

[node_db]
type = NuDB
path = ${QXRP_DATA_DIR}/nudb
advisory_delete = 0
online_delete = 512
cache_size = 512

[database_path]
${QXRP_DATA_DIR}/db

[debug_logfile]
/var/log/qxrp/debug.log

[sntp_servers]
time.windows.com
time.apple.com
pool.ntp.org

[ips_fixed]
$(for p in $TESTNET_PEERS; do echo "$p" | tr ':' ' '; done)

[validation_seed]
${VALIDATION_SEED}

[validators_file]
${QXRP_CFG_DIR}/validators.txt

[transaction_queue]
minimum_txn_in_ledger = 100
target_txn_in_ledger = 1000
ledgers_in_queue = 30
minimum_queue_size = 2000
maximum_txn_per_account = 100

[features]
ProofOfParticipation

[rpc_startup]
{ "command": "log_level", "severity": "warning" }
CFGEOF

# Write validators.txt — trust all 3 existing testnet validators
cat > "$QXRP_CFG_DIR/validators.txt" << VALEOF
[validators]
$(for k in "${VALIDATOR_KEYS[@]}"; do echo "$k"; done)
VALEOF

chown qxrp:qxrp "$QXRP_CFG_DIR/xrpld.cfg" "$QXRP_CFG_DIR/validators.txt"
success "Config written"

# ── Step 6: Systemd service ───────────────────────────────────────────────────
header "Step 6/9 — Installing Service"
cat > /etc/systemd/system/qxrp.service << SVCEOF
[Unit]
Description=qXRP Validator Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=qxrp
Group=qxrp
ExecStart=${QXRP_BIN} --conf ${QXRP_CFG_DIR}/xrpld.cfg
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=qxrp
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable qxrp
systemctl start qxrp
success "Service started: qxrp.service"
info "Logs: journalctl -u qxrp -f"

# ── Step 7: Wait for sync ─────────────────────────────────────────────────────
header "Step 7/9 — Waiting for Sync"
info "Syncing from testnet peers..."

SYNCED=0
for attempt in $(seq 1 180); do
  sleep 5
  RESP=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d '{"method":"server_info","params":[{}]}' 2>/dev/null || echo "")
  [[ -z "$RESP" ]] && { printf "\r  Waiting for RPC... (%ds)" $((attempt*5)); continue; }

  STATE=$(echo "$RESP" | python3 -c "
import sys,json
try: print(json.load(sys.stdin)['result']['info']['server_state'])
except: print('connecting')
" 2>/dev/null)
  SEQ=$(echo "$RESP" | python3 -c "
import sys,json
try: print(json.load(sys.stdin)['result']['info']['validated_ledger']['seq'])
except: print(0)
" 2>/dev/null)
  COMPLETE=$(echo "$RESP" | python3 -c "
import sys,json
try: print(json.load(sys.stdin)['result']['info'].get('complete_ledgers','?'))
except: print('?')
" 2>/dev/null)

  printf "\r${CYAN}[qXRP]${NC} state=%-15s seq=%-8s complete=%-20s time=%ds  " \
    "$STATE" "$SEQ" "$COMPLETE" $((attempt*5))

  # Must have actual ledger data (seq > 0) and not be in empty state
  if [[ "$STATE" == "proposing" || "$STATE" == "full" ]] && \
     [[ "$SEQ" -gt 0 ]] && [[ "$COMPLETE" != "empty" ]] && [[ "$COMPLETE" != "?" ]]; then
    echo ""
    SYNCED=1
    break
  fi
done
echo ""
[[ $SYNCED -eq 0 ]] && { warn "Sync timeout — check: journalctl -u qxrp -f"; exit 1; }
success "Node synced at seq $SEQ"

# ── Step 8: Fund accounts from genesis ───────────────────────────────────────
header "Step 8/9 — Funding Accounts (Testnet Genesis)"

fund_account() {
  local dest="$1" amount="$2" label="$3"
  info "Funding $label ($dest) with ${amount} qXRP..."

  # Get genesis sequence from our own node
  GENESIS_SEQ=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d "{\"method\":\"account_info\",\"params\":[{\"account\":\"${GENESIS_ADDRESS}\",\"ledger_index\":\"current\"}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['account_data']['Sequence'])" 2>/dev/null)

  RESULT=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d "{\"method\":\"submit\",\"params\":[{
      \"secret\":\"${GENESIS_SEED}\",
      \"tx_json\":{
        \"TransactionType\":\"Payment\",
        \"Account\":\"${GENESIS_ADDRESS}\",
        \"Destination\":\"${dest}\",
        \"Amount\":\"$((amount * 1000000))\",
        \"Fee\":\"12\",
        \"Flags\":0
      }}]}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print(d.get('engine_result','?'))" 2>/dev/null)

  if [[ "$RESULT" == "tesSUCCESS" || "$RESULT" == "terQUEUED" ]]; then
    success "$label funded: $RESULT"
    sleep 5  # wait for ledger close
  else
    warn "Fund result: $RESULT — may already be funded or genesis needs balance"
  fi
}

# Fund validator bond account: need bond + 15 reserve/fees
fund_account "$VALIDATOR_ADDRESS" $((BOND_AMOUNT_XRP + 15)) "Validator account"

# Fund reward wallet (just enough to create the account object on-chain)
fund_account "$REWARD_ADDRESS" 12 "Reward wallet"

# ── Step 9: Bond the validator ────────────────────────────────────────────────
header "Step 9/9 — Bonding Validator"

bond_validator() {
  local seed="$1" address="$2" bond_xrp="$3"

  info "Step 1/2: ValidatorRegister..."
  REG=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d "{\"method\":\"submit\",\"params\":[{
      \"secret\":\"$seed\",
      \"tx_json\":{
        \"TransactionType\":\"ValidatorRegister\",
        \"Account\":\"$address\",
        \"Fee\":\"12\",
        \"Flags\":0
      }}]}")
  REG_RESULT=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'].get('engine_result','?'))" 2>/dev/null)
  REG_HASH=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['tx_json'].get('hash',''))" 2>/dev/null || echo "")

  if [[ "$REG_RESULT" == "tesSUCCESS" || "$REG_RESULT" == "terQUEUED" ]]; then
    success "ValidatorRegister: $REG_RESULT"
    # Wait for validation
    if [[ -n "$REG_HASH" ]]; then
      for _ in $(seq 1 15); do
        sleep 2
        VALIDATED=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
          -H "Content-Type: application/json" \
          -d "{\"method\":\"tx\",\"params\":[{\"transaction\":\"$REG_HASH\"}]}" \
          | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print(d.get('validated',False))" 2>/dev/null)
        [[ "$VALIDATED" == "True" ]] && break
      done
    fi
    sleep 3
  else
    warn "ValidatorRegister: $REG_RESULT"
    return 1
  fi

  info "Step 2/2: ValidatorBond (${bond_xrp} qXRP)..."
  BOND=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
    -H "Content-Type: application/json" \
    -d "{\"method\":\"submit\",\"params\":[{
      \"secret\":\"$seed\",
      \"tx_json\":{
        \"TransactionType\":\"ValidatorBond\",
        \"Account\":\"$address\",
        \"BondAmount\":\"$((bond_xrp * 1000000))\",
        \"Fee\":\"12\",
        \"Flags\":0
      }}]}")
  BOND_RESULT=$(echo "$BOND" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'].get('engine_result','?'))" 2>/dev/null)
  BOND_HASH=$(echo "$BOND" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['tx_json'].get('hash',''))" 2>/dev/null || echo "")

  if [[ "$BOND_RESULT" == "tesSUCCESS" || "$BOND_RESULT" == "terQUEUED" ]]; then
    # Wait for validation
    if [[ -n "$BOND_HASH" ]]; then
      for _ in $(seq 1 15); do
        sleep 2
        TX_STATUS=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
          -H "Content-Type: application/json" \
          -d "{\"method\":\"tx\",\"params\":[{\"transaction\":\"$BOND_HASH\"}]}" \
          | python3 -c "
import sys,json
d=json.load(sys.stdin)['result']
validated=d.get('validated',False)
result=d.get('meta',{}).get('TransactionResult','pending')
print(validated, result)
" 2>/dev/null)
        if echo "$TX_STATUS" | grep -q "True"; then
          FINAL=$(echo "$TX_STATUS" | awk '{print $2}')
          success "ValidatorBond validated: $FINAL"
          break
        fi
        printf "."
      done
    fi
  else
    warn "ValidatorBond: $BOND_RESULT"
    return 1
  fi
}

bond_validator "$VALIDATOR_SEED" "$VALIDATOR_ADDRESS" "$BOND_AMOUNT_XRP"

# ── Auto-sweep service ────────────────────────────────────────────────────────
cat > "$QXRP_CFG_DIR/sweep.py" << 'SWEEPEOF'
#!/usr/bin/env python3
"""Sweeps validator rewards to reward_address. Run via systemd timer."""
import json, urllib.request

def rpc(port, method, params):
    body = json.dumps({"method": method, "params": [params]}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{port}",
        data=body, headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

cfg   = json.load(open("/etc/qxrp/validator.json"))
seed  = open("/etc/qxrp/validator.seed").read().strip()
addr  = cfg["validator_address"]
dest  = cfg["reward_address"]
bond  = cfg["bond_amount_qxrp"]
thresh= cfg.get("sweep_threshold_qxrp", 50)
port  = cfg.get("rpc_port", 5005)

# Minimum to keep: bond + 10 reserve + 5 fee buffer
min_drops = (bond + 15) * 1_000_000

try:
    resp = rpc(port, "account_info", {"account": addr, "ledger_index": "validated"})
    bal  = int(resp["result"]["account_data"]["Balance"])
except Exception as e:
    print(f"Cannot read balance: {e}"); exit(0)

sweep_drops = bal - min_drops - 12
sweep_xrp   = sweep_drops / 1_000_000

if sweep_xrp < thresh:
    print(f"Balance {bal/1e6:.2f} qXRP — {sweep_xrp:.2f} sweepable, below threshold {thresh}. Skip.")
    exit(0)

print(f"Sweeping {sweep_xrp:.4f} qXRP → {dest}")
res = rpc(port, "submit", {"secret": seed, "tx_json": {
    "TransactionType": "Payment",
    "Account": addr,
    "Destination": dest,
    "Amount": str(int(sweep_drops)),
    "Fee": "12", "Flags": 0
}})
result = res["result"].get("engine_result","?")
print(f"Result: {result}")
SWEEPEOF
chmod 700 "$QXRP_CFG_DIR/sweep.py"

cat > /etc/systemd/system/qxrp-sweep.service << 'EOF'
[Unit]
Description=qXRP Reward Sweep
After=qxrp.service
[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /etc/qxrp/sweep.py
EOF

cat > /etc/systemd/system/qxrp-sweep.timer << 'EOF'
[Unit]
Description=qXRP Reward Sweep (hourly)
[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now qxrp-sweep.timer
success "Auto-sweep timer installed (hourly → $REWARD_ADDRESS)"

# ── qxrp CLI ──────────────────────────────────────────────────────────────────
cat > /usr/local/bin/qxrp << CLIEOF
#!/usr/bin/env bash
CFG="/etc/qxrp/validator.json"
PORT=\$(python3 -c "import json; print(json.load(open('\$CFG')).get('rpc_port',5005))" 2>/dev/null || echo 5005)
RPC() { curl -s -X POST "http://127.0.0.1:\$PORT" -H "Content-Type: application/json" -d "\$1"; }
case "\$1" in
  status)
    RPC '{"method":"server_info","params":[{}]}' | python3 -c "
import sys,json
d=json.load(sys.stdin)['result']['info']
print(f'State:    {d[\"server_state\"]}')
print(f'Ledger:   {d[\"validated_ledger\"][\"seq\"]}')
print(f'Complete: {d.get(\"complete_ledgers\",\"?\")}')
print(f'Peers:    {d[\"peers\"]}')
print(f'Uptime:   {d.get(\"uptime\",0)}s')
" ;;
  balance)
    ADDR=\$(python3 -c "import json; print(json.load(open('\$CFG'))['validator_address'])")
    RWRD=\$(python3 -c "import json; print(json.load(open('\$CFG'))['reward_address'])")
    echo "Validator (\$ADDR):"
    RPC "{\"method\":\"account_info\",\"params\":[{\"account\":\"\$ADDR\",\"ledger_index\":\"validated\"}]}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin)['result']['account_data']; print(f'  Balance: {int(d[\"Balance\"])/1e6:.4f} qXRP')" 2>/dev/null || echo "  Not funded yet"
    echo "Reward wallet (\$RWRD):"
    RPC "{\"method\":\"account_info\",\"params\":[{\"account\":\"\$RWRD\",\"ledger_index\":\"validated\"}]}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin)['result']['account_data']; print(f'  Balance: {int(d[\"Balance\"])/1e6:.4f} qXRP')" 2>/dev/null || echo "  Not funded yet"
    ;;
  bond)
    SEED=\$(cat /etc/qxrp/validator.seed)
    ADDR=\$(python3 -c "import json; print(json.load(open('\$CFG'))['validator_address'])")
    BOND=\$(python3 -c "import json; print(json.load(open('\$CFG'))['bond_amount_qxrp'])")
    python3 /etc/qxrp/bond.py "\$SEED" "\$ADDR" "\$BOND" "\$PORT"
    ;;
  sweep)   python3 /etc/qxrp/sweep.py ;;
  logs)    journalctl -u qxrp -f --no-pager ;;
  restart) systemctl restart qxrp && echo "Restarted" ;;
  stop)    systemctl stop qxrp && echo "Stopped" ;;
  start)   systemctl start qxrp && echo "Started" ;;
  info)    python3 -m json.tool \$CFG ;;
  *)
    echo "qXRP Node CLI"
    echo ""
    echo "  qxrp status    — node state, ledger, peers"
    echo "  qxrp balance   — validator + reward wallet balances"
    echo "  qxrp bond      — bond this validator"
    echo "  qxrp sweep     — sweep rewards to wallet now"
    echo "  qxrp logs      — live log stream"
    echo "  qxrp restart   — restart node"
    echo "  qxrp info      — show config"
    ;;
esac
CLIEOF
chmod +x /usr/local/bin/qxrp

# ── Final summary ─────────────────────────────────────────────────────────────
FINAL_SEQ=$(curl -s -X POST "http://127.0.0.1:${RPC_PORT}" \
  -H "Content-Type: application/json" \
  -d '{"method":"server_info","params":[{}]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['info']['validated_ledger']['seq'])" 2>/dev/null || echo "?")

header "Setup Complete"
echo ""
echo -e "${GREEN}${BOLD}Your qXRP validator is live on the testnet!${NC}"
echo ""
echo -e "  ${BOLD}Validator address:${NC}    $VALIDATOR_ADDRESS"
echo -e "  ${BOLD}Consensus key:${NC}        $VALIDATION_PUBKEY"
echo -e "  ${BOLD}Reward address:${NC}       $REWARD_ADDRESS"
echo -e "  ${BOLD}Bond:${NC}                 ${BOND_AMOUNT_XRP} qXRP"
echo -e "  ${BOLD}Current ledger:${NC}       $FINAL_SEQ"
echo -e "  ${BOLD}Auto-sweep:${NC}           hourly → $REWARD_ADDRESS"
echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "    qxrp status    — check node"
echo -e "    qxrp balance   — check balances"
echo -e "    qxrp logs      — live logs"
echo -e "    qxrp sweep     — sweep rewards now"
echo ""
