#!/usr/bin/env python3
"""Fetch real USGS 3DEP elevation (meters) for Fall River and New Bedford.

Uses the USGS Elevation Point Query Service (EPQS, 3DEP LiDAR-derived) with a small
thread pool and retries. Falls back to Open-Meteo (Copernicus 90m) per point-batch if
EPQS is unreachable. Output: dist/assets/elevation.json
"""
import json, time, urllib.request, urllib.parse, sys
from concurrent.futures import ThreadPoolExecutor

CITIES = {
    "fall-river": {"bounds": [-71.172, 41.685, -71.135, 41.725], "cols": 38, "rows": 42},
    "new-bedford": {"bounds": [-70.943, 41.616, -70.912, 41.647], "cols": 30, "rows": 30},
}
DEST = "/Users/stevedefendre/sites/fall-river-iphone-release-20261111/dist/assets/elevation.json"


def epqs(lat, lon):
    q = urllib.parse.urlencode({"x": lon, "y": lat, "wkid": 4326, "units": "Meters", "includeDate": "false"})
    url = "https://epqs.nationalmap.gov/v1/json?" + q
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                v = float(json.loads(r.read().decode())["value"])
            if v < -1000:
                return None
            return v
        except Exception:
            time.sleep(0.6 * (attempt + 1))
    return None


def open_meteo(points):
    lats = ",".join(str(p[0]) for p in points)
    lons = ",".join(str(p[1]) for p in points)
    url = f"https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lons}"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return [float(v) for v in json.loads(r.read().decode())["elevation"]]
        except Exception:
            time.sleep(2.0 * (attempt + 1))
    return [0.0] * len(points)


out = {}
for cid, cfg in CITIES.items():
    west, south, east, north = cfg["bounds"]
    cols, rows = cfg["cols"], cfg["rows"]
    pts = []
    for r in range(rows):  # row 0 = north edge (map y = 0)
        lat = north - (north - south) * (r / (rows - 1))
        for c in range(cols):
            lon = west + (east - west) * (c / (cols - 1))
            pts.append((round(lat, 6), round(lon, 6)))
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=10) as ex:
        vals = list(ex.map(lambda p: epqs(*p), pts))
    missing = [i for i, v in enumerate(vals) if v is None]
    source = "USGS 3DEP (EPQS)"
    if missing:
        # Fill gaps from Open-Meteo in small batches
        for k in range(0, len(missing), 40):
            idx = missing[k:k + 40]
            fill = open_meteo([pts[i] for i in idx])
            for i, v in zip(idx, fill):
                vals[i] = v
            time.sleep(1.2)
        source += f" + Copernicus 90m gap fill ({len(missing)} pts)"
    vals = [round(max(0.0, v), 1) for v in vals]
    out[cid] = {
        "bounds": cfg["bounds"], "cols": cols, "rows": rows,
        "min": min(vals), "max": max(vals), "source": source, "values": vals,
    }
    print(f"{cid}: {cols}x{rows} min={min(vals)} max={max(vals)} missing={len(missing)} in {time.time()-t0:.0f}s", flush=True)

with open(DEST, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("saved", DEST, flush=True)
