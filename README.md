# Spindle City

Static HTML/Canvas city exploration game. Serve `dist/` with any static web server.

## Geography

`dist/assets/city-map.js` contains projected OpenStreetMap street polylines, building footprints, parks, coastline and water geometry downloaded on October 21, 2026. Bounds: west -71.172, south 41.685, east -71.135, north 41.725. This covers downtown, the waterfront and the South End, not the entire Fall River municipality. North is up. Geometry uses a local equirectangular projection and one consistent scale. Road widths, architecture textures, character scale, traffic behavior and elevation are game approximations; this is not a navigation tool or a photoreal reconstruction. OSM geometry can contain omissions and older edits.

`geography.js` renders the geometry and applies polygon collisions to buildings and water, allowing bridge crossings and mapped tunnel roads. Landmark source coordinates remain recorded separately from their nearest accessible interaction positions. Cars and pedestrians follow real road segments; ambient routes repeat within their segments. Discoveries persist locally under a version-specific key.

Map data © OpenStreetMap contributors, under ODbL: https://www.openstreetmap.org/copyright . Compact source data and provenance are included in the deployed assets. `scripts/prepare-map.py` rebuilds these assets from OSM API XML extracts in ignored `data/`. The four bounding-box extracts plus the full Taunton water relation were used. Source query and originals remain locally in that ignored directory.

Character sprite image supplied/generated in the originating conversation. Controls: WASD/arrows, Shift to sprint, E enter/exit or inspect, M map, Esc pause. Touch joystick and action buttons available on touch devices.
