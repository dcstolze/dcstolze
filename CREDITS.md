# Credits & Asset Licenses

All third-party assets used in **SISTER** are free for commercial use. Most of
the game (sprites, audio, the Sister herself) is still generated procedurally at
runtime; the items below are the downloaded assets.

## Textures — `assets/textures/`
PS1-style wall, floor and door textures from the **Miziziziz Retro 3D Graphics
Collection**, mirrored in-tree at
[`M3-org/retro3d-assets`](https://github.com/M3-org/retro3d-assets).
Released under **CC0 / Public Domain** — no attribution required (credited here
anyway, with thanks).

Files used: `BRICK_3A`, `BRICK_1A`, `CONCRETE_1A`, `CONCRETE_2A`, `FLOOR_1A`,
`DOOR_1A`.

## Character — `assets/characters/sister.png`, `sister_face.png`
The Sister is the **CC0** `Characters/Killer` 3D model (`Killer.fbx` +
`Killer.png`) from
[`M3-org/retro3d-assets`](https://github.com/M3-org/retro3d-assets),
**rendered to sprites here** with three.js + headless-gl under Xvfb: the Mixamo
rig was posed out of its T-pose into a stalking stance and captured as a
full-body billboard plus a head close-up for the jumpscare. CC0 / Public Domain.

> Note: Sketchfab was requested but is blocked by this environment's network
> allowlist (every Sketchfab endpoint returns 403), so the character was sourced
> from a reachable CC0 GitHub mirror instead.

## Build-time tooling (not shipped)
`three`, `three-stdlib`, `gl` (headless-gl), `canvas`, `jsdom` are dev-only
dependencies used to render the model and generate screenshots. They are listed
in `.gitignore` and are not part of the game, which ships as plain HTML/CSS/JS.

## Fonts — `assets/fonts/`
Self-hosted from Google Fonts so the game works offline:
- **Nosifer** — title display face (SIL Open Font License 1.1)
- **Special Elite** — typewriter body / notes (Apache License 2.0)
- **Oswald** — HUD / objective (SIL Open Font License 1.1)

## Audio
100% synthesised at runtime with the Web Audio API. No audio files.
