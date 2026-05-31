#!/usr/bin/env python3
"""
qXRP Realistic Load Tester
Models Bitcoin's natural transaction flow — not spam, just realistic ebb & flow.

Bitcoin reference (mempool.space averages):
  Average TPS  :  3.5 TPS   (~300k tx/day)
  Peak TPS     :  7-10 TPS  (EU afternoon + US morning overlap, 13:00-17:00 UTC)
  Trough TPS   :  1.0 TPS   (global night, 02:00-06:00 UTC)
  Weekend      :  -30%      lower than weekdays
  Peak days    :  600k tx/day during bull runs / high-fee periods

Usage:
  python3 load_test.py [--node http://127.0.0.1:5006] [--log load_test.log]
                       [--fund] [--dry-run]
"""

import asyncio
import json
import math
import random
import time
import argparse
import sys
from datetime import datetime, timezone
from collections import deque

import httpx

# ── Node config ───────────────────────────────────────────────────────────────
NODE_URL      = "http://127.0.0.1:5006"
NETWORK_ID    = 999
ACCOUNTS_FILE = "/opt/qxrp/testnet/load_accounts.json"
FUNDER_SEED   = "sny63XyDLBXCArFhyrK8bvksfDWEN"   # node2 validator ~7.79B qXRP
KEY_ALGO      = "secp256k1"

# How much to seed each load-test account with (in qXRP)
FUND_AMOUNT_QX  = 50_000       # 50k qXRP per account
MIN_BALANCE_QX  = 1_000        # refund if below this

# ── Bitcoin-like traffic pattern ──────────────────────────────────────────────
# Hourly weights (UTC 0-23), normalised so average ≈ 1.0
# Data derived from mempool.space 2023-2024 hourly tx counts
HOURLY_WEIGHT = [
    0.45, 0.40, 0.35, 0.30, 0.30, 0.35,   # 00-05 UTC  global night
    0.48, 0.58, 0.68, 0.78, 0.88, 0.93,   # 06-11 UTC  EU morning ramp
    0.97, 1.00, 1.00, 0.99, 0.98, 0.96,   # 12-17 UTC  EU aft + US AM peak
    0.88, 0.80, 0.70, 0.62, 0.54, 0.48,   # 18-23 UTC  US evening wind-down
]

# Monday=0 … Sunday=6  (weekends ~-30%)
DAY_WEIGHT = [1.00, 1.00, 1.00, 0.98, 0.97, 0.72, 0.68]

BASE_TPS = 3.5    # BTC 24h average
PEAK_TPS = 7.0    # BTC peak (EU/US overlap)
MIN_TPS  = 0.8    # BTC floor (deep night)

# Payment amount range (qXRP) — uniform random, loosely models BTC dust→whale mix
AMOUNT_MIN_QX = 1
AMOUNT_MAX_QX = 5_000

# ── Internals ─────────────────────────────────────────────────────────────────
DROPS_PER_QX  = 1_000_000
FEE_DROPS     = 12           # ~standard fee

# sliding window for live TPS display
_sent_times: deque = deque(maxlen=300)   # timestamps of successful tx in last 5 min
_total_sent    = 0
_total_failed  = 0
_total_latency = 0.0

wallets: list = []             # list of (Wallet, address)
sequences: dict = {}           # address → current sequence

# ── RPC helpers ──────────────────────────────────────────────────────────────

async def rpc(client: httpx.AsyncClient, method: str, params: dict | None = None) -> dict:
    body = {"method": method}
    if params:
        body["params"] = [params]
    r = await client.post(NODE_URL, json=body, timeout=10)
    return r.json().get("result", {})


async def get_sequence(client: httpx.AsyncClient, address: str) -> int:
    info = await rpc(client, "account_info", {
        "account": address,
        "ledger_index": "current",
    })
    return int(info["account_data"]["Sequence"])


# ── Transaction signing & submit ─────────────────────────────────────────────

def sign_payment(wallet, src: str, dst: str, amount_drops: int, seq: int,
                 last_ledger: int) -> str:
    """Sign a Payment transaction and return the tx_blob hex string."""
    from xrpl.models.transactions import Payment
    from xrpl.transaction import sign as xrpl_sign
    from xrpl.core.binarycodec import encode

    tx = Payment(
        account=src,
        destination=dst,
        amount=str(amount_drops),
        fee=str(FEE_DROPS),
        sequence=seq,
        last_ledger_sequence=last_ledger,
        network_id=NETWORK_ID,
    )
    signed = xrpl_sign(tx, wallet)
    return encode(signed.to_xrpl())


async def submit_tx(client: httpx.AsyncClient, tx_blob: str) -> dict:
    return await rpc(client, "submit", {"tx_blob": tx_blob})


# ── Rate calculation ──────────────────────────────────────────────────────────

def target_tps_now() -> float:
    """Return desired TPS based on current UTC time (BTC pattern)."""
    now  = datetime.now(timezone.utc)
    hw   = HOURLY_WEIGHT[now.hour]
    dw   = DAY_WEIGHT[now.weekday()]
    rate = MIN_TPS + (PEAK_TPS - MIN_TPS) * hw * dw
    return round(rate, 2)


def interval_for_tps(tps: float) -> float:
    """Seconds between transactions for a given TPS (Poisson-distributed)."""
    if tps <= 0:
        return 2.0
    # Poisson inter-arrival: exponential distribution
    return random.expovariate(tps)


# ── Funding ───────────────────────────────────────────────────────────────────

async def fund_accounts(client: httpx.AsyncClient, dry_run: bool):
    from xrpl.wallet import Wallet as XWallet

    funder = XWallet.from_seed(FUNDER_SEED, algorithm=KEY_ALGO)
    print(f"Funder: {funder.address}")

    # get funder sequence
    funder_seq = await get_sequence(client, funder.address)

    for addr, _ in wallets:
        info = await rpc(client, "account_info", {
            "account": addr, "ledger_index": "validated"
        })
        if "error" in info:
            balance_qx = 0
            print(f"  {addr}  NOT FUNDED — will create")
        else:
            balance_qx = int(info["account_data"]["Balance"]) // DROPS_PER_QX

        if balance_qx < MIN_BALANCE_QX:
            needed = FUND_AMOUNT_QX - balance_qx
            print(f"  {addr}  balance={balance_qx:,} qXRP → funding {needed:,} qXRP", end="")
            if dry_run:
                print("  [dry-run, skipped]")
                continue
            # get latest validated ledger for last_ledger_sequence
            ledger_info = await rpc(client, "ledger", {"ledger_index": "validated"})
            last_ledger = int(ledger_info["ledger"]["ledger_index"]) + 20
            blob = sign_payment(funder, funder.address, addr,
                                needed * DROPS_PER_QX, funder_seq, last_ledger)
            result = await submit_tx(client, blob)
            eng = result.get("engine_result", "?")
            print(f"  → {eng}")
            if eng in ("tesSUCCESS", "terQUEUED"):
                funder_seq += 1
            await asyncio.sleep(0.5)
        else:
            print(f"  {addr}  balance={balance_qx:,} qXRP  ok")

    print("Funding complete. Waiting 4s for ledger close…")
    await asyncio.sleep(4)


# ── Stats display ─────────────────────────────────────────────────────────────

def print_stats():
    global _sent_times, _total_sent, _total_failed, _total_latency

    now = time.monotonic()
    # 60-second window TPS
    cutoff = now - 60
    recent = [t for t in _sent_times if t > cutoff]
    tps_60 = len(recent) / 60.0

    # 300-second window TPS
    tps_300 = len(_sent_times) / 300.0

    total = _total_sent + _total_failed
    success_pct = (_total_sent / total * 100) if total else 0
    avg_lat = (_total_latency / _total_sent * 1000) if _total_sent else 0

    target = target_tps_now()
    now_utc = datetime.now(timezone.utc)
    ts = now_utc.strftime("%H:%M:%S UTC")

    print(
        f"[{ts}]  target={target:.1f}  TPS(60s)={tps_60:.2f}  TPS(5m)={tps_300:.2f}"
        f"  sent={_total_sent:,}  failed={_total_failed:,}  ok={success_pct:.1f}%"
        f"  avg_lat={avg_lat:.0f}ms"
    )


# ── Main loop ─────────────────────────────────────────────────────────────────

async def load_loop(client: httpx.AsyncClient, dry_run: bool, log_file):
    global _total_sent, _total_failed, _total_latency

    # Pre-fetch sequences
    for addr, _ in wallets:
        try:
            sequences[addr] = await get_sequence(client, addr)
        except Exception:
            sequences[addr] = 0

    print(f"\nStarting load test — {len(wallets)} accounts")
    print("Pattern: Bitcoin-like ebb/flow  (Ctrl-C to stop)\n")

    last_stats = time.monotonic()
    last_refetch = time.monotonic()
    STATS_INTERVAL  = 30   # seconds
    REFETCH_INTERVAL = 60  # re-read sequences to avoid drift

    tx_count = 0

    while True:
        now_m = time.monotonic()

        # Refresh sequences periodically
        if now_m - last_refetch > REFETCH_INTERVAL:
            for addr, _ in wallets:
                try:
                    sequences[addr] = await get_sequence(client, addr)
                except Exception:
                    pass
            last_refetch = now_m

        # Print stats
        if now_m - last_stats >= STATS_INTERVAL:
            print_stats()
            if log_file:
                log_file.flush()
            last_stats = now_m

        target = target_tps_now()
        delay  = interval_for_tps(target)

        if not dry_run:
            # Pick two distinct random accounts
            if len(wallets) < 2:
                await asyncio.sleep(delay)
                continue

            src_addr, src_wallet = random.choice(wallets)
            dst_addr = src_addr
            while dst_addr == src_addr:
                dst_addr, _ = random.choice(wallets)

            amount_qx = random.randint(AMOUNT_MIN_QX, AMOUNT_MAX_QX)
            amount_dr = amount_qx * DROPS_PER_QX

            seq = sequences.get(src_addr, 0)
            if seq == 0:
                await asyncio.sleep(delay)
                continue

            try:
                ledger_info = await rpc(client, "ledger", {"ledger_index": "validated"})
                last_ledger = int(ledger_info["ledger"]["ledger_index"]) + 20

                t0 = time.monotonic()
                blob = sign_payment(src_wallet, src_addr, dst_addr,
                                    amount_dr, seq, last_ledger)
                result = await submit_tx(client, blob)
                latency = time.monotonic() - t0

                eng = result.get("engine_result", "?")
                ok  = eng in ("tesSUCCESS", "terQUEUED")

                if ok:
                    sequences[src_addr] = seq + 1
                    _total_sent += 1
                    _total_latency += latency
                    _sent_times.append(time.monotonic())
                    tx_count += 1
                    if log_file:
                        log_file.write(
                            f"{datetime.now(timezone.utc).isoformat()},"
                            f"{src_addr},{dst_addr},{amount_qx},{eng},{latency*1000:.0f}ms\n"
                        )
                elif eng in ("terPRE_SEQ",):
                    # Sequence behind — re-fetch
                    sequences[src_addr] = await get_sequence(client, src_addr)
                    _total_failed += 1
                elif eng in ("terPAST_SEQ", "tefPAST_SEQ"):
                    sequences[src_addr] = await get_sequence(client, src_addr)
                    _total_failed += 1
                else:
                    _total_failed += 1
                    # Verbose for unexpected errors
                    if _total_failed <= 20 or _total_failed % 100 == 0:
                        print(f"  FAIL  {eng}  {src_addr[:12]}→{dst_addr[:12]}  "
                              f"amt={amount_qx} seq={seq}")

            except Exception as e:
                _total_failed += 1
                if _total_failed <= 5:
                    print(f"  ERR: {e}")

        await asyncio.sleep(max(delay - 0.01, 0.05))


# ── Entry point ───────────────────────────────────────────────────────────────

async def main():
    global wallets, NODE_URL

    parser = argparse.ArgumentParser(description="qXRP Bitcoin-pattern load tester")
    parser.add_argument("--node",    default=NODE_URL)
    parser.add_argument("--fund",    action="store_true",
                        help="Fund accounts from node2 validator before testing")
    parser.add_argument("--dry-run", action="store_true",
                        help="Calculate rates and print what would be sent, no actual txns")
    parser.add_argument("--log",     default="/var/log/qxrp-load.csv",
                        help="CSV log file path")
    args = parser.parse_args()
    NODE_URL = args.node

    from xrpl.wallet import Wallet as XWallet

    # Load accounts
    with open(ACCOUNTS_FILE) as f:
        accounts = json.load(f)

    for acct in accounts:
        w = XWallet.from_seed(acct["seed"], algorithm=KEY_ALGO)
        # Verify address matches
        if w.address == acct["address"]:
            wallets.append((acct["address"], w))
        else:
            # Try ed25519
            w2 = XWallet.from_seed(acct["seed"], algorithm="ed25519")
            if w2.address == acct["address"]:
                wallets.append((acct["address"], w2))
            else:
                print(f"  WARN: {acct['address']} seed mismatch (secp={w.address} ed={w2.address}), skipping")

    print(f"Loaded {len(wallets)} accounts")

    # Show pattern preview
    print("\n── Bitcoin-like TPS schedule (current week) ──")
    from datetime import timedelta
    now_utc = datetime.now(timezone.utc)
    print(f"{'Hour (UTC)':<12} {'Day':<10} {'Target TPS':<12} {'tx/hr (est)'}")
    print("-" * 50)
    for h in range(0, 24, 3):
        # simulate weekday
        fake = now_utc.replace(hour=h, minute=0, second=0)
        hw = HOURLY_WEIGHT[h]
        dw = DAY_WEIGHT[fake.weekday()]
        tps = MIN_TPS + (PEAK_TPS - MIN_TPS) * hw * dw
        print(f"  {h:02d}:00        {'Mon-Fri':<10} {tps:<12.1f} {tps*3600:>8,.0f}")
    print()

    async with httpx.AsyncClient() as client:
        if args.fund:
            await fund_accounts(client, args.dry_run)

        if args.dry_run:
            print("Dry-run mode — no transactions sent. Exiting.")
            return

        log_file = None
        try:
            log_file = open(args.log, "a")
            log_file.write("timestamp,from,to,amount_qx,result,latency_ms\n")
            await load_loop(client, False, log_file)
        except KeyboardInterrupt:
            print("\n\nStopped by user.")
            print_stats()
        finally:
            if log_file:
                log_file.close()


if __name__ == "__main__":
    asyncio.run(main())
