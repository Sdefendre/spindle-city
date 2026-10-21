# Spindle City

Static HTML/Canvas city exploration game. Serve `dist/` with any static web server.

## Geography

`dist/assets/city-map.js` contains projected OpenStreetMap street polylines, building footprints, parks, coastline and water geometry downloaded on October 21, 2026. Bounds: west -71.172, south 41.685, east -71.135, north 41.725. This covers downtown, the waterfront and the South End, not the entire Fall River municipality. North is up. Geometry uses a local equirectangular projection and one consistent scale. Road widths, architecture textures, character scale, traffic behavior and elevation are game approximations; this is not a navigation tool or a photoreal reconstruction. OSM geometry can contain omissions and older edits.

`geography.js` renders the geometry and applies polygon collisions to buildings and water, allowing bridge crossings and mapped tunnel roads. Landmark source coordinates remain recorded separately from their nearest accessible interaction positions. Cars and pedestrians follow real road segments; ambient routes repeat within their segments. Discoveries persist locally under a version-specific key.

Map data © OpenStreetMap contributors, under ODbL: https://www.openstreetmap.org/copyright . Compact source data and provenance are included in the deployed assets. `scripts/prepare-map.py` rebuilds these assets from OSM API XML extracts in ignored `data/`. The four bounding-box extracts plus the full Taunton water relation were used. Source query and originals remain locally in that ignored directory.

Character sprite image supplied/generated in the originating conversation. Controls: WASD/arrows, Shift to sprint, E enter/exit or inspect, M map, Esc pause. Touch joystick and action buttons available on touch devices.

## 3D street-level version

The main entry is now `entry3d.js` → `play3d.js` and `city3d.js`, using locally vendored Three.js 0.180.0 (MIT license included). Buildings are meshes from the original mapped footprints. Tagged building levels/heights are used when present; otherwise game heights are inferred. Window/brick façades and the museum-ship silhouette are modeled, not photographs or surveyed replicas. Terrain and road elevation remain simplified. The character is an animated 3D interpretation of the original bald, bearded character in tan clothing, not the original flat sprite.

WASD walks relative to the camera. Shift runs. Drag the view or use left/right arrow keys to turn. V switches between third-person and first-person. E enters/exits a nearby car. While driving, W/S accelerate/reverse and A/D steer. M opens the geographic map; Escape pauses. Discoveries from the mapped 2D version are retained. The mini map shows the local area. Touch devices use a left movement stick and drag the scene to look.

WebGL 2 is required; the start screen reports a browser graphics failure instead of offering a nonfunctional start button. Geometry is batched by neighborhood chunk, and repeated trees and lamp posts use instanced meshes. All runtime libraries are served with the game. OSM attribution remains visible.

## Reference-based architecture and graphics

`architecture.js` replaces the original single repeating facade with separate brick, stone, clapboard, roof and reflective-glass batches. Academy Building has four-story Gothic window arches, stone bands and green awnings. Government Center has an elevated concrete base, inset glazing and upper sun fins. The Borden House has green clapboard, shutters, a gable roof and an entrance. The courthouse follows its curved mapped footprint with modern glazing; mill facades use their own window rhythms. Remaining buildings use regional families, not verified individual replicas. Tagged dimensions are used where available; heights, panels and finer details remain approximated. Terrain and highway elevation are still simplified.

Photographic CC0 Poly Haven textures supply brick color and normal maps, asphalt and concrete. A CC0 sunset HDR environment supplies reflections/lighting; it is not used as a foreign city background. Sources, usage and limits are recorded in `dist/assets/visual-sources.json`; these are reference links, not copied photo facades. Three.js HDRLoader is vendored with the same MIT license. The map provides direct street-side visits to six architectural locations.

The starter car is an original white Tesla Model Y-inspired mesh with a glass canopy, mirrors, dark trim, wheels, light bars and badging. Normal traffic stays separate. Enter, steer, reverse, exit and first-person behavior use the existing game controls. The vehicle is an approximation, not an official manufacturer CAD model.
