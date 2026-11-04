#!/usr/bin/env python3
"""Rebuild a long USDT.D history (2019->now) from Coin Metrics community CapMrktCurUSD (keyless).
USDT.D proxy = usdt_mcap / sum(mcap of a broad basket) * 100. EMA-dist %, RSI and %B are scale-invariant,
so only the *shape* matters. Output: data/usdtd_cm.csv (day_open_utc_sec,value) where value = close of that UTC day.
"""
import json, urllib.request, csv, sys, os, time, calendar
ASSETS = "btc eth usdt usdc bnb xrp ada doge ltc bch xlm link dot etc xmr dai busd tusd pax uni algo icp neo dash zec xtz cro ht leo_eth matic_eth shib_eth trx_eth avaxc vet_eth mkr aave snx comp yfi crv sushi ldo qnt mana ftt gusd husd usdk fdusd_eth pyusd_eth usde_eth".split()
def get(u):
    for k in range(5):
        try:
            return json.loads(urllib.request.urlopen(u, timeout=90).read())
        except Exception as e:
            time.sleep(2*(k+1))
    raise SystemExit("fail "+u)
rows = {}
for a in ASSETS:
    u = f"https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets={a}&metrics=CapMrktCurUSD&frequency=1d&start_time=2018-06-01&page_size=10000"
    d = get(u)
    n = 0
    for r in d["data"]:
        v = r.get("CapMrktCurUSD")
        if v is None: continue
        t = calendar.timegm(time.strptime(r["time"][:10], "%Y-%m-%d"))  # UTC midnight
        rows.setdefault(a, {})[t] = float(v); n += 1
    print(a, n, flush=True)
os.makedirs("data", exist_ok=True)
import json as j
j.dump(rows, open("data/cm_caps.json", "w"))
