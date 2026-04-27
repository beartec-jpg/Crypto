#!/usr/bin/env python3
"""
Pre-test gate for QBTC load tests.

Gate rules:
1) All load nodes at same height.
2) Each load node peers >= 3.
3) No stuck warning signature in last 5 minutes.
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import time
from typing import Dict, Any, Tuple


def run(cmd: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)


def ssh(node: Dict[str, Any], remote_cmd: str, timeout: int = 30) -> subprocess.CompletedProcess:
    cmd = (
        f"sshpass -p {shlex.quote(node['ssh_password'])} ssh -o StrictHostKeyChecking=no "
        f"root@{node['host']} {shlex.quote(remote_cmd)}"
    )
    return run(cmd, timeout=timeout)


def node_health(node_name: str, node: Dict[str, Any], chain: str) -> Tuple[bool, Dict[str, Any]]:
    cli = node["bitcoin_cli_path"]
    cmd = (
        "python3 - <<'PY'\n"
        "import json,subprocess\n"
        f"cli='{cli} -chain={chain}'\n"
        "def c(s):\n"
        " p=subprocess.run(cli+' '+s,shell=True,text=True,capture_output=True)\n"
        " if p.returncode!=0: raise RuntimeError((p.stderr or p.stdout).strip())\n"
        " return p.stdout.strip()\n"
        "bi=json.loads(c('getblockchaininfo'))\n"
        "print(json.dumps({'blocks':bi.get('blocks'), 'headers':bi.get('headers'), 'ibd':bi.get('initialblockdownload')}))\n"
        "print(c('getconnectioncount'))\n"
        "PY"
    )
    res = ssh(node, cmd, timeout=20)
    if res.returncode != 0:
        return False, {"node": node_name, "error": (res.stderr or res.stdout).strip()}

    lines = [x.strip() for x in (res.stdout or "").splitlines() if x.strip()]
    if len(lines) < 2:
        return False, {"node": node_name, "error": f"bad output: {res.stdout.strip()}"}

    try:
        info = json.loads(lines[-2])
        peers = int(lines[-1])
    except Exception as exc:
        return False, {"node": node_name, "error": f"parse error: {exc}"}

    return True, {
        "node": node_name,
        "blocks": int(info.get("blocks", -1)),
        "headers": int(info.get("headers", -1)),
        "ibd": bool(info.get("ibd", True)),
        "peers": peers,
    }


def stuck_pattern_recent(node_name: str, node: Dict[str, Any], seconds: int = 300) -> Tuple[bool, int]:
    # We parse ISO UTC timestamps in debug.log and count matching lines within last window.
    cmd = (
        "python3 - <<'PY'\n"
        "import datetime as dt,re\n"
        f"cutoff=dt.datetime.utcnow()-dt.timedelta(seconds={seconds})\n"
        "pat=re.compile(r'(not punishing manually connected peer|invalid header received|Misbehaving)')\n"
        "cnt=0\n"
        "try:\n"
        " f=open('/root/.bitcoin/qbtctestnet/debug.log','r',encoding='utf-8',errors='ignore')\n"
        " lines=f.readlines()[-3000:]\n"
        " f.close()\n"
        "except Exception:\n"
        " print(0); raise SystemExit(0)\n"
        "for line in lines:\n"
        " if not pat.search(line):\n"
        "  continue\n"
        " if len(line) < 20:\n"
        "  continue\n"
        " ts=line[:20]\n"
        " try:\n"
        "  t=dt.datetime.strptime(ts,'%Y-%m-%dT%H:%M:%SZ')\n"
        " except Exception:\n"
        "  continue\n"
        " if t>=cutoff:\n"
        "  cnt+=1\n"
        "print(cnt)\n"
        "PY"
    )
    res = ssh(node, cmd, timeout=20)
    if res.returncode != 0:
        return False, 0
    try:
        count = int((res.stdout or "0").strip().splitlines()[-1])
    except Exception:
        count = 0
    return count > 0, count


def main() -> int:
    parser = argparse.ArgumentParser(description="QBTC pre-test gate")
    parser.add_argument("--config", required=True, help="Path to self-heal config JSON")
    parser.add_argument("--nodes", default="N2,N3,N4", help="Comma-separated load nodes")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    chain = cfg["chain"]
    all_nodes = cfg["nodes"]
    load_nodes = [n.strip() for n in args.nodes.split(",") if n.strip()]

    failures = []
    heights = []
    print("=== QBTC preflight gate ===")
    print(f"time={int(time.time())}")
    print(f"nodes={','.join(load_nodes)}")

    for name in load_nodes:
        if name not in all_nodes:
            failures.append(f"{name}: missing in config")
            continue
        ok, info = node_health(name, all_nodes[name], chain)
        if not ok:
            failures.append(f"{name}: {info['error']}")
            continue

        heights.append(info["blocks"])
        print(
            f"{name}: height={info['blocks']} headers={info['headers']} "
            f"ibd={info['ibd']} peers={info['peers']}"
        )

        if info["peers"] < 3:
            failures.append(f"{name}: peers < 3 ({info['peers']})")

        stuck, count = stuck_pattern_recent(name, all_nodes[name], seconds=300)
        print(f"{name}: stuck-signature-last-5m={count}")
        if stuck:
            failures.append(f"{name}: stuck signature in logs ({count} lines in last 5m)")

    if heights and (max(heights) - min(heights)) > 1:
        failures.append(f"height mismatch across load nodes: {heights}")

    if failures:
        print("GATE=FAIL")
        for f in failures:
            print(f" - {f}")
        return 2

    print("GATE=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
