import shapefile, json, sys
from shapely.geometry import shape, Point, MultiPolygon, Polygon
from shapely.ops import unary_union
r=shapefile.Reader('oslo/OsloAgreement')
keep=[shape(sr.shape.__geo_interface__) for sr in r.shapeRecords() if sr.record[1] in ('A','Nature Reserve','H1')]
g=shapefile.Reader('gaza/GazaStrip_MunicipalBoundaries')
gaza=unary_union([shape(s.__geo_interface__) for s in g.shapes()]).buffer(0.003)
raw=unary_union(keep+[gaza])
u=raw.buffer(0.0006).simplify(0.0004, preserve_topology=True)
polys=list(u.geoms) if isinstance(u,MultiPolygon) else [u]
polys=[p for p in polys if p.area>1e-6]
out=[]
for p in polys:
  rings=[[[round(x,4),round(y,4)] for x,y in p.exterior.coords]]
  rings+= [[[round(x,4),round(y,4)] for x,y in i.coords] for i in p.interiors if Polygon(i).area>1e-6]
  out.append({'b':[round(v,4) for v in p.bounds],'r':rings})
s=json.dumps(out,separators=(',',':'))
print(len(polys), len(s)); open('blocked.json','w').write(s)
# check raw coverage is inside simplified
print('raw area not covered:', raw.difference(u).area)
tests={'Anabta':(32.307,35.12),'Modiin':(31.898,35.010),'Jerusalem':(31.78,35.22),'Gaza':(31.5,34.46),'Sderot':(31.525,34.596),'Bat Hefer':(32.327,35.016),'Kochav Yair':(32.222,34.996),'Matan':(32.163,34.982),'Tzur Natan':(32.235,34.995),'Kfar Saba':(32.175,34.907),'Nirim':(31.335,34.395),'Nahal Oz':(31.473,34.497),'Bethlehem':(31.705,35.2),'Gilo':(31.73,35.185)}
for n,(la,lo) in tests.items(): print(n, u.contains(Point(lo,la)), round(raw.distance(Point(lo,la))*100,2),'km~')
