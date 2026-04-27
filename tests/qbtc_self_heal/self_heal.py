#!/usr/bin/env python3
"""
QBTC self-healing controller.

What it automates:
1) Health checks every interval.
2) Degraded detection (lag, flatline, low peers).
3) Auto restart + peer reconnect.
4) Auto recopy from canonical node if still degraded.
5) UTXO auto-consolidation trigger on canonical funding wallet.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Dict, Any, Optional


STATE_FILE = "/tmp/qbtc_self_heal_state.json"


@dataclass
class NodeStatus:
    height: Optional[int] = None
    peers: Optional[int] = None
    headers: Optional[int] = None
    ibd: Optional[bool] = None
    error: Optional[str] = None


class Controller:
    def __init__(self, cfg: Dict[str, Any], dry_run: bool = False):
        self.cfg = cfg
        self.dry_run = dry_run
        self.chain = cfg["chain"]
        self.canonical = cfg["canonical_node"]
        self.nodes = cfg["nodes"]
        self.fixed_peers = cfg.get("fixed_peers", [])
        self.lag_threshold = int(cfg.get("leader_lag_threshold_blocks", 20))
        self.degraded_after = int(cfg.get("degraded_after_checks", 4))
        self.min_peers = int(cfg.get("require_min_peers", 2))
        self.restart_wait = int(cfg.get("restart_wait_seconds", 20))
        self.recopy_wait = int(cfg.get("recopy_wait_seconds", 30))
        self.stop_canonical_during_recopy = bool(cfg.get("stop_canonical_during_recopy", True))
        self.utxo_threshold = int(cfg.get("utxo_consolidation_threshold", 500))
        self.state = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"nodes": {}, "last_cycle": 0}

    def _save_state(self) -> None:
        self.state["last_cycle"] = int(time.time())
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.state, f, indent=2)

    def _run(self, cmd: str, timeout: int = 30) -> subprocess.CompletedProcess:
        return subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)

    def _ssh(self, node_name: str, remote_cmd: str, timeout: int = 30) -> subprocess.CompletedProcess:
        node = self.nodes[node_name]
        host = node["host"]
        pw = node["ssh_password"]
        quoted = shlex.quote(remote_cmd)
        cmd = (
            f"sshpass -p {shlex.quote(pw)} ssh -o StrictHostKeyChecking=no "
            f"root@{host} {quoted}"
        )
        return self._run(cmd, timeout=timeout)

    def _rpc_cmd(self, node_name: str, method: str) -> str:
        node = self.nodes[node_name]
        cli = node["bitcoin_cli_path"]
        return f"{cli} -chain={self.chain} {method}"

    def _status(self, node_name: str) -> NodeStatus:
        cmd = (
            "python3 - <<'PY'\n"
            "import json,subprocess\n"
            f"base={json.dumps(self._rpc_cmd(node_name, ''))}.strip()\n"
            "def call(s):\n"
            "  p=subprocess.run((base+' '+s).strip(),shell=True,text=True,capture_output=True)\n"
            "  if p.returncode!=0:\n"
            "    raise RuntimeError((p.stderr or p.stdout).strip())\n"
            "  return p.stdout\n"
            "out={}\n"
            "try:\n"
            "  out['height']=int(call('getblockcount').strip())\n"
            "  out['peers']=int(call('getconnectioncount').strip())\n"
            "  bi=json.loads(call('getblockchaininfo'))\n"
            "  out['headers']=int(bi.get('headers',-1))\n"
            "  out['ibd']=bool(bi.get('initialblockdownload', True))\n"
            "  print(json.dumps(out))\n"
            "except Exception as e:\n"
            "  print(json.dumps({'error':str(e)}))\n"
            "PY"
        )
        res = self._ssh(node_name, cmd, timeout=20)
        if res.returncode != 0 or not res.stdout.strip():
            return NodeStatus(error=(res.stderr or res.stdout or "rpc/ssh failure").strip())
        try:
            data = json.loads(res.stdout.strip().splitlines()[-1])
        except Exception:
            return NodeStatus(error=f"bad status output: {res.stdout.strip()[:180]}")
        if "error" in data:
            return NodeStatus(error=str(data["error"]))
        return NodeStatus(
            height=data.get("height"),
            peers=data.get("peers"),
            headers=data.get("headers"),
            ibd=data.get("ibd"),
            error=None,
        )

    def _ensure_node_state(self, node_name: str) -> Dict[str, Any]:
        nodes_state = self.state.setdefault("nodes", {})
        if node_name not in nodes_state:
            nodes_state[node_name] = {
                "last_height": None,
                "flatline_checks": 0,
                "lag_checks": 0,
                "restart_attempts": 0,
                "recopy_attempts": 0,
                "last_action": "",
                "last_action_ts": 0,
            }
        return nodes_state[node_name]

    def _restart_and_reconnect(self, node_name: str) -> None:
        node = self.nodes[node_name]
        service = node.get("service", "bitcoin-qbtctestnet")
        cli = node["bitcoin_cli_path"]
        bitcoind = node["bitcoind_path"]
        conf = node["bitcoin_conf"]
        reconnect = "\n".join(
            [f"{cli} -chain={self.chain} addnode {peer} onetry || true" for peer in self.fixed_peers]
        )
        cmd = (
            "set -e\n"
            f"systemctl restart {service} 2>/dev/null || true\n"
            "sleep 3\n"
            "pgrep -x bitcoind >/dev/null || "
            f"nohup {bitcoind} -chain={self.chain} -pqcmode=hybrid -pqcsig=falcon -conf={conf} -daemon >/dev/null 2>&1\n"
            f"sleep {self.restart_wait}\n"
            f"{reconnect}\n"
        )
        if self.dry_run:
            print(f"[dry-run] restart/reconnect on {node_name}")
            return
        res = self._ssh(node_name, cmd, timeout=120)
        if res.returncode != 0:
            print(f"[WARN] restart/reconnect failed on {node_name}: {(res.stderr or res.stdout).strip()}")

    def _recopy_chain(self, target: str) -> None:
        source = self.canonical
        if target == source:
            return
        if self.dry_run:
            print(f"[dry-run] recopy chain {source} -> {target}")
            return
        src = self.nodes[source]
        dst = self.nodes[target]

        src_host = src["host"]
        src_pw = src["ssh_password"]
        dst_host = dst["host"]
        dst_pw = dst["ssh_password"]
        src_data = src["data_dir"]
        dst_data = dst["data_dir"]

        if self.stop_canonical_during_recopy:
            self._ssh(source, f"{src['bitcoin_cli_path']} -chain={self.chain} stop || true; sleep 8", timeout=30)

        self._ssh(target, f"{dst['bitcoin_cli_path']} -chain={self.chain} stop || true; sleep 8", timeout=30)

        rsync_cmd = (
            f"sshpass -p {shlex.quote(src_pw)} ssh -o StrictHostKeyChecking=no root@{src_host} "
            + shlex.quote(
                "set -e\n"
                + f"ssh-keyscan -H {dst_host} >> /root/.ssh/known_hosts 2>/dev/null || true\n"
                + "sshpass -p "
                + shlex.quote(dst_pw)
                + " rsync -az --delete -e 'ssh -o StrictHostKeyChecking=no' "
                + "--exclude='wallets/' --exclude='debug.log' --exclude='peers.dat' --exclude='banlist.json' "
                + f"{src_data}/ root@{dst_host}:{dst_data}/\n"
            )
        )
        rs = self._run(rsync_cmd, timeout=600)
        if rs.returncode != 0:
            print(f"[ERROR] recopy rsync failed {source}->{target}: {(rs.stderr or rs.stdout).strip()}")

        self._ssh(source, f"nohup {src['bitcoind_path']} -chain={self.chain} -pqcmode=hybrid -pqcsig=falcon -conf={src['bitcoin_conf']} -daemon >/dev/null 2>&1", timeout=30)
        self._ssh(target, f"nohup {dst['bitcoind_path']} -chain={self.chain} -pqcmode=hybrid -pqcsig=falcon -conf={dst['bitcoin_conf']} -daemon >/dev/null 2>&1", timeout=30)

        reconnect = "\n".join(
            [f"{dst['bitcoin_cli_path']} -chain={self.chain} addnode {peer} onetry || true" for peer in self.fixed_peers]
        )
        self._ssh(target, f"sleep {self.recopy_wait}\n{reconnect}", timeout=90)

    def _trigger_consolidation_if_needed(self) -> None:
        node_name = self.canonical
        node = self.nodes[node_name]
        wallet = node.get("funding_wallet", "miner")
        cli = node["bitcoin_cli_path"]
        cmd = (
            "python3 - <<'PY'\n"
            "import json,subprocess\n"
            f"base='{cli} -chain={self.chain} -rpcwallet={wallet}'\n"
            "p=subprocess.run(base+' listunspent 1',shell=True,text=True,capture_output=True)\n"
            "if p.returncode!=0:\n"
            "  print('ERR:'+ (p.stderr or p.stdout).strip())\n"
            "else:\n"
            "  u=json.loads(p.stdout)\n"
            "  print(len(u))\n"
            "PY"
        )
        res = self._ssh(node_name, cmd, timeout=30)
        out = (res.stdout or "").strip().splitlines()
        if not out:
            return
        last = out[-1].strip()
        if last.startswith("ERR:"):
            print(f"[WARN] cannot check UTXO count: {last}")
            return
        try:
            utxo_count = int(last)
        except ValueError:
            return

        if utxo_count <= self.utxo_threshold:
            return

        check_running = self._ssh(node_name, "pgrep -f '/tmp/consolidate2.py' >/dev/null && echo RUNNING || echo IDLE", timeout=10)
        running = "RUNNING" in (check_running.stdout or "")
        if running:
            print(f"[INFO] UTXO {utxo_count} > {self.utxo_threshold}, consolidation already running")
            return

        print(f"[ACTION] UTXO {utxo_count} > {self.utxo_threshold}, starting /tmp/consolidate2.py")
        if self.dry_run:
            print("[dry-run] skip starting consolidation")
            return
        self._ssh(node_name, "nohup python3 -u /tmp/consolidate2.py > /tmp/consolidate_auto.log 2>&1 &", timeout=10)

    def run_cycle(self) -> int:
        statuses: Dict[str, NodeStatus] = {}
        for node_name in self.nodes:
            statuses[node_name] = self._status(node_name)

        leader = statuses.get(self.canonical)
        if not leader or leader.error or leader.height is None:
            print(f"[ERROR] canonical node {self.canonical} unavailable: {leader.error if leader else 'unknown'}")
            self._save_state()
            return 2

        print(f"[INFO] leader {self.canonical} height={leader.height} peers={leader.peers}")

        for node_name, status in statuses.items():
            st = self._ensure_node_state(node_name)

            if status.error:
                print(f"[WARN] {node_name}: status error: {status.error}")
                st["lag_checks"] += 1
                st["flatline_checks"] += 1
                continue

            lag = max(0, leader.height - int(status.height or 0))
            prev_h = st.get("last_height")
            flatline = prev_h is not None and prev_h == status.height

            st["lag_checks"] = st.get("lag_checks", 0) + 1 if lag > self.lag_threshold else 0
            st["flatline_checks"] = st.get("flatline_checks", 0) + 1 if flatline else 0
            st["last_height"] = status.height

            print(
                f"[INFO] {node_name}: h={status.height} hdr={status.headers} peers={status.peers} "
                f"ibd={status.ibd} lag={lag} lag_checks={st['lag_checks']} flatline_checks={st['flatline_checks']}"
            )

            degraded = (
                (status.peers is not None and status.peers < self.min_peers)
                or st["lag_checks"] >= self.degraded_after
                or st["flatline_checks"] >= self.degraded_after
            )

            if not degraded:
                continue

            now = int(time.time())
            last_action_ts = int(st.get("last_action_ts", 0))
            if now - last_action_ts < self.restart_wait:
                continue

            print(f"[ACTION] {node_name} degraded -> restart+reconnect")
            self._restart_and_reconnect(node_name)
            st["restart_attempts"] = st.get("restart_attempts", 0) + 1
            st["last_action"] = "restart_reconnect"
            st["last_action_ts"] = now

            post = self._status(node_name)
            if post.error:
                still_bad = True
            else:
                post_lag = max(0, leader.height - int(post.height or 0))
                still_bad = (
                    (post.peers is not None and post.peers < self.min_peers)
                    or post_lag > self.lag_threshold
                )

            if still_bad and node_name != self.canonical:
                print(f"[ACTION] {node_name} still degraded -> recopy from {self.canonical}")
                self._recopy_chain(node_name)
                st["recopy_attempts"] = st.get("recopy_attempts", 0) + 1
                st["last_action"] = "recopy_from_canonical"
                st["last_action_ts"] = int(time.time())

        self._trigger_consolidation_if_needed()
        self._save_state()
        return 0



def load_config(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    parser = argparse.ArgumentParser(description="QBTC self-healing controller")
    parser.add_argument("--config", required=True, help="Path to config JSON")
    parser.add_argument("--once", action="store_true", help="Run exactly one check-heal cycle")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    args = parser.parse_args()

    cfg = load_config(args.config)
    ctl = Controller(cfg, dry_run=args.dry_run)

    if args.once:
        return ctl.run_cycle()

    interval = int(cfg.get("interval_seconds", 30))
    print(f"[INFO] starting self-heal loop; interval={interval}s")
    while True:
        rc = ctl.run_cycle()
        if rc != 0:
            print(f"[WARN] cycle ended with rc={rc}")
        time.sleep(interval)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
