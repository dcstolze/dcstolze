"use strict";
/* ============================================================
   textures.js — procedurally generated wall textures & sprites.
   No external image assets: everything is drawn to offscreen
   canvases so the game runs fully offline.
   ============================================================ */

const TEXW = 64, TEXH = 64;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* ---- walls ---- */
function wallTex(scheme) {
  const c = mk(TEXW, TEXH), x = c.getContext('2d');
  x.fillStyle = scheme.base; x.fillRect(0, 0, TEXW, TEXH);
  // vertical wallpaper stripes
  for (let i = 0; i < TEXW; i += 8) { x.fillStyle = scheme.stripe; x.fillRect(i, 0, 4, TEXH); }
  // faint damask diamonds
  x.fillStyle = scheme.accent;
  for (let yy = 4; yy < TEXH; yy += 16) for (let xx = 4; xx < TEXW; xx += 16) {
    x.beginPath(); x.moveTo(xx, yy - 3); x.lineTo(xx + 3, yy); x.lineTo(xx, yy + 3); x.lineTo(xx - 3, yy); x.fill();
  }
  // grime / water stains
  for (let i = 0; i < 70; i++) {
    const gx = Math.random() * TEXW, gy = Math.random() * TEXH;
    x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.18) + ')';
    x.fillRect(gx, gy, 1 + Math.random() * 2, 1 + Math.random() * 3);
  }
  // dark baseboard + ceiling line
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, TEXH - 7, TEXW, 7);
  x.fillStyle = 'rgba(0,0,0,0.3)';  x.fillRect(0, 0, TEXW, 3);
  // creeping shadow up from the floor
  const g = x.createLinearGradient(0, TEXH, 0, TEXH * 0.4);
  g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, TEXW, TEXH);
  return c;
}

/* ---- interior door ---- */
function doorTex() {
  const c = mk(TEXW, TEXH), x = c.getContext('2d');
  x.fillStyle = '#2c1d11'; x.fillRect(0, 0, TEXW, TEXH);
  for (let i = 0; i < TEXW; i += 4) { x.fillStyle = 'rgba(0,0,0,' + (0.1 + Math.random() * 0.12) + ')'; x.fillRect(i, 0, 1, TEXH); }
  x.strokeStyle = '#19100a'; x.lineWidth = 2;
  x.strokeRect(8, 6, TEXW - 16, 22); x.strokeRect(8, 34, TEXW - 16, 24);
  x.strokeStyle = '#3c2817'; x.lineWidth = 1;
  x.strokeRect(10, 8, TEXW - 20, 18); x.strokeRect(10, 36, TEXW - 20, 20);
  x.fillStyle = '#c9a14a'; x.beginPath(); x.arc(TEXW - 14, TEXH / 2, 3, 0, 7); x.fill();
  return c;
}

/* ---- the locked front door (the goal) ---- */
function exitTex() {
  const c = mk(TEXW, TEXH), x = c.getContext('2d');
  x.fillStyle = '#16100a'; x.fillRect(0, 0, TEXW, TEXH);
  for (let i = 0; i < TEXW; i += 5) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 2, TEXH); }
  x.fillStyle = '#3a2a18'; x.fillRect(TEXW / 2 - 4, 8, 8, TEXH - 16); x.fillRect(16, 22, TEXW - 32, 8);
  x.fillStyle = '#1c130b'; x.fillRect(TEXW / 2 - 2, 10, 2, TEXH - 20);
  x.fillStyle = '#5a4a30'; [[12, 12], [52, 12], [12, 52], [52, 52]].forEach(p => { x.beginPath(); x.arc(p[0], p[1], 2, 0, 7); x.fill(); });
  // freedom-light leaking under the door
  const g = x.createLinearGradient(0, TEXH, 0, TEXH - 14);
  g.addColorStop(0, 'rgba(180,120,60,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, TEXH - 14, TEXW, 14);
  return c;
}

const SCHEMES = [
  { base: '#23262c', stripe: '#1b1e23', accent: '#2e333b' }, // grey-blue
  { base: '#2a1c1c', stripe: '#201414', accent: '#3a2826' }, // maroon
  { base: '#212619', stripe: '#191d12', accent: '#2c3322' }, // sickly green
  { base: '#26201a', stripe: '#1c1712', accent: '#352b20' }, // brown
];
const WALL_TEX = SCHEMES.map(wallTex);
const DOOR_TEX = doorTex();
const EXIT_TEX = exitTex();

/* ---- swap in real CC0 PS1 textures (Miziziziz collection) once they load ----
   These overwrite the procedural canvases in place, so the renderer (which
   holds references to them) upgrades live. The procedural versions act as the
   fallback until the images arrive, and on any environment without Image. */
function overwriteTex(canvas, url, relight) {
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (relight) { // re-apply the floor-shadow so lighting still reads
      const g = x.createLinearGradient(0, canvas.height, 0, canvas.height * 0.4);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, canvas.width, canvas.height);
    }
  };
  img.onerror = () => {}; // keep procedural fallback
  img.src = url;
}
const TEXDIR = 'assets/textures/';
overwriteTex(WALL_TEX[0], TEXDIR + 'BRICK_3A.png', true);
overwriteTex(WALL_TEX[1], TEXDIR + 'CONCRETE_1A.png', true);
overwriteTex(WALL_TEX[2], TEXDIR + 'BRICK_1A.png', true);
overwriteTex(WALL_TEX[3], TEXDIR + 'CONCRETE_2A.png', true);
overwriteTex(DOOR_TEX, TEXDIR + 'DOOR_1A.png', false);

/* the Sister herself: a digitized character composited from the CC0 atlas,
   loaded over the procedural sprite (and resized to keep her detail). */
function overwriteSprite(canvas, url) {
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width; canvas.height = img.height;
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.drawImage(img, 0, 0);
  };
  img.onerror = () => {};
  img.src = url;
}

/* ---- sprites (transparent backgrounds) ---- */
function nunSprite() {
  const c = mk(64, 128), x = c.getContext('2d');
  // long black habit
  x.fillStyle = '#0a0a0c';
  x.beginPath();
  x.moveTo(32, 18); x.lineTo(50, 40); x.lineTo(58, 126); x.lineTo(6, 126); x.lineTo(14, 40); x.closePath(); x.fill();
  // robe folds
  x.strokeStyle = '#040405'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(32, 46); x.lineTo(32, 124); x.moveTo(24, 60); x.lineTo(20, 124); x.moveTo(40, 60); x.lineTo(44, 124); x.stroke();
  // wimple (white frame around the face)
  x.fillStyle = '#d9d3c4';
  x.beginPath(); x.moveTo(32, 6); x.quadraticCurveTo(54, 8, 52, 40); x.quadraticCurveTo(40, 52, 32, 52);
  x.quadraticCurveTo(24, 52, 12, 40); x.quadraticCurveTo(10, 8, 32, 6); x.fill();
  // veil shadow over the wimple
  x.fillStyle = '#0a0a0c';
  x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(56, 4, 54, 30); x.quadraticCurveTo(50, 18, 32, 16);
  x.quadraticCurveTo(14, 18, 10, 30); x.quadraticCurveTo(8, 4, 32, 4); x.fill();
  // pale face
  x.fillStyle = '#cbbfa9';
  x.beginPath(); x.ellipse(32, 33, 12, 15, 0, 0, 7); x.fill();
  // hollow black eyes
  x.fillStyle = '#000';
  x.beginPath(); x.ellipse(27, 31, 3.2, 5, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(37, 31, 3.2, 5, 0, 0, 7); x.fill();
  // gaunt cheeks + grim mouth
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(24, 40, 16, 1.4);
  x.strokeStyle = '#1a0c0c'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(27, 43); x.lineTo(37, 43); x.stroke();
  // blood trickle
  x.strokeStyle = 'rgba(120,0,0,0.8)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(30, 38); x.lineTo(29, 50); x.stroke();
  // arm + cleaver
  x.fillStyle = '#0a0a0c'; x.fillRect(44, 52, 8, 30);
  x.fillStyle = '#b9bcc2';
  x.beginPath(); x.moveTo(50, 50); x.lineTo(60, 44); x.lineTo(62, 60); x.lineTo(50, 64); x.closePath(); x.fill();
  x.fillStyle = '#6a4a2a'; x.fillRect(49, 62, 4, 16);
  return c;
}
function keySprite() {
  const c = mk(32, 48), x = c.getContext('2d');
  x.strokeStyle = '#d8b24a'; x.fillStyle = '#d8b24a'; x.lineWidth = 4; x.lineCap = 'round';
  x.beginPath(); x.arc(16, 12, 7, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(16, 18); x.lineTo(16, 42); x.stroke();
  x.fillRect(16, 34, 8, 3); x.fillRect(16, 40, 6, 3);
  return c;
}
function noteSprite() {
  const c = mk(32, 40), x = c.getContext('2d');
  x.fillStyle = '#e6e1d2'; x.fillRect(7, 4, 18, 32);
  x.strokeStyle = '#9a917e'; x.lineWidth = 1; x.strokeRect(7, 4, 18, 32);
  x.fillStyle = '#9a917e'; for (let i = 0; i < 5; i++) x.fillRect(10, 9 + i * 5, 12, 1);
  return c;
}
function batterySprite() {
  const c = mk(32, 40), x = c.getContext('2d');
  // soft glow so it's findable in the dark
  const g = x.createRadialGradient(16, 20, 1, 16, 20, 16);
  g.addColorStop(0, 'rgba(120,200,255,0.5)'); g.addColorStop(1, 'rgba(80,160,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(16, 20, 16, 0, 7); x.fill();
  // body
  x.fillStyle = '#1c2630'; x.fillRect(10, 8, 12, 26);
  x.fillStyle = '#cf3a2a'; x.fillRect(10, 8, 12, 9);     // red top band
  x.fillStyle = '#d8b24a'; x.fillRect(13, 5, 6, 3);      // terminal
  // "+" / "-"
  x.fillStyle = '#e6e1d2'; x.fillRect(13, 24, 6, 1.5); x.fillRect(15.5, 21.5, 1.5, 6);
  return c;
}
const NUN_SPR = nunSprite(), KEY_SPR = keySprite(), NOTE_SPR = noteSprite(), BATTERY_SPR = batterySprite();
const NUN_FACE = nunSprite(); // jumpscare close-up (procedural fallback until the render loads)

// swap the procedural Sister for the 3D-rendered CC0 character once it loads
overwriteSprite(NUN_SPR, 'assets/characters/sister.png');
overwriteSprite(NUN_FACE, 'assets/characters/sister_face.png');

/* ---- furniture / props (billboards) ---- */
function wardrobeSprite() {
  const c = mk(48, 96), x = c.getContext('2d');
  x.fillStyle = '#2a1c10'; x.fillRect(4, 4, 40, 90);
  x.fillStyle = '#1c120a'; x.fillRect(4, 4, 40, 90); x.fillStyle = '#33220f';
  x.fillRect(6, 6, 36, 86);
  x.strokeStyle = '#0e0905'; x.lineWidth = 2; x.strokeRect(8, 9, 14, 80); x.strokeRect(26, 9, 14, 80);
  x.fillStyle = '#c9a14a'; x.beginPath(); x.arc(20, 50, 2, 0, 7); x.arc(28, 50, 2, 0, 7); x.fill();
  // wood grain
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1;
  for (let i = 10; i < 40; i += 6) { x.beginPath(); x.moveTo(i, 9); x.lineTo(i, 89); x.stroke(); }
  return c;
}
function bedSprite() {
  const c = mk(72, 56), x = c.getContext('2d');
  // frame
  x.fillStyle = '#241710'; x.fillRect(2, 16, 68, 34);
  // headboard
  x.fillStyle = '#1a0f08'; x.fillRect(2, 2, 12, 48);
  // mattress / stained sheets
  x.fillStyle = '#b9b0a0'; x.fillRect(14, 18, 54, 18);
  x.fillStyle = '#a39a88'; x.fillRect(14, 28, 54, 8);
  // pillow
  x.fillStyle = '#cfc7b8'; x.fillRect(16, 16, 16, 12);
  // old blood stain
  x.fillStyle = 'rgba(90,0,0,0.5)'; x.beginPath(); x.ellipse(46, 26, 10, 5, 0, 0, 7); x.fill();
  return c;
}
function tableSprite() {
  const c = mk(60, 48), x = c.getContext('2d');
  x.fillStyle = '#3a2613'; x.fillRect(4, 14, 52, 8);
  x.fillStyle = '#2a1b0d'; x.fillRect(8, 22, 4, 24); x.fillRect(48, 22, 4, 24);
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1; for (let i = 6; i < 56; i += 5) { x.beginPath(); x.moveTo(i, 14); x.lineTo(i, 22); x.stroke(); }
  return c;
}
function chairSprite() {
  const c = mk(28, 48), x = c.getContext('2d');
  x.fillStyle = '#2a1b0d'; x.fillRect(6, 4, 4, 42); x.fillRect(6, 24, 16, 4);
  x.fillRect(18, 24, 4, 22); x.fillRect(6, 42, 4, 4); x.fillRect(18, 42, 4, 4);
  return c;
}
function candleSprite() {
  const c = mk(24, 48), x = c.getContext('2d');
  // glow halo (additive look)
  const g = x.createRadialGradient(12, 14, 1, 12, 14, 14);
  g.addColorStop(0, 'rgba(255,180,80,0.7)'); g.addColorStop(1, 'rgba(255,150,40,0)');
  x.fillStyle = g; x.beginPath(); x.arc(12, 14, 14, 0, 7); x.fill();
  // wax
  x.fillStyle = '#d8cdb4'; x.fillRect(9, 22, 6, 22);
  // flame
  x.fillStyle = '#ffcf6a'; x.beginPath(); x.ellipse(12, 16, 2.4, 5, 0, 0, 7); x.fill();
  x.fillStyle = '#fff4c8'; x.beginPath(); x.ellipse(12, 17, 1.2, 3, 0, 0, 7); x.fill();
  return c;
}
function altarSprite() {
  const c = mk(48, 96), x = c.getContext('2d');
  // cross
  x.fillStyle = '#5a4630'; x.fillRect(21, 6, 6, 60); x.fillRect(10, 22, 28, 6);
  x.fillStyle = '#3a2c1c'; x.fillRect(23, 8, 2, 56);
  // table base
  x.fillStyle = '#241710'; x.fillRect(6, 66, 36, 26);
  x.fillStyle = '#3a0000'; x.fillRect(6, 66, 36, 6); // bloody cloth
  // two candles
  x.fillStyle = '#d8cdb4'; x.fillRect(12, 56, 4, 12); x.fillRect(32, 56, 4, 12);
  x.fillStyle = '#ffcf6a'; x.beginPath(); x.ellipse(14, 53, 1.6, 4, 0, 0, 7); x.ellipse(34, 53, 1.6, 4, 0, 0, 7); x.fill();
  return c;
}
const PROP_SPR = {
  wardrobe: wardrobeSprite(),
  bed: bedSprite(),
  table: tableSprite(),
  chair: chairSprite(),
  candle: candleSprite(),
  altar: altarSprite(),
};
