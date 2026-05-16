#!/usr/bin/env python3
"""
qXRP 1-Hour Surge Test
4 surges over ~60 minutes. Each surge ramps up to a peak, overshoots slightly,
then descends back to a baseline TPS between surges.

Surge peaks:  s1=120/L  s2=175/L  s3=200/L  s4=220/L
Overshoots:   s1=150/L  s2=210/L  s3=235/L  s4=260/L
Baseline:     5 tx/ledger

At ~2.5 s/ledger → total ≈ 60 min
"""

import json, time, random, sys, os, threading, statistics
from datetime import datetime, timezone
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import requests

try:
    from xrpl.wallet import Wallet
    from xrpl.core.binarycodec import encode, encode_for_signing
    from xrpl.core.keypairs import sign as kp_sign
except ImportError:
    print("ERROR: pip3 install xrpl-py --break-system-packages")
    sys.exit(1)

# ─── Config ───────────────────────────────────────────────────────────────────

NODES          = ["http://127.0.0.1:5005", "http://127.0.0.1:5006", "http://127.0.0.1:5007"]
GENESIS_ADDR   = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
GENESIS_SECRET = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb"
NETWORK_ID     = 999
BASE_FEE       = 12
FUND_DROPS     = 100_000_000   # 100 qXRP per wave account
SEND_DROPS     = 1_000         # 0.001 qXRP per test TX
NUM_ACCOUNTS   = 320           # 320 > max 260 tx/ledger, so each ledger uses distinct accounts
DEST_ADDR      = GENESIS_ADDR
LOG_FILE       = "/opt/qxrp/surge_test.log"
REPORT_FILE    = "/opt/qxrp/SURGE_TEST_REPORT.md"

# ─── Stage plan ───────────────────────────────────────────────────────────────
# (label, tx_per_ledger, num_ledgers)
# ~2.5 s/ledger  →  24 ledgers ≈ 1 min, 72 ≈ 3 min
STAGES = [
    # 3 min warm-up at baseline
    ("baseline_init",   5,   72),

    # ── Surge 1 — peak 120/L, overshoot 150/L ─────────────────────────────
    ("s1_ramp1",       20,   24),   # +1 min
    ("s1_ramp2",       50,   24),   # +1 min
    ("s1_ramp3",       90,   24),   # +1 min
    ("s1_peak",       120,   48),   # +2 min  ← PEAK 1
    ("s1_overshoot",  150,   24),   # +1 min  ← OVERSHOOT
    ("s1_down1",       70,   24),   # +1 min
    ("s1_down2",       20,   24),   # +1 min
    ("s1_down3",        5,   24),   # +1 min  (tail baseline)
    ("baseline_1",      5,   72),   # +3 min recovery

    # ── Surge 2 — peak 175/L, overshoot 210/L ─────────────────────────────
    ("s2_ramp1",       20,   24),
    ("s2_ramp2",       60,   24),
    ("s2_ramp3",      110,   24),
    ("s2_ramp4",      160,   24),
    ("s2_peak",       175,   48),   # ← PEAK 2
    ("s2_overshoot",  210,   24),   # ← OVERSHOOT
    ("s2_down1",      100,   24),
    ("s2_down2",       40,   24),
    ("s2_down3",        5,   24),
    ("baseline_2",      5,   72),   # recovery

    # ── Surge 3 — peak 200/L, overshoot 235/L ─────────────────────────────
    ("s3_ramp1",       30,   24),
    ("s3_ramp2",       80,   24),
    ("s3_ramp3",      140,   24),
    ("s3_ramp4",      190,   24),
    ("s3_peak",       200,   48),   # ← PEAK 3
    ("s3_overshoot",  235,   24),   # ← OVERSHOOT
    ("s3_down1",      120,   24),
    ("s3_down2",       50,   24),
    ("s3_down3",        5,   24),
    ("baseline_3",      5,   72),   # recovery

    # ── Surge 4 — peak 220/L, overshoot 260/L (max stress) ────────────────
    ("s4_ramp1",       30,   24),
    ("s4_ramp2",       80,   24),
    ("s4_ramp3",      150,   24),
    ("s4_ramp4",      200,   24),
    ("s4_peak",       220,   48),   # ← PEAK 4
    ("s4_overshoot",  260,   36),   # ← OVERSHOOT (1.5 min)
    ("s4_down1",      150,   24),
    ("s4_down2",       70,   24),
    ("s4_down3",       20,   24),
    ("s4_down4",        5,   24),

    # 7 min final cooldown
    ("final_baseline",  5,  168),
]

TOTAL_LEDGERS     = sum(n for _, _, n in STAGES)
MAX_TX_PER_LEDGER = max(t for _, t, _ in STAGES)

# ─── Globals ──────────────────────────────────────────────────────────────────

_node_idx    = 0
_nlock       = threading.Lock()
_seq_lock    = threading.Lock()
_log_lock    = threading.Lock()
account_seqs = {}   # addr -> next sequence number
all_metrics  = []   # list of per-ledger dicts

# ─── Utilities ────────────────────────────────────────────────────────────────

def log(msg):
    ts   = datetime.now(timezone.utc).strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with _log_lock:
        with open(LOG_FILE, "a") as fh:
            fh.write(line + "\n")


def rpc(method, params=None, node=None):
    global _node_idx
    if node is None:
        with _nlock:
            node = NODES[_node_idx % len(NODES)]
            _node_idx += 1
    try:
        r = requests.post(
            node,
            json={"method": method, "params": [params or {}]},
            timeout=5,
        )
        r.raise_for_status()
        return r.json().get("result", {})
    except Exception:
        return {}


def get_ledger_seq():
    for node in NODES:
        r = rpc("server_info", {}, node=node)
        seq = r.get("info", {}).get("validated_ledger", {}).get("seq")
        if seq:
            return int(seq)
    return 0


def wait_for_new_ledger(after_seq, timeout=15.0):
    """Block until validated_ledger.seq > after_seq. Returns new seq."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        cur = get_ledger_seq()
        if cur > after_seq:
            return cur
        time.sleep(0.15)
    return get_ledger_seq()


def get_account_seq(addr):
    r = rpc("account_info", {"account": addr, "ledger_index": "current"})
    return int(r.get("account_data", {}).get("Sequence", 0))


def get_fee():
    r = rpc("fee", {})
    val = r.get("drops", {}).get("minimum_fee", BASE_FEE)
    return int(val)


def sign_payment(wallet, destination, drops, seq, last_ledger, fee):
    tx = {
        "TransactionType":    "Payment",
        "Account":            wallet.classic_address,
        "Destination":        destination,
        "Amount":             str(int(drops)),
        "Fee":                str(int(fee)),
        "Sequence":           int(seq),
        "LastLedgerSequence": int(last_ledger),
        "Flags":              0,
        "SigningPubKey":      wallet.public_key.upper(),
        "TxnSignature":       "",
    }
    # NetworkID only required when > 1024 for signing hash
    if NETWORK_ID > 1024:
        tx["NetworkID"] = NETWORK_ID
    sig = kp_sign(encode_for_signing(tx), wallet.private_key)
    tx["TxnSignature"] = sig
    return encode(tx)


def submit_blob(tx_blob):
    r = rpc("submit", {"tx_blob": tx_blob})
    return r.get("engine_result", ""), r.get("tx_json", {}).get("hash", "")


# ─── Funding ──────────────────────────────────────────────────────────────────

def fund_accounts(wallets):
    log(f"Funding {len(wallets)} wave accounts @ 100 qXRP each...")
    genesis  = Wallet.from_seed(GENESIS_SECRET, algorithm="secp256k1")
    gen_seq  = get_account_seq(GENESIS_ADDR)
    fee      = get_fee()
    batch_sz = 40
    total_ok = 0

    for b_start in range(0, len(wallets), batch_sz):
        batch      = wallets[b_start : b_start + batch_sz]
        cur_ledger = get_ledger_seq()
        last_l     = cur_ledger + 80
        blobs      = []

        for w in batch:
            blob = sign_payment(genesis, w.classic_address,
                                FUND_DROPS, gen_seq, last_l, fee)
            gen_seq += 1
            blobs.append(blob)

        ok = 0
        with ThreadPoolExecutor(max_workers=20) as ex:
            for eng, _ in ex.map(submit_blob, blobs):
                if eng in ("tesSUCCESS", "terQUEUED"):
                    ok += 1

        total_ok += ok
        bn = b_start // batch_sz + 1
        nb = (len(wallets) + batch_sz - 1) // batch_sz
        log(f"  Funding batch {bn}/{nb}: {ok}/{len(batch)} accepted")

        # Wait one ledger between batches so nodes can process
        wait_for_new_ledger(cur_ledger, timeout=12)
        fee = get_fee()

    # Wait 3 ledger closes for confirms
    log("Waiting 3 ledgers for funding confirmations...")
    cl = get_ledger_seq()
    wait_for_new_ledger(cl + 2, timeout=30)

    # Collect initial sequences
    confirmed = 0
    for w in wallets:
        seq = get_account_seq(w.classic_address)
        if seq > 0:
            account_seqs[w.classic_address] = seq
            confirmed += 1

    log(f"Funded & confirmed: {confirmed}/{len(wallets)}")
    return confirmed


# ─── Stage runner ─────────────────────────────────────────────────────────────

def run_stage(label, tx_per_ledger, num_ledgers, wallets, fee):
    n      = len(wallets)
    prev_L = get_ledger_seq()

    for i in range(num_ledgers):
        # ── Wait for next ledger ─────────────────────────────────────────
        t0      = time.monotonic()
        cur_L   = wait_for_new_ledger(prev_L, timeout=15)
        last_l  = cur_L + 12

        # ── Build & sign TX batch ─────────────────────────────────────────
        blobs = []
        with _seq_lock:
            for j in range(tx_per_ledger):
                idx  = (i * tx_per_ledger + j) % n
                w    = wallets[idx]
                addr = w.classic_address
                seq  = account_seqs.get(addr, 0)
                if seq == 0:
                    continue
                try:
                    blob = sign_payment(w, DEST_ADDR, SEND_DROPS, seq, last_l, fee)
                    account_seqs[addr] = seq + 1
                    blobs.append(blob)
                except Exception as e:
                    log(f"  sign error @ {addr}: {e}")

        if not blobs:
            prev_L = cur_L
            continue

        # ── Submit in parallel ────────────────────────────────────────────
        accepted = 0
        with ThreadPoolExecutor(max_workers=min(len(blobs), 64)) as ex:
            for eng, _ in ex.map(submit_blob, blobs):
                if eng in ("tesSUCCESS", "terQUEUED"):
                    accepted += 1

        t_submit = time.monotonic() - t0

        # ── Wait for ledger close (converge measurement) ──────────────────
        wait_for_new_ledger(cur_L, timeout=12)
        t_conv = time.monotonic() - t0

        m = {
            "ledger":     cur_L,
            "stage":      label,
            "target":     tx_per_ledger,
            "submitted":  len(blobs),
            "accepted":   accepted,
            "submit_ms":  round(t_submit * 1000),
            "converge_s": round(t_conv, 2),
            "fee":        fee,
        }
        all_metrics.append(m)

        # Progress log every 24 ledgers (~1 min)
        if i % 24 == 23:
            elapsed_min = (time.monotonic()) / 60
            log(f"    {label} [{i+1}/{num_ledgers}] "
                f"sub={len(blobs)} acc={accepted} conv={t_conv:.2f}s fee={fee}")

        prev_L = cur_L

        # Refresh fee every 20 ledgers
        if i % 20 == 19:
            fee = get_fee()

    return fee   # return updated fee for next stage


# ─── Report ───────────────────────────────────────────────────────────────────

def generate_report(start_dt, end_dt, wallets):
    elapsed_min    = (end_dt - start_dt).total_seconds() / 60
    total_sub      = sum(m["submitted"] for m in all_metrics)
    total_acc      = sum(m["accepted"]  for m in all_metrics)
    peak_sub       = max((m["submitted"] for m in all_metrics), default=0)
    peak_ledger    = next((m["ledger"] for m in all_metrics
                           if m["submitted"] == peak_sub), 0)
    avg_conv       = statistics.mean(m["converge_s"] for m in all_metrics) if all_metrics else 0
    max_conv       = max((m["converge_s"] for m in all_metrics), default=0)
    accept_pct     = 100 * total_acc // max(total_sub, 1)

    # Per-stage aggregation (preserve insertion order)
    stage_rows = {}
    for m in all_metrics:
        s = m["stage"]
        if s not in stage_rows:
            stage_rows[s] = {"target": m["target"], "sub": 0, "acc": 0,
                             "conv": [], "fees": []}
        stage_rows[s]["sub"]  += m["submitted"]
        stage_rows[s]["acc"]  += m["accepted"]
        stage_rows[s]["conv"].append(m["converge_s"])
        stage_rows[s]["fees"].append(m["fee"])

    # ASCII chart — one bar per metric entry, height = submitted, width = 70 cols
    chart_w = min(70, len(all_metrics))
    sample  = all_metrics[:chart_w]
    peak_v  = max((m["submitted"] for m in sample), default=1)
    H       = 10
    chart   = []
    for row in range(H, 0, -1):
        thresh = peak_v * row // H
        chart.append(f"{thresh:4d} │" +
                     "".join("█" if m["submitted"] >= thresh else " " for m in sample))
    chart.append("     └" + "─" * chart_w)
    chart.append("      ← first " + str(chart_w) + " ledger snapshots →")

    # Build report
    lines = [
        "# qXRP 1-Hour Surge Test Report",
        "",
        f"**Start:**    {start_dt.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"**End:**      {end_dt.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"**Duration:** {elapsed_min:.1f} min",
        f"**Accounts:** {len(wallets)}",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Total submitted | {total_sub:,} |",
        f"| Total accepted  | {total_acc:,} |",
        f"| Accept rate     | {accept_pct}% |",
        f"| Peak tx/ledger  | {peak_sub} @ ledger #{peak_ledger} |",
        f"| Avg converge    | {avg_conv:.2f}s |",
        f"| Max converge    | {max_conv:.2f}s |",
        "",
        "## TX Throughput Profile",
        "```",
    ] + chart + [
        "```",
        "",
        "## Per-Stage Results",
        "",
        "| Stage | tx/L | Submitted | Accepted | Avg Conv | Max Fee |",
        "|---|---|---|---|---|---|",
    ]

    for stage, d in stage_rows.items():
        avg_c   = statistics.mean(d["conv"]) if d["conv"] else 0
        max_fee = max(d["fees"]) if d["fees"] else 0
        lines.append(f"| {stage} | {d['target']} | {d['sub']:,} | "
                     f"{d['acc']:,} | {avg_c:.2f}s | {max_fee} |")

    lines += [
        "",
        "## Per-Ledger Detail (first 200)",
        "",
        "| # | Ledger | Stage | Target | Submitted | Accepted | Submit ms | Converge s | Fee |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for i, m in enumerate(all_metrics[:200]):
        lines.append(f"| {i+1} | {m['ledger']} | {m['stage']} | {m['target']} | "
                     f"{m['submitted']} | {m['accepted']} | "
                     f"{m['submit_ms']} | {m['converge_s']} | {m['fee']} |")

    with open(REPORT_FILE, "w") as fh:
        fh.write("\n".join(lines))
    log(f"Report → {REPORT_FILE}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    t0_wall   = time.monotonic()
    start_dt  = datetime.now(timezone.utc)

    log("=" * 66)
    log("qXRP 1-Hour Surge Test")
    log(f"  Start:         {start_dt.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    log(f"  Stages:        {len(STAGES)}")
    log(f"  Total ledgers: {TOTAL_LEDGERS}  (~{TOTAL_LEDGERS * 2.5 / 60:.0f} min)")
    log(f"  Max tx/ledger: {MAX_TX_PER_LEDGER}")
    log(f"  Wave accounts: {NUM_ACCOUNTS}")
    log(f"  Surge peaks:   120 → 175 → 200 → 220  (overshoots: 150/210/235/260)")
    log("=" * 66)

    seq = get_ledger_seq()
    if not seq:
        log("ERROR: no node reachable")
        sys.exit(1)
    log(f"Chain live @ ledger #{seq}")

    # ── Generate wave wallets & fund ──────────────────────────────────────
    log(f"\n── Wallet setup ──────────────────────────────────────────────")
    wallets   = [Wallet.create() for _ in range(NUM_ACCOUNTS)]
    confirmed = fund_accounts(wallets)
    if confirmed < MAX_TX_PER_LEDGER:
        log(f"WARNING: only {confirmed} funded < {MAX_TX_PER_LEDGER} needed at peak")

    # ── Run stages ────────────────────────────────────────────────────────
    log(f"\n── Surge test @ ledger {get_ledger_seq()} ──────────────────────────")
    fee = get_fee()

    for idx, (label, tx_per_ledger, num_ledgers) in enumerate(STAGES):
        elapsed = (time.monotonic() - t0_wall) / 60
        log(f"\n[{idx+1:02d}/{len(STAGES)}] {label:22s}  "
            f"tx/L={tx_per_ledger:4d}  ledgers={num_ledgers:4d}  "
            f"elapsed={elapsed:.1f}min")

        fee = run_stage(label, tx_per_ledger, num_ledgers, wallets, fee)

        # Stage summary
        stage_m = [m for m in all_metrics if m["stage"] == label]
        if stage_m:
            sub  = sum(m["submitted"] for m in stage_m)
            acc  = sum(m["accepted"]  for m in stage_m)
            avgc = statistics.mean(m["converge_s"] for m in stage_m)
            log(f"  ✓ {sub:,} submitted  {acc:,} accepted  conv_avg={avgc:.2f}s")

    # ── Report ────────────────────────────────────────────────────────────
    end_dt    = datetime.now(timezone.utc)
    total_min = (time.monotonic() - t0_wall) / 60
    log("\n" + "=" * 66)
    log(f"Surge test complete in {total_min:.1f} minutes")
    log(f"Total submitted: {sum(m['submitted'] for m in all_metrics):,}")
    log(f"Total accepted:  {sum(m['accepted']  for m in all_metrics):,}")
    generate_report(start_dt, end_dt, wallets)


if __name__ == "__main__":
    main()
