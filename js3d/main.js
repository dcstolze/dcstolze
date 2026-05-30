// main.js — first-person 3D survival horror (three.js), PS1 / VHS look.
import * as THREE from '../assets/vendor/three.module.js';
import * as W from './world3d.js';
import * as A from './audio.js';

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
  const scale = Math.min(0.5, 360 / Math.max(w, h));
  LW = Math.max(160, Math.round(w * scale)); LH = Math.max(160, Math.round(h * scale));
  renderer.setPixelRatio(1); renderer.setSize(LW, LH, false);
  cv.style.width = '100vw'; cv.style.height = '100vh'; cv.style.imageRendering = 'pixelated';
  if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
}

/* ---------- scene ---------- */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060a, 0.11);
const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 100);
scene.add(new THREE.AmbientLight(0x1a2230, 0.12));
const flash = new THREE.SpotLight(0xffe8c4, 2.6, 20, Math.PI / 5.5, 0.6, 1.3);
const flashTarget = new THREE.Object3D();
scene.add(flash, flashTarget); flash.target = flashTarget;
const world = new THREE.Group(); scene.add(world);

/* ---------- state ---------- */
let map, blocked = new Set(), doors = {};
const player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let keysHave = 0, battery = 1, flashOn = true, running = false, playTime = 0, stamina = 1;
let hidden = false, walkPhase = 0;
let state = 'title';
const props = [];           // { gx, gy, mesh, kind:'dresser'|'wardrobe', searched, contains }
let exitTile = null;
const enemy = { x: 0, z: 0, spr: null, path: [], repath: 0, chase: 0, heard: null, target: null, state: 'patrol', speed: 2, nearness: 0 };
const TEXES = {};
let sisterFaceImg = null;
let stepT = 0, heartT = 0, bellT = 8, glitchT = 4, lockMsgT = 0, toastT = 0;

const tile = (w) => Math.floor(w / T);
const walkable = (gx, gy) => gx >= 0 && gy >= 0 && gx < N && gy < N && map[gy][gx] === 0 && !blocked.has(gy * N + gx);

/* ---------- assets ---------- */
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
async function loadAssets() {
  for (const n of ['BRICK_3A', 'BRICK_1A', 'CONCRETE_1A', 'CONCRETE_2A', 'FLOOR_1A', 'DOOR_1A', 'DOOR_2A']) TEXES[n] = await loadImg('assets/textures/' + n + '.png');
  TEXES.sister = await loadImg('assets/characters/sister.png');
  sisterFaceImg = await loadImg('assets/characters/sister_face.png');
}
function makeTex(img) { const t = new THREE.CanvasTexture(img); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; }

/* ---------- build a level ---------- */
function buildLevel() {
  world.clear();
  map = W.genGrid();
  blocked = new Set();
  const sr = W.roomTiles(0, 0), ey = sr.y0 + (W.ROOM >> 1);
  map[ey][0] = 9; exitTile = { gx: 0, gy: ey };
  doors = W.buildMeshes(map, world, TEXES).doors;

  props.length = 0;
  const drMat = new THREE.MeshLambertMaterial({ map: makeTex(TEXES.DOOR_1A) });
  const wdMat = new THREE.MeshLambertMaterial({ map: makeTex(TEXES.DOOR_2A) });
  const order = [];
  for (let ry = 0; ry < W.RY; ry++) for (let rx = 0; rx < W.RX; rx++) { if (rx === 0 && ry === 0) continue; order.push({ rx, ry, d: rx + ry }); }
  order.sort((a, b) => b.d - a.d);
  order.forEach((o, i) => {
    const c = W.roomCenter(o.rx, o.ry);
    // dresser in one corner
    const dgx = c.x + 1, dgy = c.y + 1;
    if (walkable(dgx, dgy)) {
      blocked.add(dgy * N + dgx);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.85), drMat);
      box.position.set(dgx * T + T / 2, 0.65, dgy * T + T / 2); world.add(box);
      props.push({ gx: dgx, gy: dgy, mesh: box, kind: 'dresser', searched: false, contains: i < KEYS_NEEDED ? 'key' : (Math.random() < 0.4 ? 'battery' : null) });
    }
    // wardrobe (hide spot) in the opposite corner of most rooms
    const wgx = c.x - 1, wgy = c.y - 1;
    if (Math.random() < 0.7 && walkable(wgx, wgy)) {
      blocked.add(wgy * N + wgx);
      const wb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.0), wdMat);
      wb.position.set(wgx * T + T / 2, 1.2, wgy * T + T / 2); world.add(wb);
      props.push({ gx: wgx, gy: wgy, mesh: wb, kind: 'wardrobe', searched: false, contains: null });
    }
  });

  const spc = W.roomCenter(0, 0);
  player.x = (spc.x + 0.5) * T; player.z = (spc.y + 0.5) * T; player.yaw = Math.PI / 4; player.pitch = 0;
  const far = order[0], ec = W.roomCenter(far.rx, far.ry);
  enemy.x = (ec.x + 0.5) * T; enemy.z = (ec.y + 0.5) * T; enemy.path = []; enemy.repath = 0; enemy.chase = 0; enemy.heard = null; enemy.state = 'patrol';
  if (!enemy.spr) {
    const m = new THREE.SpriteMaterial({ map: makeTex(TEXES.sister), fog: true });
    enemy.spr = new THREE.Sprite(m); const a = TEXES.sister.width / TEXES.sister.height; enemy.spr.scale.set(2.1 * a, 2.1, 1); scene.add(enemy.spr);
  }
  keysHave = 0; battery = 1; flashOn = true; playTime = 0; stamina = 1; hidden = false;
  document.getElementById('hideMask').classList.remove('on');
  updateHud();
}

/* ---------- input ---------- */
const mv = { x: 0, y: 0 }; let moveId = null, lookId = null, lastLX = 0, lastLY = 0, mox = 0, moy = 0;
const keys = {}; let actReq = false;
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
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'e') actReq = true; });
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
let mDown = false, mLook = false;
cv.addEventListener('mousedown', e => { if (e.clientX < window.innerWidth * 0.5) { mDown = true; mox = e.clientX; moy = e.clientY; } else { mLook = true; lastLX = e.clientX; lastLY = e.clientY; } });
window.addEventListener('mousemove', e => { if (mDown) { let dx = e.clientX - mox, dy = e.clientY - moy, m = Math.hypot(dx, dy), mx = 55; if (m > mx) { dx = dx / m * mx; dy = dy / m * mx; } mv.x = dx / mx; mv.y = dy / mx; } if (mLook) { player.yaw -= (e.clientX - lastLX) * 0.005; player.pitch = Math.max(-0.9, Math.min(0.9, player.pitch - (e.clientY - lastLY) * 0.004)); lastLX = e.clientX; lastLY = e.clientY; } });
window.addEventListener('mouseup', () => { mDown = mLook = false; mv.x = 0; mv.y = 0; });
function bindBtn(id, on, off) { const el = document.getElementById(id); if (!el) return; ['touchstart', 'mousedown'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); on(); }, { passive: false })); if (off) ['touchend', 'touchcancel', 'mouseup'].forEach(ev => el.addEventListener(ev, off)); }

/* ---------- movement ---------- */
function tryMove(nx, nz) {
  const openDoorAt = (gx, gy) => { if (map[gy] && map[gy][gx] === 2) { map[gy][gx] = 0; (doors[gx + ',' + gy] || []).forEach(m => m.visible = false); A.sfxDoor(); if (Math.hypot(enemy.x - player.x, enemy.z - player.z) < 7 * T) enemy.heard = { gx, gy }; } };
  const gy = tile(player.z), gx0 = tile(nx);
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
  const moving = !hidden && Math.abs(ix) + Math.abs(iy) > 0.12;
  const wantRun = (running || keys['shift']) && moving && stamina > 0.02;
  if (wantRun) stamina = Math.max(0, stamina - dt * 0.42); else stamina = Math.min(1, stamina + dt * 0.28);
  const sp = (wantRun ? 4.3 : 3.0) * dt;

  if (moving) {
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const fwdX = -s, fwdZ = -c, rX = c, rZ = -s;
    let vx = fwdX * (-iy) + rX * ix, vz = fwdZ * (-iy) + rZ * ix;
    const m = Math.hypot(vx, vz) || 1; vx /= m; vz /= m;
    const mag = Math.min(1, Math.hypot(ix, iy));
    tryMove(player.x + vx * sp * mag, player.z + vz * sp * mag);
    walkPhase += dt * (wantRun ? 13 : 9);
    stepT -= dt * (wantRun ? 1.7 : 1);
    if (stepT <= 0) { A.sfxStep(wantRun); stepT = 0.42; if (wantRun && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 9 * T) enemy.heard = { gx: tile(player.x), gy: tile(player.z) }; }
  }

  // flashlight battery + flicker
  if (flashOn && !hidden) battery = Math.max(0, battery - dt / 80);
  if (battery <= 0) flashOn = false;
  let fi = (flashOn && !hidden) ? 2.6 : 0.0;
  if (fi > 0) { if (battery < 0.18 && Math.random() < 0.3) fi *= 0.35; fi *= 0.92 + Math.random() * 0.16 + enemy.nearness * 0.0; }
  flash.intensity = fi;

  // camera (with head-bob)
  const bob = moving ? Math.sin(walkPhase) * 0.05 : 0;
  const camY = (hidden ? 1.05 : 1.6) + bob;
  camera.position.set(player.x, camY, player.z);
  const dirX = -Math.sin(player.yaw) * Math.cos(player.pitch), dirY = Math.sin(player.pitch), dirZ = -Math.cos(player.yaw) * Math.cos(player.pitch);
  camera.lookAt(player.x + dirX, camY + dirY, player.z + dirZ);
  flash.position.copy(camera.position);
  flashTarget.position.set(player.x + dirX * 6, camY + dirY * 6, player.z + dirZ * 6);

  // contextual action button
  let nearAct = null, nd = 2.3, kind = null;
  for (const p of props) {
    const d = Math.hypot(p.gx * T + T / 2 - player.x, p.gy * T + T / 2 - player.z);
    if (p.kind === 'wardrobe') { if (d < nd) { nd = d; nearAct = p; kind = 'hide'; } }
    else if (!p.searched && d < nd) { nd = d; nearAct = p; kind = 'search'; }
  }
  const threatened = enemy.state === 'chase' || enemy.nearness > 0.5;
  if (threatened && !hidden) { // prefer a hide spot when hunted
    let h = null, hd = 2.3; for (const p of props) if (p.kind === 'wardrobe') { const d = Math.hypot(p.gx * T + T / 2 - player.x, p.gy * T + T / 2 - player.z); if (d < hd) { hd = d; h = p; } }
    if (h) { nearAct = h; kind = 'hide'; }
  }
  const ab = document.getElementById('actBtn');
  ab.classList.toggle('hidden', !(hidden || nearAct) || state !== 'play');
  ab.textContent = hidden ? 'LEAVE' : (kind === 'hide' ? 'HIDE' : 'SEARCH');
  if (actReq) { actReq = false; if (hidden) leaveHide(); else if (nearAct) { if (kind === 'hide') enterHide(); else search(nearAct); } }

  // exit
  if (Math.hypot((exitTile.gx + 0.5) * T - player.x, (exitTile.gy + 0.5) * T - player.z) < 2.0) {
    if (keysHave >= KEYS_NEEDED) return win();
    else if (lockMsgT <= 0) { A.sfxLocked(); toast('The front door is locked. Three keys. (' + keysHave + '/3)'); lockMsgT = 2.2; }
  }
  lockMsgT -= dt;

  updateEnemy(dt);

  bellT -= dt; if (bellT <= 0) { if (enemy.nearness > 0.22) A.sfxBell(); bellT = 6 + Math.random() * 7; }
  glitchT -= dt; if (glitchT <= 0) { vhsGlitch(); glitchT = (enemy.nearness > 0.6 ? 1.5 : 4) + Math.random() * 4; }
  toastT -= dt; if (toastT <= 0) document.getElementById('toast').classList.remove('show');
  document.getElementById('batt').style.width = (battery * 100) + '%';
  document.getElementById('stam').style.width = (stamina * 100) + '%';
  document.getElementById('tc').textContent = fmt(playTime);
}

function enterHide() {
  hidden = true; A.sfxDoor(); document.getElementById('hideMask').classList.add('on');
  toast('You hold your breath in the dark.');
  const d = Math.hypot(enemy.x - player.x, enemy.z - player.z);
  if (enemy.state === 'chase' && d < 3.0 * T) { setTimeout(() => { if (state === 'play') { toast('She saw you climb in.'); die(); } }, 550); }
}
function leaveHide() { hidden = false; document.getElementById('hideMask').classList.remove('on'); }

function search(p) {
  p.searched = true; p.mesh.scale.z = 0.6; A.sfxDrawer();
  if (Math.hypot(enemy.x - player.x, enemy.z - player.z) < 6 * T) enemy.heard = { gx: tile(player.x), gy: tile(player.z) };
  if (p.contains === 'key') { keysHave++; A.sfxKey(); vhsGlitch(); updateHud(); toast(keysHave >= KEYS_NEEDED ? 'The last key. Get to the front door.' : 'An iron key. (' + keysHave + '/3)'); }
  else if (p.contains === 'battery') { battery = Math.min(1, battery + 0.35); A.sfxKey(); toast('Spare batteries.'); }
  else toast('Old rags and dust.');
}

function updateEnemy(dt) {
  const dx = player.x - enemy.x, dz = player.z - enemy.z, dist = Math.hypot(dx, dz);
  const pgx = tile(player.x), pgy = tile(player.z), egx = tile(enemy.x), egy = tile(enemy.z);
  const see = !hidden && dist < 11 * T && W.losClear(map, egx, egy, pgx, pgy);
  if (see) { enemy.chase = 4.5; enemy.state = 'chase'; enemy.heard = { gx: pgx, gy: pgy }; }
  else { enemy.chase -= dt; if (enemy.chase > 0) enemy.state = 'chase'; else if (enemy.heard) enemy.state = 'investigate'; else enemy.state = 'patrol'; }

  let goal;
  if (enemy.state === 'chase') { goal = (see ? { gx: pgx, gy: pgy } : (enemy.heard || { gx: pgx, gy: pgy })); enemy.speed = 3.2; }
  else if (enemy.state === 'investigate') {
    goal = enemy.heard; enemy.speed = 2.4;
    if (Math.hypot((goal.gx + 0.5) * T - enemy.x, (goal.gy + 0.5) * T - enemy.z) < 0.6 * T) enemy.heard = null;
  } else {
    enemy.speed = 1.8;
    if (!enemy.target || Math.hypot((enemy.target.gx + 0.5) * T - enemy.x, (enemy.target.gy + 0.5) * T - enemy.z) < 0.5 * T) {
      let rx, ry, tr = 0; do { rx = Math.random() * N | 0; ry = Math.random() * N | 0; tr++; } while ((map[ry][rx] !== 0 || blocked.has(ry * N + rx)) && tr < 200);
      enemy.target = { gx: rx, gy: ry };
    }
    goal = enemy.target;
  }
  enemy.repath -= dt;
  if (enemy.repath <= 0 || enemy.path.length === 0) { enemy.path = W.findPath(map, blocked, egx, egy, goal.gx, goal.gy); enemy.repath = enemy.state === 'chase' ? 0.3 : 0.6; }
  if (enemy.state === 'chase' && dist < 2.4 * T) {
    // final lunge — home directly on the player, not just the tile centre
    let ex = player.x - enemy.x, ez = player.z - enemy.z, d = Math.hypot(ex, ez) || 1; const step = enemy.speed * dt;
    enemy.x += ex / d * step; enemy.z += ez / d * step; enemy.path = [];
  } else if (enemy.path.length) {
    const [nx, ny] = enemy.path[0], cx = nx * T + T / 2, cz = ny * T + T / 2;
    let ex = cx - enemy.x, ez = cz - enemy.z, d = Math.hypot(ex, ez) || 1; const step = enemy.speed * dt;
    enemy.x += ex / d * step; enemy.z += ez / d * step;
    if (map[ny][nx] === 2) { map[ny][nx] = 0; (doors[nx + ',' + ny] || []).forEach(m => m.visible = false); }
    if (d < 0.3) enemy.path.shift();
  }
  enemy.spr.position.set(enemy.x, 1.05, enemy.z);
  enemy.nearness = Math.max(0, Math.min(1, 1 - dist / (9 * T)));

  heartT -= dt; const iv = 1.1 - enemy.nearness * 0.8;
  if (heartT <= 0 && enemy.nearness > 0.12) { A.heartbeat(0.3 + enemy.nearness * 0.9); heartT = iv; }
  let cl = enemy.state === 'chase' ? Math.min(1, 0.5 + enemy.nearness * 0.6) : (enemy.state === 'investigate' ? 0.15 : 0);
  A.setChaseAudio(hidden ? cl * 0.3 : cl);

  document.body.classList.toggle('shake', dist < 3.5 && !hidden);
  if (!hidden && dist < 1.7) die();
}

/* ---------- ui ---------- */
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); toastT = 3.2; }
function updateHud() { document.getElementById('obj').textContent = keysHave >= KEYS_NEEDED ? 'ESCAPE — THE FRONT DOOR' : 'SEARCH THE DRAWERS — ' + keysHave + '/3 KEYS'; }
function fmt(t) { t |= 0; const p = n => (n < 10 ? '0' : '') + n; return p(t / 3600 | 0) + ':' + p((t / 60 | 0) % 60) + ':' + p(t % 60); }
const vhsEl = document.getElementById('vhs');
function vhsGlitch() { vhsEl.classList.remove('glitch'); void vhsEl.offsetWidth; vhsEl.classList.add('glitch'); setTimeout(() => vhsEl.classList.remove('glitch'), 500); }

/* ---------- loop ---------- */
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') { update(dt); renderer.render(scene, camera); }
  requestAnimationFrame(loop);
}

/* ---------- flow ---------- */
function show(id, v) { const e = document.getElementById(id); if (e) e.classList.toggle('hidden', !v); }
function startGame() { A.initAudio(); buildLevel(); state = 'play'; ['hud', 'battWrap', 'stamWrap', 'vhs', 'runBtn', 'flashBtn'].forEach(i => show(i, true)); last = performance.now(); }
function hudOff() { ['hud', 'battWrap', 'stamWrap', 'runBtn', 'flashBtn', 'actBtn'].forEach(i => show(i, false)); A.setChaseAudio(0); document.body.classList.remove('shake'); }
function win() { state = 'over'; hudOff(); A.sfxWin(); const t = document.getElementById('overTitle'); t.textContent = 'YOU GOT OUT'; t.style.color = '#9ecb6a'; document.getElementById('overMsg').innerHTML = 'You spill into the night. She is still in there.'; show('over', true); }
function die() {
  if (state !== 'play') return; state = 'over'; hidden = false; document.getElementById('hideMask').classList.remove('on'); hudOff();
  A.sfxScream(); if (navigator.vibrate) navigator.vibrate([70, 40, 240]);
  jumpscare(() => { const t = document.getElementById('overTitle'); t.textContent = 'SHE FOUND YOU'; t.style.color = '#a40000'; document.getElementById('overMsg').innerHTML = 'You found <b>' + keysHave + '</b> of 3 keys.'; show('over', true); });
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
  document.getElementById('retryBtn').addEventListener('click', () => { A.resumeAudio(); show('over', false); startGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) A.suspendAudio(); else if (state === 'play') A.resumeAudio(); });
  requestAnimationFrame(loop);
})();
