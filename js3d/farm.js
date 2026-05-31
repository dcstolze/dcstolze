// farm.js — the abandoned farm: the whole playable world. Loads the full-res
// GLTF, sits it on the ground, and exposes flat-ground free-roam movement.
import * as THREE from '../assets/vendor/three.module.js';
import { GLTFLoader } from '../assets/vendor/GLTFLoader.js';

export const farm = {
  group: null,
  ready: false,
  radius: 30,        // walkable bound (set after model fits)
  eye: 1.6,
};

// Fit the model: center on origin, base at y=0, scale to a target footprint.
function fitModel(root, targetSpan) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const span = Math.max(size.x, size.z) || 1;
  const s = targetSpan / span;
  root.scale.setScalar(s);
  // recompute after scaling
  const box2 = new THREE.Box3().setFromObject(root);
  const c2 = new THREE.Vector3(); box2.getCenter(c2);
  root.position.x -= c2.x;
  root.position.z -= c2.z;
  root.position.y -= box2.min.y;          // sit base on the ground
  return targetSpan;
}

// Give every material the flat PS1 / night look and crunchy textures.
function ps1ify(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestFilter; m.map.anisotropy = 1; m.map.generateMipmaps = false; }
      m.metalness !== undefined && (m.metalness = 0);
      m.roughness !== undefined && (m.roughness = 1);
      m.flatShading = true;
      m.fog = true;
      m.needsUpdate = true;
    });
  });
}

export function loadFarm(scene, onProgress) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      'assets/farm/scene.gltf',
      (gltf) => {
        const root = gltf.scene;
        const span = 56;                  // ~56 units across — a real walk
        fitModel(root, span);
        ps1ify(root);
        const g = new THREE.Group();
        g.add(root);

        // dark ground so you never see "the void" under the model
        const ground = new THREE.Mesh(
          new THREE.CircleGeometry(span * 1.4, 24),
          new THREE.MeshLambertMaterial({ color: 0x0c0f0a })
        );
        ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; g.add(ground);

        farm.radius = span * 0.48;
        farm.center = { x: 0, z: 0 };

        scene.add(g);
        farm.group = g; farm.ready = true;
        resolve(farm);
      },
      (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
      (err) => reject(err)
    );
  });
}

// Player spawn: at the near edge, looking in toward the farm.
export function spawn(player) {
  player.x = 0;
  player.z = farm.radius * 0.82;
  player.yaw = 0;            // faces -Z, into the farm
  player.pitch = -0.02;
}

// Flat-ground move clamped to the walkable circle (no mesh collision —
// free roam, kept robust so you never get stuck).
export function moveFarm(player, nx, nz) {
  const cx = 0, cz = 0;
  const dx = nx - cx, dz = nz - cz;
  const d = Math.hypot(dx, dz);
  if (d > farm.radius) { const k = farm.radius / d; player.x = cx + dx * k; player.z = cz + dz * k; }
  else { player.x = nx; player.z = nz; }
}

export function dispose(scene) {
  if (farm.group) { scene.remove(farm.group); }
  farm.group = null; farm.ready = false;
}
