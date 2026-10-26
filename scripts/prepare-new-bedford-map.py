"""Build the compact, client-side New Bedford map extract used by the game.

The input files are four ignored OpenStreetMap API extracts covering the
downtown/waterfront play area.  We deliberately keep the city bounded: this is
a street-level destination, not a claim to represent the full municipality.
"""
import collections
import json
import xml.etree.ElementTree as ET
from pathlib import Path

WEST, SOUTH, EAST, NORTH = -70.943, 41.616, -70.912, 41.647
SCALE = 1.5
nodes, ways, rels = {}, {}, {}
for filename in sorted(Path("data").glob("new-bedford-*.osm")):
    root = ET.parse(filename).getroot()
    for node in root.findall("node"):
        nodes[node.attrib["id"]] = {
            "lon": float(node.attrib["lon"]),
            "lat": float(node.attrib["lat"]),
            "tags": {tag.attrib["k"]: tag.attrib["v"] for tag in node.findall("tag")},
        }
    for way in root.findall("way"):
        ways[way.attrib["id"]] = {
            "refs": [ref.attrib["ref"] for ref in way.findall("nd")],
            "tags": {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")},
        }
    for relation in root.findall("relation"):
        rels[relation.attrib["id"]] = {
            "members": [(member.attrib["type"], member.attrib["ref"], member.attrib["role"])
                        for member in relation.findall("member")],
            "tags": {tag.attrib["k"]: tag.attrib["v"] for tag in relation.findall("tag")},
        }

def point(node):
    return [round((node["lon"] - WEST) * 83100 * SCALE, 1),
            round((NORTH - node["lat"]) * 111320 * SCALE, 1)]

def coordinates(refs):
    return [point(nodes[ref]) for ref in refs if ref in nodes]

out = {
    "width": round((EAST - WEST) * 83100 * SCALE),
    "height": round((NORTH - SOUTH) * 111320 * SCALE),
    "roads": [], "buildings": [], "areas": [], "water": [], "coast": [],
    "streams": [], "pois": [], "source": "OpenStreetMap contributors",
    "date": "2026-10-26", "city": "new-bedford",
}
landmark_words = ("whaling museum", "seamen", "mariners", "custom house", "city hall", "zeiterion", "state pier", "buttonwood", "fishing heritage", "new bedford national historical")

def is_landmark(name):
    return any(word in name.lower() for word in landmark_words)

for ident, way in ways.items():
    tags, path = way["tags"], coordinates(way["refs"])
    highway, name = tags.get("highway"), tags.get("name", "")
    if len(path) < 2:
        continue
    if tags.get("natural") == "coastline":
        out["coast"].append(path)
    if highway:
        out["roads"].append({"id": ident, "type": highway, "name": name, "p": path,
                             "oneway": tags.get("oneway", "no"), "bridge": tags.get("bridge", "no"),
                             "tunnel": tags.get("tunnel", "no"), "layer": tags.get("layer", "0")})
    if "building" in tags:
        out["buildings"].append({"p": path, "name": name, "type": tags.get("building"),
                                  "height": tags.get("building:levels", "2"),
                                  "heightMeters": tags.get("height", ""),
                                  "hasLevels": "building:levels" in tags})
    if tags.get("leisure") in ["park", "garden", "pitch", "playground"] or tags.get("landuse") in ["grass", "forest", "recreation_ground", "cemetery"]:
        out["areas"].append({"p": path, "name": name, "type": tags.get("leisure", tags.get("landuse"))})
    if tags.get("natural") == "water" or tags.get("waterway") == "riverbank":
        out["water"].append({"p": path, "name": name})
    if tags.get("waterway") in ["river", "stream", "canal"]:
        out["streams"].append({"p": path, "name": name, "type": tags["waterway"], "tunnel": tags.get("tunnel", "no")})
    if is_landmark(name):
        out["pois"].append({"name": name, "p": [round(sum(v[0] for v in path) / len(path), 1), round(sum(v[1] for v in path) / len(path), 1)], "tags": tags})
for node in nodes.values():
    name = node["tags"].get("name", "")
    if is_landmark(name):
        out["pois"].append({"name": name, "p": point(node), "tags": node["tags"]})

# Reassemble water multipolygon outer rings included in the API extracts.
for relation in rels.values():
    tags = relation["tags"]
    if tags.get("natural") != "water" and tags.get("waterway") != "riverbank":
        continue
    chains = [ways[ident]["refs"][:] for kind, ident, role in relation["members"]
              if kind == "way" and role in ("outer", "") and ident in ways]
    while chains:
        chain = chains.pop()
        changed = True
        while changed and chain[0] != chain[-1]:
            changed = False
            for index, segment in enumerate(chains):
                if chain[-1] == segment[0]: chain += segment[1:]
                elif chain[-1] == segment[-1]: chain += list(reversed(segment))[1:]
                elif chain[0] == segment[-1]: chain = segment[:-1] + chain
                elif chain[0] == segment[0]: chain = list(reversed(segment))[:-1] + chain
                else: continue
                chains.pop(index); changed = True; break
        if len(chain) > 3 and chain[0] == chain[-1]:
            out["water"].append({"p": coordinates(chain), "name": tags.get("name", "")})

Path("dist/assets/new-bedford-map.js").write_text("window.NEW_BEDFORD_DATA=" + json.dumps(out, separators=(",", ":")) + ";")
Path("dist/assets/new-bedford-map-source.json").write_text(json.dumps({
    "source": "https://www.openstreetmap.org",
    "license": "https://opendatacommons.org/licenses/odbl/1-0/",
    "bounds": [WEST, SOUTH, EAST, NORTH], "retrieved": "2026-10-26",
    "method": "OpenStreetMap API 0.6 map; four adjoining bounding boxes plus full New Bedford Harbor multipolygon relation 1318632",
    "harbor_relation": "https://www.openstreetmap.org/relation/1318632",
    "coverage": "New Bedford downtown, historic district, waterfront and harbor; not the whole municipality."
}, indent=2))
print({key: len(value) for key, value in out.items() if isinstance(value, list)})
print(sorted({poi["name"] for poi in out["pois"]}))
