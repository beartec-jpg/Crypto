#!/usr/bin/env python3
"""
qXRP Extended TX Ramp Stress Test
==================================
Sends escalating waves of Payment transactions to the 3-node testnet,
measuring TPS, ledger close time, fee escalation, queue depth, and
chain storage growth at every stage.

Ramp profile (configurable at bottom):
  WARMUP   →  5  tx/ledger  ×  10 ledgers
  RAMP-1   →  20 tx/ledger  ×  20 ledgers
  RAMP-2   →  50 tx/ledger  ×  20 ledgers
  RAMP-3   → 100 tx/ledger  ×  20 ledgers
  BURST    → 300 tx/ledger  ×  10 ledgers  (saturates queue)
  COOLDOWN →   0 tx/ledger  ×  15 ledgers  (drain + measure recovery)

Each stage records: achieved TPS, avg/max converge time, fee growth,
queue high-water mark, chain storage delta.

Report written to: /opt/qxrp/RAMP_TEST_REPORT.md
Run on the server: python3 /tmp/qxrp_ramp_test.py
"""

import json, time, secrets, sys, statistics, os, subprocess
from datetime import datetime, timezone
import urllib.request, urllib.error
from collections import deque

# ─── CONFIG ────────────────────────────────────────────────────────────────────
PORTS         = [5005, 5006, 5007]
PRIMARY       = 5005
GENESIS_SEC   = "masterpassphrase"
GENESIS_ACCT  = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
DROPS_PER_XRP = 1_000_000
TX_FEE        = 12        # base fee drops
FUND_PER_ACCT = 200 * DROPS_PER_XRP   # 200 qXRP per wave account
REPORT_FILE   = "/opt/qxrp/RAMP_TEST_REPORT.md"

# Ramp stages: (label, tx_per_ledger, num_ledgers, pause_between_ledgers_s)
RAMP_STAGES = [
    ("warmup",   5,   10, 4),
    ("ramp_1",   20,  20, 4),
    ("ramp_2",   50,  20, 4),
    ("ramp_3",   100, 20, 4),
    ("burst",    300, 10, 4),
    ("cooldown", 0,   15, 4),
]

# Wave accounts — created once at startup
WAVE_ACCOUNTS_N = 60   # enough for burst bursts; cycled round-robin

# ─── HELPERS ───────────────────────────────────────────────────────────────────
def log(msg, level="INFO"):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    icons = {"INFO": "  ", "OK": "✓ ", "WARN": "⚠ ", "FAIL": "✗ ", "HEAD": "══", "STAT": "📊"}
    print(f"[{ts}] {icons.get(level,'  ')}{msg}", flush=True)


def rpc(port, method, params=None, timeout=10):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"method": method, "params": [params or {}]}).encode()
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def submit(port, tx_json, secret):
    return rpc(port, "submit", {"tx_json": tx_json, "secret": secret})["result"]


def server_info(port=PRIMARY):
    return rpc(port, "server_info")["result"]["info"]


def current_ledger(port=PRIMARY):
    return server_info(port).get("validated_ledger", {}).get("seq", 0)


def wait_for_ledger(target_seq: int, port=PRIMARY, timeout_s=60):
    """Block until validated ledger >= target_seq."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if current_ledger(port) >= target_seq:
            return True
        time.sleep(0.5)
    return False


def get_seq(port, account):
    r = rpc(port, "account_info", {"account": account, "ledger_index": "current"})
    return r["result"]["account_data"]["Sequence"]


def chain_storage_mb():
    """Sum nudb+db bytes for all 3 nodes."""
    total = 0
    for lbl in ("node1", "node2", "node3"):
        for sub in ("nudb", "db"):
            d = f"/var/lib/qxrp/{lbl}/{sub}"
            try:
                out = subprocess.check_output(["du","-sb",d], stderr=subprocess.DEVNULL, timeout=3)
                total += int(out.split()[0])
            except Exception:
                pass
    return total / 1_048_576


def fee_info(port=PRIMARY):
    r = rpc(port, "fee")
    d = r.get("drops", {})
    return {
        "base":     int(d.get("base_fee", 0)),
        "ol_fee":   int(d.get("open_ledger_fee", 0)),
        "median":   int(d.get("median_fee", 0)),
        "queue_sz": int(r.get("current_queue_size", 0)),
        "queue_max":int(r.get("max_queue_size", 10000)),
    }


def ledger_tx_count(port=PRIMARY):
    """Number of transactions in the latest validated ledger."""
    r = rpc(port, "ledger", {"ledger_index": "validated", "transactions": True, "expand": False})
    return len(r.get("ledger", {}).get("transactions", []))


def converge_time(port=PRIMARY):
    info = server_info(port)
    return info.get("last_close", {}).get("converge_time_s", 0)


# ─── ACCOUNT POOL ──────────────────────────────────────────────────────────────
class AccountPool:
    def __init__(self):
        self.accounts = []   # list of {addr, seed, seq}
        self._idx = 0

    def create(self, n: int):
        log(f"  Creating {n} wave accounts from genesis...", "INFO")
        genesis_seq = get_seq(PRIMARY, GENESIS_ACCT)
        batch_hashes = []
        for i in range(n):
            passphrase = f"qxrpramp{i:05d}x{secrets.token_hex(4)}"
            wp = rpc(PRIMARY, "wallet_propose", {"passphrase": passphrase, "key_type": "secp256k1"})["result"]
            addr = wp.get("account_id") or wp.get("accountID", "")
            seed = wp.get("master_seed", passphrase)
            if not addr:
                log(f"  wallet_propose failed slot {i}", "WARN")
                continue
            r = submit(PRIMARY, {
                "TransactionType": "Payment", "Account": GENESIS_ACCT,
                "Destination": addr, "Amount": str(FUND_PER_ACCT),
                "Fee": str(TX_FEE), "Sequence": genesis_seq,
            }, GENESIS_SEC)
            eng = r.get("engine_result","?")
            if eng not in ("tesSUCCESS","terQUEUED"):
                log(f"  fund {i} failed: {eng}", "WARN")
                continue
            batch_hashes.append(r.get("tx_json",{}).get("hash",""))
            genesis_seq += 1
            self.accounts.append({"addr": addr, "seed": seed, "seq": None})
            if (i+1) % 10 == 0:
                log(f"  ... {i+1}/{n} funded", "INFO")

        log(f"  Waiting for {len(self.accounts)} accounts to land...", "INFO")
        time.sleep(20)

        # Populate sequence numbers
        ok = 0
        for a in self.accounts:
            try:
                a["seq"] = get_seq(PRIMARY, a["addr"])
                ok += 1
            except Exception:
                a["seq"] = 1
        log(f"  {ok}/{len(self.accounts)} accounts ready with seq", "OK")

    def next(self):
        if not self.accounts:
            return None
        a = self.accounts[self._idx % len(self.accounts)]
        self._idx += 1
        return a


# ─── RAMP STAGE ENGINE ─────────────────────────────────────────────────────────
def run_stage(label: str, tx_per_ledger: int, num_ledgers: int,
              pause_s: float, pool: AccountPool, stats_out: list):
    log(f"", "INFO")
    log(f"STAGE: {label.upper()}  tx/ledger={tx_per_ledger}  ledgers={num_ledgers}", "HEAD")

    stage_stats = {
        "label": label,
        "tx_per_ledger_target": tx_per_ledger,
        "num_ledgers": num_ledgers,
        "ledger_stats": [],
        "storage_start_mb": chain_storage_mb(),
    }

    converge_times = []
    queue_hwm      = 0
    fee_ol_peak    = 0
    tx_confirmed   = 0

    start_seq  = current_ledger()
    start_time = time.time()

    for ledger_i in range(num_ledgers):
        target_seq = start_seq + ledger_i + 1
        ledger_start = time.time()

        # Submit tx_per_ledger payments
        submitted_this_round = 0
        for _ in range(tx_per_ledger):
            sender = pool.next()
            if not sender:
                break
            # Bounce between all 3 nodes to spread load
            dest = pool.next()
            if not dest or dest["addr"] == sender["addr"]:
                dest = pool.accounts[0] if pool.accounts else None
            if not dest:
                continue
            port = PORTS[submitted_this_round % len(PORTS)]
            try:
                r = submit(port, {
                    "TransactionType": "Payment",
                    "Account": sender["addr"],
                    "Destination": dest["addr"],
                    "Amount": str(DROPS_PER_XRP),  # 1 qXRP
                    "Fee": str(TX_FEE),
                    "Sequence": sender["seq"],
                    "Flags": 0,
                }, sender["seed"])
                eng = r.get("engine_result", "?")
                if eng in ("tesSUCCESS", "terQUEUED"):
                    sender["seq"] = (sender["seq"] or 1) + 1
                    submitted_this_round += 1
                elif eng == "terPRE_SEQ":
                    # sequence drift — resync
                    try:
                        sender["seq"] = get_seq(port, sender["addr"])
                    except Exception:
                        pass
                elif eng in ("tefPAST_SEQ", "tefMAX_LEDGER"):
                    try:
                        sender["seq"] = get_seq(port, sender["addr"])
                    except Exception:
                        pass
            except Exception as e:
                log(f"  submit err: {e}", "WARN")

        # Wait for ledger to close
        closed = wait_for_ledger(target_seq, timeout_s=30)
        ledger_dur = time.time() - ledger_start

        # Gather post-ledger metrics
        try:
            ct   = converge_time()
            fi   = fee_info()
            txc  = ledger_tx_count()
            converge_times.append(ct)
            queue_hwm   = max(queue_hwm, fi["queue_sz"])
            fee_ol_peak = max(fee_ol_peak, fi["ol_fee"])
            tx_confirmed += txc

            stage_stats["ledger_stats"].append({
                "ledger": target_seq,
                "submitted": submitted_this_round,
                "confirmed": txc,
                "converge_s": ct,
                "queue": fi["queue_sz"],
                "ol_fee": fi["ol_fee"],
                "dur_s": round(ledger_dur, 2),
            })

            log(f"  L#{target_seq:>5}  sent={submitted_this_round:>3}  "
                f"confirmed={txc:>3}  converge={ct}s  "
                f"queue={fi['queue_sz']:>4}  ol_fee={fi['ol_fee']:>6} drops  "
                f"dur={ledger_dur:.1f}s")
        except Exception as e:
            log(f"  metrics err ledger {target_seq}: {e}", "WARN")

        remaining = pause_s - (time.time() - ledger_start)
        if remaining > 0:
            time.sleep(remaining)

    stage_end_time = time.time()
    elapsed = stage_end_time - start_time
    storage_end = chain_storage_mb()
    storage_delta = storage_end - stage_stats["storage_start_mb"]

    achieved_tps = tx_confirmed / elapsed if elapsed > 0 else 0
    avg_converge = statistics.mean(converge_times) if converge_times else 0
    max_converge = max(converge_times) if converge_times else 0

    stage_stats.update({
        "elapsed_s":       round(elapsed, 1),
        "tx_confirmed":    tx_confirmed,
        "achieved_tps":    round(achieved_tps, 3),
        "avg_converge_s":  round(avg_converge, 2),
        "max_converge_s":  max_converge,
        "queue_hwm":       queue_hwm,
        "fee_ol_peak_drops": fee_ol_peak,
        "storage_end_mb":  round(storage_end, 2),
        "storage_delta_mb":round(storage_delta, 3),
    })
    stats_out.append(stage_stats)

    log(f"  ── Stage {label} DONE ──", "STAT")
    log(f"     TPS={achieved_tps:.2f}  confirmed={tx_confirmed}  elapsed={elapsed:.0f}s", "STAT")
    log(f"     converge avg={avg_converge:.2f}s  max={max_converge}s", "STAT")
    log(f"     queue HWM={queue_hwm}  peak ol_fee={fee_ol_peak} drops", "STAT")
    log(f"     storage: {stage_stats['storage_start_mb']:.1f} → {storage_end:.1f} MB  (+{storage_delta:.2f} MB)", "STAT")

    return stage_stats


# ─── REPORT ────────────────────────────────────────────────────────────────────
def write_report(all_stages: list, pool: AccountPool):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        "# qXRP Extended TX Ramp — Test Report",
        f"Generated: {now}  |  Nodes: 3  |  Accounts: {len(pool.accounts)}",
        "",
        "## Summary",
        "",
        "| Stage | Target tx/L | Ledgers | Confirmed TX | Achieved TPS | Avg Converge | Max Converge | Queue HWM | Peak OL Fee | Storage Δ |",
        "|-------|------------|---------|-------------|-------------|-------------|-------------|-----------|------------|-----------|",
    ]
    for s in all_stages:
        lines.append(
            f"| {s['label']} | {s['tx_per_ledger_target']} | {s['num_ledgers']} | "
            f"{s['tx_confirmed']} | {s['achieved_tps']:.3f} | "
            f"{s['avg_converge_s']}s | {s['max_converge_s']}s | "
            f"{s['queue_hwm']} | {s['fee_ol_peak_drops']} drops | "
            f"+{s['storage_delta_mb']:.3f} MB |"
        )

    lines += ["", "## Per-Stage Details", ""]
    for s in all_stages:
        lines += [
            f"### {s['label'].upper()}",
            f"- Target: **{s['tx_per_ledger_target']} tx/ledger** × {s['num_ledgers']} ledgers",
            f"- Confirmed: **{s['tx_confirmed']} TX** in {s['elapsed_s']}s",
            f"- TPS: **{s['achieved_tps']:.3f}**",
            f"- Converge: avg {s['avg_converge_s']}s / max {s['max_converge_s']}s",
            f"- Queue HWM: {s['queue_hwm']} / peak open-ledger fee: {s['fee_ol_peak_drops']} drops",
            f"- Chain storage: {s['storage_start_mb']:.1f} → {s['storage_end_mb']:.1f} MB (+{s['storage_delta_mb']:.3f} MB)",
            "",
            "| Ledger | Sent | Confirmed | Converge | Queue | OL Fee | Dur |",
            "|--------|------|-----------|----------|-------|--------|-----|",
        ]
        for row in s.get("ledger_stats", []):
            lines.append(
                f"| #{row['ledger']} | {row['submitted']} | {row['confirmed']} | "
                f"{row['converge_s']}s | {row['queue']} | {row['ol_fee']} | {row['dur_s']}s |"
            )
        lines.append("")

    # Final network snapshot
    try:
        info = server_info()
        vl   = info.get("validated_ledger", {})
        lines += [
            "## Final Network Snapshot",
            f"- State: {info.get('server_state')}",
            f"- Validated ledger: #{vl.get('seq')}",
            f"- Peers: {info.get('peers')}",
            f"- Load factor: {info.get('load_factor')}",
            f"- IO latency: {info.get('io_latency_ms')}ms",
            f"- Total chain storage: {chain_storage_mb():.1f} MB",
        ]
    except Exception as e:
        lines.append(f"- Final snapshot error: {e}")

    content = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)
    with open(REPORT_FILE, "w") as f:
        f.write(content)
    log(f"Report written to {REPORT_FILE}", "OK")
    return content


# ─── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    log("qXRP Extended TX Ramp Test", "HEAD")
    log(f"Stages: {[s[0] for s in RAMP_STAGES]}")
    log(f"Started: {datetime.now(timezone.utc).isoformat()}")

    # Pre-flight: all nodes proposing
    log("\nPre-flight check...", "INFO")
    for port in PORTS:
        try:
            info = server_info(port)
            st = info.get("server_state","?")
            seq = info.get("validated_ledger",{}).get("seq",0)
            log(f"  port={port} state={st} ledger=#{seq}", "OK" if st=="proposing" else "FAIL")
        except Exception as e:
            log(f"  port={port} UNREACHABLE: {e}", "FAIL")
            sys.exit(1)

    # Create wave accounts
    pool = AccountPool()
    pool.create(WAVE_ACCOUNTS_N)

    if len(pool.accounts) < 10:
        log("Too few accounts created — aborting", "FAIL")
        sys.exit(1)

    log(f"\nStarting ramp with {len(pool.accounts)} accounts...", "INFO")
    storage_baseline = chain_storage_mb()
    log(f"Chain storage baseline: {storage_baseline:.1f} MB", "INFO")

    all_stages = []
    for label, tpl, nl, pause in RAMP_STAGES:
        try:
            run_stage(label, tpl, nl, pause, pool, all_stages)
        except KeyboardInterrupt:
            log("Interrupted by user — writing partial report", "WARN")
            break
        except Exception as e:
            log(f"Stage {label} error: {e}", "FAIL")
            import traceback; traceback.print_exc()

    # Final storage measurement
    final_storage = chain_storage_mb()
    total_delta = final_storage - storage_baseline
    log("", "INFO")
    log(f"TOTAL CHAIN GROWTH: {storage_baseline:.1f} → {final_storage:.1f} MB  (+{total_delta:.2f} MB)", "STAT")

    write_report(all_stages, pool)
    log("RAMP TEST COMPLETE", "OK")


if __name__ == "__main__":
    main()
