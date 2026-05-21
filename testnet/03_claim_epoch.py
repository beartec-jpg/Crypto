#!/usr/bin/env python3
"""
03_claim_epoch.py
─────────────────
Runs ON 37.27.47.236.  Claims rewards for all eligible validators.

For each ValidatorBond SLE found on-chain:
  • BondStatus  == BONDED
  • CompositeScore >= 500 (5%)
  • EpochLastClaimed < current EpochNumber

Submits ClaimReward from the bond's Account (validator's own address).
Seeds are resolved from testnet_state.json or the built-in VALIDATORS table.

Usage:
    python3 /opt/qxrp/testnet/03_claim_epoch.py
    python3 /opt/qxrp/testnet/03_claim_epoch.py --dry-run
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_ADDR, VALIDATORS, NODE4,
    rpc, rpc_any, get_seq, sign_and_submit, wait_validated,
    current_epoch, all_validator_bonds,
    log, ok, warn, err,
)

STATE_FILE    = "/opt/qxrp/testnet/testnet_state.json"
DROPS_PER_XRP = 1_000_000
MIN_SCORE_BPS = 500     # kMIN_COMPOSITE_SCORE_BPS
BOND_STATUS_BONDED   = 1
BOND_STATUS_UNBONDING = 2

def load_seed_map() -> dict:
    """Return address → seed mapping from state file + built-in data."""
    seed_map = {}
    # Built-in validators
    for v in VALIDATORS:
        seed_map[v["address"]] = v["seed"]
    # node4
    seed_map[NODE4["address"]] = NODE4["seed"]
    # Override/augment from state file
    try:
        with open(STATE_FILE) as f:
            state = json.load(f)
        for v in state.get("validators", []):
            seed_map[v["address"]] = v["seed"]
        node4_state = state.get("node4")
        if node4_state:
            seed_map[node4_state["address"]] = node4_state["seed"]
    except FileNotFoundError:
        warn("State file not found — using built-in seed table only.")
    return seed_map

def get_treasury_balance() -> int:
    """Return genesis account balance in drops."""
    try:
        r = rpc_any("account_info", {"account": GENESIS_ADDR, "ledger_index": "validated"})
        return int(r["account_data"]["Balance"])
    except Exception:
        return 0

def claim_reward(bond: dict, seed: str, epoch_number: int, dry_run: bool) -> str:
    account  = bond.get("Account")
    ck_hex   = bond.get("ConsensusKey", "")
    score    = bond.get("CompositeScore", 0)
    agg      = bond.get("AggregateCompositeScore", 0)

    if not account or not ck_hex:
        warn(f"  Skipping malformed bond: {bond}")
        return "SKIP"

    log(f"  ClaimReward for {account[:18]}...  score={score}/{agg}  epoch={epoch_number}")

    if dry_run:
        ok("    [dry-run] would submit ClaimReward")
        return "DRY_RUN"

    before = 0
    try:
        r = rpc_any("account_info", {"account": account, "ledger_index": "validated"})
        before = int(r["account_data"]["Balance"])
    except Exception:
        pass

    seq = get_seq(account)
    result, tx_hash = sign_and_submit(seed, {
        "TransactionType": "ClaimReward",
        "Account":         account,
        "ConsensusKey":    ck_hex,
        "Fee":             "12",
        "Sequence":        seq,
    })
    log(f"    Submitted → {result}  hash={tx_hash[:16]}...")

    if result in ("tesSUCCESS", "terQUEUED"):
        validated = wait_validated(tx_hash, retries=20, sleep_s=3)
        if validated == "tesSUCCESS":
            try:
                r = rpc_any("account_info", {"account": account, "ledger_index": "validated"})
                after = int(r["account_data"]["Balance"])
                reward_drops = after - before
                ok(f"    Claimed {reward_drops / DROPS_PER_XRP:.2f} qXRP → {account}")
            except Exception:
                ok(f"    Claim validated for {account}")
        else:
            warn(f"    Validated result: {validated}")
    else:
        err(f"    Claim failed: {result}")

    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Check eligibility without submitting")
    args = parser.parse_args()

    seed_map = load_seed_map()

    epoch_number, epoch_start, pool_balance = current_epoch()
    if epoch_number == 0:
        err("No RewardEpoch SLE found — epoch 1 has not occurred yet (chain not at ledger 3600).")
        sys.exit(1)

    log(f"Current epoch: {epoch_number}  start_ledger={epoch_start}  pool={pool_balance / DROPS_PER_XRP:.2f} qXRP")

    treasury_before = get_treasury_balance()
    log(f"Treasury before: {treasury_before / DROPS_PER_XRP:.2f} qXRP")

    bonds = all_validator_bonds()
    log(f"Found {len(bonds)} ValidatorBond SLE(s)")

    claimed = 0
    skipped = 0

    for bond in bonds:
        status     = bond.get("BondStatus", 0)
        score      = bond.get("CompositeScore", 0)
        last_epoch = bond.get("EpochLastClaimed", 0)
        account    = bond.get("Account", "?")
        ck_hex     = bond.get("ConsensusKey", "")[:16]

        skip_reason = None
        if status == BOND_STATUS_UNBONDING:
            skip_reason = "UNBONDING (slashed)"
        elif score < MIN_SCORE_BPS:
            skip_reason = f"score too low ({score} < {MIN_SCORE_BPS})"
        elif last_epoch >= epoch_number:
            skip_reason = f"already claimed epoch {last_epoch}"

        if skip_reason:
            warn(f"  Skip {account[:18]}...  CK={ck_hex}...  reason={skip_reason}")
            skipped += 1
            continue

        seed = seed_map.get(account)
        if not seed:
            warn(f"  No seed for {account} — cannot claim (may be genesis-bonded).")
            skipped += 1
            continue

        result = claim_reward(bond, seed, epoch_number, args.dry_run)
        if result in ("tesSUCCESS", "terQUEUED", "DRY_RUN"):
            claimed += 1

    treasury_after = get_treasury_balance()
    paid_out = treasury_before - treasury_after
    if paid_out > 0:
        ok(f"\nTotal paid out: {paid_out / DROPS_PER_XRP:.2f} qXRP  ({claimed} claims, {skipped} skipped)")
    else:
        log(f"\nClaims: {claimed}  Skipped: {skipped}  (pool may not refill until next epoch)")

if __name__ == "__main__":
    main()
