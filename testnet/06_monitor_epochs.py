#!/usr/bin/env python3
"""
06_monitor_epochs.py
────────────────────
Runs ON 37.27.47.236.  Live terminal dashboard for the qXRP testnet.

Refreshes every 5 s and shows:
  • Ledger sequence, epoch number, ledgers until next epoch
  • Estimated time to next epoch boundary
  • Treasury balance, current epoch pool
  • Per-validator table: ConsensusKey prefix, wallet address, BondStatus,
    CompositeScore (bps), AggScore, LastClaimed, wallet balance

Colour legend:
  green  = BONDED, score OK, can claim
  yellow = BONDED but score too low (< 500 bps)
  red    = UNBONDING (slashed or locked)
  dim    = already claimed this epoch

Usage:
    python3 /opt/qxrp/testnet/06_monitor_epochs.py
    python3 /opt/qxrp/testnet/06_monitor_epochs.py --interval 10
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_ADDR, VALIDATORS, NODE4,
    rpc_any, current_epoch, all_validator_bonds,
)

DROPS_PER_XRP   = 1_000_000
EPOCH_LEDGERS   = 3600       # kQXRP_LEDGERS_PER_EPOCH
MIN_SCORE_BPS   = 500
BOND_STATUS     = {0: "UNKNOWN", 1: "BONDED", 2: "UNBONDING"}

# ANSI colours
GRN = "\033[32m"
YLW = "\033[33m"
RED = "\033[31m"
DIM = "\033[2m"
RST = "\033[0m"
BLD = "\033[1m"

def colour_status(status_int: int, score: int, last_claimed: int, epoch_number: int) -> str:
    label = BOND_STATUS.get(status_int, f"?{status_int}")
    if status_int == 2:
        return f"{RED}{label}{RST}"
    if score < MIN_SCORE_BPS:
        return f"{YLW}{label}(low score){RST}"
    if last_claimed >= epoch_number and epoch_number > 0:
        return f"{DIM}{label}(claimed){RST}"
    return f"{GRN}{label}{RST}"

def get_account_balance(address: str) -> int:
    try:
        r = rpc_any("account_info", {"account": address, "ledger_index": "validated"})
        return int(r["account_data"]["Balance"])
    except Exception:
        return 0

def get_ledger_info():
    r = rpc_any("server_info")
    info = r["info"]
    seq  = info["validated_ledger"]["seq"]
    return seq

def build_nkey_index() -> dict:
    """Map consensus_hex → short nkey name for display."""
    idx = {}
    for v in VALIDATORS:
        idx[v["consensus_hex"].upper()] = v["name"]
    idx[NODE4["consensus_hex"].upper()] = NODE4["name"]
    return idx

def render(interval: int):
    """One render pass.  Returns True to continue, False to exit."""
    os.system("clear")

    try:
        seq = get_ledger_info()
    except Exception as e:
        print(f"  Error fetching ledger: {e}")
        return True

    epoch_number, epoch_start, pool_balance = current_epoch()
    treasury_bal = get_account_balance(GENESIS_ADDR)

    # Calculate next epoch boundary
    if epoch_number > 0:
        next_boundary = epoch_start + EPOCH_LEDGERS
        ledgers_left  = max(0, next_boundary - seq)
    else:
        next_boundary = EPOCH_LEDGERS
        ledgers_left  = max(0, EPOCH_LEDGERS - seq)

    # Estimate time: assume ~3.5s per ledger
    secs_left = ledgers_left * 3.5
    if secs_left < 3600:
        eta_str = f"{secs_left/60:.1f} min"
    else:
        eta_str = f"{secs_left/3600:.1f} h"

    now = time.strftime("%H:%M:%S")
    print(f"{BLD}╔═══════════════════════════════════════════════════════════╗{RST}")
    print(f"{BLD}║  qXRP Epoch Monitor                            {now}  ║{RST}")
    print(f"{BLD}╚═══════════════════════════════════════════════════════════╝{RST}")
    print(f"  Ledger:         {seq}")
    print(f"  Epoch:          {epoch_number}")
    print(f"  Next boundary:  ledger {next_boundary}  ({ledgers_left} ledgers, ~{eta_str})")
    print(f"  Treasury:       {treasury_bal / DROPS_PER_XRP:,.2f} qXRP")
    if pool_balance > 0:
        print(f"  Epoch pool:     {pool_balance / DROPS_PER_XRP:,.2f} qXRP")
    else:
        print(f"  Epoch pool:     (epoch 0 — scoring starts at ledger {EPOCH_LEDGERS})")
    print()

    bonds = all_validator_bonds()
    nkey_idx = build_nkey_index()

    if not bonds:
        print("  No ValidatorBond SLEs found yet.")
        print(f"\n  [refreshes every {interval}s — Ctrl-C to quit]")
        return True

    # Table header
    print(f"{'NODE':<8}  {'ACCOUNT':^36}  {'STATUS':^22}  "
          f"{'SCORE':>6}  {'AGG':>6}  {'CLAIMED':>7}  {'BALANCE':>14}")
    print("─" * 108)

    for bond in bonds:
        ck_hex  = bond.get("ConsensusKey", "").upper()
        acct    = bond.get("Account", "?")
        status  = bond.get("BondStatus", 0)
        score   = bond.get("CompositeScore", 0)
        agg     = bond.get("AggregateCompositeScore", 0)
        claimed = bond.get("EpochLastClaimed", 0)
        name    = nkey_idx.get(ck_hex, ck_hex[:8] + "...")
        bal     = get_account_balance(acct)
        status_str = colour_status(status, score, claimed, epoch_number)

        # Progress bar for score
        score_pct = min(score, 10000) // 500  # 0-20 blocks
        bar = "█" * score_pct + "░" * (20 - score_pct)

        print(f"{name:<8}  {acct:^36}  {status_str:<31}  "
              f"{score:>6}  {agg:>6}  {claimed:>7}  {bal/DROPS_PER_XRP:>13.2f}")
        print(f"         score [{bar}]")

    print()
    print(f"  {GRN}green{RST}=eligible  {YLW}yellow{RST}=score<500  "
          f"{RED}red{RST}=UNBONDING  {DIM}dim{RST}=claimed")
    print(f"\n  [refreshes every {interval}s — Ctrl-C to quit]")
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=5, help="Refresh interval in seconds")
    args = parser.parse_args()

    try:
        while True:
            try:
                render(args.interval)
            except Exception as e:
                print(f"\nRender error: {e}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nMonitor stopped.")

if __name__ == "__main__":
    main()
