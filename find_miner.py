#!/usr/bin/env python3
import requests
from requests.auth import HTTPBasicAuth

NODE = "http://89.167.109.241:28332"
AUTH = HTTPBasicAuth("qbtcverify", "verify_node3_2026")
COINBASE = "qbtct1qdet6dpjx90xqc8vq5lulspa0x8saqe7v66xtnh"

def rpc(method, params=None, wallet=None, timeout=30):
    url = f"{NODE}/wallet/{wallet}" if wallet else NODE
    r = requests.post(url, auth=AUTH, json={"jsonrpc":"1.0","method":method,"params":params or [],"id":1}, timeout=timeout)
    return r.json()

# Only check currently loaded wallets (no new loads)
loaded = rpc("listwallets")["result"]
print(f"Loaded wallets: {len(loaded)}")

total = 0
for w in loaded:
    try:
        bal = rpc("getbalance", wallet=w).get("result", 0) or 0
        ismine = rpc("getaddressinfo", [COINBASE], wallet=w).get("result", {}).get("ismine", False)
        total += float(bal)
        marker = " *** COINBASE OWNER ***" if ismine else ""
        print(f"  {w}: {bal} QBTC{marker}")
    except Exception as e:
        print(f"  {w}: ERROR {e}")

print(f"\nTotal across loaded wallets: {total:.8f} QBTC")
