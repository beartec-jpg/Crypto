#!/usr/bin/env python3
"""
QBTC 72-hour Surge Test Runner
================================
Manages 30 test wallets across 3 nodes.
Cycle: 4 hours (1hr SURGE @ 1 tx/30s/wallet + 3hr normal @ 1 tx/180s/wallet)
18 cycles × 4hr = 72 hours total.

Deploy to N1:  scp runner.py root@89.167.109.241:/root/surge_test/
Run on N1:     nohup python3 /root/surge_test/runner.py > /root/surge_test/runner.out 2>&1 &
"""

import asyncio
import base64
import json
import logging
import random
import signal
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path("/root/surge_test")
LOG_DIR  = BASE_DIR / "logs"
WALLETS_FILE = BASE_DIR / "wallets.json"
STATE_FILE   = BASE_DIR / "state.json"

NODES = {
    "N1": {"host": "127.0.0.1",    "port": 28332, "user": "qbtcverify", "pw": "verify_node3_2026"},
    "N2": {"host": "46.62.156.169", "port": 28332, "user": "qbtcseed",   "pw": "seednode1_rpc_2026"},
    "N3": {"host": "37.27.47.236",  "port": 28332, "user": "qbtcseed",   "pw": "seednode2_rpc_2026"},
}
MINER_NODE   = "N1"
MINER_WALLET = "miner"

TEST_DURATION_SEC   = 72 * 3600   # 72 hours total
SURGE_CYCLE_SEC     =  4 * 3600   # 4-hour cycles
SURGE_DURATION_SEC  =  1 * 3600   # 1hr surge per cycle
SURGE_TX_INTERVAL   = 30          # seconds between txs per wallet during SURGE
NORMAL_TX_INTERVAL  = 180         # seconds between txs per wallet during normal
TX_AMOUNT           = 0.001       # QBTC per transaction
TOPUP_THRESHOLD     = 0.50        # QBTC; top up wallet below this
TOPUP_AMOUNT        = 2.00        # QBTC; amount to top up with
TOPUP_CHECK_SEC     = 300         # check balances every 5 minutes
MONITOR_INTERVAL    = 60          # stats snapshot every 60 seconds
CROSS_NODE_BIAS     = 0.70        # probability of cross-node tx

# ── Logging ────────────────────────────────────────────────────────────────────
LOG_DIR.mkdir(parents=True, exist_ok=True)
_ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
_log_file = LOG_DIR / f"runner_{_ts}.log"
_csv_file  = LOG_DIR / f"stats_{_ts}.csv"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
    handlers=[logging.FileHandler(_log_file), logging.StreamHandler()],
)
log = logging.getLogger("surge")

_csv_header_done = False

def csv_write(row: dict) -> None:
    global _csv_header_done
    with open(_csv_file, "a") as f:
        if not _csv_header_done:
            f.write(",".join(row.keys()) + "\n")
            _csv_header_done = True
        f.write(",".join(str(v) for v in row.values()) + "\n")

# ── Counters (in-process, no locks needed in asyncio) ─────────────────────────
sent_ok   = 0
sent_fail = 0
topups    = 0

# ── RPC ────────────────────────────────────────────────────────────────────────
def _rpc_sync(node_name: str, method: str, params: list, wallet: Optional[str]) -> object:
    node = NODES[node_name]
    url  = f"http://{node['host']}:{node['port']}/"
    if wallet:
        url += f"wallet/{wallet}"
    payload = json.dumps({"jsonrpc": "1.0", "id": "surge", "method": method, "params": params})
    creds   = base64.b64encode(f"{node['user']}:{node['pw']}".encode()).decode()
    req = urllib.request.Request(
        url, data=payload.encode(),
        headers={"Content-Type": "text/plain", "Authorization": f"Basic {creds}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())
    if result.get("error"):
        raise RuntimeError(f"RPC {method}: {result['error']}")
    return result["result"]

async def rpc(node_name: str, method: str, params: list = None, wallet: Optional[str] = None) -> object:
    if params is None:
        params = []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _rpc_sync, node_name, method, params, wallet)

# ── Phase ──────────────────────────────────────────────────────────────────────
def phase_info(start: float) -> tuple[bool, float]:
    """Returns (is_surge, seconds_remaining_in_current_phase)."""
    elapsed      = time.monotonic() - start
    pos_in_cycle = elapsed % SURGE_CYCLE_SEC
    if pos_in_cycle < SURGE_DURATION_SEC:
        return True,  SURGE_DURATION_SEC - pos_in_cycle
    else:
        return False, SURGE_CYCLE_SEC - pos_in_cycle

# ── Wallet sender ─────────────────────────────────────────────────────────────
async def wallet_sender(
    wallet: dict,
    all_wallets: list,
    start: float,
    stop: asyncio.Event,
) -> None:
    wid  = wallet["id"]
    node = wallet["node"]
    wname = wallet["wallet_name"]
    global sent_ok, sent_fail

    # Stagger initial launch to spread load
    await asyncio.sleep(random.uniform(0, min(NORMAL_TX_INTERVAL, 60)))

    consecutive_fails = 0

    while not stop.is_set():
        surge, phase_rem = phase_info(start)
        interval = SURGE_TX_INTERVAL if surge else NORMAL_TX_INTERVAL

        # Choose destination (prefer cross-node)
        others     = [w for w in all_wallets if w["id"] != wid]
        cross      = [w for w in others if w["node"] != node]
        dest = (
            random.choice(cross)  if cross and random.random() < CROSS_NODE_BIAS
            else random.choice(others)
        )

        try:
            txid = await rpc(node, "sendtoaddress", [dest["address"], TX_AMOUNT], wallet=wname)
            sent_ok += 1
            consecutive_fails = 0
            log.info("TX %-5s %s→%s  txid=%.12s…  ok=%d",
                     "SURGE" if surge else "norm", wid, dest["id"], txid, sent_ok)
        except Exception as exc:
            sent_fail += 1
            consecutive_fails += 1
            log.warning("TX FAIL %s: %s (fail#%d)", wid, exc, consecutive_fails)
            if consecutive_fails >= 5:
                log.error("Wallet %s: 5 consecutive failures, pausing 60s", wid)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=60)
                except asyncio.TimeoutError:
                    pass
                consecutive_fails = 0
                continue

        # Sleep until next tx; wake early if the phase changes
        sleep_for = min(interval, phase_rem + 1.0)
        try:
            await asyncio.wait_for(stop.wait(), timeout=sleep_for)
        except asyncio.TimeoutError:
            pass

# ── Top-up task ────────────────────────────────────────────────────────────────
async def topup_task(wallets: list, stop: asyncio.Event) -> None:
    global topups
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=TOPUP_CHECK_SEC)
        except asyncio.TimeoutError:
            pass
        if stop.is_set():
            break
        for w in wallets:
            try:
                bal = await rpc(w["node"], "getbalance", [], wallet=w["wallet_name"])
                if bal < TOPUP_THRESHOLD:
                    txid = await rpc(
                        MINER_NODE, "sendtoaddress",
                        [w["address"], TOPUP_AMOUNT],
                        wallet=MINER_WALLET,
                    )
                    topups += 1
                    log.info("TOPUP %s  bal=%.4f → sent %.2f QBTC  txid=%.12s…",
                             w["id"], bal, TOPUP_AMOUNT, txid)
            except Exception as exc:
                log.warning("Topup check failed for %s: %s", w["id"], exc)

# ── Monitor task ───────────────────────────────────────────────────────────────
async def monitor_task(start: float, wallets: list, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            surge, phase_rem = phase_info(start)
            elapsed = time.monotonic() - start

            chain   = await rpc("N1", "getblockchaininfo")
            tips    = await rpc("N1", "getchaintips")
            mempool = await rpc("N1", "getmempoolinfo")
            mining  = await rpc("N1", "getmininginfo")
            tc      = Counter(t["status"] for t in tips)

            row = {
                "ts":              datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "elapsed_hr":      round(elapsed / 3600, 3),
                "phase":           "SURGE" if surge else "normal",
                "phase_rem_min":   round(phase_rem / 60, 1),
                "height":          chain["blocks"],
                "tips_active":     tc.get("active", 0),
                "tips_valid_hdr":  tc.get("valid-headers", 0),
                "tips_valid_fork": tc.get("valid-fork", 0),
                "mempool_tx":      mempool["size"],
                "mempool_kb":      round(mempool["bytes"] / 1024, 1),
                "nethash_ths":     round(mining.get("networkhashps", 0) / 1e12, 4),
                "difficulty":      round(mining.get("difficulty", 0), 2),
                "sent_ok":         sent_ok,
                "sent_fail":       sent_fail,
                "topups":          topups,
            }
            csv_write(row)
            log.info(
                "STATS h=%-5d phase=%-6s(%-4.0fmin) tips=%s mempool=%dtx "
                "nethash=%.4fTH/s sent=%d fail=%d topups=%d",
                row["height"], row["phase"], phase_rem / 60, dict(tc),
                row["mempool_tx"], row["nethash_ths"],
                sent_ok, sent_fail, topups,
            )
            # Write live status
            STATE_FILE.write_text(json.dumps(
                {**row, "wallets": len(wallets), "log": str(_log_file)},
                indent=2,
            ))
        except Exception as exc:
            log.warning("Monitor error: %s", exc)

        try:
            await asyncio.wait_for(stop.wait(), timeout=MONITOR_INTERVAL)
        except asyncio.TimeoutError:
            pass

# ── Entry point ────────────────────────────────────────────────────────────────
async def main() -> None:
    if not WALLETS_FILE.exists():
        log.error("wallets.json not found at %s — run setup.sh first", WALLETS_FILE)
        sys.exit(1)

    wallets = json.loads(WALLETS_FILE.read_text())
    log.info("Loaded %d wallets", len(wallets))

    start = time.monotonic()
    stop  = asyncio.Event()
    loop  = asyncio.get_event_loop()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: stop.set())

    async def watchdog() -> None:
        """Stop after TEST_DURATION_SEC."""
        try:
            await asyncio.wait_for(stop.wait(), timeout=TEST_DURATION_SEC)
        except asyncio.TimeoutError:
            log.info("72-hour test complete — shutting down.")
            stop.set()

    log.info("=" * 60)
    log.info("QBTC 72-hour Surge Test starting")
    log.info("  Wallets   : %d (%d nodes × %d each)",
             len(wallets), len(NODES), len(wallets) // len(NODES))
    log.info("  Cycle     : %dhr surge + %dhr normal = %dhr cycle",
             SURGE_DURATION_SEC // 3600,
             (SURGE_CYCLE_SEC - SURGE_DURATION_SEC) // 3600,
             SURGE_CYCLE_SEC // 3600)
    log.info("  TX rate   : surge=1/%ds  normal=1/%ds per wallet",
             SURGE_TX_INTERVAL, NORMAL_TX_INTERVAL)
    log.info("  TX amount : %.3f QBTC  topup_at=%.2f QBTC",
             TX_AMOUNT, TOPUP_THRESHOLD)
    log.info("  Log       : %s", _log_file)
    log.info("  Stats CSV : %s", _csv_file)
    log.info("=" * 60)

    tasks = [
        asyncio.create_task(watchdog()),
        asyncio.create_task(monitor_task(start, wallets, stop)),
        asyncio.create_task(topup_task(wallets, stop)),
        *[asyncio.create_task(wallet_sender(w, wallets, start, stop)) for w in wallets],
    ]

    await stop.wait()
    log.info("Stopping %d tasks...", len(tasks))
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    log.info("Runner stopped. sent_ok=%d sent_fail=%d topups=%d", sent_ok, sent_fail, topups)


if __name__ == "__main__":
    asyncio.run(main())
