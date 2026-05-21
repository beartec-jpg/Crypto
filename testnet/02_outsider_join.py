#!/usr/bin/env python3
"""
02_outsider_join.py
───────────────────
Runs ON 37.27.47.236.  Adds node4 (46.224.0.140) as an outsider validator
AFTER epoch 1 has been scored.  Performs:

  A) SSH to node4 — fix quorum (4→3), add own key to validators.txt, wipe DB
  B) Start qxrp service on node4 and wait for sync
  C) Genesis funds node4's wallet address (2,000 qXRP)
  D) Submit ValidatorRegister + ValidatorBond from node4's own seed
     (sign via node1 RPC — seed stays on this machine, OK for testnet)
  E) Add node4's key to validators.txt on ALL 4 nodes, rolling restart
  F) Verify node4's bond appears on-chain with Account = node4_address
  G) Update testnet_state.json with node4 info

Usage (on 37.27.47.236, after epoch 1):
    python3 /opt/qxrp/testnet/02_outsider_join.py
"""

import os
import secrets
import subprocess
import sys
import time
import json

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_SEED, GENESIS_ADDR, VALIDATORS, NODE4,
    VALIDATORS_TXT_3, VALIDATORS_TXT_4,
    rpc, rpc_any, get_seq, sign_and_submit, wait_validated,
    current_ledger_seq, all_validator_bonds,
    ssh4, ssh4_rpc,
    log, ok, warn, err,
)

STATE_FILE       = "/opt/qxrp/testnet/testnet_state.json"
NODE4_VALS_TXT   = "/etc/qxrp/validators.txt"
HETZNER_VALS_TXT = "/etc/qxrp/validators.txt"
DROPS_PER_XRP    = 1_000_000

FALCON512_PREFIX   = 0xFB
FALCON512_RAW_BYTES = 897   # 1 prefix + 897 payload = 898 bytes total = 1796 hex chars

def generate_falcon_test_key() -> str:
    """Generate a random 898-byte Falcon-512 test key (prefix 0xFB)."""
    raw = bytes([FALCON512_PREFIX]) + secrets.token_bytes(FALCON512_RAW_BYTES)
    return raw.hex().upper()

# ── A: Fix node4 config and validators.txt ────────────────────────────────────
def fix_node4():
    log("=== A: Configuring node4 ===")

    # Fix quorum: 4 → 3
    out = ssh4("python3 -c \""
               "import re; "
               "cfg = open('/etc/qxrp/xrpld.cfg').read(); "
               "new = re.sub(r'validation_quorum\\s*=\\s*\\d+', 'validation_quorum = 3', cfg); "
               "open('/etc/qxrp/xrpld.cfg','w').write(new); "
               "print('quorum fixed' if new != cfg else 'quorum already correct')\"")
    log(f"  Quorum fix: {out}")

    # Write validators.txt on node4 with all 4 keys (including its own)
    vals_content = VALIDATORS_TXT_4.replace("\n", "\\n").replace("'", "\\'")
    out = ssh4(f"printf '{vals_content}' > {NODE4_VALS_TXT} && echo 'validators.txt written'")
    ok(f"  node4 validators.txt: {out}")

    # Wipe node4 DB
    out = ssh4("systemctl stop qxrp; rm -rf /var/lib/qxrp/nudb /var/lib/qxrp/db; echo 'wiped'")
    ok(f"  node4 DB: {out}")

# ── B: Start node4 and wait for sync ─────────────────────────────────────────
def start_and_sync_node4(timeout=360):
    log("=== B: Starting node4 ===")
    ssh4("systemctl start qxrp")
    time.sleep(5)

    # Get current validated ledger from Hetzner nodes
    current = current_ledger_seq(5005)
    log(f"  Current chain ledger: {current}")

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = ssh4_rpc("server_info")
            state = r["info"].get("server_state", "unknown")
            seq = r["info"].get("validated_ledger", {}).get("seq", 0)
            log(f"  node4 state={state!r}  seq={seq}")
            if state in ("proposing", "full") and seq >= current - 3:
                ok(f"  node4 synced! seq={seq}")
                return True
        except Exception as e:
            log(f"  node4 not ready: {e}")
        time.sleep(10)
    err("  node4 did not sync in time.")
    return False

# ── C: Fund node4 account ─────────────────────────────────────────────────────
def fund_node4():
    log("=== C: Funding node4 account ===")
    address = NODE4["address"]
    try:
        r = rpc_any("account_info", {"account": address, "ledger_index": "validated"})
        if "account_data" in r:
            bal = int(r["account_data"]["Balance"]) / DROPS_PER_XRP
            warn(f"  node4 account already funded ({bal:.0f} qXRP). Skipping.")
            return True
    except Exception:
        pass

    seq = get_seq(GENESIS_ADDR)
    result, tx_hash = sign_and_submit(GENESIS_SEED, {
        "TransactionType": "Payment",
        "Account":         GENESIS_ADDR,
        "Destination":     address,
        "Amount":          str(2000 * DROPS_PER_XRP),
        "Fee":             "12",
        "Sequence":        seq,
    })
    log(f"  Fund tx → {result}")
    validated = wait_validated(tx_hash)
    if validated == "tesSUCCESS":
        ok(f"  node4 funded: {address}")
        return True
    else:
        err(f"  Fund failed: {validated}")
        return False

# ── D: Register + Bond node4 ──────────────────────────────────────────────────
def bond_node4() -> str:
    """Register and self-bond node4. Returns the falcon key used."""
    log("=== D: Bonding node4 ===")
    seed    = NODE4["seed"]
    address = NODE4["address"]
    ck_hex  = NODE4["consensus_hex"]

    # Check if already bonded
    bonds = all_validator_bonds()
    if any(b.get("ConsensusKey", "").upper() == ck_hex.upper() for b in bonds):
        warn("  node4 already bonded — skipping.")
        return "ALREADY_BONDED"

    falcon_pk = generate_falcon_test_key()
    log(f"  Using fresh Falcon key (first 16 chars): {falcon_pk[:16]}...")

    # ValidatorRegister  (sign via node1 RPC, submit to chain)
    seq = get_seq(address)
    result, tx_hash = sign_and_submit(seed, {
        "TransactionType": "ValidatorRegister",
        "Account":         address,
        "PublicKey":       falcon_pk,
        "ConsensusKey":    ck_hex,
        "Fee":             "12",
        "Sequence":        seq,
    })
    log(f"  ValidatorRegister → {result}")
    wait_validated(tx_hash)

    # ValidatorBond
    seq = get_seq(address)
    result, tx_hash = sign_and_submit(seed, {
        "TransactionType": "ValidatorBond",
        "Account":         address,
        "ConsensusKey":    ck_hex,
        "BondedAmount":      str(1000 * DROPS_PER_XRP),
        "Fee":             "12",
        "Sequence":        seq,
    })
    log(f"  ValidatorBond     → {result}")
    validated = wait_validated(tx_hash)
    if validated == "tesSUCCESS":
        ok("  node4 bonded successfully.")
    else:
        err(f"  node4 bond result: {validated}")
    return falcon_pk

# ── E: Add node4 to all validators.txt + rolling restart ─────────────────────
def add_node4_to_validators_txt():
    log("=== E: Updating validators.txt + rolling restarts ===")

    # Write 4-key validators.txt on Hetzner
    with open(HETZNER_VALS_TXT, "w") as f:
        f.write(VALIDATORS_TXT_4)
    ok(f"  Hetzner validators.txt updated (4 keys)")

    # Rolling restart on nodes 1-3 (keep quorum at all times)
    for v in VALIDATORS:
        log(f"  Restarting {v['service']}...")
        subprocess.run(["systemctl", "restart", v["service"]], check=True)
        time.sleep(8)  # let it rejoin consensus before next restart
        try:
            r = rpc(v["rpc_port"], "server_info")
            state = r["info"].get("server_state", "?")
            log(f"    {v['name']} state after restart: {state}")
        except Exception as e:
            warn(f"    {v['name']} check failed: {e}")

    ok("  Rolling restart complete.")

# ── F: Verify node4 bond ──────────────────────────────────────────────────────
def verify_node4_bond():
    log("=== F: Verifying node4 bond on chain ===")
    time.sleep(5)
    bonds = all_validator_bonds()
    node4_bond = None
    for b in bonds:
        if b.get("ConsensusKey", "").upper() == NODE4["consensus_hex"].upper():
            node4_bond = b
            break
    if node4_bond:
        acct   = node4_bond.get("Account", "?")
        status = node4_bond.get("BondStatus", "?")
        score  = node4_bond.get("CompositeScore", 0)
        ok(f"  node4 bond: Account={acct}  status={status}  score={score}")
        if acct == NODE4["address"]:
            ok("  Self-bond confirmed: Account == node4_address ✓")
        else:
            warn(f"  Expected Account={NODE4['address']}, got {acct}")
        return True
    else:
        err("  node4 ValidatorBond SLE NOT found on chain!")
        return False

# ── G: Update state file ──────────────────────────────────────────────────────
def update_state(falcon_pk: str):
    log("=== G: Updating testnet_state.json ===")
    try:
        with open(STATE_FILE) as f:
            state = json.load(f)
    except FileNotFoundError:
        state = {"validators": []}

    state["node4"] = {
        "name":           NODE4["name"],
        "seed":           NODE4["seed"],
        "address":        NODE4["address"],
        "consensus_nkey": NODE4["consensus_nkey"],
        "consensus_hex":  NODE4["consensus_hex"],
        "rpc_port":       NODE4["rpc_port"],
        "host":           NODE4["host"],
        "falcon_pk":      falcon_pk,
        "joined_at":      time.time(),
    }
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    ok(f"  State updated: {STATE_FILE}")

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    fix_node4()
    if not start_and_sync_node4():
        err("Aborting — node4 failed to sync.")
        sys.exit(1)
    if not fund_node4():
        err("Aborting — could not fund node4.")
        sys.exit(1)
    falcon_pk = bond_node4()
    add_node4_to_validators_txt()
    verify_node4_bond()
    update_state(falcon_pk)

    ok("\n=== Outsider join complete ===")
    log("node4 is now part of the validator set.")
    log("It will start scoring from the NEXT epoch boundary.")
    log("Next: python3 /opt/qxrp/testnet/03_claim_epoch.py")

if __name__ == "__main__":
    main()
