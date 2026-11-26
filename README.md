# Spindle City

Static HTML/Canvas/Three.js city exploration game. Serve `dist/` with any static web server.

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

## Realism pass

`character.js` adds a proportioned articulated character rig, elbows/knees, gait blending, collar, pockets, seams, fabric bump detail and a fuller face while preserving the original bald/bearded tan-outfit design. The player uses the detailed variant; nearby pedestrians use the lighter variant. These are original procedural models, not scanned humans.

`presentation.js` renders through a multisampled target with depth-based ambient occlusion, restrained highlight diffusion, filmic color mapping and a subtle vignette. High enables the depth pass; Balanced reduces rendering resolution and disables it. These settings are in the pause menu. C toggles cinematic HUD visibility. No device-performance or frame-rate claims are made.

`street-detail.js` adds instanced curbs, benches, bins, hydrants, drains and intersection crosswalk markings around downtown. These street-furniture placements are visual approximations, not surveyed fixtures. Curbs crossing another mapped drivable road are omitted. Pedestrian paths render below drivable roads to avoid coplanar flickering artifacts.

The Model Y body uses a smoothed longitudinal loft and wheel-arch cutouts. Car steering now depends on wheelbase and speed, Space brakes, and coasting models gentle regenerative deceleration. Character collisions include vehicles and street furniture. A movement-return bug that reported motion on a blocked zero-length axis was corrected. Pedestrians become visible again after returning to valid sidewalk positions.

Validation for this pass: JavaScript syntax checks; local browser startup with no console errors; third-person walking, entering the Tesla, driving, braking to a stop, steering, exit, first-person movement, pause/resume, Balanced selection and cinematic HUD toggle. Existing real-map architecture, map shortcuts, public no-login access and discoveries are retained. Full city photogrammetry, surveyed terrain elevation, interiors, production game AI and AAA character assets remain outside this prototype.

## Two-city driving and pedestrians

The game offers separate Fall River and New Bedford destinations. New Bedford covers a bounded downtown, historic district and waterfront extract; it is not the full city. City selection reloads the chosen map and keeps separate local discovery records. There is no continuous road trip between cities. Map geometry is © OpenStreetMap contributors under ODbL; the New Bedford extract and harbor relation source are recorded in `dist/assets/new-bedford-map-source.json`.

The I-195 access button in Fall River and Route 18 access button in New Bedford move the player and car to mapped highway segments. The map's terrain and road elevations are simplified. V switches to first-person; in the white Model Y that view includes an original dashboard, steering wheel and center display. The Model Y remains an approximation, with animated wheels and steering.

Auto drive is a game-only prototype. While in a car, open Auto drive or press F, pick a landmark on the map, and start the route. The planner follows a directed graph derived from mapped road geometry; it does not model all turn restrictions, traffic signals, lanes, road elevations, or real Tesla Full Self-Driving. It can stop if a route is blocked; steering, accelerating, braking or F returns control to the player. Some destinations may not be reachable in the bounded map extract.

Nearby pedestrians use varied appearances and movement. Up to three use locally hosted, rigged MakeHuman-derived models generated with Ara 3D Gen; the rest use lighter procedural figures. Character and CMU motion notices are bundled under `dist/assets/models/npcs/`. Braga Bridge and New Bedford's Custom House have original reference-inspired geometry; they are interpretations rather than surveyed 3D models.

## Controller and detailed Model Y

**Controller.** Plug in or pair a controller, then press any button. Browsers only show a gamepad after you press something. The game only accepts the W3C `standard` mapping (Xbox/PlayStation layouts in current Chrome, Edge and Safari). If your controller uses a non-standard mapping, the start screen and pause panel say so and the controller is ignored.

| Input | Action |
| --- | --- |
| Left stick | walk / steer |
| Right stick | look (the car camera stops auto-following for 1.5 s) |
| RT / R2 | accelerate |
| LT / L2 | brake; keep holding once stopped to reverse (release to switch back to braking) |
| A / ✕ | interact, enter or exit the car; confirm in menus (starts the game from the title screen) |
| B / ○ | close or back in menus |
| X / □ · Y / △ | camera view · map |
| L3 · Start / Options | sprint · pause and resume |
| D-pad | move menu focus; ◀ ▶ change the focused list (graphics, destination) |

Any stick or trigger input cancels auto drive. When a controller connects or reconnects, when an overlay opens or closes, and on pause, the game ignores the controller until every stick, trigger and button is released. A disconnect or a hidden tab stops all motion, including auto drive, and pauses the game. The game never resumes on its own. `node --test tests/` covers the mapping logic only. It has not been checked against physical controller hardware.

**Model Y.** The parked white car is "Tesla Model Y 2021" by 763468712 (CC BY 4.0; see `CREDITS.md` and `dist/assets/models/tesla-model-y/LICENSE.txt`). The geometry was simplified locally, and the paint, glass, tyres and trim were re-tuned at runtime to pearl white. It shows the 2021 exterior, not the 2025 "Juniper" refresh. The procedural car appears first and stays in place if the GLB fails to load. The first-person view still uses the procedural cockpit, not the model's interior.

## Driving model and traffic

**Player car.** Manual driving now uses `driving.js`: a fixed-step bicycle model in metres with a swept, oriented car-sized box. `player-car.js` builds its collision world once per city from the mapped building footprints, street-furniture colliders and `Geo.blocked` (shoreline, map edge, bridge crossings). Roads tagged as tunnels, culverts or building passages still pass under footprints, using the same rule as `geography.js`. Top speeds are unchanged: 27 m/s (60 MPH) on motorways, motorway links and trunk roads, 18 m/s (40 MPH) elsewhere. Leaving a faster road eases the car down rather than snapping its speed. Space is a hard brake. S, or LT once stopped, reverses to about 13 MPH. A collision stops the car at the point of contact; reverse or steer away to continue. A car that starts a frame already overlapping something only checks its centre point until it is clear, so it cannot get stuck. There is no damage model. Auto drive keeps its simpler route follower.

**Traffic.** Ambient cars ease up to a cruise speed and slow to a stop for the player (on foot or in a car) or another car in their lane ahead. Things behind them or on the pavement do not stop them. They pull away again once the lane clears. Cars drive in the right-hand lane of the mapped centreline, so oncoming cars on the same road pass beside each other. The parked Model Y now starts at the right-hand curb. Traffic does not follow signals, turn at junctions or avoid pedestrians other than the player. A car stopped behind a stationary player just waits.

**Feel.** In the third-person driving view the chase camera pulls back a little and the field of view widens by up to 10° with speed. Both return to normal on foot or in first person. The body rolls and pitches slightly with cornering and acceleration. Only the body moves; the wheels and collision box stay put. Brake and reversing lights brighten on both the procedural and the detailed Model Y, and traffic shows brake lights when stopping. Impacts shake the camera in proportion to speed, and hard hits (about 18 MPH and up) show a notice. With `prefers-reduced-motion` set, the FOV change and the shake are off.

**Hooks.** While driving, the current vehicle carries `vehicle.drive = {speed, acceleration, lateral, impact, collision, braking, reversing, auto}` (metres and seconds; `impact` is the speed at contact, `collision` names what was hit). It is `null` after stepping out. Ambient cars expose `speed`, `braking` and `waiting` (seconds stopped behind something).

**Verified.** `node --check` on every changed file, and `node --test tests/`. The tests cover the driving model (acceleration to the cap, braking, reverse cap, steering, building, tunnel, prop and vehicle collisions, recovering from an overlap), the map-unit wrapper, traffic stopping and resuming, queueing, lane offset, and the existing controller mapping. **Not verified:** none of this has been checked in a browser. That includes how the new collision feels against real footprints, tunnel and bridge crossings on the real maps, frame rate, camera and FOV changes, body tilt on the GLB, brake-light brightness, and traffic behaviour at real junctions.
