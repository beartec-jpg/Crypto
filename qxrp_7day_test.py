#!/usr/bin/env python3
"""
qXRP 7-Day Progressive Network Test
====================================
Tests:
  1. Cyclic TX pressure waves (ramp-up → peak → sustain → cooldown → rest)
  2. Gradual validator addition (3 → 4 → 5 → 6 nodes during the test)
  3. Continuous health monitoring with per-cycle reports

Validator expansion schedule (days):
  Day 0–2  : 3 validators (baseline)
  Day 2    : +validator 4 added to UNL
  Day 4    : +validator 5 added to UNL
  Day 6    : +validator 6 added to UNL

TX wave cycle (repeats every 4 hours):
  15m  ramp-up   (0 → PEAK_TPS)
  45m  peak load (PEAK_TPS)
  30m  ramp-down (PEAK_TPS → LOW_TPS)
  30m  rest      (LOW_TPS background)
"""

import asyncio
import json
import time
import random
import datetime
import signal
import sys
import os
import subprocess
import statistics
from dataclasses import dataclass, field
from typing import Optional
import urllib.request
import urllib.error

# ─── Config ──────────────────────────────────────────────────────────────────

RPC_URL          = "http://127.0.0.1:5005"
GENESIS_SEED     = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb"
GENESIS_ACCOUNT  = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
LOG_FILE         = "/opt/qxrp/7day_test.log"
METRICS_FILE     = "/opt/qxrp/7day_metrics.json"

# Validator UNL path
VALIDATORS_FILE  = "/etc/qxrp/validators.txt"

# Wave parameters
CYCLE_SECONDS    = 4 * 3600        # 4-hour full cycle
RAMP_UP_SECS     = 15 * 60         # 15 min
PEAK_SECS        = 45 * 60         # 45 min
RAMP_DOWN_SECS   = 30 * 60         # 30 min
REST_SECS        = 30 * 60         # 30 min

PEAK_TPS         = 80              # target peak (wallets per second funded)
LOW_TPS          = 5               # background rate during rest
TX_BATCH         = 20              # transactions per batch submission

# How many funded accounts to track (rotates)
ACCOUNT_POOL     = 500

# Validator expansion schedule: (day_number, pubkey, label)
# Pubkeys derived from validation seeds on the server
VALIDATOR_EXPANSION = [
    # Day 2: add node4 (new node we spin up on day 2)
    (2, "ED_PLACEHOLDER_NODE4_PUBKEY", "node4"),
    # Day 4: add node5
    (4, "ED_PLACEHOLDER_NODE5_PUBKEY", "node5"),
    # Day 6: add node6
    (6, "ED_PLACEHOLDER_NODE6_PUBKEY", "node6"),
]

# Current 3-validator UNL (from /etc/qxrp/validators.txt)
BASE_VALIDATORS = [
    "n94RNoyd8qLHjn7FbvtpWWumSSs2S7XGncejjLLJ2FofDrBZ1Ff6",  # node1
    "n9MuP4C9zqXjZx18Jw7gaSSQ9bi4R7TBxn9LfmPR9Mb9JgG9sLR6",  # node2
    "n9KX6hNjxiyKSPi1vptDFsuqAMSe9dpZ5uehEnT6GdkmRvzWYMwp",  # node3
]

# ─── Logging ─────────────────────────────────────────────────────────────────

log_fh = None

def log(msg: str, level: str = "INFO"):
    ts = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"{ts} [{level}] {msg}"
    print(line, flush=True)
    if log_fh:
        log_fh.write(line + "\n")
        log_fh.flush()

# ─── RPC ─────────────────────────────────────────────────────────────────────

def rpc(method: str, params: dict = {}, timeout: int = 10) -> dict:
    body = json.dumps({"method": method, "params": [params]}).encode()
    req = urllib.request.Request(RPC_URL, data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)["result"]
    except Exception as e:
        raise RuntimeError(f"RPC {method} failed: {e}")

def get_ledger() -> int:
    return rpc("server_info")["info"]["validated_ledger"]["seq"]

def get_server_state() -> str:
    return rpc("server_info")["info"]["server_state"]

def get_fee() -> int:
    try:
        return int(rpc("fee")["drops"]["open_ledger_fee"])
    except Exception:
        return 12

def get_account_seq(address: str) -> int:
    r = rpc("account_info", {"account": address, "ledger_index": "current"})
    return r["account_data"]["Sequence"]

def submit_tx(tx_blob: str) -> dict:
    return rpc("submit", {"tx_blob": tx_blob})

# ─── Signing (pure xrpl-primitives) ─────────────────────────────────────────
# Uses xrpl-py (installed on server) for signing

import importlib
_xrpl = None

def get_xrpl():
    global _xrpl
    if _xrpl is None:
        _xrpl = importlib.import_module("xrpl")
    return _xrpl

def make_wallet(seed: str):
    xrpl = get_xrpl()
    return xrpl.wallet.Wallet.from_seed(seed, algorithm="secp256k1")

def sign_payment(wallet, to: str, amount_drops: int, seq: int, last_ledger: int, fee: int = 12, net_id: int = 999) -> str:
    xrpl = get_xrpl()
    tx = {
        "TransactionType": "Payment",
        "Account": wallet.classic_address,
        "Destination": to,
        "Amount": str(amount_drops),
        "Fee": str(fee),
        "Sequence": seq,
        "LastLedgerSequence": last_ledger,
        "Flags": 0,
        "SigningPubKey": wallet.public_key,
    }
    if net_id > 1024:
        tx["NetworkID"] = net_id
    signed = xrpl.core.keypairs.sign(
        xrpl.core.binarycodec.encode_for_signing(tx),
        wallet.private_key
    )
    tx["TxnSignature"] = signed
    return xrpl.core.binarycodec.encode(tx)

# ─── Account pool ────────────────────────────────────────────────────────────

@dataclass
class AccountPool:
    wallets: list = field(default_factory=list)
    funded: set   = field(default_factory=set)

    def add(self, wallet):
        self.wallets.append(wallet)
        self.funded.add(wallet.classic_address)

    def random_dest(self) -> str:
        """Pick a random destination that isn't the genesis account."""
        return random.choice(self.wallets).classic_address

pool = AccountPool()

def fund_initial_pool(n: int = ACCOUNT_POOL):
    """Create n wallets and fund them from genesis in batches."""
    log(f"Funding initial pool of {n} accounts…")
    xrpl = get_xrpl()
    genesis = make_wallet(GENESIS_SEED)
    funded = 0
    seq = get_account_seq(GENESIS_ACCOUNT)
    fee = get_fee()

    wallets = [xrpl.wallet.Wallet.create() for _ in range(n)]

    BATCH = 50
    for i in range(0, n, BATCH):
        batch = wallets[i:i+BATCH]
        last_l = get_ledger() + 15
        blobs = []
        for w in batch:
            blob = sign_payment(genesis, w.classic_address,
                                10_000_000,   # 10 qXRP each
                                seq, last_l, fee)
            blobs.append(blob)
            seq += 1
        for blob in blobs:
            try:
                submit_tx(blob)
            except Exception:
                pass
        funded += len(batch)
        if funded % 100 == 0:
            log(f"  funded {funded}/{n}")
        time.sleep(1)

    # Wait for ledger to close
    time.sleep(4)
    for w in wallets:
        pool.add(w)
    log(f"Pool ready: {len(pool.wallets)} accounts")

# ─── Metrics ─────────────────────────────────────────────────────────────────

@dataclass
class CycleMetrics:
    cycle_num: int
    start_utc: str
    phase: str = ""
    txs_submitted: int = 0
    txs_success: int = 0
    txs_failed: int = 0
    ledgers_closed: int = 0
    peak_tps_observed: float = 0.0
    avg_ledger_close_secs: float = 0.0
    errors: list = field(default_factory=list)
    validator_count: int = 3

all_metrics: list[CycleMetrics] = []
current_cycle: Optional[CycleMetrics] = None

def save_metrics():
    try:
        data = [vars(m) for m in all_metrics]
        with open(METRICS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log(f"metrics save error: {e}", "WARN")

# ─── Validator management ─────────────────────────────────────────────────────

active_validators = list(BASE_VALIDATORS)
validators_added  = set()

def write_validators_file(validators: list):
    content = "[validators]\n" + "\n".join(validators) + "\n"
    with open(VALIDATORS_FILE, "w") as f:
        f.write(content)
    log(f"Updated {VALIDATORS_FILE} with {len(validators)} validators")

def reload_validator_list():
    """Send SIGHUP to all xrpld processes to reload config."""
    result = subprocess.run(["pkill", "-HUP", "xrpld"], capture_output=True)
    log(f"Sent SIGHUP to xrpld (rc={result.returncode})")
    time.sleep(3)

def check_validator_expansion(elapsed_days: float):
    global active_validators
    for (day, pubkey, label) in VALIDATOR_EXPANSION:
        if elapsed_days >= day and label not in validators_added:
            if pubkey.startswith("ED_PLACEHOLDER"):
                log(f"Validator expansion day {day} ({label}): placeholder key — skipping (spin up node first)", "WARN")
                validators_added.add(label)
                continue
            active_validators.append(pubkey)
            validators_added.add(label)
            write_validators_file(active_validators)
            reload_validator_list()
            log(f"VALIDATOR EXPANSION: added {label} (total={len(active_validators)}) at day {elapsed_days:.2f}")

# ─── TX wave engine ──────────────────────────────────────────────────────────

_shutdown = False

def handle_signal(sig, frame):
    global _shutdown
    log("Shutdown signal received", "WARN")
    _shutdown = True

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT,  handle_signal)

def submit_wave_burst(genesis_wallet, tps_target: float, duration_secs: int,
                      phase: str, metrics: CycleMetrics):
    """Submit transactions at tps_target rate for duration_secs."""
    if tps_target <= 0:
        return
    interval  = 1.0 / tps_target
    end_time  = time.monotonic() + duration_secs
    seq       = get_account_seq(GENESIS_ACCOUNT)
    fee       = get_fee()
    last_ledger = get_ledger() + 20

    # Refresh seq/ledger every 60s
    last_refresh = time.monotonic()

    log(f"  [{phase}] {tps_target:.1f} tps × {duration_secs}s")

    submitted_this_phase = 0
    tick_start = time.monotonic()
    tick_count = 0

    while time.monotonic() < end_time and not _shutdown:
        now = time.monotonic()

        # Refresh every 60 seconds
        if now - last_refresh > 60:
            try:
                seq = get_account_seq(GENESIS_ACCOUNT)
                fee = get_fee()
                last_ledger = get_ledger() + 20
                last_refresh = now
            except Exception as e:
                log(f"seq refresh error: {e}", "WARN")

        dest = pool.random_dest() if pool.wallets else GENESIS_ACCOUNT
        if dest == GENESIS_ACCOUNT:
            dest = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"  # fallback

        try:
            blob = sign_payment(genesis_wallet, dest,
                                1_000_000,   # 1 qXRP
                                seq, last_ledger, fee)
            result = submit_tx(blob)
            er = result.get("engine_result", "")
            if er.startswith("tes") or er == "terQUEUED":
                metrics.txs_success += 1
            else:
                metrics.txs_failed += 1
                if len(metrics.errors) < 5:
                    metrics.errors.append(er)
            metrics.txs_submitted += 1
            submitted_this_phase += 1
            seq += 1
        except Exception as e:
            metrics.txs_failed += 1

        tick_count += 1
        # sleep to pace to tps_target
        expected = tick_start + tick_count * interval
        sleep_dur = expected - time.monotonic()
        if sleep_dur > 0:
            time.sleep(min(sleep_dur, 0.5))

def run_ramp(genesis_wallet, start_tps: float, end_tps: float,
             duration_secs: int, phase: str, metrics: CycleMetrics):
    """Linearly ramp from start_tps to end_tps over duration_secs."""
    steps    = max(10, duration_secs // 30)  # change rate every 30s
    step_dur = duration_secs // steps

    log(f"  [{phase}] ramp {start_tps:.0f}→{end_tps:.0f} tps over {duration_secs//60}m")

    for i in range(steps):
        if _shutdown:
            break
        frac = i / max(steps - 1, 1)
        tps  = start_tps + (end_tps - start_tps) * frac
        submit_wave_burst(genesis_wallet, tps, step_dur, phase, metrics)
        metrics.peak_tps_observed = max(metrics.peak_tps_observed, tps)

# ─── Health snapshot ─────────────────────────────────────────────────────────

def health_snapshot() -> dict:
    try:
        info = rpc("server_info")["info"]
        return {
            "state":   info["server_state"],
            "ledger":  info["validated_ledger"]["seq"],
            "peers":   info["peers"],
            "load":    info.get("load_factor", 1),
            "queue":   info.get("txn_not_synced", 0),
        }
    except Exception as e:
        return {"state": "error", "error": str(e)}

# ─── Main cycle loop ──────────────────────────────────────────────────────────

def run_cycle(cycle_num: int, start_day: float, genesis_wallet) -> CycleMetrics:
    metrics = CycleMetrics(
        cycle_num=cycle_num,
        start_utc=datetime.datetime.utcnow().isoformat(),
        validator_count=len(active_validators)
    )
    all_metrics.append(metrics)
    log(f"{'='*60}")
    log(f"CYCLE {cycle_num} start | day={start_day:.3f} | validators={len(active_validators)}")

    snap_before = health_snapshot()
    l_before    = snap_before.get("ledger", 0)
    t_before    = time.monotonic()

    # Phase 1: Ramp up
    metrics.phase = "ramp_up"
    run_ramp(genesis_wallet, LOW_TPS, PEAK_TPS, RAMP_UP_SECS, "RAMP↑", metrics)

    # Phase 2: Peak sustained
    metrics.phase = "peak"
    submit_wave_burst(genesis_wallet, PEAK_TPS, PEAK_SECS, "PEAK", metrics)

    # Phase 3: Ramp down
    metrics.phase = "ramp_down"
    run_ramp(genesis_wallet, PEAK_TPS, LOW_TPS, RAMP_DOWN_SECS, "RAMP↓", metrics)

    # Phase 4: Rest / background
    metrics.phase = "rest"
    submit_wave_burst(genesis_wallet, LOW_TPS, REST_SECS, "REST", metrics)

    # Collect stats
    snap_after  = health_snapshot()
    l_after     = snap_after.get("ledger", l_before)
    elapsed     = time.monotonic() - t_before

    metrics.ledgers_closed       = max(0, l_after - l_before)
    metrics.phase                = "complete"
    if metrics.ledgers_closed > 0:
        metrics.avg_ledger_close_secs = elapsed / metrics.ledgers_closed

    sr = metrics.txs_success / max(metrics.txs_submitted, 1) * 100

    log(f"CYCLE {cycle_num} DONE | submitted={metrics.txs_submitted} success={sr:.1f}% "
        f"ledgers={metrics.ledgers_closed} peak_tps={metrics.peak_tps_observed:.1f} "
        f"avg_close={metrics.avg_ledger_close_secs:.2f}s validators={metrics.validator_count}")

    save_metrics()
    return metrics

# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    global log_fh

    log_fh = open(LOG_FILE, "a", buffering=1)
    log("=" * 60)
    log("qXRP 7-DAY PROGRESSIVE SURGE TEST STARTING")
    log(f"Cycle={CYCLE_SECONDS//3600}h  Peak={PEAK_TPS}tps  Pool={ACCOUNT_POOL}")
    log(f"Validator expansion: {[(d,l) for d,_,l in VALIDATOR_EXPANSION]}")
    log("=" * 60)

    # Write initial validators file
    write_validators_file(active_validators)

    # Load genesis wallet
    genesis_wallet = make_wallet(GENESIS_SEED)
    log(f"Genesis: {genesis_wallet.classic_address}")

    # Fund initial account pool
    fund_initial_pool(ACCOUNT_POOL)

    start_epoch = time.monotonic()
    TEST_DURATION_DAYS = 7
    TEST_DURATION_SECS = TEST_DURATION_DAYS * 86400

    cycle_num   = 0
    cycles_done = 0

    # How many full 4h cycles fit in 7 days
    total_cycles = TEST_DURATION_SECS // CYCLE_SECONDS
    log(f"Total cycles: {total_cycles} ({TEST_DURATION_DAYS} days / {CYCLE_SECONDS//3600}h)")

    while not _shutdown:
        elapsed     = time.monotonic() - start_epoch
        elapsed_days = elapsed / 86400

        if elapsed >= TEST_DURATION_SECS:
            log("7-DAY TEST COMPLETE")
            break

        # Check validator expansion
        check_validator_expansion(elapsed_days)

        cycle_num += 1
        cycle_start = time.monotonic()

        try:
            metrics = run_cycle(cycle_num, elapsed_days, genesis_wallet)
            cycles_done += 1
        except Exception as e:
            log(f"Cycle {cycle_num} exception: {e}", "ERROR")
            import traceback
            log(traceback.format_exc(), "ERROR")
            time.sleep(30)
            continue

        # Sleep for any remaining time in the cycle window
        cycle_elapsed = time.monotonic() - cycle_start
        remaining     = CYCLE_SECONDS - cycle_elapsed
        if remaining > 0 and not _shutdown:
            log(f"Cycle {cycle_num} finished early, sleeping {remaining:.0f}s until next cycle")
            # Sleep in chunks so we can react to shutdown
            slept = 0
            while slept < remaining and not _shutdown:
                chunk = min(60, remaining - slept)
                time.sleep(chunk)
                slept += chunk

    # Final summary
    log("=" * 60)
    log(f"TEST FINISHED | total_cycles={cycles_done}")
    if all_metrics:
        total_tx   = sum(m.txs_submitted for m in all_metrics)
        total_ok   = sum(m.txs_success   for m in all_metrics)
        peak_ever  = max(m.peak_tps_observed for m in all_metrics)
        log(f"Total TX submitted : {total_tx:,}")
        log(f"Total TX success   : {total_ok:,}  ({total_ok/max(total_tx,1)*100:.1f}%)")
        log(f"Peak TPS observed  : {peak_ever:.1f}")
        log(f"Final validators   : {len(active_validators)}")
    save_metrics()
    log("=" * 60)

    if log_fh:
        log_fh.close()

if __name__ == "__main__":
    main()
