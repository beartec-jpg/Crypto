#!/usr/bin/env python3
"""
Expand stress/surge wallet pool on N2/N3/N4 and fund new wallets from N2 miner.

Default behavior:
- Add stress wallets up to target count per node (default 40).
- Add surge wallets up to target count per node (default 20).
- Fund each newly created wallet with 5 QBTC from N2 miner.
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, List, Tuple


def run(cmd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)


def ssh(host: str, password: str, remote_cmd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    cmd = (
        f"sshpass -p {shlex.quote(password)} ssh -o StrictHostKeyChecking=no "
        f"root@{host} {shlex.quote(remote_cmd)}"
    )
    return run(cmd, timeout=timeout)


def rpc(node: Dict[str, Any], chain: str, method: str, wallet: str | None = None) -> subprocess.CompletedProcess:
    cli = node["bitcoin_cli_path"]
    w = f" -rpcwallet={wallet}" if wallet else ""
    cmd = f"{cli} -chain={chain}{w} {method}"
    return ssh(node["host"], node["ssh_password"], cmd, timeout=45)


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
    lines = [x.strip() for x in (res.stdout or "").splitlines() if x.strip()]
    return lines


def ensure_wallet(node: Dict[str, Any], chain: str, wallet: str) -> None:
    # Try create; if exists, load.
    create = rpc(node, chain, f"createwallet {shlex.quote(wallet)}")
    if create.returncode == 0:
        return
    msg = (create.stderr or create.stdout or "").lower()
    if "already exists" in msg or "database already exists" in msg:
        load = rpc(node, chain, f"loadwallet {shlex.quote(wallet)}")
        # loadwallet can fail if already loaded; that's okay.
        if load.returncode != 0:
            lmsg = (load.stderr or load.stdout or "").lower()
            if "already loaded" not in lmsg:
                raise RuntimeError(f"loadwallet failed for {wallet}: {(load.stderr or load.stdout).strip()}")
        return
    raise RuntimeError(f"createwallet failed for {wallet}: {(create.stderr or create.stdout).strip()}")


def get_new_address(node: Dict[str, Any], chain: str, wallet: str) -> str:
    res = rpc(node, chain, "getnewaddress", wallet=wallet)
    if res.returncode != 0:
        raise RuntimeError(f"getnewaddress failed for {wallet}: {(res.stderr or res.stdout).strip()}")
    return (res.stdout or "").strip().splitlines()[-1].strip()


def send_to_address(n2: Dict[str, Any], chain: str, address: str, amount: float) -> str:
    method = f"sendtoaddress {shlex.quote(address)} {amount}"
    res = rpc(n2, chain, method, wallet="miner")
    if res.returncode != 0:
        raise RuntimeError(f"sendtoaddress failed: {(res.stderr or res.stdout).strip()}")
    return (res.stdout or "").strip().splitlines()[-1].strip()


def count_needed(existing: List[str], prefix: str, target: int) -> List[str]:
    existing_set = set(existing)
    out = []
    i = 0
    while len(existing_set) + len(out) < target:
        name = f"{prefix}{i:02d}"
        if name not in existing_set:
            out.append(name)
        i += 1
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Expand wallet pool and fund new wallets")
    parser.add_argument("--config", default="tests/qbtc_self_heal/config.json")
    parser.add_argument("--stress-target", type=int, default=40)
    parser.add_argument("--surge-target", type=int, default=20)
    parser.add_argument("--fund-amount", type=float, default=5.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cfg_path = Path(args.config).resolve()
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    chain = cfg["chain"]
    nodes = cfg["nodes"]

    n2 = nodes["N2"]
    n3 = nodes["N3"]
    n4 = nodes["N4"]

    prefixes: List[Tuple[str, Dict[str, Any], str]] = [
        ("n2", n2, "N2"),
        ("n3", n3, "N3"),
        ("n4", n4, "N4"),
    ]

    create_plan: List[Tuple[str, Dict[str, Any], str]] = []

    for pref, node, label in prefixes:
        stress_existing = list_wallet_dirs(node, f"stress_{pref}_")
        surge_existing = list_wallet_dirs(node, f"surge_{pref}_")

        stress_new = count_needed(stress_existing, f"stress_{pref}_", args.stress_target)
        surge_new = count_needed(surge_existing, f"surge_{pref}_", args.surge_target)

        print(f"{label}: existing stress={len(stress_existing)} surge={len(surge_existing)}")
        print(f"{label}: creating stress={len(stress_new)} surge={len(surge_new)}")

        for w in stress_new + surge_new:
            create_plan.append((w, node, label))

    if not create_plan:
        print("Nothing to create; targets already met.")
        return 0

    total_funding = len(create_plan) * args.fund_amount
    print(f"Total new wallets: {len(create_plan)}")
    print(f"Total funding needed: {total_funding:.8f} QBTC")

    bal_res = rpc(n2, chain, "getbalance", wallet="miner")
    if bal_res.returncode != 0:
        raise SystemExit(f"Cannot read N2 miner balance: {(bal_res.stderr or bal_res.stdout).strip()}")
    miner_balance = float((bal_res.stdout or "0").strip().splitlines()[-1].strip())
    print(f"N2 miner balance: {miner_balance:.8f} QBTC")

    if miner_balance < total_funding + 5:
        raise SystemExit("Insufficient miner balance for wallet expansion + buffer")

    created = 0
    funded = 0
    for wallet, node, label in create_plan:
        if args.dry_run:
            print(f"[dry-run] {label} create+fund {wallet}")
            continue

        ensure_wallet(node, chain, wallet)
        address = get_new_address(node, chain, wallet)
        txid = send_to_address(n2, chain, address, args.fund_amount)
        created += 1
        funded += 1
        print(f"{label}: {wallet} funded {args.fund_amount} QBTC txid={txid[:16]}...")
        time.sleep(0.2)

    print(f"Done. created={created}, funded={funded}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
