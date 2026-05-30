# Drop the building model here

Upload your building into this folder (`assets/models/`).

## Best formats (in order of preference)
1. **.glb** (single self-contained file with textures) — ideal
2. **.gltf** + its `.bin` + texture images
3. **.fbx** + texture image(s) — works (this is how the Sister was rendered)
4. **.obj** + `.mtl` + texture image(s)

If textures are separate files, upload them alongside the model.

## Notes
- The game is a 2D raycaster, so I'll use the building by **rendering it to
  sprites / textures** (the same headless three.js pipeline used for the
  character), and/or rebuilding its floor plan as the playable map.
- Any license is fine for personal use, but if you want it kept in the repo,
  CC0 / something you own is safest. Tell me the source + license.
