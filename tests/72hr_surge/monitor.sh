#!/bin/bash
# Live status check for the 72-hr surge test
N1="89.167.109.241"
N1_PASS="Hbxtvw77XErT"

sshpass -p "$N1_PASS" ssh -o StrictHostKeyChecking=no root@"$N1" 'python3' << 'PYEOF'
import base64, json, subprocess, urllib.request
from datetime import datetime, timezone

NODES_CFG = {
    "N1": ("127.0.0.1",    28332, "qbtcverify", "verify_node3_2026"),
    "N2": ("46.62.156.169", 28332, "qbtcseed",   "seednode1_rpc_2026"),
    "N3": ("37.27.47.236",  28332, "qbtcseed",   "seednode2_rpc_2026"),
}

def rpc(node, method, params=None, wallet=None):
    if params is None: params = []
    host, port, user, pw = NODES_CFG[node]
    url = f"http://{host}:{port}/" + (f"wallet/{wallet}" if wallet else "")
    payload = json.dumps({"jsonrpc":"1.0","id":"mon","method":method,"params":params})
    creds   = base64.b64encode(f"{user}:{pw}".encode()).decode()
    req = urllib.request.Request(url, data=payload.encode(),
        headers={"Content-Type":"text/plain","Authorization":f"Basic {creds}"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        r = json.loads(resp.read())
    if r.get("error"): raise RuntimeError(r["error"])
    return r["result"]

print("=" * 62)
print(f"  QBTC 72-hr Surge Monitor  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
print("=" * 62)

# Runner process
import subprocess as sp
res = sp.run(["pgrep","-a","python3"], capture_output=True, text=True)
running = any("runner.py" in l for l in res.stdout.splitlines())
print(f"\n{'✓ Runner RUNNING' if running else '✗ Runner NOT RUNNING'}")

# Live state
import os
if os.path.exists("/root/surge_test/state.json"):
    s = json.loads(open("/root/surge_test/state.json").read())
    print(f"\n── Live state ──────────────────────────────────────────")
    print(f"  Elapsed       : {s.get('elapsed_hr','?')} hr")
    print(f"  Phase         : {s.get('phase','?')}  ({s.get('phase_rem_min','?')} min remaining)")
    print(f"  Height        : {s.get('height','?')}")
    print(f"  DAG tips      : active={s.get('tips_active','?')} valid-hdr={s.get('tips_valid_hdr','?')} fork={s.get('tips_valid_fork','?')}")
    print(f"  Mempool       : {s.get('mempool_tx','?')} txs  {s.get('mempool_kb','?')} KB")
    print(f"  Net hashrate  : {s.get('nethash_ths','?')} TH/s")
    print(f"  Txs sent      : ok={s.get('sent_ok','?')} fail={s.get('sent_fail','?')} topups={s.get('topups','?')}")

# Chain state per node
print(f"\n── Chain sync ──────────────────────────────────────────")
for node in ("N1", "N2", "N3"):
    try:
        info = rpc(node, "getblockchaininfo")
        print(f"  {node}: h={info['blocks']} ibd={info['initialblockdownload']} "
              f"hash={info['bestblockhash'][:16]}…")
    except Exception as e:
        print(f"  {node}: ERROR {e}")

# Wallet balances
print(f"\n── Wallet balances ─────────────────────────────────────")
if os.path.exists("/root/surge_test/wallets.json"):
    wallets = json.loads(open("/root/surge_test/wallets.json").read())
    total_bal = 0.0
    low = []
    for w in wallets:
        try:
            bal = rpc(w["node"], "getbalance", [], wallet=w["wallet_name"])
            total_bal += bal
            flag = " ← LOW" if bal < 0.5 else ""
            if bal < 0.5:
                low.append(w["id"])
        except Exception:
            bal = "ERR"
            flag = ""
        print(f"  {w['id']:12s}  {bal if isinstance(bal,str) else f'{bal:.4f}'} QBTC{flag}")
    print(f"\n  Total across wallets: {total_bal:.4f} QBTC")
    if low:
        print(f"  ⚠ LOW wallets (need topup): {', '.join(low)}")
else:
    print("  wallets.json not found")

# Last 10 log lines
print(f"\n── Last log lines ──────────────────────────────────────")
import glob
logs = sorted(glob.glob("/root/surge_test/logs/runner_*.log"))
if logs:
    with open(logs[-1]) as f:
        lines = f.readlines()
    for l in lines[-10:]:
        print(" ", l.rstrip())
else:
    print("  No log files yet")

print("\n" + "=" * 62)
PYEOF
