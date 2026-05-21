#!/usr/bin/env python3
"""
04_ramp_load.py
───────────────
Runs ON 37.27.47.236.  Sends a ramping payment load to exercise the chain:

  TPS cycle (repeats every 90 s):  5 → 10 → 20 → 30 → 20 → 10 → 5

Creates 20 funded test accounts if they don't already exist.
Stops on Ctrl-C and prints a summary.

Usage:
    python3 /opt/qxrp/testnet/04_ramp_load.py [--accounts 20] [--max-tps 30]
    nohup python3 /opt/qxrp/testnet/04_ramp_load.py > /opt/qxrp/testnet/load.log 2>&1 &
"""

import argparse
import json
import os
import random
import signal
import sys
import time
import threading

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    GENESIS_SEED, GENESIS_ADDR,
    rpc, rpc_any, get_seq, sign_and_submit,
    current_ledger_seq,
    log, ok, warn,
)

ACCOUNTS_FILE  = "/opt/qxrp/testnet/load_accounts.json"
DROPS_PER_XRP  = 1_000_000
FUND_AMOUNT    = 50 * DROPS_PER_XRP   # 50 qXRP each
PAYMENT_AMOUNT = "1000"               # 1 milli-qXRP per payment

# ── Account creation ───────────────────────────────────────────────────────────
def create_or_load_accounts(n: int) -> list:
    if os.path.exists(ACCOUNTS_FILE):
        with open(ACCOUNTS_FILE) as f:
            accounts = json.load(f)
        if len(accounts) >= n:
            log(f"  Loaded {len(accounts)} existing load accounts.")
            # Verify they're funded
            funded = []
            for a in accounts[:n]:
                try:
                    r = rpc_any("account_info", {"account": a["address"], "ledger_index": "validated"})
                    if "account_data" in r:
                        funded.append(a)
                except Exception:
                    pass
            if len(funded) >= n // 2:
                ok(f"  {len(funded)}/{n} accounts verified as active.")
                return accounts[:n]

    log(f"  Creating {n} fresh test accounts...")
    accounts = []
    for i in range(n):
        r = rpc_any("wallet_propose", {"key_type": "secp256k1"})
        accounts.append({
            "address": r["account_id"],
            "seed":    r["master_seed"],
        })

    # Fund in batches using genesis
    genesis_seq = get_seq(GENESIS_ADDR)
    for i, acct in enumerate(accounts):
        sign_and_submit(GENESIS_SEED, {
            "TransactionType": "Payment",
            "Account":         GENESIS_ADDR,
            "Destination":     acct["address"],
            "Amount":          str(FUND_AMOUNT),
            "Fee":             "12",
            "Sequence":        genesis_seq + i,
        })
        if (i + 1) % 5 == 0:
            log(f"    Funded {i+1}/{n}...")
            time.sleep(2)  # let ledgers close

    # Wait for all accounts to be visible
    log("  Waiting for accounts to settle...")
    time.sleep(10)

    os.makedirs(os.path.dirname(ACCOUNTS_FILE), exist_ok=True)
    with open(ACCOUNTS_FILE, "w") as f:
        json.dump(accounts, f, indent=2)
    ok(f"  {n} accounts funded and saved.")
    return accounts

# ── Payment loop ───────────────────────────────────────────────────────────────
_stop_flag = False
_stats = {"sent": 0, "ok": 0, "failed": 0, "start_time": 0.0}

def handle_sigint(*_):
    global _stop_flag
    _stop_flag = True
    print("\nStopping...")

def send_payment(sender: dict, recipient_addr: str, seq: int) -> str:
    result, _ = sign_and_submit(sender["seed"], {
        "TransactionType": "Payment",
        "Account":         sender["address"],
        "Destination":     recipient_addr,
        "Amount":          PAYMENT_AMOUNT,
        "Fee":             "12",
        "Sequence":        seq,
    })
    return result

def run_tps(accounts: list, target_tps: int, duration: float):
    """Send payments at target_tps for duration seconds."""
    global _stop_flag
    interval = 1.0 / target_tps
    deadline = time.time() + duration
    # Seed sequence counters
    seqs = {}
    for a in accounts:
        try:
            seqs[a["address"]] = get_seq(a["address"])
        except Exception:
            seqs[a["address"]] = 1

    n = len(accounts)
    i = 0
    while time.time() < deadline and not _stop_flag:
        t0 = time.time()
        sender = accounts[i % n]
        recipient = accounts[(i + 1) % n]["address"]
        addr = sender["address"]
        seq = seqs[addr]

        result = send_payment(sender, recipient, seq)
        _stats["sent"] += 1
        if result in ("tesSUCCESS", "terQUEUED"):
            _stats["ok"] += 1
            seqs[addr] = seq + 1
        elif result in ("terSEQ_GAP", "tefPAST_SEQ", "tefMAX_LEDGER"):
            # Resync sequence
            try:
                seqs[addr] = get_seq(addr)
            except Exception:
                pass
            _stats["failed"] += 1
        else:
            _stats["failed"] += 1

        i += 1
        elapsed = time.time() - t0
        sleep_for = interval - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for)

def ramp_cycle(accounts: list, max_tps: int):
    """One TPS ramp cycle: 5→max→5 TPS over ~90 s."""
    steps = [
        (5,       10),
        (max_tps // 2, 15),
        (max_tps,  20),
        (max_tps,  20),
        (max_tps // 2, 15),
        (5,       10),
    ]
    for tps, duration in steps:
        if _stop_flag:
            break
        ledger = current_ledger_seq()
        elapsed = time.time() - _stats["start_time"]
        log(f"  TPS={tps:3d}  ledger={ledger}  sent={_stats['sent']}  "
            f"ok={_stats['ok']}  failed={_stats['failed']}  "
            f"elapsed={elapsed:.0f}s")
        run_tps(accounts, tps, duration)

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--accounts", type=int, default=20)
    parser.add_argument("--max-tps",  type=int, default=30)
    args = parser.parse_args()

    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)

    accounts = create_or_load_accounts(args.accounts)
    _stats["start_time"] = time.time()

    log(f"Starting ramp load: {args.accounts} accounts, max {args.max_tps} TPS")
    log("Press Ctrl-C to stop.")

    cycle = 0
    while not _stop_flag:
        cycle += 1
        log(f"\n── Cycle {cycle} ──────────────────────────────────────────")
        ramp_cycle(accounts, args.max_tps)

    elapsed = time.time() - _stats["start_time"]
    ok(f"\n=== Load test complete ===")
    log(f"  Total sent:   {_stats['sent']}")
    log(f"  Successful:   {_stats['ok']}")
    log(f"  Failed:       {_stats['failed']}")
    log(f"  Elapsed:      {elapsed:.1f}s")
    if elapsed > 0:
        log(f"  Avg TPS:      {_stats['ok'] / elapsed:.1f}")

if __name__ == "__main__":
    main()
