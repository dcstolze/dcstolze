"use strict";
/* ============================================================
   world.js — the mansion. A grid of rooms is carved out of a
   solid block of wall, then connected with a randomised
   spanning tree of doorways so EVERY room is always reachable.
   Rooms are then furnished with props (some of which double as
   hiding spots). Also holds grid queries used by the renderer
   and the AI: line-of-sight and BFS pathfinding.
   ============================================================ */

const RX = 5, RY = 5;     // rooms across / down  (25-room mansion)
const ROOM = 5;           // interior tiles per room
const P = ROOM + 1;       // pitch including the shared wall
const N = RX * P + 1;     // full map dimension (tiles)

// 0 = floor, 1 = wall, 2 = closed door, 9 = locked front door
let map = [];
let doorOpened = null;

// props: { x, y, tx, ty, type, solid, hide }  (tx,ty = tile)
let props = [];
// tiles that block movement/pathing because furniture sits there
let blocked = null;       // Uint8Array(N*N)

const NOTES = [
  "“Day 9. The keys are gone. She carried them off into the rooms.”",
  "“If you hear the bell, stop moving. She hunts by sound.”",
  "“The front door has three locks. Three keys. No mercy.”",
  "“I climbed inside the wardrobe and held my breath. Her shadow passed twice.”",
  "“Sister does not blink. Sister does not tire. Sister does not stop.”",
  "“There is no God left in this house. Only her.”",
  "“Don't run when she's close. She can hear your heart.”",
  "“Hide. Wait. Pray she walks the other way.”",
];

function inRoom(rx, ry) { return rx >= 0 && ry >= 0 && rx < RX && ry < RY; }
function roomTiles(rx, ry) { return { x0: rx * P + 1, y0: ry * P + 1, x1: rx * P + ROOM, y1: ry * P + ROOM }; }
function roomCenter(rx, ry) { const r = roomTiles(rx, ry); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; }

function isBlocked(tx, ty) { return blocked && blocked[ty * N + tx] === 1; }

function genMap() {
  map = [];
  for (let y = 0; y < N; y++) map.push(new Array(N).fill(1));

  // carve room interiors
  for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
    const r = roomTiles(rx, ry);
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) map[y][x] = 0;
  }

  // knock a door through the wall shared by two rooms
  function door(rx, ry, nx, ny) {
    if (nx > rx)      map[ry * P + 1 + (ROOM >> 1)][(rx + 1) * P] = 2;
    else if (nx < rx) map[ry * P + 1 + (ROOM >> 1)][rx * P] = 2;
    else if (ny > ry) map[(ry + 1) * P][rx * P + 1 + (ROOM >> 1)] = 2;
    else              map[ry * P][rx * P + 1 + (ROOM >> 1)] = 2;
  }

  // randomised DFS spanning tree -> guarantees full connectivity
  const vis = new Array(RX * RY).fill(false);
  const stack = [[0, 0]]; vis[0] = true;
  while (stack.length) {
    const [rx, ry] = stack[stack.length - 1];
    const opts = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => {
      const nx = rx + d[0], ny = ry + d[1];
      if (inRoom(nx, ny) && !vis[ny * RX + nx]) opts.push([nx, ny]);
    });
    if (opts.length) {
      const [nx, ny] = opts[(Math.random() * opts.length) | 0];
      door(rx, ry, nx, ny); vis[ny * RX + nx] = true; stack.push([nx, ny]);
    } else stack.pop();
  }

  // extra doors for loops (fewer dead ends, more ways for her to appear)
  for (let i = 0; i < 7; i++) {
    const rx = (Math.random() * RX) | 0, ry = (Math.random() * RY) | 0;
    const d = [[1, 0], [0, 1]][(Math.random() * 2) | 0];
    const nx = rx + d[0], ny = ry + d[1];
    if (inRoom(nx, ny)) door(rx, ry, nx, ny);
  }

  doorOpened = [];
  for (let y = 0; y < N; y++) doorOpened.push(new Array(N).fill(false));

  generateProps();
}

/* ---- furnish the rooms ---- */
const THEMES = ['bedroom', 'bedroom', 'dining', 'study', 'chapel', 'bare'];

function generateProps() {
  props = [];
  blocked = new Uint8Array(N * N);

  function place(tx, ty, type, solid, hide) {
    if (solid) blocked[ty * N + tx] = 1;
    props.push({ x: tx + 0.5, y: ty + 0.5, tx, ty, type, solid, hide });
  }

  for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
    const r = roomTiles(rx, ry);
    const cx = r.x0 + (ROOM >> 1), cy = r.y0 + (ROOM >> 1);
    // candidate tiles = interior minus the central cross (keeps doorways linked)
    const spots = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (x === cx || y === cy) continue;
      spots.push([x, y]);
    }
    // shuffle
    for (let i = spots.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }

    const spawnRoom = (rx === 0 && ry === 0);
    const theme = spawnRoom ? 'bare' : THEMES[(Math.random() * THEMES.length) | 0];
    let pick = 0;
    const next = () => spots[pick++];

    if (theme === 'bedroom') {
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'bed', true, true); }
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'wardrobe', true, true); }
      if (spots[pick] && Math.random() < 0.6) { const [x, y] = next(); place(x, y, 'candle', false, false); }
    } else if (theme === 'dining') {
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'table', true, false); }
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'chair', true, false); }
      if (spots[pick] && Math.random() < 0.7) { const [x, y] = next(); place(x, y, 'candle', false, false); }
    } else if (theme === 'study') {
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'table', true, false); }
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'wardrobe', true, true); }
      if (spots[pick] && Math.random() < 0.5) { const [x, y] = next(); place(x, y, 'candle', false, false); }
    } else if (theme === 'chapel') {
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'altar', true, false); }
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'candle', false, false); }
      if (spots[pick]) { const [x, y] = next(); place(x, y, 'candle', false, false); }
    } else { // bare-ish
      if (spawnRoom) { if (spots[pick]) { const [x, y] = next(); place(x, y, 'candle', false, false); } }
      else if (Math.random() < 0.5 && spots[pick]) { const [x, y] = next(); place(x, y, 'candle', false, false); }
    }
  }

  // guarantee at least a handful of hiding spots exist somewhere
  let hides = props.filter(p => p.hide).length;
  let safety = 0;
  while (hides < 6 && safety++ < 60) {
    const rx = (Math.random() * RX) | 0, ry = (Math.random() * RY) | 0;
    if (rx === 0 && ry === 0) continue;
    const r = roomTiles(rx, ry);
    const cx = r.x0 + (ROOM >> 1), cy = r.y0 + (ROOM >> 1);
    const x = r.x0 + (Math.random() * ROOM | 0), y = r.y0 + (Math.random() * ROOM | 0);
    if (x === cx || y === cy) continue;
    if (blocked[y * N + x]) continue;
    blocked[y * N + x] = 1;
    props.push({ x: x + 0.5, y: y + 0.5, tx: x, ty: y, type: 'wardrobe', solid: true, hide: true });
    hides++;
  }
}

// rooms reachable from a start room, following doorways
function reachableRooms(srx, sry) {
  const dist = {}; const q = [[srx, sry]]; dist[srx + ',' + sry] = 0;
  function connected(ax, ay, bx, by) {
    let wx, wy;
    if (bx > ax)      { wx = (ax + 1) * P; wy = ay * P + 1 + (ROOM >> 1); }
    else if (bx < ax) { wx = ax * P;       wy = ay * P + 1 + (ROOM >> 1); }
    else if (by > ay) { wy = (ay + 1) * P; wx = ax * P + 1 + (ROOM >> 1); }
    else              { wy = ay * P;       wx = ax * P + 1 + (ROOM >> 1); }
    const t = map[wy][wx]; return t === 0 || t === 2;
  }
  while (q.length) {
    const [rx, ry] = q.shift();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => {
      const nx = rx + d[0], ny = ry + d[1];
      if (inRoom(nx, ny) && !(nx + ',' + ny in dist) && connected(rx, ry, nx, ny)) {
        dist[nx + ',' + ny] = dist[rx + ',' + ry] + 1; q.push([nx, ny]);
      }
    });
  }
  return dist;
}

// is the straight line between two points unobstructed by walls?
function losClear(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / 0.12);
  for (let i = 1; i < steps; i++) {
    const x = x0 + dx * i / steps, y = y0 + dy * i / steps;
    const t = map[y | 0] && map[y | 0][x | 0];
    if (t === 1 || t === 2 || t === 9) return false;
  }
  return true;
}

// BFS shortest path over passable tiles (floor / open door, not furniture)
function findPath(sx, sy, tx, ty) {
  const start = sy * N + sx, goal = ty * N + tx;
  const prev = new Int32Array(N * N).fill(-1);
  const seen = new Uint8Array(N * N);
  const q = [start]; seen[start] = 1; let head = 0;
  while (head < q.length) {
    const cur = q[head++]; if (cur === goal) break;
    const cx = cur % N, cy = (cur / N) | 0;
    const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const t = map[ny][nx]; if (!(t === 0 || t === 2)) continue;
      const idx = ny * N + nx; if (seen[idx]) continue;
      if (blocked[idx] && idx !== goal) continue;
      seen[idx] = 1; prev[idx] = cur; q.push(idx);
    }
  }
  if (!seen[goal]) return [];
  const path = []; let c = goal;
  while (c !== start && c !== -1) { path.push([c % N, (c / N) | 0]); c = prev[c]; }
  path.reverse(); return path;
}
