#!/usr/bin/env python3
"""Convert the web game's map scripts (window.X={...}) into compact JSON for Godot.
Map units are 1.5 per metre; output is metres with x east, z south."""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
S = 1 / 1.5
def pts(p): return [[round(x * S, 2), round(y * S, 2)] for x, y in p]
def convert(src, dst):
    raw = (ROOT / src).read_text()
    d = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
    out = {"width": round(d["width"] * S, 2), "height": round(d["height"] * S, 2), "date": d.get("date", ""),
           "roads": [{"id": r["id"], "type": r["type"], "name": r.get("name", ""), "p": pts(r["p"]),
                      "oneway": r.get("oneway", "no"), "bridge": r.get("bridge", "no") != "no",
                      "tunnel": r.get("tunnel", "no") != "no", "layer": int(float(r.get("layer") or 0))} for r in d["roads"]],
           "buildings": [{"p": pts(b["p"]), "name": b.get("name", ""), "type": b.get("type", ""),
                          "levels": b.get("height", ""), "meters": b.get("heightMeters", "")} for b in d["buildings"]],
           "areas": [{"p": pts(a["p"]), "name": a.get("name", ""), "type": a.get("type", "")} for a in d["areas"]],
           "water": [{"p": pts(w["p"]), "name": w.get("name", "")} for w in d["water"]],
           "coast": [pts(c) for c in d["coast"]],
           "streams": [{"p": pts(s["p"]), "name": s.get("name", ""), "type": s.get("type", ""),
                        "tunnel": s.get("tunnel", "no") != "no"} for s in d["streams"]],
           "pois": [{"name": p["name"], "p": pts([p["p"]])[0], "tourism": bool(p.get("tags", {}).get("tourism"))} for p in d["pois"]]}
    (ROOT / dst).write_text(json.dumps(out, separators=(",", ":")))
    print(dst, len(out["roads"]), "roads", len(out["buildings"]), "buildings", (ROOT / dst).stat().st_size // 1024, "KB")
convert("dist/assets/city-map.js", "godot/data/fall_river.json")
convert("dist/assets/new-bedford-map.js", "godot/data/new_bedford.json")
