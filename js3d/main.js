// main.js — first-person 3D survival horror (three.js), PS1 / VHS look.
import * as THREE from '../assets/vendor/three.module.js';
import * as W from './world3d.js';

const { N, P, T, WALL_H } = W;
const KEYS_NEEDED = 3;

/* ---------- renderer at low internal resolution (PS1 chunk) ---------- */
const cv = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x05060a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
let LW = 0, LH = 0;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const scale = Math.min(0.5, 360 / Math.max(w, h));   // keep it chunky + fast
  LW = Math.max(160, Math.round(w * scale)); LH = Math.max(160, Math.round(h * scale));
  renderer.setPixelRatio(1); renderer.setSize(LW, LH, false);
  cv.style.width = '100vw'; cv.style.height = '100vh'; cv.style.imageRendering = 'pixelated';
  if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
}

/* ---------- scene ---------- */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060a, 0.085);
const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 100);
scene.add(new THREE.AmbientLight(0x223044, 0.22));
const flash = new THREE.SpotLight(0xfff2d6, 7.0, 24, Math.PI / 5, 0.55, 1.1);
const flashTarget = new THREE.Object3D();
scene.add(flash, flashTarget); flash.target = flashTarget;

const world = new THREE.Group(); scene.add(world);

/* ---------- state ---------- */
let map, blocked = new Set(), doors = {};
const player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let keysHave = 0, battery = 1, flashOn = true, running = false, playTime = 0;
let state = 'title';
const props = [];           // { gx, gy, mesh, searched, contains }
let exitTile = null;
const enemy = { x: 0, z: 0, spr: null, path: [], repath: 0, speed: 2.4, nearness: 0 };
const TEXES = {};
let sisterFaceImg = null;

const tile = (w) => Math.floor(w / T);
const walkable = (gx, gy) => gx >= 0 && gy >= 0 && gx < N && gy < N && map[gy][gx] === 0 && !blocked.has(gy * N + gx);

/* ---------- asset loading ---------- */
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
async function loadAssets() {
  const names = ['BRICK_3A', 'BRICK_1A', 'CONCRETE_1A', 'CONCRETE_2A', 'FLOOR_1A', 'DOOR_1A'];
  for (const n of names) TEXES[n] = await loadImg('assets/textures/' + n + '.png');
  TEXES.sister = await loadImg('assets/characters/sister.png');
  sisterFaceImg = await loadImg('assets/characters/sister_face.png');
}

/* ---------- build a level ---------- */
function buildLevel() {
  world.clear();
  map = W.genGrid();
  blocked = new Set();

  // exit on the west wall of the spawn room
  const sr = W.roomTiles(0, 0), ey = sr.y0 + (W.ROOM >> 1);
  map[ey][0] = 9; exitTile = { gx: 0, gy: ey };

  const built = W.buildMeshes(map, world, TEXES);
  doors = built.doors;

  // dressers: one per room (not spawn), keys in the 3 farthest
  props.length = 0;
  const order = [];
  for (let ry = 0; ry < W.RY; ry++) for (let rx = 0; rx < W.RX; rx++) { if (rx === 0 && ry === 0) continue; order.push({ rx, ry, d: rx + ry }); }
  order.sort((a, b) => b.d - a.d);
  const drMat = new THREE.MeshLambertMaterial({ map: makeTex(TEXES.DOOR_1A) });
  order.forEach((o, i) => {
    const c = W.roomCenter(o.rx, o.ry);
    const gx = c.x + 1, gy = c.y + 1;                 // a corner-ish tile
    if (!walkable(gx, gy)) return;
    blocked.add(gy * N + gx);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.8), drMat);
    box.position.set(gx * T + T / 2, 0.65, gy * T + T / 2);
    world.add(box);
    props.push({ gx, gy, mesh: box, searched: false, contains: i < KEYS_NEEDED ? 'key' : (Math.random() < 0.4 ? 'battery' : null) });
  });

  // spawn
  const spc = W.roomCenter(0, 0);
  player.x = (spc.x + 0.5) * T; player.z = (spc.y + 0.5) * T; player.yaw = Math.PI / 4; player.pitch = 0;

  // enemy far away
  const far = order[0]; const ec = W.roomCenter(far.rx, far.ry);
  enemy.x = (ec.x + 0.5) * T; enemy.z = (ec.y + 0.5) * T; enemy.path = []; enemy.repath = 0;
  if (!enemy.spr) {
    const t = makeTex(TEXES.sister); const m = new THREE.SpriteMaterial({ map: t, fog: true });
    enemy.spr = new THREE.Sprite(m);
    const a = TEXES.sister.width / TEXES.sister.height;
    enemy.spr.scale.set(2.1 * a, 2.1, 1);
    scene.add(enemy.spr);
  }
  keysHave = 0; battery = 1; flashOn = true; playTime = 0;
  updateHud();
}
function makeTex(img) { const t = new THREE.CanvasTexture(img); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; }

/* ---------- input ---------- */
const mv = { x: 0, y: 0 }; let moveId = null, lookId = null, lastLX = 0, lastLY = 0, mox = 0, moy = 0;
const keys = {};
function tStart(id, x, y) { if (x < window.innerWidth * 0.5 && moveId === null) { moveId = id; mox = x; moy = y; mv.x = 0; mv.y = 0; } else if (lookId === null) { lookId = id; lastLX = x; lastLY = y; } }
function tMove(id, x, y) {
  if (id === moveId) { let dx = x - mox, dy = y - moy, m = Math.hypot(dx, dy), mx = 55; if (m > mx) { dx = dx / m * mx; dy = dy / m * mx; } mv.x = dx / mx; mv.y = dy / mx; }
  else if (id === lookId) { player.yaw -= (x - lastLX) * 0.005; player.pitch = Math.max(-0.9, Math.min(0.9, player.pitch - (y - lastLY) * 0.004)); lastLX = x; lastLY = y; }
}
function tEnd(id) { if (id === moveId) { moveId = null; mv.x = 0; mv.y = 0; } else if (id === lookId) lookId = null; }
cv.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) tStart(t.identifier, t.clientX, t.clientY); }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) tMove(t.identifier, t.clientX, t.clientY); }, { passive: false });
cv.addEventListener('touchend', e => { e.preventDefault(); for (const t of e.changedTouches) tEnd(t.identifier); }, { passive: false });
cv.addEventListener('touchcancel', e => { for (const t of e.changedTouches) tEnd(t.identifier); });
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
let mDown = false, mLook = false;
cv.addEventListener('mousedown', e => { if (e.clientX < window.innerWidth * 0.5) { mDown = true; mox = e.clientX; moy = e.clientY; } else { mLook = true; lastLX = e.clientX; lastLY = e.clientY; } });
window.addEventListener('mousemove', e => { if (mDown) { let dx = e.clientX - mox, dy = e.clientY - moy, m = Math.hypot(dx, dy), mx = 55; if (m > mx) { dx = dx / m * mx; dy = dy / m * mx; } mv.x = dx / mx; mv.y = dy / mx; } if (mLook) { player.yaw -= (e.clientX - lastLX) * 0.005; player.pitch = Math.max(-0.9, Math.min(0.9, player.pitch - (e.clientY - lastLY) * 0.004)); lastLX = e.clientX; lastLY = e.clientY; } });
window.addEventListener('mouseup', () => { mDown = mLook = false; mv.x = 0; mv.y = 0; });
let actReq = false;
function bindBtn(id, on, off) { const el = document.getElementById(id); if (!el) return; ['touchstart', 'mousedown'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); on(); }, { passive: false })); if (off) ['touchend', 'touchcancel', 'mouseup'].forEach(ev => el.addEventListener(ev, off)); }

/* ---------- movement + collision ---------- */
function tryMove(nx, nz) {
  const gy = tile(player.z), gx0 = tile(nx);
  // open a door we push into
  const openDoorAt = (gx, gy) => { if (map[gy] && map[gy][gx] === 2) { map[gy][gx] = 0; (doors[gx + ',' + gy] || []).forEach(m => m.visible = false); } };
  if (map[gy] && map[gy][gx0] === 2) openDoorAt(gx0, gy);
  if (walkable(gx0, gy)) player.x = nx;
  const gx = tile(player.x), gy0 = tile(nz);
  if (map[gy0] && map[gy0][gx] === 2) openDoorAt(gx, gy0);
  if (walkable(gx, gy0)) player.z = nz;
}

/* ---------- update ---------- */
let last = 0;
function update(dt) {
  playTime += dt;
  let ix = mv.x, iy = mv.y;
  if (keys['w']) iy = -1; if (keys['s']) iy = 1; if (keys['a']) ix = -1; if (keys['d']) ix = 1;
  const moving = Math.abs(ix) + Math.abs(iy) > 0.1;
  running = (keys['shift'] || running) && moving;
  const sp = (running && battery >= 0 ? 4.2 : 3.0) * dt;
  if (moving) {
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    // forward = -iy, strafe = ix  (camera looks down -Z at yaw 0)
    const fwdX = -s, fwdZ = -c, rX = c, rZ = -s;
    let vx = fwdX * (-iy) + rX * ix, vz = fwdZ * (-iy) + rZ * ix;
    const m = Math.hypot(vx, vz) || 1; vx /= m; vz /= m;
    tryMove(player.x + vx * sp * Math.min(1, Math.hypot(ix, iy)), player.z + vz * sp * Math.min(1, Math.hypot(ix, iy)));
  }

  // flashlight battery
  if (flashOn) battery = Math.max(0, battery - dt / 80);
  flash.intensity = flashOn && battery > 0 ? (7.0 + (battery < 0.18 && Math.random() < 0.3 ? -5 : 0)) : 0.0;

  // camera
  camera.position.set(player.x, 1.6, player.z);
  const dirX = -Math.sin(player.yaw) * Math.cos(player.pitch), dirY = Math.sin(player.pitch), dirZ = -Math.cos(player.yaw) * Math.cos(player.pitch);
  camera.lookAt(player.x + dirX, 1.6 + dirY, player.z + dirZ);
  flash.position.copy(camera.position);
  flashTarget.position.set(player.x + dirX * 6, 1.6 + dirY * 6, player.z + dirZ * 6);

  // action: search nearest dresser
  let near = null, nd = 2.2;
  for (const p of props) { if (p.searched) continue; const d = Math.hypot(p.gx * T + T / 2 - player.x, p.gy * T + T / 2 - player.z); if (d < nd) { nd = d; near = p; } }
  const ab = document.getElementById('actBtn'); ab.classList.toggle('hidden', !near || state !== 'play'); ab.textContent = 'SEARCH';
  if (actReq) { actReq = false; if (near) search(near); }

  // exit
  if (Math.hypot((exitTile.gx + 0.5) * T - player.x, (exitTile.gy + 0.5) * T - player.z) < 2.0) {
    if (keysHave >= KEYS_NEEDED) return win();
    else toast('Locked. Three keys. (' + keysHave + '/3)');
  }

  updateEnemy(dt);
  toastT -= dt; if (toastT <= 0) document.getElementById('toast').classList.remove('show');
  document.getElementById('batt').style.width = (battery * 100) + '%';
  document.getElementById('tc').textContent = fmt(playTime);
}

function search(p) {
  p.searched = true; p.mesh.scale.z = 0.6; p.mesh.position.y = 0.5;
  if (p.contains === 'key') { keysHave++; updateHud(); toast(keysHave >= KEYS_NEEDED ? 'The last key. Get to the front door.' : 'An iron key. (' + keysHave + '/3)'); }
  else if (p.contains === 'battery') { battery = Math.min(1, battery + 0.35); toast('Spare batteries.'); }
  else toast('Old rags and dust.');
  enemy.heard = { gx: tile(player.x), gy: tile(player.z) };
}

function updateEnemy(dt) {
  const dx = player.x - enemy.x, dz = player.z - enemy.z, dist = Math.hypot(dx, dz);
  const pgx = tile(player.x), pgy = tile(player.z), egx = tile(enemy.x), egy = tile(enemy.z);
  const see = dist < 11 * T / T && W.losClear(map, egx, egy, pgx, pgy);
  enemy.repath -= dt;
  if (enemy.repath <= 0 || enemy.path.length === 0) {
    const goal = (see || dist < 12) ? { gx: pgx, gy: pgy } : (enemy.heard || { gx: pgx, gy: pgy });
    enemy.path = W.findPath(map, blocked, egx, egy, goal.gx, goal.gy);
    enemy.repath = 0.4;
  }
  if (enemy.path.length) {
    const [nx, ny] = enemy.path[0], cx = nx * T + T / 2, cz = ny * T + T / 2;
    let ex = cx - enemy.x, ez = cz - enemy.z, d = Math.hypot(ex, ez) || 1;
    const step = enemy.speed * dt; enemy.x += ex / d * step; enemy.z += ez / d * step;
    if (map[ny][nx] === 2) { map[ny][nx] = 0; (doors[nx + ',' + ny] || []).forEach(m => m.visible = false); }
    if (d < 0.3) enemy.path.shift();
  }
  enemy.spr.position.set(enemy.x, 1.05, enemy.z);
  enemy.nearness = Math.max(0, Math.min(1, 1 - dist / (9 * T) * T));
  // VHS intensity via body class
  document.body.classList.toggle('shake', dist < 3.5);
  if (dist < 1.2) die();
}

/* ---------- ui helpers ---------- */
let toastT = 0;
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); toastT = 3.2; }
function updateHud() { document.getElementById('obj').textContent = keysHave >= KEYS_NEEDED ? 'ESCAPE — THE FRONT DOOR' : 'SEARCH THE DRAWERS — ' + keysHave + '/3 KEYS'; }
function fmt(t) { t |= 0; const p = n => (n < 10 ? '0' : '') + n; return p(t / 3600 | 0) + ':' + p((t / 60 | 0) % 60) + ':' + p(t % 60); }

/* ---------- loop ---------- */
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') { update(dt); renderer.render(scene, camera); }
  requestAnimationFrame(loop);
}

/* ---------- flow ---------- */
function show(id, v) { const e = document.getElementById(id); if (e) e.classList.toggle('hidden', !v); }
function startGame() { buildLevel(); state = 'play'; ['hud', 'battWrap', 'vhs', 'runBtn', 'flashBtn'].forEach(i => show(i, true)); last = performance.now(); }
function win() { state = 'over'; ['hud', 'battWrap', 'runBtn', 'flashBtn', 'actBtn'].forEach(i => show(i, false)); document.getElementById('overTitle').textContent = 'YOU GOT OUT'; document.getElementById('overTitle').style.color = '#9ecb6a'; document.getElementById('overMsg').innerHTML = 'You spill into the night. She is still in there.'; show('over', true); }
function die() {
  if (state !== 'play') return; state = 'over'; ['hud', 'battWrap', 'runBtn', 'flashBtn', 'actBtn'].forEach(i => show(i, false));
  if (navigator.vibrate) navigator.vibrate([70, 40, 240]);
  jumpscare(() => { document.getElementById('overTitle').textContent = 'SHE FOUND YOU'; document.getElementById('overTitle').style.color = '#a40000'; document.getElementById('overMsg').innerHTML = 'You found <b>' + keysHave + '</b> of 3 keys.'; show('over', true); });
}
function jumpscare(done) {
  const jc = document.getElementById('jump'), c = document.getElementById('jumpCanvas'), x = c.getContext('2d');
  const W2 = window.innerWidth, H2 = window.innerHeight; c.width = W2; c.height = H2; show('jump', true);
  let f = 0; const dur = 60;
  (function fr() {
    f++; x.fillStyle = '#000'; x.fillRect(0, 0, W2, H2);
    const im = x.createImageData(W2, H2), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 70; d[i] = v + (Math.random() < 0.02 ? 150 : 0); d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; } x.putImageData(im, 0, 0);
    if (sisterFaceImg) { const sc = 0.5 + f / dur * 1.9, h = Math.min(W2, H2) * 1.8 * sc, w = h * (sisterFaceImg.width / sisterFaceImg.height); x.drawImage(sisterFaceImg, W2 / 2 - w / 2 + (Math.random() - 0.5) * 22, H2 / 2 - h * 0.4 + (Math.random() - 0.5) * 22, w, h); }
    x.fillStyle = 'rgba(125,0,0,' + (0.15 + 0.25 * Math.random()) + ')'; x.fillRect(0, 0, W2, H2);
    if (f < dur) requestAnimationFrame(fr); else setTimeout(() => { show('jump', false); done(); }, 130);
  })();
}

/* ---------- boot ---------- */
(async function boot() {
  resize(); window.addEventListener('resize', resize);
  await loadAssets();
  bindBtn('runBtn', () => running = true, () => running = false);
  bindBtn('flashBtn', () => { if (battery > 0.001) flashOn = !flashOn; });
  bindBtn('actBtn', () => actReq = true, null);
  document.getElementById('startBtn').addEventListener('click', () => { show('title', false); startGame(); });
  document.getElementById('retryBtn').addEventListener('click', () => { show('over', false); startGame(); });
  requestAnimationFrame(loop);
})();
