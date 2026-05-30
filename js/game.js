"use strict";
/* ============================================================
   game.js — entry point. Owns the canvas + low-res render
   buffer, the raycasting renderer, player / Sister / item /
   furniture state, the update loop, the hiding mechanic,
   win-die flow and the jumpscare. Pulls together textures.js,
   audio.js, world.js and input.js.
   ============================================================ */

/* ---------- canvas + chunky PS1 render buffer ---------- */
const screen = document.getElementById('game');
const sctx = screen.getContext('2d');
let W = 0, H = 0, DPR = 1;

const buf = document.createElement('canvas');
const bx = buf.getContext('2d');
let bufW = 0, bufH = 0, zbuf = null;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  screen.width = Math.floor(W * DPR); screen.height = Math.floor(H * DPR);
  screen.style.width = W + 'px'; screen.style.height = H + 'px';
  sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  sctx.imageSmoothingEnabled = false;

  bufW = Math.max(150, Math.min(280, Math.round(W * 0.4)));
  bufH = Math.round(bufW * H / W);
  buf.width = bufW; buf.height = bufH;
  bx.imageSmoothingEnabled = false;
  zbuf = new Float32Array(bufW);
}
window.addEventListener('resize', resize);
resize();

/* ---------- constants ---------- */
const FOV = 0.66;
const FOG = 8.5;
const KEYS_NEEDED = 3;

// billboard sizing per sprite type: v=height(tiles) h=width(tiles) ho=hover
const SIZES = {
  nun:      { v: 2.25, h: 1.05, ho: 0 },
  key:      { v: 0.5,  h: 0.34, ho: 0.35 },
  note:     { v: 0.5,  h: 0.34, ho: 0.30 },
  wardrobe: { v: 1.7,  h: 0.92, ho: 0 },
  bed:      { v: 0.7,  h: 1.30, ho: 0 },
  table:    { v: 0.66, h: 0.95, ho: 0 },
  chair:    { v: 0.82, h: 0.5,  ho: 0 },
  candle:   { v: 0.55, h: 0.3,  ho: 0, glow: true },
  altar:    { v: 1.75, h: 0.85, ho: 0 },
};
function sprFor(type) {
  if (type === 'nun') return NUN_SPR;
  if (type === 'key') return KEY_SPR;
  if (type === 'note') return NOTE_SPR;
  return PROP_SPR[type];
}

/* ---------- state ---------- */
const player = { x: 0, y: 0, ang: 0, pitch: 0 };
let keysHave = 0;
let items = [];
let exit = { x: 0, y: 0 };
const enemy = { x: 0, y: 0, state: 'patrol', path: [], target: null, repath: 0, chase: 0, speed: 1.5, nearness: 0, lastKnown: null, searchT: 0 };

let hidden = false, hideSpot = null, nearHide = null;
let climax = false;             // triggered when all keys are found
let state = 'title';
let last = 0, raf = 0;
let stamina = 1;
let stepT = 0, heartT = 0, lockMsgT = 0, toastT = 0, bellT = 8, stalkT = 6;
let noiseTog = 0;

const toastEl = document.getElementById('toast');
const objEl = document.getElementById('obj');
const hideBtn = document.getElementById('hideBtn');
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); toastT = 3.6; }

function updateHud() {
  document.querySelectorAll('.kslot').forEach((el, i) => el.classList.toggle('has', i < keysHave));
}
function updateObjective() {
  objEl.innerHTML = climax || keysHave >= KEYS_NEEDED
    ? 'ESCAPE — THE FRONT DOOR'
    : 'FIND THE THREE KEYS (' + keysHave + '/3)';
}

/* ---------- new game ---------- */
function setup() {
  genMap();
  const spawn = roomCenter(0, 0);
  player.x = spawn.x + 0.5; player.y = spawn.y + 0.5; player.ang = Math.PI / 4; player.pitch = 0;
  keysHave = 0; items = []; hidden = false; hideSpot = null; climax = false;

  // locked front door on the outer (west) wall of the spawn room
  const sr = roomTiles(0, 0);
  const ey = sr.y0 + (ROOM >> 1);
  map[ey][0] = 9; exit = { x: 0.5, y: ey + 0.5 };

  // keys go in the three rooms farthest from spawn
  const dist = reachableRooms(0, 0);
  const rooms = [];
  for (const k in dist) { const [rx, ry] = k.split(',').map(Number); if (!(rx === 0 && ry === 0)) rooms.push({ rx, ry, d: dist[k] }); }
  rooms.sort((a, b) => b.d - a.d);
  for (let i = 0; i < KEYS_NEEDED && i < rooms.length; i++) {
    const c = roomCenter(rooms[i].rx, rooms[i].ry);
    items.push({ x: c.x + 0.5, y: c.y + 0.5, type: 'key', got: false });
  }
  // scatter lore notes in some of the middle rooms
  const noteRooms = rooms.slice(KEYS_NEEDED).filter((_, i) => i % 2 === 0).slice(0, 6);
  noteRooms.forEach((r, i) => { const c = roomCenter(r.rx, r.ry); items.push({ x: c.x + 0.5, y: c.y - 0.3, type: 'note', got: false, text: NOTES[i % NOTES.length] }); });

  // Sister starts far away
  const far = rooms[Math.min(2, rooms.length - 1)];
  const ec = roomCenter(far.rx, far.ry);
  enemy.x = ec.x + 0.5; enemy.y = ec.y + 0.5;
  enemy.state = 'patrol'; enemy.path = []; enemy.target = null; enemy.chase = 0; enemy.speed = 1.5; enemy.nearness = 0; enemy.lastKnown = null; enemy.searchT = 0;

  stamina = 1; bellT = 8; stalkT = 8;
  updateHud(); updateObjective();
}

/* ---------- movement / collision ---------- */
function walkable(tx, ty) { return map[ty] && map[ty][tx] === 0 && !isBlocked(tx, ty); }

function tryMove(nx, ny) {
  const r = 0.22;
  function openIfDoor(cx, cy) {
    const tx = cx | 0, ty = cy | 0;
    if (map[ty] && map[ty][tx] === 2) {
      map[ty][tx] = 0; doorOpened[ty][tx] = true; sfxDoor();
      if (Math.hypot(enemy.x - tx, enemy.y - ty) < 7) enemy.lastKnown = { x: tx, y: ty }; // a creak she can hear
    }
  }
  // X axis
  const cx = nx + Math.sign(nx - player.x) * r;
  if (map[player.y | 0] && map[player.y | 0][cx | 0] === 2) openIfDoor(cx, player.y);
  if (walkable(cx | 0, player.y | 0)) player.x = nx;
  // Y axis
  const cy = ny + Math.sign(ny - player.y) * r;
  if (map[cy | 0] && map[cy | 0][player.x | 0] === 2) openIfDoor(player.x, cy);
  if (walkable(player.x | 0, cy | 0)) player.y = ny;
}

/* ---------- hiding ---------- */
function findNearHide() {
  let best = null, bd = 1.35;
  for (const p of props) {
    if (!p.hide) continue;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function enterHide(spot) {
  hidden = true; hideSpot = spot;
  // face the furniture so the "peek" looks right
  player.ang = Math.atan2(spot.y - player.y, spot.x - player.x);
  sfxDoor();
  // hid too late? if she's actively chasing and right on top of you, she sees it
  const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
  if (enemy.state === 'chase' && d < 2.6 && losClear(enemy.x, enemy.y, player.x, player.y)) {
    setTimeout(() => { if (state === 'play') { toast("She saw you climb in."); die(); } }, 550);
  } else {
    toast("You hold your breath in the dark.");
  }
}
function leaveHide() { hidden = false; hideSpot = null; }

/* ---------- update ---------- */
function update(dt) {
  // consume HIDE button
  if (hideToggle) {
    hideToggle = false;
    if (hidden) leaveHide();
    else if (nearHide) enterHide(nearHide);
  }

  if (!hidden) doMovement(dt);

  // item pickups (also while peeking, you can't reach — only when not hidden)
  if (!hidden) {
    for (const it of items) {
      if (it.got) continue;
      if (Math.hypot(it.x - player.x, it.y - player.y) < 0.55) {
        it.got = true;
        if (it.type === 'key') {
          keysHave++; sfxKey(); updateHud(); updateObjective();
          if (keysHave >= KEYS_NEEDED) triggerClimax();
          else toast("An iron key, cold and heavy. (" + keysHave + "/3)");
        } else { sfxNote(); toast(it.text); }
      }
    }
    // front door
    if (Math.hypot(exit.x - player.x, exit.y - player.y) < 1.2) {
      if (keysHave >= KEYS_NEEDED) { win(); return; }
      else if (lockMsgT <= 0) { sfxLocked(); toast("The front door won't budge. Three keys. (" + keysHave + "/3)"); lockMsgT = 2.2; }
    }
  }

  lockMsgT -= dt; toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show');

  // hide button visibility
  nearHide = hidden ? null : findNearHide();
  const showHide = hidden || !!nearHide;
  hideBtn.classList.toggle('hidden', !showHide || state !== 'play');
  hideBtn.textContent = hidden ? 'LEAVE' : 'HIDE';

  updateEnemy(dt);

  bellT -= dt;
  if (bellT <= 0) { if (enemy.nearness > 0.22 || climax) sfxBell(); bellT = 6 + Math.random() * 7; }
}

function doMovement(dt) {
  let mx = moveV.x, my = moveV.y;
  if (keys['w']) my = -1; if (keys['s']) my = 1; if (keys['a']) mx = -1; if (keys['d']) mx = 1;
  if (keys['arrowleft']) player.ang -= 2 * dt; if (keys['arrowright']) player.ang += 2 * dt;

  const moving = (Math.abs(mx) + Math.abs(my)) > 0.1;
  const wantRun = (running || keys['shift']) && stamina > 0.02 && moving;
  const baseSpeed = 2.35 * (wantRun ? 1.7 : 1);
  if (wantRun) stamina = Math.max(0, stamina - dt * 0.42);
  else stamina = Math.min(1, stamina + dt * 0.28);

  const dirX = Math.cos(player.ang), dirY = Math.sin(player.ang);
  const fwd = -my, strafe = mx;
  let vx = dirX * fwd - dirY * strafe;
  let vy = dirY * fwd + dirX * strafe;
  const mag = Math.hypot(vx, vy);
  if (mag > 0.05) {
    vx /= mag; vy /= mag;
    const sp = baseSpeed * Math.min(1, mag) * dt;
    tryMove(player.x + vx * sp, player.y + vy * sp);
    stepT -= dt * (wantRun ? 1.7 : 1);
    if (stepT <= 0) { sfxStep(); stepT = 0.42; }
    // running is LOUD — she hears it nearby
    if (wantRun && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 9) {
      enemy.lastKnown = { x: player.x | 0, y: player.y | 0 };
    }
  }
}

function triggerClimax() {
  climax = true;
  enemy.lastKnown = { x: player.x | 0, y: player.y | 0 };
  enemy.chase = 6; enemy.state = 'chase';
  toast("THE LOCKS CLICK OPEN. She heard it. RUN.");
  sfxScream(); sfxBell();
  document.getElementById('redveil').style.opacity = 0.5;
  setTimeout(() => { if (state === 'play') document.getElementById('redveil').style.opacity = 0; }, 400);
}

/* ---------- Sister AI ---------- */
function teleportStalk() {
  for (let i = 0; i < 30; i++) {
    const rx = (Math.random() * RX) | 0, ry = (Math.random() * RY) | 0;
    const c = roomCenter(rx, ry);
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d > 6 && d < 12) { enemy.x = c.x + 0.5; enemy.y = c.y + 0.5; enemy.path = []; return; }
  }
}

function updateEnemy(dt) {
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const see = !hidden && dist < 11 && losClear(enemy.x, enemy.y, player.x, player.y);

  if (climax) { enemy.lastKnown = { x: player.x | 0, y: player.y | 0 }; enemy.state = 'chase'; enemy.chase = 1; }
  else if (see) { enemy.chase = 4.5; enemy.state = 'chase'; enemy.lastKnown = { x: player.x | 0, y: player.y | 0 }; }
  else {
    enemy.chase -= dt;
    if (enemy.chase > 0) enemy.state = 'chase';
    else if (enemy.lastKnown) enemy.state = 'investigate';
    else enemy.state = 'patrol';
  }

  // pick goal
  let goalX, goalY;
  if (enemy.state === 'chase') {
    const lk = (see || climax) ? { x: player.x | 0, y: player.y | 0 } : (enemy.lastKnown || { x: player.x | 0, y: player.y | 0 });
    goalX = lk.x; goalY = lk.y;
    enemy.speed = climax ? 2.55 : (2.0 + keysHave * 0.12);
  } else if (enemy.state === 'investigate') {
    goalX = enemy.lastKnown.x; goalY = enemy.lastKnown.y;
    enemy.speed = 1.55;
    if (Math.hypot(goalX + 0.5 - enemy.x, goalY + 0.5 - enemy.y) < 0.7) {
      enemy.lastKnown = null; enemy.searchT = 1.4 + Math.random(); // pause and look around
    }
  } else { // patrol
    enemy.speed = 1.25;
    if (enemy.searchT > 0) { enemy.searchT -= dt; goalX = enemy.x | 0; goalY = enemy.y | 0; }
    else {
      if (!enemy.target || Math.hypot(enemy.target.x + 0.5 - enemy.x, enemy.target.y + 0.5 - enemy.y) < 0.4) {
        let rx, ry, tries = 0;
        do { rx = (Math.random() * N) | 0; ry = (Math.random() * N) | 0; tries++; } while ((map[ry][rx] !== 0 || isBlocked(rx, ry)) && tries < 200);
        enemy.target = { x: rx, y: ry };
      }
      goalX = enemy.target.x; goalY = enemy.target.y;
    }
    // occasional stalk so she never wanders uselessly far
    stalkT -= dt;
    if (stalkT <= 0) { stalkT = 7 + Math.random() * 6; if (!see && dist > 16) teleportStalk(); }
  }

  enemy.repath -= dt;
  if (enemy.repath <= 0 || enemy.path.length === 0) {
    enemy.path = findPath(enemy.x | 0, enemy.y | 0, goalX, goalY);
    enemy.repath = enemy.state === 'chase' ? 0.3 : 0.6;
  }

  if (enemy.path.length && enemy.searchT <= 0) {
    const [nx, ny] = enemy.path[0];
    const cx = nx + 0.5, cy = ny + 0.5;
    let ex = cx - enemy.x, ey = cy - enemy.y; const d = Math.hypot(ex, ey) || 1;
    const sp = enemy.speed * dt;
    enemy.x += ex / d * sp; enemy.y += ey / d * sp;
    if (map[ny][nx] === 2) { map[ny][nx] = 0; doorOpened[ny][nx] = true; } // she opens doors
    if (d < 0.12) enemy.path.shift();
  }

  enemy.nearness = hidden ? Math.max(0, Math.min(0.5, 1 - dist / 9)) : Math.max(0, Math.min(1, 1 - dist / 9));

  heartT -= dt;
  const interval = 1.1 - enemy.nearness * 0.8;
  if (heartT <= 0 && enemy.nearness > 0.12) { heartbeat(0.3 + enemy.nearness * 0.9); heartT = interval; }

  if (!hidden && dist < 0.55) die();
}

/* ---------- render ---------- */
const noise = document.createElement('canvas'); noise.width = 128; noise.height = 128;
const nctx = noise.getContext('2d');
function refreshNoise() {
  const img = nctx.createImageData(128, 128), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  nctx.putImageData(img, 0, 0);
}

function render() {
  const horizon = (bufH * 0.5 + player.pitch) | 0;

  // ceiling
  let g = bx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  g.addColorStop(0, '#070709'); g.addColorStop(1, '#0c0c10');
  bx.fillStyle = g; bx.fillRect(0, 0, bufW, Math.max(0, horizon));
  // floor
  g = bx.createLinearGradient(0, Math.max(0, horizon), 0, bufH);
  g.addColorStop(0, '#0a0806'); g.addColorStop(1, '#201810');
  bx.fillStyle = g; bx.fillRect(0, Math.max(0, horizon), bufW, bufH - horizon);

  const dirX = Math.cos(player.ang), dirY = Math.sin(player.ang);
  const planeX = -Math.sin(player.ang) * FOV, planeY = Math.cos(player.ang) * FOV;

  // walls (DDA raycast)
  for (let x = 0; x < bufW; x++) {
    const camX = 2 * x / bufW - 1;
    const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
    let mapX = player.x | 0, mapY = player.y | 0;
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    let stepX, stepY, sideDX, sideDY;
    if (rdx < 0) { stepX = -1; sideDX = (player.x - mapX) * ddx; } else { stepX = 1; sideDX = (mapX + 1 - player.x) * ddx; }
    if (rdy < 0) { stepY = -1; sideDY = (player.y - mapY) * ddy; } else { stepY = 1; sideDY = (mapY + 1 - player.y) * ddy; }
    let hit = 0, side = 0, tile = 1, guard = 0;
    while (!hit && guard++ < 80) {
      if (sideDX < sideDY) { sideDX += ddx; mapX += stepX; side = 0; } else { sideDY += ddy; mapY += stepY; side = 1; }
      if (mapX < 0 || mapY < 0 || mapX >= N || mapY >= N) { hit = 1; tile = 1; break; }
      tile = map[mapY][mapX];
      if (tile === 1 || tile === 2 || tile === 9) hit = 1;
    }
    let perp = side === 0 ? (sideDX - ddx) : (sideDY - ddy);
    if (perp < 0.01) perp = 0.01;
    zbuf[x] = perp;

    const lineH = bufH / perp;
    const drawStart = (-lineH / 2 + horizon) | 0;
    const drawEnd = (lineH / 2 + horizon) | 0;

    let tex;
    if (tile === 2) tex = DOOR_TEX;
    else if (tile === 9) tex = EXIT_TEX;
    else { const rxv = (mapX / P) | 0, ryv = (mapY / P) | 0; tex = WALL_TEX[(rxv * 3 + ryv) & 3]; }

    let wallX = side === 0 ? player.y + perp * rdy : player.x + perp * rdx;
    wallX -= Math.floor(wallX);
    let texX = (wallX * TEXW) | 0;
    if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TEXW - texX - 1;

    const ds = Math.max(0, drawStart), de = Math.min(bufH, drawEnd);
    const sh = drawEnd - drawStart;
    if (sh > 0) {
      bx.drawImage(tex, texX, 0, 1, TEXH, x, drawStart, 1, sh);
      let fog = Math.min(0.94, perp / FOG);
      if (side === 1) fog = Math.min(0.96, fog + 0.18);
      if (tile === 9) { bx.fillStyle = climax ? 'rgba(200,120,40,0.32)' : 'rgba(120,70,30,0.18)'; bx.fillRect(x, ds, 1, de - ds); }
      bx.fillStyle = 'rgba(2,1,0,' + fog + ')'; bx.fillRect(x, ds, 1, de - ds);
    }
  }

  // sprites: furniture + items + Sister, sorted far -> near
  const sprs = [];
  for (const p of props) sprs.push({ x: p.x, y: p.y, type: p.type });
  for (const it of items) if (!it.got) sprs.push({ x: it.x, y: it.y, type: it.type });
  sprs.push({ x: enemy.x, y: enemy.y, type: 'nun' });
  for (const s of sprs) s._d = (s.x - player.x) ** 2 + (s.y - player.y) ** 2;
  sprs.sort((a, b) => b._d - a._d);

  const invDet = 1 / (planeX * dirY - dirX * planeY);
  for (const s of sprs) {
    if (s._d > 340) continue;                       // distance cull
    const dx = s.x - player.x, dy = s.y - player.y;
    const tx = invDet * (dirY * dx - dirX * dy);
    const ty = invDet * (-planeY * dx + planeX * dy); // depth
    if (ty <= 0.2) continue;
    const screenX = (bufW / 2) * (1 + tx / ty);
    const lineH = bufH / ty;
    const sz = SIZES[s.type]; const spr = sprFor(s.type);
    const sH = lineH * sz.v, sW = lineH * sz.h;
    const bottom = horizon + lineH / 2 - lineH * sz.ho;
    const topY = bottom - sH;
    const startX = (screenX - sW / 2) | 0, endX = (screenX + sW / 2) | 0;
    if (endX <= startX) continue;

    const fog = Math.min(0.92, ty / FOG);
    let alpha = Math.max(0, 1 - fog);
    if (s.type === 'key' || s.type === 'note') alpha *= 0.6 + 0.4 * Math.sin(performance.now() / 250 + s.x);
    if (sz.glow) { bx.globalCompositeOperation = 'lighter'; alpha = Math.max(0.25, 1 - fog * 0.6) * (0.8 + 0.2 * Math.sin(performance.now() / 90 + s.x)); }
    bx.globalAlpha = Math.max(0, Math.min(1, alpha));
    for (let x = Math.max(0, startX); x < Math.min(bufW, endX); x++) {
      if (ty >= zbuf[x]) continue;
      const u = ((x - startX) / (endX - startX) * spr.width) | 0;
      bx.drawImage(spr, u, 0, 1, spr.height, x, topY, 1, sH);
    }
    bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
  }

  // blit chunky buffer to screen
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(buf, 0, 0, bufW, bufH, 0, 0, W, H);

  // PS1 film grain
  noiseTog ^= 1;
  if (noiseTog) refreshNoise();
  sctx.save();
  sctx.globalAlpha = 0.05 + enemy.nearness * 0.16;
  sctx.globalCompositeOperation = 'screen';
  sctx.drawImage(noise, 0, 0, W, H);
  sctx.restore();

  // hiding: looking out through a slit
  if (hidden) {
    sctx.fillStyle = 'rgba(2,2,3,0.97)';
    sctx.fillRect(0, 0, W, H * 0.30);
    sctx.fillRect(0, H * 0.70, W, H * 0.30);
    sctx.fillStyle = 'rgba(0,0,0,0.45)';
    sctx.fillRect(0, 0, W * 0.10, H); sctx.fillRect(W * 0.90, 0, W * 0.10, H);
  }

  // red veil + shake when she's close
  const rv = document.getElementById('redveil');
  if (!climax) rv.style.opacity = enemy.nearness > 0.55 ? (enemy.nearness - 0.55) * 1.9 : 0;
  document.body.classList.toggle('shake', enemy.nearness > 0.8 && !hidden);

  document.getElementById('stam').style.width = (stamina * 100) + '%';
}

/* ---------- loop ---------- */
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') { update(dt); if (state === 'play') render(); }
  raf = requestAnimationFrame(loop);
}

function showHud(v) {
  document.getElementById('hud').classList.toggle('hidden', !v);
  document.getElementById('stamWrap').classList.toggle('hidden', !v);
  document.getElementById('runBtn').classList.toggle('hidden', !v);
  if (!v) hideBtn.classList.add('hidden');
}

function startGame() {
  setup(); state = 'play'; showHud(true);
  last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}

/* ---------- win / die ---------- */
function win() {
  state = 'over'; cancelAnimationFrame(raf); document.body.classList.remove('shake');
  document.getElementById('redveil').style.opacity = 0; showHud(false); sfxWin();
  const t = document.getElementById('overTitle'); t.textContent = 'YOU GOT OUT'; t.style.color = '#9ecb6a';
  document.getElementById('overMsg').innerHTML = 'You spill out into the cold night air.<br><br>The house falls silent behind you. She is still in there.<br>Waiting for the next one.';
  document.getElementById('over').classList.remove('hidden');
}

function die() {
  state = 'over'; cancelAnimationFrame(raf); document.body.classList.remove('shake'); showHud(false);
  sfxScream(); if (navigator.vibrate) navigator.vibrate([70, 40, 240]);
  jumpscare(() => {
    document.getElementById('redveil').style.opacity = 0;
    const t = document.getElementById('overTitle'); t.textContent = 'SHE FOUND YOU'; t.style.color = '#a40000';
    document.getElementById('overMsg').innerHTML = 'Cold hands close around you. The last thing you see is the white of her face.<br><br>You found <b>' + keysHave + '</b> of 3 keys.';
    document.getElementById('over').classList.remove('hidden');
  });
}

function jumpscare(done) {
  const jc = document.getElementById('jump'), c = document.getElementById('jumpCanvas'), x = c.getContext('2d');
  c.width = W; c.height = H; jc.classList.remove('hidden');
  let f = 0; const dur = 64;
  (function fr() {
    f++;
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    refreshNoise(); x.globalAlpha = 0.4; x.drawImage(noise, 0, 0, W, H); x.globalAlpha = 1;
    const sc = 0.5 + f / dur * 2.0, jx = (Math.random() - 0.5) * 22, jy = (Math.random() - 0.5) * 22;
    const h = Math.min(W, H) * 1.5 * sc, w = h * (NUN_SPR.width / NUN_SPR.height);
    x.drawImage(NUN_SPR, W / 2 - w / 2 + jx, H / 2 - h * 0.42 + jy, w, h);
    x.fillStyle = 'rgba(120,0,0,' + (0.15 + 0.25 * Math.random()) + ')'; x.fillRect(0, 0, W, H);
    if (f < dur) requestAnimationFrame(fr);
    else setTimeout(() => { jc.classList.add('hidden'); done(); }, 130);
  })();
}

/* ---------- buttons + boot ---------- */
document.getElementById('startBtn').addEventListener('click', () => {
  initAudio();
  document.getElementById('title').classList.add('hidden');
  startGame();
});
document.getElementById('retryBtn').addEventListener('click', () => {
  if (AC && AC.state === 'suspended') AC.resume();
  document.getElementById('over').classList.add('hidden');
  startGame();
});
document.addEventListener('visibilitychange', () => {
  if (!AC) return;
  if (document.hidden) AC.suspend(); else if (state === 'play') AC.resume();
});

initInput();
