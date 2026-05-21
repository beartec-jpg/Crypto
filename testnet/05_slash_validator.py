#!/usr/bin/env python3
"""
05_slash_validator.py
─────────────────────
Runs ON 37.27.47.236.  Submits a ValidatorSlash transaction against a target
validator, then verifies the resulting bond state.

Slash offense codes (from QXRPConstants.h):
  1 = DOUBLE_SIGN   → 100% bond burned, UNBONDING
  2 = ABSENCE       →  25% bond burned, UNBONDING   (default)
  3 = INVALID_VOTE  →  50% bond burned, UNBONDING

Usage:
    python3 /opt/qxrp/testnet/05_slash_validator.py
    python3 /opt/qxrp/testnet/05_slash_validator.py --target node4 --offense 2
    python3 /opt/qxrp/testnet/05_slash_validator.py --target node1 --offense 1
"""

import argparse
import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_SEED, GENESIS_ADDR, VALIDATORS, NODE4,
    rpc_any, get_seq, sign_and_submit, wait_validated,
    all_validator_bonds, consensus_key_to_slash_target,
    log, ok, warn, err,
)

DROPS_PER_XRP = 1_000_000
OFFENSE_NAMES = {1: "DOUBLE_SIGN (100%)", 2: "ABSENCE (25%)", 3: "INVALID_VOTE (50%)"}
BOND_STATUS   = {1: "BONDED", 2: "UNBONDING"}

def find_node(name: str) -> dict:
    if name == "node4":
        return NODE4
    for v in VALIDATORS:
        if v["name"] == name:
            return v
    err(f"Unknown node: {name!r}. Valid: node1, node2, node3, node4")
    sys.exit(1)

def show_bond_state(consensus_hex: str, label: str = ""):
    bonds = all_validator_bonds()
    for b in bonds:
        if b.get("ConsensusKey", "").upper() == consensus_hex.upper():
            acct    = b.get("Account", "?")
            status  = BOND_STATUS.get(b.get("BondStatus", 0), f"UNKNOWN({b.get('BondStatus')})")
            bonded  = int(b.get("BondedAmount", 0)) / DROPS_PER_XRP
            score   = b.get("CompositeScore", 0)
            slash_n = b.get("SlashCount", 0)
            slash_m = b.get("SlashMultiplier", 10000)
            log(f"  {label}Bond state:")
            log(f"    Account:         {acct}")
            log(f"    BondStatus:      {status}")
            log(f"    BondedAmount:    {bonded:.2f} qXRP")
            log(f"    CompositeScore:  {score} bps")
            log(f"    SlashCount:      {slash_n}")
            log(f"    SlashMultiplier: {slash_m} bps")
            return b
    warn(f"  {label}No bond found for this consensus key.")
    return None

def try_claim_after_slash(node: dict, epoch_number: int = 1):
    """Attempt ClaimReward to confirm tecNO_PERMISSION."""
    log("  Testing ClaimReward (should fail with tecNO_PERMISSION)...")
    address = node["address"]
    seed    = node["seed"]
    ck_hex  = node["consensus_hex"]
    try:
        seq = get_seq(address)
        result, tx_hash = sign_and_submit(seed, {
            "TransactionType": "ClaimReward",
            "Account":         address,
            "ConsensusKey":    ck_hex,
            "Fee":             "12",
            "Sequence":        seq,
        })
        validated = wait_validated(tx_hash, retries=10, sleep_s=3) if result != "SIGN_ERR" else result
        if validated in ("tecNO_PERMISSION", "tecNO_ENTRY"):
            ok(f"  ClaimReward correctly rejected: {validated}")
        else:
            warn(f"  ClaimReward result: {validated} (expected tecNO_PERMISSION)")
    except Exception as e:
        warn(f"  ClaimReward test failed with exception: {e}")

def main():
    parser = argparse.ArgumentParser(description="Slash a qXRP validator")
    parser.add_argument("--target",  default="node4", help="node1/node2/node3/node4")
    parser.add_argument("--offense", type=int, default=2, choices=[1, 2, 3],
                        help="1=DOUBLE_SIGN 2=ABSENCE 3=INVALID_VOTE")
    args = parser.parse_args()

    node = find_node(args.target)
    ck_hex = node["consensus_hex"]
    offense_name = OFFENSE_NAMES[args.offense]

    log(f"=== SlashValidator: target={args.target}  offense={args.offense} ({offense_name}) ===")

    # Derive slash target AccountID from consensus key
    slash_target_addr = consensus_key_to_slash_target(ck_hex)
    log(f"  Consensus key:   {ck_hex[:20]}...")
    log(f"  Slash target:    {slash_target_addr}")

    # Show current bond state
    log("--- Before slash ---")
    show_bond_state(ck_hex, "BEFORE ")

    # Submit ValidatorSlash from genesis (any account can slash)
    seq = get_seq(GENESIS_ADDR)
    result, tx_hash = sign_and_submit(GENESIS_SEED, {
        "TransactionType": "ValidatorSlash",
        "Account":         GENESIS_ADDR,
        "SlashTarget":     slash_target_addr,
        "SlashOffense":    args.offense,
        "Fee":             "12",
        "Sequence":        seq,
    })
    log(f"  ValidatorSlash → {result}  ({tx_hash[:20]}...)")

    if result in ("SIGN_ERR",):
        err("  Signing failed — check seed and node connectivity.")
        sys.exit(1)

    validated = wait_validated(tx_hash, retries=20, sleep_s=3)
    if validated == "tesSUCCESS":
        ok("  Slash transaction validated!")
    else:
        err(f"  Slash tx result: {validated}")
        if validated in ("tecNO_ENTRY", "temBAD_AMOUNT"):
            err("  Bond may not exist or is already UNBONDING.")
        sys.exit(1)

    # Wait for ledger to settle
    time.sleep(5)

    # Show new bond state
    log("--- After slash ---")
    bond = show_bond_state(ck_hex, "AFTER  ")

    if bond:
        status = bond.get("BondStatus", 0)
        if status == 2:  # UNBONDING
            ok("  Bond is UNBONDING as expected.")
            # Current epoch (or 1 if we don't know)
            try:
                from common import current_epoch
                epoch_number, _, _ = current_epoch()
            except Exception:
                epoch_number = 1
            try_claim_after_slash(node, epoch_number)
        else:
            warn(f"  Expected UNBONDING, got status={status}")

    ok("\n=== Slash complete ===")
    log(f"  {args.target} is now UNBONDING — it cannot claim rewards.")
    log(f"  Bond unlock: ~{262800} ledgers (~73 epochs) from now.")

if __name__ == "__main__":
    main()
