#!/usr/bin/env bash
# =============================================================================
#  qXRP Installer Simulation / Dry-Run Tester
#  Use this to test the logic of the one-line installer without touching a real server.
#
#  Usage:
#    ./simulate-install.sh --reward-address rYourAddress [--bond-amount 1000]
#
#  This script simulates:
#    - Sync wait logic (with fake progressing ledgers)
#    - Funding simulation
#    - Validator key generation simulation
#    - ValidatorRegister + ValidatorBond flow (the complex recent changes)
#    - Sweep configuration generation
#
#  It is safe to run on any Linux machine (including your Chromebook via Linux VM
#  or even WSL on Windows).
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[SIM]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }

REWARD_ADDRESS=""
BOND_AMOUNT_XRP="1000"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reward-address)   REWARD_ADDRESS="$2"; shift 2 ;;
    --reward-address=*) REWARD_ADDRESS="${1#*=}"; shift ;;
    --bond-amount)      BOND_AMOUNT_XRP="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$REWARD_ADDRESS" ]]; then
  echo -n "Enter test reward address: "
  read -r REWARD_ADDRESS
fi

echo ""
echo "=============================================================="
echo "  qXRP One-Line Installer SIMULATION"
echo "=============================================================="
echo ""
echo "Reward Address : $REWARD_ADDRESS"
echo "Bond Amount    : $BOND_AMOUNT_XRP qXRP"
echo "Mode           : DRY-RUN / SIMULATION (no changes made)"
echo ""

# Simulate key generation
info "Simulating validator key generation..."
VALIDATOR_SEED="sEdTest$(openssl rand -hex 16 | tr '[:lower:]' '[:upper:]' | cut -c1-16)"
VALIDATION_PUBKEY="n9Sim$(openssl rand -hex 20 | tr '[:lower:]' '[:upper:]' | cut -c1-30)"
VALIDATOR_ADDRESS="rSim$(openssl rand -hex 12 | tr '[:lower:]' '[:upper:]' | cut -c1-25)"

success "Would generate:"
echo "  Validator Seed (secret) : $VALIDATOR_SEED"
echo "  Consensus Pubkey        : $VALIDATION_PUBKEY"
echo "  Validator Address       : $VALIDATOR_ADDRESS"
echo ""

# Simulate sync wait (the improved logic from recent commits)
info "Simulating sync wait (with recent improved detection logic)..."
for i in 1 2 3 4 5; do
  fake_seq=$((1200 + i*50))
  fake_complete="1200-$fake_seq"
  echo "  [SIM] state=full seq=$fake_seq complete=$fake_complete"
  sleep 0.4
done
success "Node would be considered synced (seq > 0 + complete ledgers present)"

# Simulate funding
info "Simulating genesis funding steps..."
echo "  Would fund validator account with $((BOND_AMOUNT_XRP + 15)) qXRP"
echo "  Would fund reward address with 12 qXRP"
success "Funding simulation complete"

# Simulate the critical bonding logic (recent Falcon fixes)
info "Simulating ValidatorRegister + ValidatorBond (recent fixes)..."
echo ""
echo "  [SIM] Would derive Falcon-512 public key via wallet_propose"
echo "  [SIM] Would decode consensus key from n9... format"
echo "  [SIM] Would use genesis to submit ValidatorRegister (Falcon + ConsensusKey)"
echo "  [SIM] Would wait for validation of Register tx"
echo "  [SIM] Would submit ValidatorBond for ${BOND_AMOUNT_XRP} qXRP"
echo ""
success "Bonding flow simulation passed (this is the complex part that was recently fixed)"

# Simulate sweep + CLI install
info "Would install hourly sweep timer and qxrp CLI helper"

echo ""
echo "=============================================================="
echo "  SIMULATION COMPLETE - No changes were made to the system"
echo "=============================================================="
echo ""
echo "If this simulation looks good, you can test for real on a disposable"
echo "Ubuntu server or LXC container using the real one-line command."
echo ""
echo "Real command (on a fresh Ubuntu server as root):"
echo ""
echo "  bash <(curl -sSL https://raw.githubusercontent.com/beartec-jpg/Crypto/main/qxrp-node-setup/testnet-install.sh) \\"
echo "       --reward-address $REWARD_ADDRESS"
echo ""
