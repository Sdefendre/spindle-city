import xml.etree.ElementTree as ET,json,math,collections
from pathlib import Path
nodes={};ways={};rels={}
for fn in Path('data').glob('*.osm'):
 root=ET.parse(fn).getroot()
 for n in root.findall('node'): nodes[n.attrib['id']]={'lon':float(n.attrib['lon']),'lat':float(n.attrib['lat']),'tags':{t.attrib['k']:t.attrib['v'] for t in n.findall('tag')}}
 for w in root.findall('way'): ways[w.attrib['id']]={'refs':[a.attrib['ref'] for a in w.findall('nd')],'tags':{t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}}
 for r in root.findall('relation'): rels[r.attrib['id']]={'members':[(m.attrib['type'],m.attrib['ref'],m.attrib['role']) for m in r.findall('member')],'tags':{t.attrib['k']:t.attrib['v'] for t in r.findall('tag')}}
def pt(n):return [round((n['lon']+71.172)*83100*1.5,1),round((41.725-n['lat'])*111320*1.5,1)]
def coords(refs):return [pt(nodes[r]) for r in refs if r in nodes]
out={'width':round(.037*83100*1.5),'height':round(.04*111320*1.5),'roads':[],'buildings':[],'areas':[],'water':[],'coast':[],'streams':[],'pois':[],'source':'OpenStreetMap contributors','date':'2026-10-21'}
for id,w in ways.items():
 t=w['tags'];p=coords(w['refs']);typ=t.get('highway');name=t.get('name','')
 if len(p)<2:continue
 if t.get('natural')=='coastline':out['coast'].append(p)
 if typ:out['roads'].append({'id':id,'type':typ,'name':name,'p':p,'oneway':t.get('oneway','no'),'bridge':t.get('bridge','no'),'tunnel':t.get('tunnel','no'),'layer':t.get('layer','0')})
 if 'building' in t:out['buildings'].append({'p':p,'name':name,'type':t.get('building'),'height':t.get('building:levels','2'),'heightMeters':t.get('height',''),'hasLevels':'building:levels' in t})
 if t.get('leisure') in ['park','garden','pitch','playground'] or t.get('landuse') in ['grass','forest','recreation_ground','cemetery']:out['areas'].append({'p':p,'name':name,'type':t.get('leisure',t.get('landuse'))})
 if t.get('natural')=='water' or t.get('waterway')=='riverbank':out['water'].append({'p':p,'name':name})
 if t.get('waterway') in ['river','stream','canal']:out['streams'].append({'p':p,'name':name,'type':t['waterway'],'tunnel':t.get('tunnel','no')})
 if any(a in name.lower() for a in ['battleship','borden','kennedy','bicentennial','city hall','heritage','braga','quequechan']):out['pois'].append({'name':name,'p':[round(sum(v[0] for v in p)/len(p),1),round(sum(v[1] for v in p)/len(p),1)],'tags':t})
for n in nodes.values():
 name=n['tags'].get('name','')
 if any(a in name.lower() for a in ['battleship','borden','kennedy','bicentennial','city hall','heritage','braga','quequechan']):out['pois'].append({'name':name,'p':pt(n),'tags':n['tags']})
# Assemble outer water rings from relation member ways when present in the extract.
for r in rels.values():
 t=r['tags']
 if t.get('natural')!='water' and t.get('waterway')!='riverbank':continue
 chains=[ways[id]['refs'][:] for typ,id,role in r['members'] if typ=='way' and role in ('outer','') and id in ways]
 while chains:
  chain=chains.pop();changed=True
  while changed and chain[0]!=chain[-1]:
   changed=False
   for i,s in enumerate(chains):
    if chain[-1]==s[0]:chain+=s[1:]
    elif chain[-1]==s[-1]:chain+=list(reversed(s))[1:]
    elif chain[0]==s[-1]:chain=s[:-1]+chain
    elif chain[0]==s[0]:chain=list(reversed(s))[:-1]+chain
    else:continue
    chains.pop(i);changed=True;break
  if len(chain)>3 and chain[0]==chain[-1]:out['water'].append({'p':coords(chain),'name':t.get('name','')})
print({k:len(v) for k,v in out.items() if isinstance(v,list)})
print([(p['name'],p['p']) for p in out['pois'] if p['tags'].get('leisure')=='park' or p['name'] in ['Fall River City Hall','Lizzie Borden House','Battleship Cove']])
Path('dist/assets/city-map.js').write_text('window.CITY_DATA='+json.dumps(out,separators=(',',':'))+';')
Path('dist/assets/map-source.json').write_text(json.dumps({'source':'https://www.openstreetmap.org','license':'https://opendatacommons.org/licenses/odbl/1-0/','bounds':[-71.172,41.685,-71.135,41.725],'retrieved':'2026-10-21','method':'OpenStreetMap API 0.6 map; four adjoining bounding boxes','coverage':'Downtown, waterfront and South End; not the whole municipality.'},indent=2))
