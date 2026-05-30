# SISTER — Don't Let Her Find You

A mobile-first, PS1/VHS-style **first-person survival horror** game inspired by
Puppet Combo's *Nun Massacre*. You're locked inside a dark mansion with a
relentless habited killer. Find the **three iron keys**, reach the **front
door**, and get out — without being caught.

> **Two versions in this repo:**
> - `index3d.html` — the **3D** version (three.js, real first-person 3D with a
>   PS1/VHS look). This is the current direction.
> - `index.html` — the original **2D raycaster** version (fully playable).

Built to run entirely in a phone browser. No build step, no servers, no
external assets: every texture and sound is generated procedurally at runtime,
so it works fully offline.

## Play

Open `index.html` in a browser (or serve the folder), tap **GO INSIDE**, and
turn the sound on. Best on a phone in a dark room with headphones.

To serve locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone (same network) or desktop
```

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | drag on the **left** half of the screen | `W A S D` |
| Look | drag on the **right** half of the screen | `← →` |
| Sprint (loud!) | hold **RUN** | `Shift` |
| Hide / leave | tap **HIDE** near a wardrobe or bed | `E` |

## How it plays

- **Explore** a procedurally generated 25-room mansion — every layout is
  different but always fully connected, so the keys are always reachable.
- **Sister** patrols, investigates noises, chases you on sight, and stalks
  closer when you drift too far away. Sprinting and slamming doors is loud —
  she hears it and comes looking.
- **Hide** inside wardrobes and beds to break her line of sight and wait for
  her to wander off. Dive in too late while she's already on you and she'll
  drag you out.
- The moment you collect the **third key**, the locks click open — and she
  hears it. The house turns into a sprint for the door.
- Get caught and she fills the screen. Reach the door and you escape into the
  night… but she's still in there, waiting for the next one.

## Project structure

```
index.html        markup + screens (title / HUD / end / jumpscare)
css/style.css     all styling, vignette, overlays
js/textures.js    procedural wall textures, the Sister sprite, furniture, items
js/audio.js       Web Audio synthesis: drone, heartbeat, stings, scream
js/world.js       mansion generation, furnishing, line-of-sight, BFS pathfinding
js/input.js       multi-touch + mouse + keyboard controls
js/game.js        renderer (raycaster), player/AI/hiding, game loop, win/die
```

The renderer is a textured raycasting engine drawn to a small internal buffer
and upscaled with smoothing off for the chunky PS1 look, finished with
distance fog, a flashlight vignette, and film grain.
