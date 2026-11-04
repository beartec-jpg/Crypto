import sys, json, numpy as np
sys.path.insert(0,'/workspace/tdiv')
import tdlib as T
T.GRID='/workspace/tdiv/data'
ud, uv = T.load_usdtd('wide')
td,o,h,l,c = T.load_daily('BTCUSDT')
# last 400 days common
pos={int(d):i for i,d in enumerate(ud)}
rows=[(int(t),oo,hh,ll,cc,pos[int(t)]) for t,oo,hh,ll,cc in zip(td,o,h,l,c) if int(t) in pos][-400:-1]  # drop last (forming)
coin=[dict(time=r[0],open=r[1],high=r[2],low=r[3],close=r[4]) for r in rows]
us=[dict(time=int(ud[r[5]]),value=float(uv[r[5]])) for r in rows]
json.dump(dict(coin=coin,us=us), open('/tmp/parity_in.json','w'))
class FP(T.Panel):
    def __init__(s):
        s.usdtd=np.array([u['value'] for u in us]); s.D=len(us); s.A=1
        s.c=np.array([[x['close'] for x in coin]]); s.first=np.array([0]); s._cache={}
p=FP(); sc,top=p.score()
# remove 60-day mask for parity
T_mask=None
p2=FP(); p2.first=np.array([-60]); sc,top=p2.score()
json.dump(dict(score=[None if np.isnan(x) else float(x) for x in sc[0]], top=[None if np.isnan(x) else float(x) for x in top[0]]), open('/tmp/parity_py.json','w'))
