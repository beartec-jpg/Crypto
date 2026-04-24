#!/bin/bash
# =============================================================================
# QBTC 72-hr Surge Test — SETUP
# =============================================================================
# Run once from your local machine before starting the test.
# Creates 30 test wallets (10 per node), seeds each with 2 QBTC.
# Deploys runner.py to N1 ready to launch.
#
# Usage:  bash tests/72hr_surge/setup.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
N1="89.167.109.241"
N1_PASS="Hbxtvw77XErT"
SEED_PER_WALLET=2        # QBTC
WALLETS_PER_NODE=10

echo ""
echo "══════════════════════════════════════════════════════"
echo "  QBTC 72-hr Surge Test — Setup"
echo "══════════════════════════════════════════════════════"
echo "  Wallets     : $((WALLETS_PER_NODE * 3)) total (${WALLETS_PER_NODE} per node)"
echo "  Seed/wallet : ${SEED_PER_WALLET} QBTC"
echo "  Total seed  : $((SEED_PER_WALLET * WALLETS_PER_NODE * 3)) QBTC"
echo ""

# ── Deploy files to N1 ────────────────────────────────────────────────────────
echo "→ Deploying runner.py to N1..."
sshpass -p "$N1_PASS" ssh -o StrictHostKeyChecking=no root@"$N1" \
    "mkdir -p /root/surge_test/logs"
sshpass -p "$N1_PASS" scp -o StrictHostKeyChecking=no \
    "$SCRIPT_DIR/runner.py" root@"$N1":/root/surge_test/runner.py
echo "  ✓ runner.py deployed"

# ── Create wallets and seed on N1 ─────────────────────────────────────────────
echo "→ Creating wallets and seeding (runs on N1)..."
sshpass -p "$N1_PASS" ssh -o StrictHostKeyChecking=no root@"$N1" \
    "SEED=${SEED_PER_WALLET} N_PER_NODE=${WALLETS_PER_NODE} python3" << 'PYEOF'
import base64, json, os, sys, time, urllib.request

SEED        = float(os.environ["SEED"])
N_PER_NODE  = int(os.environ["N_PER_NODE"])
BASE_DIR    = "/root/surge_test"

NODES_CFG = {
    "N1": ("127.0.0.1",    28332, "qbtcverify", "verify_node3_2026"),
    "N2": ("46.62.156.169", 28332, "qbtcseed",   "seednode1_rpc_2026"),
    "N3": ("37.27.47.236",  28332, "qbtcseed",   "seednode2_rpc_2026"),
}

def rpc(node, method, params=None, wallet=None):
    if params is None:
        params = []
    host, port, user, pw = NODES_CFG[node]
    url = f"http://{host}:{port}/"
    if wallet:
        url += f"wallet/{wallet}"
    payload = json.dumps({"jsonrpc": "1.0", "id": "setup", "method": method, "params": params})
    creds   = base64.b64encode(f"{user}:{pw}".encode()).decode()
    req = urllib.request.Request(
        url, data=payload.encode(),
        headers={"Content-Type": "text/plain", "Authorization": f"Basic {creds}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        result = json.loads(resp.read())
    if result.get("error"):
        raise RuntimeError(f"RPC {method} on {node}: {result['error']}")
    return result["result"]

# ── Check existing wallets.json (allow re-running safely) ─────────────────────
import os as _os
existing_wallets = []
wfile = f"{BASE_DIR}/wallets.json"
if _os.path.exists(wfile):
    existing_wallets = json.loads(open(wfile).read())
    existing_ids = {w["id"] for w in existing_wallets}
    print(f"Found {len(existing_wallets)} existing wallets in wallets.json")
else:
    existing_ids = set()

wallets = list(existing_wallets)

# ── Create wallets ─────────────────────────────────────────────────────────────
for node in ("N1", "N2", "N3"):
    for i in range(N_PER_NODE):
        wid   = f"{node}_{i:02d}"
        wname = f"surge_{node.lower()}_{i:02d}"
        if wid in existing_ids:
            print(f"  skip {wid} (already in wallets.json)")
            continue

        # Try create; if exists just load it
        try:
            rpc(node, "createwallet", [wname, False, False, "", False, True, True])
            print(f"  created {node}/{wname}")
        except RuntimeError as e:
            msg = str(e).lower()
            if "already exists" in msg or "database already exists" in msg:
                try:
                    rpc(node, "loadwallet", [wname])
                    print(f"  loaded  {node}/{wname} (already existed)")
                except RuntimeError:
                    pass  # already loaded
            else:
                print(f"  WARN createwallet {node}/{wname}: {e}")

        addr = rpc(node, "getnewaddress", [], wallet=wname)
        wallets.append({"id": wid, "node": node, "wallet_name": wname, "address": addr})
        print(f"    → {addr}")

# Save wallets.json
open(wfile, "w").write(json.dumps(wallets, indent=2))
print(f"\nSaved {len(wallets)} wallets → {wfile}")

# ── Seed from miner ────────────────────────────────────────────────────────────
total_seed = SEED * len(wallets)
miner_bal  = rpc("N1", "getbalance", [], wallet="miner")
print(f"\nMiner balance : {miner_bal:.4f} QBTC")
print(f"Seed needed   : {total_seed:.1f} QBTC ({SEED} × {len(wallets)} wallets)")
print(f"Reserve after : {miner_bal - total_seed:.2f} QBTC")

if miner_bal < total_seed + 10:
    print("\nERROR: Insufficient miner balance (need 10 QBTC buffer).")
    print("Wait for more blocks to be mined and re-run setup.sh")
    sys.exit(1)

print("\nSeeding wallets...")
already_funded = 0
seeded = 0
for w in wallets:
    try:
        bal = rpc(w["node"], "getbalance", [], wallet=w["wallet_name"])
    except Exception:
        bal = 0.0
    if bal >= SEED * 0.9:
        print(f"  {w['id']:12s}  bal={bal:.4f}  (already funded, skip)")
        already_funded += 1
        continue
    try:
        txid = rpc("N1", "sendtoaddress", [w["address"], SEED], wallet="miner")
        seeded += 1
        print(f"  {w['id']:12s}  sent {SEED} QBTC  txid={txid[:16]}…")
        time.sleep(0.3)   # don't hammer the mempool
    except Exception as e:
        print(f"  {w['id']:12s}  SEED FAILED: {e}")

print(f"\nDone. Seeded={seeded}  already_funded={already_funded}  total_wallets={len(wallets)}")
print(f"Log: {BASE_DIR}/logs/")
print("\nNext steps:")
print("  1. Wait ~1-2 blocks for seed txs to confirm")
print("  2. Run:  bash tests/72hr_surge/start_test.sh")
PYEOF

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Setup complete."
echo "  Check balances with:  bash tests/72hr_surge/monitor.sh"
echo "  Start the test with:  bash tests/72hr_surge/start_test.sh"
echo "══════════════════════════════════════════════════════"
