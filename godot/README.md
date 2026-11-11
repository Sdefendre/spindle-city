# Spindle City — native Godot port

A Godot 4.7 port of the browser game in `../dist`. It rebuilds the same two
cities (Fall River and New Bedford) from the same OpenStreetMap extracts and
reuses the same models, textures and sounds, with a real physics engine and a
larger set of things to do.

## Run it

Install Godot 4.7 or newer (`brew install --cask godot`), then from the repo root:

```bash
godot --path godot
```

The first launch imports the assets, which takes a little while. To edit the
project, open `godot/project.godot` in the Godot editor.

## Controls

| Action | Keyboard and mouse | Controller |
| --- | --- | --- |
| Move / steer | W A S D or arrows | Left stick |
| Look | Mouse (click to capture) | Right stick |
| Run | Shift | L3 |
| Jump (on foot) / handbrake (driving) | Space | B |
| Accelerate / brake and reverse | W / S | RT / LT |
| Enter, exit, interact | E | A |
| Camera view | V | X |
| Map | M | Y |
| Auto drive to GPS pin | F | LB |
| Horn / headlights / reset car | H / L / R | RB / D-pad up / D-pad down |
| Hide HUD | C | — |
| Pause | Esc | Start |

## What is in the port

- **City.** Roads, sidewalks, lane markings, buildings with collision, water,
  parks, trees, street lamps and bridge rails are generated at load from
  `data/*.json` and batched into 240 m chunks. Houses get siding and gable
  roofs; larger buildings get brick facades with procedural windows that light
  up at night. Buildings over mapped tunnel roads are lifted so you can drive
  under them.
- **Driving.** Cars are `VehicleBody3D` rigs under Jolt physics at 120 Hz: the
  licensed Model Y plus a hatchback, sedan, pickup, van and coupe. Any parked
  or stopped traffic car can be taken.
- **On foot.** The rigged player model with idle, walk and run, in third or
  first person.
- **Traffic and pedestrians.** Both live in a bubble around the player.
  Traffic follows the road graph, keeps right, slows for corners and brakes for
  whatever is ahead. Pedestrians follow sidewalks and step out of the way of
  cars. Nothing in the game hurts them.
- **Day, night and weather.** A 24-minute day with sun, moon, lit windows,
  street lamps and headlights, plus overcast and rain with wet roads.
- **Jobs and money.** Courier runs, rideshare fares and checkpoint time trials
  start at the coloured beacons. Cash buys more cars from the garage in the
  pause menu. Finding each of the seven landmarks also pays.
- **Map and GPS.** Click the full map or pick a place to route there along
  real streets and one-way rules. F hands the wheel to auto drive.
- **Saves.** Money, cars, discoveries, position, time of day and settings are
  kept in `user://save.cfg`, per city where it matters.

## Checks

```bash
godot --headless --fixed-fps 60 --path godot -- --selftest
godot --headless --fixed-fps 60 --path godot -- --selftest --city=new-bedford
godot --headless --fixed-fps 120 --path godot -s tests/vehicle_test.gd -- model_y coupe van
godot --path godot -- --demo
```

`--selftest` plays through walking, entering and leaving cars, auto drive,
taking a traffic car, a courier job, water rescue, the garage, the highway
shortcut, night and rain, and the map and pause screens, and prints PASS or
FAIL for each. `--demo` does a shorter run in a window and saves screenshots
to the Godot user data folder.

These checks cover logic and physics. Steering feel, mouse and controller
input, and audio balance have not been judged by a person playing it.

## Not in the port

The browser version's hand-modelled landmark buildings (Academy Building,
Government Center, the Borden House, the museum ships) are plain generated
buildings here. There is no music or radio, no interiors, no terrain
elevation, and no traffic signals.

## Rebuilding the map data

`tools/convert_map.py` converts `../dist/assets/*-map.js` into `data/*.json`
in metres. Map data © OpenStreetMap contributors, ODbL. Model and asset
credits are in `../CREDITS.md`.
