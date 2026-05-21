#!/usr/bin/env python3
"""
01_fresh_testnet_setup.py
─────────────────────────
Runs ON 37.27.47.236.  Performs a complete fresh-chain restart:

  A) Fix validation_quorum 4 → 3 in node1/2/3 configs
  B) Write validators.txt with nodes 1-3 only (node4 joins later)
  C) Wipe chain DBs and restart all three services
  D) Wait for all three nodes to reach 'proposing' state
  E) Use genesis to fund each validator's wallet address
  F) Submit ValidatorRegister + ValidatorBond from each validator's own seed
  G) Verify 3 ValidatorBond SLEs with Account ≠ genesis
  H) Write /opt/qxrp/testnet/testnet_state.json for downstream scripts

Usage (on 37.27.47.236):
    python3 /opt/qxrp/testnet/01_fresh_testnet_setup.py
"""

import os
import re
import subprocess
import time
import json
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_SEED, GENESIS_ADDR, VALIDATORS, VALIDATORS_TXT_3,
    rpc, rpc_any, get_seq, sign_and_submit, wait_validated,
    current_ledger_seq, all_validator_bonds,
    log, ok, warn, err,
)

STATE_FILE = "/opt/qxrp/testnet/testnet_state.json"
VALIDATORS_TXT_PATH = "/etc/qxrp/validators.txt"
DROPS_PER_XRP = 1_000_000

# ── A. Config fixes ────────────────────────────────────────────────────────────
def fix_quorum(cfg_path: str):
    with open(cfg_path) as f:
        content = f.read()
    new = re.sub(r"validation_quorum\s*=\s*\d+", "validation_quorum = 3", content)
    if new == content:
        warn(f"  quorum already correct in {cfg_path}")
        return
    with open(cfg_path, "w") as f:
        f.write(new)
    ok(f"  Fixed quorum → 3 in {cfg_path}")

def write_validators_txt(content: str, path: str = VALIDATORS_TXT_PATH):
    with open(path, "w") as f:
        f.write(content)
    ok(f"  Wrote {path}  ({content.count('n9') + content.count('n94')} entries)")

# ── B. Service management ──────────────────────────────────────────────────────
def service(name: str, action: str):
    r = subprocess.run(["systemctl", action, name], capture_output=True, text=True)
    return r.returncode == 0

def wipe_node(data_dir: str):
    for sub in ["nudb", "db"]:
        path = os.path.join(data_dir, sub)
        if os.path.exists(path):
            subprocess.run(["rm", "-rf", path], check=True)
            log(f"  Wiped {path}")

# ── C. Wait for proposing state ────────────────────────────────────────────────
def wait_proposing(node, timeout=180):
    port = node["rpc_port"]
    deadline = time.time() + timeout
    log(f"  Waiting for {node['name']} (port {port}) to reach 'proposing'...")
    while time.time() < deadline:
        try:
            r = rpc(port, "server_info")
            state = r["info"].get("server_state", "")
            if state == "proposing":
                ok(f"  {node['name']} is proposing (ledger {r['info']['validated_ledger']['seq']})")
                return True
            else:
                log(f"    {node['name']} state={state!r} ...")
        except Exception as e:
            log(f"    {node['name']} not ready yet: {e}")
        time.sleep(5)
    err(f"  {node['name']} did not reach proposing within {timeout}s")
    return False

# ── D. Fund + bond ─────────────────────────────────────────────────────────────
def fund_account(address: str, xrp: int = 2000):
    """Send `xrp` qXRP from genesis to `address`."""
    port = 5005
    seq = get_seq(GENESIS_ADDR, port)
    drops = xrp * DROPS_PER_XRP
    result, tx_hash = sign_and_submit(GENESIS_SEED, {
        "TransactionType": "Payment",
        "Account":         GENESIS_ADDR,
        "Destination":     address,
        "Amount":          str(drops),
        "Fee":             "12",
        "Sequence":        seq,
    }, port)
    if result in ("tesSUCCESS", "terQUEUED"):
        log(f"  Funded {address} with {xrp} qXRP  (seq={seq})")
    else:
        warn(f"  Fund payment result: {result}")
    return result

def wait_for_account(address: str, retries=30):
    for _ in range(retries):
        time.sleep(2)
        try:
            r = rpc_any("account_info", {"account": address, "ledger_index": "validated"})
            if "account_data" in r:
                return True
        except Exception:
            pass
    return False

def self_bond(node: dict):
    """Submit ValidatorRegister + ValidatorBond from the node's own seed."""
    port = 5005
    seed    = node["seed"]
    address = node["address"]
    ck_hex  = node["consensus_hex"]
    fpk     = node["falcon_pk"]

    log(f"  Bonding {node['name']} ({address[:12]}...) ...")

    # ValidatorRegister
    seq = get_seq(address, port)
    result, tx_hash = sign_and_submit(seed, {
        "TransactionType": "ValidatorRegister",
        "Account":         address,
        "PublicKey":       fpk,
        "ConsensusKey":    ck_hex,
        "Fee":             "12",
        "Sequence":        seq,
    }, port)
    log(f"    ValidatorRegister → {result}  ({tx_hash[:16]}...)")
    if result not in ("tesSUCCESS", "terQUEUED"):
        warn(f"    Register may have failed: {result}")
    else:
        validated = wait_validated(tx_hash)
        log(f"    Validated: {validated}")

    # ValidatorBond
    seq = get_seq(address, port)
    result, tx_hash = sign_and_submit(seed, {
        "TransactionType": "ValidatorBond",
        "Account":         address,
        "ConsensusKey":    ck_hex,
        "BondedAmount":      str(1000 * DROPS_PER_XRP),  # 1000 qXRP bond
        "Fee":             "12",
        "Sequence":        seq,
    }, port)
    log(f"    ValidatorBond     → {result}  ({tx_hash[:16]}...)")
    if result not in ("tesSUCCESS", "terQUEUED"):
        err(f"    Bond FAILED: {result}")
        return False
    validated = wait_validated(tx_hash)
    if validated == "tesSUCCESS":
        ok(f"  {node['name']} self-bond confirmed.")
        return True
    else:
        err(f"  {node['name']} bond validation result: {validated}")
        return False

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    log("=== Phase A: Fix configs ===")
    for v in VALIDATORS:
        fix_quorum(v["cfg_path"])

    log("=== Phase B: Write validators.txt (3 nodes only) ===")
    write_validators_txt(VALIDATORS_TXT_3)

    log("=== Phase C: Wipe and restart chain ===")
    # Stop all services first
    for v in VALIDATORS:
        log(f"  Stopping {v['service']}...")
        service(v["service"], "stop")
    time.sleep(3)

    # Wipe data
    for v in VALIDATORS:
        wipe_node(v["data_dir"])

    # Start services
    for v in VALIDATORS:
        log(f"  Starting {v['service']}...")
        if not service(v["service"], "start"):
            err(f"  Failed to start {v['service']}")
            sys.exit(1)
        time.sleep(1)

    log("=== Phase D: Wait for proposing state ===")
    for v in VALIDATORS:
        if not wait_proposing(v, timeout=240):
            err("  Aborting — not all nodes reached proposing state.")
            sys.exit(1)

    # Extra settle time
    time.sleep(5)

    log("=== Phase E: Fund validator accounts from genesis ===")
    for v in VALIDATORS:
        # Check if already funded (from a partial run)
        try:
            r = rpc_any("account_info", {"account": v["address"], "ledger_index": "validated"})
            if "account_data" in r:
                bal = int(r["account_data"]["Balance"]) / DROPS_PER_XRP
                warn(f"  {v['name']} account already exists (bal={bal:.0f} qXRP). Skipping fund.")
                continue
        except Exception:
            pass
        fund_account(v["address"], xrp=2000)
        if not wait_for_account(v["address"]):
            err(f"  Could not confirm {v['name']} account creation.")
            sys.exit(1)
        ok(f"  {v['name']} account funded.")

    # Let all payments settle
    time.sleep(5)

    log("=== Phase F: Self-bond each validator ===")
    for v in VALIDATORS:
        # Skip if already bonded (idempotent)
        bonds = all_validator_bonds()
        already = any(b.get("ConsensusKey", "").upper() == v["consensus_hex"].upper() for b in bonds)
        if already:
            warn(f"  {v['name']} already bonded — skipping.")
            continue
        if not self_bond(v):
            err(f"  Aborting — {v['name']} bond failed.")
            sys.exit(1)
        time.sleep(2)

    log("=== Phase G: Verify bonds ===")
    time.sleep(5)
    bonds = all_validator_bonds()
    log(f"  Found {len(bonds)} ValidatorBond SLE(s)")
    bad = [b for b in bonds if b.get("Account") == GENESIS_ADDR]
    if bad:
        warn(f"  {len(bad)} bond(s) still owned by genesis — self-bond may not have worked.")
    for b in bonds:
        ck = b.get("ConsensusKey", "?")[:16]
        acct = b.get("Account", "?")
        score = b.get("CompositeScore", "?")
        status = b.get("BondStatus", "?")
        log(f"    CK={ck}... Account={acct}  score={score}  status={status}")

    log("=== Phase H: Save state ===")
    state = {
        "created_at":   time.time(),
        "validators":   [
            {
                "name":           v["name"],
                "seed":           v["seed"],
                "address":        v["address"],
                "consensus_nkey": v["consensus_nkey"],
                "consensus_hex":  v["consensus_hex"],
                "rpc_port":       v["rpc_port"],
            }
            for v in VALIDATORS
        ],
        "node4": None,  # filled in by 02_outsider_join.py
    }
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    ok(f"  State saved to {STATE_FILE}")

    ok("\n=== Setup complete ===")
    log("Next steps:")
    log("  1. Run monitor:  python3 /opt/qxrp/testnet/06_monitor_epochs.py")
    log("  2. Run load:     nohup python3 /opt/qxrp/testnet/04_ramp_load.py > /opt/qxrp/testnet/load.log 2>&1 &")
    log("  3. After ledger 3600 (epoch 1):  python3 /opt/qxrp/testnet/03_claim_epoch.py")
    log("  4. Add outsider: python3 /opt/qxrp/testnet/02_outsider_join.py")

if __name__ == "__main__":
    main()
