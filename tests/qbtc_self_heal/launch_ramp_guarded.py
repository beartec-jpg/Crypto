#!/usr/bin/env python3
"""
Gate-aware ramp launcher for N2/N3/N4.

Behavior:
1) Ensure preflight gate passes.
2) Ensure self-heal daemon is running (optional auto-start).
3) Launch ramp_flood.py on each load node.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, Tuple


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "tests" / "qbtc_self_heal" / "config.json"
SELF_HEAL_RUNNER = REPO_ROOT / "tests" / "qbtc_self_heal" / "run_self_heal.sh"
PRECHECK = REPO_ROOT / "tests" / "qbtc_self_heal" / "preflight_gate.py"


def run(cmd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)


def ssh(host: str, password: str, remote_cmd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    cmd = (
        f"sshpass -p {shlex.quote(password)} ssh -o StrictHostKeyChecking=no "
        f"root@{host} {shlex.quote(remote_cmd)}"
    )
    return run(cmd, timeout=timeout)


def load_cfg(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def ensure_self_heal_running(config_path: Path, auto_start: bool) -> None:
    pid_file = Path("/tmp/qbtc_self_heal.pid")
    log_file = Path("/tmp/qbtc_self_heal.log")

    alive = False
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
            os.kill(pid, 0)
            alive = True
        except Exception:
            alive = False

    if alive:
        print("[ok] self-heal daemon already running")
        return

    if not auto_start:
        raise SystemExit("self-heal daemon is not running; start it first or use --auto-start-self-heal")

    cmd = (
        f"nohup bash {shlex.quote(str(SELF_HEAL_RUNNER))} {shlex.quote(str(config_path))} "
        f"> {shlex.quote(str(log_file))} 2>&1 & echo $! > /tmp/qbtc_self_heal.pid"
    )
    res = run(cmd, timeout=15)
    if res.returncode != 0:
        raise SystemExit(f"failed to start self-heal daemon: {(res.stderr or res.stdout).strip()}")
    print("[ok] started self-heal daemon")


def run_gate(config_path: Path, python_cmd: str) -> None:
    cmd = (
        f"{python_cmd} {shlex.quote(str(PRECHECK))} --config {shlex.quote(str(config_path))} --nodes N2,N3,N4"
    )
    res = run(cmd, timeout=90)
    if res.stdout:
        print(res.stdout.rstrip())
    if res.returncode != 0:
        raise SystemExit("preflight gate failed; refusing to launch ramp")


def launch_node(prefix: str, host: str, password: str, peak: int, duration: int) -> Tuple[bool, str]:
    remote = (
        f"nohup python3 -u /tmp/ramp_flood.py {prefix} {int(peak)} {int(duration)} "
        f"> /tmp/ramp_{prefix}.log 2>&1 & "
        "echo STARTED:$!"
    )
    res = ssh(host, password, remote, timeout=30)
    if res.returncode != 0:
        return False, (res.stderr or res.stdout).strip()
    return True, (res.stdout or "").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Gate-aware ramp launcher")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to config JSON")
    parser.add_argument("--duration", type=int, default=3600)
    parser.add_argument("--n2-peak", type=int, default=40)
    parser.add_argument("--n3-peak", type=int, default=60)
    parser.add_argument("--n4-peak", type=int, default=55)
    parser.add_argument("--auto-start-self-heal", action="store_true")
    parser.add_argument("--python-cmd", default=sys.executable)
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    cfg = load_cfg(config_path)

    for node in ("N2", "N3", "N4"):
        if node not in cfg.get("nodes", {}):
            raise SystemExit(f"missing {node} in config")

    ensure_self_heal_running(config_path, auto_start=args.auto_start_self_heal)
    run_gate(config_path, python_cmd=args.python_cmd)

    plan = [
        ("n2", cfg["nodes"]["N2"]["host"], cfg["nodes"]["N2"]["ssh_password"], args.n2_peak),
        ("n3", cfg["nodes"]["N3"]["host"], cfg["nodes"]["N3"]["ssh_password"], args.n3_peak),
        ("n4", cfg["nodes"]["N4"]["host"], cfg["nodes"]["N4"]["ssh_password"], args.n4_peak),
    ]

    print("[info] launching ramp flood jobs...")
    failures = []
    for prefix, host, password, peak in plan:
        ok, msg = launch_node(prefix, host, password, peak=peak, duration=args.duration)
        if ok:
            print(f"[ok] {prefix} peak={peak} duration={args.duration} -> {msg}")
        else:
            failures.append(f"{prefix}@{host}: {msg}")

    if failures:
        print("[error] one or more launches failed:")
        for f in failures:
            print(f" - {f}")
        return 2

    print("[ok] all ramp jobs started")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
