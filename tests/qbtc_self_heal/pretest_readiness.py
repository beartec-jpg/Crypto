#!/usr/bin/env python3
"""
Pre-test readiness checker for QBTC stress/ramp launches.

Checks:
1) Self-heal daemon is running.
2) Gate passes consistently for N consecutive attempts.
3) Required wallet counts exist per node/prefix.
4) Required wallet balances are confirmed (trusted >= target balance).
5) Reports pending balances so launch can be delayed until settled.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Any, List, Tuple


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "tests" / "qbtc_self_heal" / "config.json"
GATE_SCRIPT = REPO_ROOT / "tests" / "qbtc_self_heal" / "preflight_gate.py"


def run(cmd: str, timeout: int = 90) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)


def ssh(host: str, password: str, remote_cmd: str, timeout: int = 90) -> subprocess.CompletedProcess:
    cmd = (
        f"sshpass -p {shlex.quote(password)} ssh -o StrictHostKeyChecking=no "
        f"root@{host} {shlex.quote(remote_cmd)}"
    )
    return run(cmd, timeout=timeout)


def read_cfg(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def self_heal_alive() -> bool:
    pid_file = Path("/tmp/qbtc_self_heal.pid")
    if not pid_file.exists():
        return False
    try:
        pid = int(pid_file.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def gate_pass_stable(config_path: Path, python_cmd: str, attempts: int, interval: int) -> Tuple[bool, List[str]]:
    logs: List[str] = []
    for i in range(1, attempts + 1):
        cmd = (
            f"{python_cmd} {shlex.quote(str(GATE_SCRIPT))} "
            f"--config {shlex.quote(str(config_path))} --nodes N2,N3,N4"
        )
        res = run(cmd, timeout=120)
        out = (res.stdout or "").strip()
        logs.append(f"attempt={i} rc={res.returncode}\n{out}")
        if res.returncode != 0:
            return False, logs
        if i < attempts:
            time.sleep(interval)
    return True, logs


def list_wallet_dirs(node: Dict[str, Any], prefix: str) -> List[str]:
    cmd = (
        "python3 - <<'PY'\n"
        "import os\n"
        "base='/root/.bitcoin/qbtctestnet/wallets'\n"
        f"pref={prefix!r}\n"
        "if not os.path.isdir(base):\n"
        "  print('')\n"
        "else:\n"
        "  xs=sorted([x for x in os.listdir(base) if x.startswith(pref)])\n"
        "  print('\\n'.join(xs))\n"
        "PY"
    )
    res = ssh(node["host"], node["ssh_password"], cmd, timeout=30)
    if res.returncode != 0:
        return []
    return [x.strip() for x in (res.stdout or "").splitlines() if x.strip()]


def get_all_wallet_balances(node: Dict[str, Any], chain: str, wallets: List[str]) -> Dict[str, Tuple[float, float, str]]:
    """Batch check all wallet balances in a single SSH call. Returns {wallet: (trusted, pending, err)}."""
    if not wallets:
        return {}
    cli = node["bitcoin_cli_path"]
    wallets_json = json.dumps(wallets)
    cmd = (
        "python3 - <<'PYEOF'\n"
        "import json,subprocess\n"
        f"cli_base={json.dumps(cli + ' -chain=' + chain)}\n"
        f"wallets={wallets_json}\n"
        "results={}\n"
        "for w in wallets:\n"
        "  lp=subprocess.run(cli_base+' loadwallet '+json.dumps(w),shell=True,text=True,capture_output=True)\n"
        "  p=subprocess.run(cli_base+' -rpcwallet='+json.dumps(w)+' getbalances',shell=True,text=True,capture_output=True)\n"
        "  if p.returncode!=0:\n"
        "    results[w]={'t':0.0,'p':0.0,'e':(p.stderr or p.stdout).strip()[:80]}\n"
        "  else:\n"
        "    try:\n"
        "      d=json.loads(p.stdout)\n"
        "      m=d.get('mine',{})\n"
        "      results[w]={'t':float(m.get('trusted',0.0)),'p':float(m.get('untrusted_pending',0.0)),'e':''}\n"
        "    except Exception as ex:\n"
        "      results[w]={'t':0.0,'p':0.0,'e':str(ex)[:80]}\n"
        "print(json.dumps(results))\n"
        "PYEOF"
    )
    res = ssh(node["host"], node["ssh_password"], cmd, timeout=max(60, len(wallets) * 3))
    if res.returncode != 0:
        err = (res.stderr or res.stdout or "ssh error").strip()[:120]
        return {w: (0.0, 0.0, err) for w in wallets}
    # Parse last JSON line from stdout
    lines = [l.strip() for l in (res.stdout or "").splitlines() if l.strip()]
    for line in reversed(lines):
        try:
            raw = json.loads(line)
            return {w: (float(raw[w]["t"]), float(raw[w]["p"]), raw[w]["e"]) for w in wallets if w in raw}
        except Exception:
            continue
    err = f"unparseable output: {lines[-1][:80] if lines else 'empty'}"
    return {w: (0.0, 0.0, err) for w in wallets}


def main() -> int:
    parser = argparse.ArgumentParser(description="QBTC pre-test readiness checker")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--python-cmd", default=sys.executable)
    parser.add_argument("--gate-attempts", type=int, default=3)
    parser.add_argument("--gate-interval", type=int, default=8)
    parser.add_argument("--stress-target", type=int, default=40)
    parser.add_argument("--surge-target", type=int, default=20)
    parser.add_argument("--min-trusted-balance", type=float, default=5.0)
    parser.add_argument("--max-pending-wallets", type=int, default=0)
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    cfg = read_cfg(config_path)
    chain = cfg["chain"]
    nodes = cfg["nodes"]

    failures: List[str] = []

    print("=== QBTC Pre-test Readiness ===")

    alive = self_heal_alive()
    print(f"self_heal_alive={alive}")
    if not alive:
        failures.append("self-heal daemon is not running")

    gate_ok, gate_logs = gate_pass_stable(
        config_path=config_path,
        python_cmd=args.python_cmd,
        attempts=args.gate_attempts,
        interval=args.gate_interval,
    )
    print(f"gate_stable={gate_ok} attempts={args.gate_attempts}")
    if not gate_ok:
        failures.append("preflight gate not stable across attempts")

    summary = []
    for node_name, pref in (("N2", "n2"), ("N3", "n3"), ("N4", "n4")):
        node = nodes[node_name]
        stress_wallets = list_wallet_dirs(node, f"stress_{pref}_")
        surge_wallets = list_wallet_dirs(node, f"surge_{pref}_")

        if len(stress_wallets) < args.stress_target:
            failures.append(f"{node_name}: stress wallet count {len(stress_wallets)} < {args.stress_target}")
        if len(surge_wallets) < args.surge_target:
            failures.append(f"{node_name}: surge wallet count {len(surge_wallets)} < {args.surge_target}")

        sample_wallets = sorted(stress_wallets)[: args.stress_target] + sorted(surge_wallets)[: args.surge_target]
        funded_ok = 0
        pending_wallets = 0
        errors = 0

        balances = get_all_wallet_balances(node, chain, sample_wallets)
        for w in sample_wallets:
            trusted, pending, err = balances.get(w, (0.0, 0.0, "missing from result"))
            if err:
                errors += 1
                continue
            if trusted >= args.min_trusted_balance:
                funded_ok += 1
            if pending > 0:
                pending_wallets += 1

        total_expected = args.stress_target + args.surge_target
        summary.append(
            {
                "node": node_name,
                "expected": total_expected,
                "funded_ok": funded_ok,
                "pending_wallets": pending_wallets,
                "errors": errors,
            }
        )

        if funded_ok < total_expected:
            failures.append(
                f"{node_name}: funded trusted wallets {funded_ok}/{total_expected} below target {args.min_trusted_balance}"
            )
        if pending_wallets > args.max_pending_wallets:
            failures.append(
                f"{node_name}: pending wallets {pending_wallets} > allowed {args.max_pending_wallets}"
            )
        if errors > 0:
            failures.append(f"{node_name}: wallet balance read errors={errors}")

    for row in summary:
        print(
            f"{row['node']}: funded_ok={row['funded_ok']}/{row['expected']} "
            f"pending_wallets={row['pending_wallets']} errors={row['errors']}"
        )

    if failures:
        print("READINESS=FAIL")
        for f in failures:
            print(f" - {f}")
        if gate_logs:
            print("--- gate logs ---")
            for gl in gate_logs:
                print(gl)
        return 2

    print("READINESS=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
