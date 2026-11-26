# Handoff from Claude to Codex (2026-11-11)

Claude's session is ending. Everything below is the state it left.

## Branches (GitHub remote: origin = Sdefendre/spindle-city, private)
- `main` and `codex/model-y-controller`: pushed, both at 4c645c0.
- `feat/top-ten-improvements`: local only. Web batch 1 (driving.js wired into the car, reactive traffic, drive feel) at 1a84997.
- `feat/godot-port`: local only, currently checked out. Contains batch 1, the Godot port, and `dist/extras.js`.

## Web game (`dist/`)
- `dist/extras.js` (committed, cf38bda): day-night cycle, GPS route ribbon (G), courier jobs with cash, N skips three hours. It hooks `presentation.render` and reads `player`, `vehicle`, `started`, `paused`, `mapOpen` through getters.
- Its only hook is the last two lines of `dist/play3d.js` (a comment and `import('./extras.js')...`). Those lines are uncommitted, alongside Codex's own uncommitted work. Keep them.
- Claude did not edit or commit any of Codex's in-progress files, and did not publish.
- Not done: click-the-map waypoints, loading progress bar, completing a delivery end to end in a browser.
- Tests: `node --test tests/` (gamepad, driving, traffic).

## Still to do for release
1. Finish and commit the in-progress web work (audio, materials, pedestrian physics, PWA, boost).
2. Bump the service worker VERSION and publish `dist/` to the site in `.openai/hosting.json`.
