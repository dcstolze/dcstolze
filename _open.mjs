import { JSDOM } from 'jsdom'; import canvasPkg from 'canvas'; import fs from 'fs';
const { createCanvas, loadImage } = canvasPkg;
const dom = new JSDOM('<!DOCTYPE html><canvas id=game></canvas>', { url: 'http://localhost/' });
const win = dom.window; globalThis.window = win; globalThis.document = win.document; globalThis.self = globalThis;
const urlOf = (u) => (u && u.url) ? u.url : String(u);
globalThis.Request = class { constructor(u) { this.url = urlOf(u); } };
globalThis.fetch = async (u) => { const p = urlOf(u).replace('http://localhost/', '').replace(/^\.\//, ''); const b = fs.readFileSync(p); return { ok: true, status: 200, url: urlOf(u), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), json: async () => JSON.parse(b.toString()), text: async () => b.toString() }; };
globalThis.Image = function () { const c = createCanvas(2, 2); Object.defineProperty(c, 'src', { set() {} }); return c; };
globalThis.createImageBitmap = async (b) => b;
const THREE = await import('./assets/vendor/three.module.js');
const F = await import('./js3d/farm.js');
const scene = new THREE.Scene();
await F.loadFarm(scene, () => {});
const meshes = F.farm._meshes;
const ray = new THREE.Raycaster();
function clearance(x, z, gy) {
  // shoot rays outward at eye height; return min distance to any wall
  let mn = 99;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    ray.set(new THREE.Vector3(x, gy + 1.7, z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    const h = ray.intersectObjects(meshes, true);
    if (h.length) mn = Math.min(mn, h[0].distance);
  }
  return mn;
}
const R = F.farm.radius;
// scan a grid, find spots with ground + good clearance, prefer toward edge so you look INTO the scene
const cands = [];
for (let z = -R * 0.85; z <= R * 0.85; z += R * 0.12) {
  for (let x = -R * 0.85; x <= R * 0.85; x += R * 0.12) {
    if (Math.hypot(x, z) > R * 0.9) continue;
    const gy = F.groundY(x, z);
    if (gy === null) continue;
    const cl = clearance(x, z, gy);
    cands.push({ x, z, gy, cl });
  }
}
cands.sort((a, b) => b.cl - a.cl);
console.log('TOP OPEN SPOTS (x, z, ground, clearance):');
for (const c of cands.slice(0, 8)) console.log('  ', c.x.toFixed(1), c.z.toFixed(1), '| g', c.gy.toFixed(1), '| clear', c.cl.toFixed(1));
process.exit(0);
