import json, time, numpy as np, urllib.request
rows = {a:{int(k):v for k,v in m.items()} for a,m in json.load(open('data/cm_caps.json')).items()}
days = sorted(rows['btc'])
def series(assets, ffill_gap=5):
    tot = np.zeros(len(days))
    for a in assets:
        m = rows.get(a, {}); last=None; lastd=-99; arr=np.zeros(len(days))
        for i,d in enumerate(days):
            if d in m: last=m[d]; lastd=i
            if last is not None and i-lastd<=ffill_gap: arr[i]=last
        tot += arr
    return tot
full = [a for a in rows if a not in ('bnb_eth',)]
wide = series(full+['bnb_eth'])
narrow = series(['btc','eth','usdt','usdc'])
usdt = np.array([rows['usdt'].get(d, np.nan) for d in days])
d_wide = usdt/wide*100; d_narrow = usdt/narrow*100
out = {'days':days,'wide':d_wide.tolist(),'narrow':d_narrow.tolist()}
json.dump(out, open('data/usdtd_proxies.json','w'))
# validate vs production (last 365d)
prod = json.loads(urllib.request.urlopen('https://www.beartec.uk/api/crypto/usdt-dominance',timeout=60).read())['series']
pm = {p['time']:p['value'] for p in prod}
idx = [i for i,d in enumerate(days) if d in pm]
P = np.array([pm[days[i]] for i in idx])
def rsi(x,n=14):
    d=np.diff(x); g=np.maximum(d,0); l=np.maximum(-d,0)
    ag=g[:n].mean(); al=l[:n].mean(); o=[np.nan]*n
    o.append(100-100/(1+ag/al))
    for k in range(n,len(d)):
        ag=(ag*(n-1)+g[k])/n; al=(al*(n-1)+l[k])/n; o.append(100-100/(1+ag/al) if al>0 else 100)
    return np.array(o)
for name,arr in (('wide',d_wide),('narrow',d_narrow)):
    for sh in (-1,0,1):
        A=np.array([arr[i+sh] for i in idx if 0<=i+sh<len(days)]); Pp=P[:len(A)]
        ra, rp = rsi(A), rsi(Pp)
        m=~np.isnan(ra)&~np.isnan(rp)
        print(name,'shift',sh,'level corr %.4f'%np.corrcoef(A,Pp)[0,1],'RSI14 corr %.4f'%np.corrcoef(ra[m],rp[m])[0,1],'diff corr %.3f'%np.corrcoef(np.diff(A),np.diff(Pp))[0,1], 'mean wide %.2f prod %.2f'%(A.mean(),Pp.mean()))
# print yearly summary of wide
for y in range(2019,2027):
    ii=[i for i,d in enumerate(days) if time.gmtime(d).tm_year==y]
    print(y,'wide min %.2f max %.2f | narrow min %.2f max %.2f'%(d_wide[ii].min(),d_wide[ii].max(),d_narrow[ii].min(),d_narrow[ii].max()))
