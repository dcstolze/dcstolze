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
The Sister is the **"Horror Ghost Character - Blood Stained Spirit"** 3D model,
**rendered to sprites here** with three.js + headless-gl under Xvfb (front-facing
full-body billboard + a head close-up for the jumpscare). The source `.gltf`
ships in `horror_ghost_character_-_blood_stained_spirit.zip`.

**License: CC-BY-4.0 — attribution required. Required credit:**

> This work is based on "Horror Ghost Character - Blood Stained Spirit"
> (https://sketchfab.com/3d-models/horror-ghost-character-blood-stained-spirit-ed1a90be19404450935720f7abaae471)
> by adhamasalah (https://sketchfab.com/adhamAsalah)
> licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

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
