// farm.js — the abandoned farm: the whole playable world. Loads the full-res
// GLTF, fits it, and exposes ground-following free-roam movement (raycasts
// down onto the terrain so the camera always rides on top of the surface).
import * as THREE from '../assets/vendor/three.module.js';
import { GLTFLoader } from '../assets/vendor/GLTFLoader.js';

export const farm = {
  group: null,
  ready: false,
  radius: 26,        // walkable bound (set after model fits)
  eye: 1.7,          // camera height ABOVE the ground under the player
  _meshes: [],       // collidable meshes for ground raycasts
  _ray: new THREE.Raycaster(),
  _top: 40,          // y to cast down from
  _lastY: 0,         // last known good ground height
};

const DOWN = new THREE.Vector3(0, -1, 0);

// Fit the model: center on origin in X/Z, base at y=0, scale to a footprint.
function fitModel(root, targetSpan) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = targetSpan / (Math.max(size.x, size.z) || 1);
  root.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(root);
  const c2 = new THREE.Vector3(); box2.getCenter(c2);
  root.position.x -= c2.x;
  root.position.z -= c2.z;
  root.position.y -= box2.min.y;       // base sits on y=0
  root.updateMatrixWorld(true);
}

// Brighter, flat PS1 night look. Lift base color so the scene is readable.
function ps1ify(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      if (!m) return m;
      // convert to a lightweight Lambert so AmbientLight actually brightens it
      const lm = new THREE.MeshLambertMaterial({
        map: m.map || null,
        color: m.color ? m.color.clone() : new THREE.Color(0xbfc4cc),
        transparent: m.transparent, opacity: m.opacity,
        alphaTest: m.alphaTest || (m.transparent ? 0.5 : 0),
        side: m.side, fog: true,
      });
      if (lm.map) { lm.map.magFilter = THREE.NearestFilter; lm.map.minFilter = THREE.NearestFilter; lm.map.anisotropy = 1; lm.map.generateMipmaps = false; lm.map.colorSpace = THREE.SRGBColorSpace; }
      return lm;
    });
    if (!Array.isArray(mats) || mats.length === 1) o.material = o.material[0];
  });
}

// raycast down to the terrain; returns ground Y or null if there's no floor.
export function groundY(x, z) {
  farm._ray.set(new THREE.Vector3(x, farm._top, z), DOWN);
  const hits = farm._ray.intersectObjects(farm._meshes, true);
  return hits.length ? hits[0].point.y : null;
}

export function loadFarm(scene, onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      'assets/farm/scene.gltf',
      (gltf) => {
        const root = gltf.scene;
        const span = 56;
        fitModel(root, span);
        ps1ify(root);

        const g = new THREE.Group();
        g.add(root);

        // collect meshes for ground raycasting
        farm._meshes = [];
        root.traverse((o) => { if (o.isMesh) farm._meshes.push(o); });

        const fb = new THREE.Box3().setFromObject(root);
        farm._top = fb.max.y + 10;
        farm.radius = span * 0.46;

        // wide dark ground plane far below, so a hole never shows pure void
        const skirt = new THREE.Mesh(
          new THREE.CircleGeometry(span * 1.6, 32),
          new THREE.MeshLambertMaterial({ color: 0x10130d })
        );
        skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.2; g.add(skirt);

        scene.add(g);
        farm.group = g; farm.ready = true;
        resolve(farm);
      },
      (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
      (err) => reject(err)
    );
  });
}

// horizontal clearance at a point: min distance to a wall in 16 directions.
function clearanceAt(x, z, gy) {
  let mn = 99;
  const o = new THREE.Vector3(x, gy + farm.eye, z), d = new THREE.Vector3();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    d.set(Math.cos(a), 0, Math.sin(a)); farm._ray.set(o, d);
    const h = farm._ray.intersectObjects(farm._meshes, true);
    if (h.length) mn = Math.min(mn, h[0].distance);
  }
  return mn;
}

// Spawn on open GROUND (not a rooftop). First find the terrain height (the
// median of all ground samples), then pick the most open spot sitting on that
// terrain band, and face the camera across the farm.
export function spawn(player) {
  const R = farm.radius;
  // sample ground heights to find the terrain level
  const hs = [];
  for (let z = -R * 0.9; z <= R * 0.9; z += R * 0.08)
    for (let x = -R * 0.9; x <= R * 0.9; x += R * 0.08) {
      if (Math.hypot(x, z) > R * 0.9) continue;
      const g = groundY(x, z); if (g !== null) hs.push(g);
    }
  hs.sort((a, b) => a - b);
  const terrain = hs.length ? hs[hs.length >> 1] : 0;   // median = ground level

  let best = null;
  for (let z = -R * 0.82; z <= R * 0.82; z += R * 0.1) {
    for (let x = -R * 0.82; x <= R * 0.82; x += R * 0.1) {
      if (Math.hypot(x, z) > R * 0.85) continue;
      const gy = groundY(x, z);
      if (gy === null || Math.abs(gy - terrain) > 2) continue;   // terrain only, no roofs
      const cl = clearanceAt(x, z, gy);
      if (!best || cl > best.cl) best = { x, z, gy, cl };
    }
  }
  best = best || { x: 0, z: 0, gy: groundY(0, 0) ?? terrain };
  player.x = best.x; player.z = best.z;

  // face whichever horizontal direction has the most scenery (cast rays around,
  // aim at the bearing whose nearby walls are closest = most to look at).
  let bestYaw = Math.atan2(-best.x, -best.z), bestHits = -1;
  const o = new THREE.Vector3(best.x, best.gy + farm.eye, best.z), d = new THREE.Vector3();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    d.set(Math.sin(a), 0, Math.cos(a)); farm._ray.set(o, d);
    const h = farm._ray.intersectObjects(farm._meshes, true);
    // score: something in view, but not right in your face
    if (h.length) {
      const dist = h[0].distance;
      const score = dist > 3 && dist < 40 ? (40 - dist) : -1;
      if (score > bestHits) { bestHits = score; bestYaw = Math.atan2(d.x, d.z); }
    }
  }
  player.yaw = bestYaw;
  player.pitch = -0.02;
  farm._lastY = best.gy;
}

// Move clamped to the walkable circle; only step onto tiles that have ground.
export function moveFarm(player, nx, nz) {
  const d = Math.hypot(nx, nz);
  if (d > farm.radius) { const k = farm.radius / d; nx *= k; nz *= k; }
  const y = groundY(nx, nz);
  if (y !== null && Math.abs(y - farm._lastY) < 3.5) {   // refuse cliffs/holes
    player.x = nx; player.z = nz; farm._lastY = y;
  }
}

// camera height = ground under the player + eye height
export function eyeY(player) {
  const y = groundY(player.x, player.z);
  if (y !== null) farm._lastY = y;
  return farm._lastY + farm.eye;
}

export function dispose(scene) {
  if (farm.group) scene.remove(farm.group);
  farm.group = null; farm.ready = false; farm._meshes = [];
}
