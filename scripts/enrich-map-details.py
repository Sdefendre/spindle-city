"""Retain additional surveyed OSM tags from the original local map extracts.
Only enrich existing features; never regenerate or change their geometry.
"""
import json,xml.etree.ElementTree as ET
from pathlib import Path
for filename,prefix,west,north,sources in [
 ('city-map.js','window.CITY_DATA',-71.172,41.725,[Path('data')/(x+'.osm') for x in ['ne','nw','se','sw','taunton']]),
 ('new-bedford-map.js','window.NEW_BEDFORD_DATA',-70.943,41.647,list(Path('data').glob('new-bedford-*.osm')))]:
 p=Path('dist/assets')/filename;data=json.loads(p.read_text().split('=',1)[1].rstrip(';\n'));nodes={};ways={}
 for source in sources:
  root=ET.parse(source).getroot()
  for n in root.findall('node'):nodes[n.attrib['id']]=[round((float(n.attrib['lon'])-west)*83100*1.5,1),round((north-float(n.attrib['lat']))*111320*1.5,1)]
  for w in root.findall('way'):ways[w.attrib['id']]=([n.attrib['ref'] for n in w.findall('nd')],{t.attrib['k']:t.attrib['v'] for t in w.findall('tag')})
 buildings={tuple(tuple(nodes[n]) for n in refs if n in nodes):tags for refs,tags in ways.values() if 'building' in tags}
 n=0
 for b in data['buildings']:
  t=buildings.get(tuple(map(tuple,b['p'])))
  if not t:continue
  for key,tag in [('material','building:material'),('colour','building:colour'),('roofColour','roof:colour'),('roofShape','roof:shape'),('houseNumber','addr:housenumber'),('street','addr:street')]:
   if t.get(tag):b[key]=t[tag];n+=1
  if not b.get('name') and t.get('name'):b['name']=t['name']
 for r in data['roads']:
  t=ways.get(r.get('id'),([],{}))[1]
  for key in ['lanes','width','maxspeed','surface']:
   if t.get(key):r[key]=t[key]
 p.write_text(prefix+'='+json.dumps(data,separators=(',',':'))+';')
 print(filename,'retained building tags:',n)
