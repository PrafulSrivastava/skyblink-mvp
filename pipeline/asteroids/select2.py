import glob, numpy as np, json
from astropy.io import ascii
res={}
files=['433','n7','21','n1036','n29','16','324','15','n1620','n3122','3200']
for k in files:
    f=f'most/{k}.tbl'; t=ascii.read(f,format='ipac')
    name=[l for l in open(f) if l.startswith('\\object_name')][0].split('=',1)[1].strip().strip('"')
    t['det']=[int(p[1]) for p in t['productid']]
    cands=[]
    for det in range(1,7):
        s=t[t['det']==det]; s.sort('mjd_start'); m=np.array(s['mjd_start'])
        if len(m)<2: continue
        vis=[[0]]
        for i in range(1,len(m)):
            (vis[-1].append(i) if (m[i]-m[vis[-1][-1]])*1440<15 else vis.append([i]))
        V=[dict(mjd=float(np.mean(m[v])),ra=float(np.mean(s['ra_obj'][v])),dec=float(np.mean(s['dec_obj'][v])),rows=[int(x) for x in v]) for v in vis]
        for i in range(len(V)):
            for j in range(i+1,len(V)):
                span=(V[j]['mjd']-V[i]['mjd'])*24
                if span>48: break
                d=np.hypot((V[j]['ra']-V[i]['ra'])*np.cos(np.radians(V[i]['dec'])),V[j]['dec']-V[i]['dec'])*3600
                mov=d/6.15
                if mov>60: break
                if mov<5: continue
                nexp=sum(len(v['rows']) for v in V[i:j+1])
                cands.append((j-i+1, mov, nexp, det, span, d/span, s['start_date'][V[i]['rows'][0]], float(s['vmag'][0]), [str(s['productid'][r])+'|'+str(s['start_date'][r]) for v in V[i:j+1] for r in v['rows']]))
    cands.sort(key=lambda c:(-c[0],-c[1]))
    print(f"\n{name}")
    for c in cands[:4]: print(f"  det D{c[3]} visits={c[0]} nexp={c[2]} span={c[4]:.1f}h move={c[1]:.1f}px rate={c[5]:.1f}\"/h start={c[6]} vmag={c[7]}")
    res[k]=dict(name=name,cands=[dict(visits=c[0],move_px=c[1],nexp=c[2],det=c[3],span_h=c[4],rate=c[5],start=str(c[6]),vmag=c[7],exps=c[8]) for c in cands[:6]])
json.dump(res,open('windows.json','w'),indent=1)
