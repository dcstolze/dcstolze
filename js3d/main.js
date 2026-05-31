// main.js — SISTER: explore the abandoned farm. First-person, PS1 / VHS look.
// The farm is the entire game: free roam at night with a flashlight.
import * as THREE from '../assets/vendor/three.module.js';
import * as A from './audio.js';
import * as F from './farm.js';

/* ---------- renderer at low internal resolution (PS1 chunk) ---------- */
const cv = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x0a0e18, 1);
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
scene.fog = new THREE.FogExp2(0x0a0e18, 0.022);
const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 300);
const moon = new THREE.DirectionalLight(0xaec4e8, 0.9); moon.position.set(-8, 14, 6); scene.add(moon);
const moonFill = new THREE.DirectionalLight(0x4a5a7a, 0.35); moonFill.position.set(6, 8, -4); scene.add(moonFill);
const amb = new THREE.AmbientLight(0x3a4663, 0.7); scene.add(amb);
const flash = new THREE.SpotLight(0xffe8c4, 2.6, 24, Math.PI / 5.5, 0.6, 1.3);
const flashTarget = new THREE.Object3D();
scene.add(flash, flashTarget); flash.target = flashTarget;

/* ---------- state ---------- */
const player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let battery = 1, flashOn = true, running = false, playTime = 0, stamina = 1, walkPhase = 0;
let state = 'title';
let stepT = 0, glitchT = 4, toastT = 0;

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
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
let mDown = false, mLook = false;
cv.addEventListener('mousedown', e => { if (e.clientX < window.innerWidth * 0.5) { mDown = true; mox = e.clientX; moy = e.clientY; } else { mLook = true; lastLX = e.clientX; lastLY = e.clientY; } });
window.addEventListener('mousemove', e => { if (mDown) { let dx = e.clientX - mox, dy = e.clientY - moy, m = Math.hypot(dx, dy), mx = 55; if (m > mx) { dx = dx / m * mx; dy = dy / m * mx; } mv.x = dx / mx; mv.y = dy / mx; } if (mLook) { player.yaw -= (e.clientX - lastLX) * 0.005; player.pitch = Math.max(-0.9, Math.min(0.9, player.pitch - (e.clientY - lastLY) * 0.004)); lastLX = e.clientX; lastLY = e.clientY; } });
window.addEventListener('mouseup', () => { mDown = mLook = false; mv.x = 0; mv.y = 0; });
function bindBtn(id, on, off) { const el = document.getElementById(id); if (!el) return; ['touchstart', 'mousedown'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); on(); }, { passive: false })); if (off) ['touchend', 'touchcancel', 'mouseup'].forEach(ev => el.addEventListener(ev, off)); }

/* ---------- update: free roam the farm ---------- */
function updateFarm(dt) {
  playTime += dt;
  let ix = mv.x, iy = mv.y;
  if (keys['w']) iy = -1; if (keys['s']) iy = 1; if (keys['a']) ix = -1; if (keys['d']) ix = 1;
  const moving = Math.abs(ix) + Math.abs(iy) > 0.12;
  const wantRun = (running || keys['shift']) && moving && stamina > 0.02;
  if (wantRun) stamina = Math.max(0, stamina - dt * 0.42); else stamina = Math.min(1, stamina + dt * 0.28);
  const sp = (wantRun ? 4.6 : 3.1) * dt;
  if (moving) {
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    let vx = (-s) * (-iy) + c * ix, vz = (-c) * (-iy) + (-s) * ix;
    const m = Math.hypot(vx, vz) || 1; vx /= m; vz /= m;
    const mag = Math.min(1, Math.hypot(ix, iy));
    F.moveFarm(player, player.x + vx * sp * mag, player.z + vz * sp * mag);
    walkPhase += dt * (wantRun ? 13 : 9);
    stepT -= dt * (wantRun ? 1.7 : 1);
    if (stepT <= 0) { A.sfxStep(wantRun); stepT = 0.42; }
  }
  if (flashOn) battery = Math.max(0, battery - dt / 120);
  if (battery <= 0) flashOn = false;
  let fi = flashOn ? 2.6 : 0.0; if (fi > 0) fi *= 0.92 + Math.random() * 0.16;
  flash.intensity = fi;

  const bob = moving ? Math.sin(walkPhase) * 0.05 : 0;
  const camY = F.farm.eye + bob;
  camera.position.set(player.x, camY, player.z);
  const dirX = -Math.sin(player.yaw) * Math.cos(player.pitch), dirY = Math.sin(player.pitch), dirZ = -Math.cos(player.yaw) * Math.cos(player.pitch);
  camera.lookAt(player.x + dirX, camY + dirY, player.z + dirZ);
  flash.position.copy(camera.position);
  flashTarget.position.set(player.x + dirX * 6, camY + dirY * 6, player.z + dirZ * 6);

  glitchT -= dt; if (glitchT <= 0) { vhsGlitch(); glitchT = 5 + Math.random() * 4; }
  toastT -= dt; if (toastT <= 0) document.getElementById('toast').classList.remove('show');
  document.getElementById('batt').style.width = (battery * 100) + '%';
  document.getElementById('stam').style.width = (stamina * 100) + '%';
  document.getElementById('tc').textContent = fmt(playTime);
}

/* ---------- ui ---------- */
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); toastT = 3.2; }
function fmt(t) { t |= 0; const p = n => (n < 10 ? '0' : '') + n; return p(t / 3600 | 0) + ':' + p((t / 60 | 0) % 60) + ':' + p(t % 60); }
const vhsEl = document.getElementById('vhs');
function vhsGlitch() { vhsEl.classList.remove('glitch'); void vhsEl.offsetWidth; vhsEl.classList.add('glitch'); setTimeout(() => vhsEl.classList.remove('glitch'), 500); }

/* ---------- loop ---------- */
let last = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'farm') { updateFarm(dt); renderer.render(scene, camera); }
  requestAnimationFrame(loop);
}

/* ---------- flow ---------- */
function show(id, v) { const e = document.getElementById(id); if (e) e.classList.toggle('hidden', !v); }
let farmLoaded = false;
async function startFarm() {
  A.initAudio();
  document.getElementById('introText').textContent = 'Arriving at Hollow Farm…';
  document.getElementById('intro').classList.remove('hidden');
  try {
    if (!farmLoaded) {
      await F.loadFarm(scene, (p) => { document.getElementById('introText').textContent = 'Arriving at Hollow Farm… ' + Math.round(p * 100) + '%'; });
      farmLoaded = true;
    }
    F.farm.group.visible = true;
  } catch (e) {
    document.getElementById('introText').textContent = 'Failed to load the farm. Reload to retry.';
    return;
  }
  battery = 1; flashOn = true; stamina = 1; playTime = 0;
  F.spawn(player);
  state = 'farm';
  ['hud', 'battWrap', 'stamWrap', 'vhs', 'runBtn', 'flashBtn'].forEach(i => show(i, true));
  document.getElementById('obj').textContent = 'HOLLOW FARM';
  document.getElementById('intro').classList.add('hidden');
  last = performance.now();
}

/* ---------- boot ---------- */
(async function boot() {
  resize(); window.addEventListener('resize', resize);
  bindBtn('runBtn', () => running = true, () => running = false);
  bindBtn('flashBtn', () => { if (battery > 0.001) flashOn = !flashOn; });
  document.getElementById('startBtn').addEventListener('click', () => { A.initAudio(); show('title', false); startFarm(); });
  const rb = document.getElementById('retryBtn'); if (rb) rb.addEventListener('click', () => { A.resumeAudio(); show('over', false); startFarm(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) A.suspendAudio(); else if (state === 'farm') A.resumeAudio(); });
  requestAnimationFrame(loop);
})();
