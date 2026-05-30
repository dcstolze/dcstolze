// world3d.js — procedural mansion built as real 3D geometry (three.js).
// Reuses the same grid idea as the 2D game: rooms carved from a wall block,
// connected by a randomised spanning tree of doorways. Returns the grid (for
// collision + AI) plus the THREE meshes and the prop list.
import * as THREE from '../assets/vendor/three.module.js';

export const RX = 4, RY = 4, ROOM = 4, P = ROOM + 1, N = RX * P + 1;
export const T = 3.2;          // world units per tile
export const WALL_H = 3.0;

export function inRoom(rx, ry) { return rx >= 0 && ry >= 0 && rx < RX && ry < RY; }
export function roomTiles(rx, ry) { return { x0: rx * P + 1, y0: ry * P + 1, x1: rx * P + ROOM, y1: ry * P + ROOM }; }
export function roomCenter(rx, ry) { const r = roomTiles(rx, ry); return { x: (r.x0 + r.x1) / 2 | 0, y: (r.y0 + r.y1) / 2 | 0 }; }

export function genGrid() {
  const map = [];
  for (let y = 0; y < N; y++) map.push(new Array(N).fill(1));
  for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
    const r = roomTiles(rx, ry);
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) map[y][x] = 0;
  }
  const door = (rx, ry, nx, ny) => {
    if (nx > rx) map[ry * P + 1 + (ROOM >> 1)][(rx + 1) * P] = 2;
    else if (nx < rx) map[ry * P + 1 + (ROOM >> 1)][rx * P] = 2;
    else if (ny > ry) map[(ry + 1) * P][rx * P + 1 + (ROOM >> 1)] = 2;
    else map[ry * P][rx * P + 1 + (ROOM >> 1)] = 2;
  };
  const vis = new Array(RX * RY).fill(false), stack = [[0, 0]]; vis[0] = true;
  while (stack.length) {
    const [rx, ry] = stack[stack.length - 1], opts = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => { const nx = rx + d[0], ny = ry + d[1]; if (inRoom(nx, ny) && !vis[ny * RX + nx]) opts.push([nx, ny]); });
    if (opts.length) { const [nx, ny] = opts[(Math.random() * opts.length) | 0]; door(rx, ry, nx, ny); vis[ny * RX + nx] = true; stack.push([nx, ny]); }
    else stack.pop();
  }
  for (let i = 0; i < 4; i++) { const rx = Math.random() * RX | 0, ry = Math.random() * RY | 0, d = [[1, 0], [0, 1]][Math.random() * 2 | 0], nx = rx + d[0], ny = ry + d[1]; if (inRoom(nx, ny)) door(rx, ry, nx, ny); }
  return map;
}

// BFS over passable tiles (floor / door), avoiding blocked-prop tiles
export function findPath(map, blocked, sx, sy, tx, ty) {
  const start = sy * N + sx, goal = ty * N + tx;
  const prev = new Int32Array(N * N).fill(-1), seen = new Uint8Array(N * N), q = [start];
  seen[start] = 1; let h = 0;
  while (h < q.length) {
    const c = q[h++]; if (c === goal) break;
    const cx = c % N, cy = c / N | 0;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const t = map[ny][nx]; if (!(t === 0 || t === 2)) continue;
      const i = ny * N + nx; if (seen[i] || (blocked.has(i) && i !== goal)) continue;
      seen[i] = 1; prev[i] = c; q.push(i);
    }
  }
  if (!seen[goal]) return [];
  const path = []; let c = goal; while (c !== start && c !== -1) { path.push([c % N, c / N | 0]); c = prev[c]; }
  return path.reverse();
}

export function losClear(map, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, steps = Math.ceil(Math.hypot(dx, dy) / 0.12);
  for (let i = 1; i < steps; i++) { const x = x0 + dx * i / steps | 0, y = y0 + dy * i / steps | 0; const t = map[y] && map[y][x]; if (t === 1 || t === 2 || t === 9) return false; }
  return true;
}

function pixTex(canvasOrImg, rx, ry) {
  const t = new THREE.CanvasTexture(canvasOrImg);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1;
  return t;
}

// PS1 vertex-snap wobble
function ps1(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.snap = { value: 110.0 };
    sh.vertexShader = 'uniform float snap;\n' + sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
       gl_Position.xyz /= gl_Position.w;
       gl_Position.xy = floor(gl_Position.xy * snap) / snap;
       gl_Position.xyz *= gl_Position.w;`);
  };
  return mat;
}

// Build all meshes into `group`. `tex` is a map name->HTMLImage/Canvas.
export function buildMeshes(map, group, tex) {
  const mat = {};
  const lambert = (img, rx, ry) => ps1(new THREE.MeshLambertMaterial({ map: pixTex(img, rx, ry) }));
  const wallMats = [lambert(tex.BRICK_3A), lambert(tex.CONCRETE_1A), lambert(tex.BRICK_1A), lambert(tex.CONCRETE_2A)];
  const floorMat = lambert(tex.FLOOR_1A);
  const ceilMat = lambert(tex.CONCRETE_2A);
  const doorMat = ps1(new THREE.MeshLambertMaterial({ map: pixTex(tex.DOOR_1A) }));
  const exitMat = ps1(new THREE.MeshLambertMaterial({ map: pixTex(tex.DOOR_1A), color: 0xffcaa0 }));

  const planeXZ = new THREE.PlaneGeometry(T, T);
  const planeWall = new THREE.PlaneGeometry(T, WALL_H);
  const doors = {};

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (map[y][x] !== 0) continue;
    const wx = x * T + T / 2, wz = y * T + T / 2;
    // floor + ceiling
    let f = new THREE.Mesh(planeXZ, floorMat); f.rotation.x = -Math.PI / 2; f.position.set(wx, 0, wz); group.add(f);
    let c = new THREE.Mesh(planeXZ, ceilMat); c.rotation.x = Math.PI / 2; c.position.set(wx, WALL_H, wz); group.add(c);
    // walls facing each solid neighbour
    const sides = [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0]];
    for (const [dx, dy, ry] of sides) {
      const nx = x + dx, ny = y + dy, t = (map[ny] && map[ny][nx]);
      if (t === 0) continue; // open between two floors
      let mtl, isDoor = false, isExit = false;
      if (t === 2) { mtl = doorMat; isDoor = true; }
      else if (t === 9) { mtl = exitMat; isExit = true; }
      else mtl = wallMats[((x / P | 0) * 3 + (y / P | 0)) & 3];
      const w = new THREE.Mesh(planeWall, mtl);
      w.position.set(wx + dx * T / 2, WALL_H / 2, wz + dy * T / 2);
      w.rotation.y = ry;
      group.add(w);
      if (isDoor) { (doors[nx + ',' + ny] = doors[nx + ',' + ny] || []).push(w); }
      if (isExit) w.userData.exit = true;
    }
  }
  return { doors };
}
