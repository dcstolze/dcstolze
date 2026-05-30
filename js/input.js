"use strict";
/* ============================================================
   input.js — touch + mouse + keyboard controls.
   Left half of the screen is a virtual move-stick, right half
   is a look/drag area, plus a held RUN button. References the
   globals `screen`, `player`, `W`, `bufH` defined in game.js
   (classic scripts share one global scope); listeners only
   read them at runtime, after game.js has initialised them.
   ============================================================ */

const moveV = { x: 0, y: 0, active: false, ox: 0, oy: 0 };
let moveId = null, lookId = null, lastLookX = 0, lastLookY = 0;
let running = false;
let hideToggle = false;   // one-shot: set by the HIDE button, consumed by the game loop
const keys = {};

function requestHide() { hideToggle = true; }

function onStart(id, x, y) {
  if (x < W * 0.5 && moveId === null) {
    moveId = id; moveV.active = true; moveV.ox = x; moveV.oy = y; moveV.x = 0; moveV.y = 0;
  } else if (lookId === null) {
    lookId = id; lastLookX = x; lastLookY = y;
  }
}
function onMove(id, x, y) {
  if (id === moveId) {
    let dx = x - moveV.ox, dy = y - moveV.oy;
    const m = Math.hypot(dx, dy), max = 58;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    moveV.x = dx / max; moveV.y = dy / max;
  } else if (id === lookId) {
    player.ang += (x - lastLookX) * 0.005;
    player.pitch = Math.max(-bufH * 0.28, Math.min(bufH * 0.28, player.pitch - (y - lastLookY) * 0.6));
    lastLookX = x; lastLookY = y;
  }
}
function onEnd(id) {
  if (id === moveId) { moveId = null; moveV.active = false; moveV.x = 0; moveV.y = 0; }
  else if (id === lookId) { lookId = null; }
}

function initInput() {
  screen.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) onStart(t.identifier, t.clientX, t.clientY); }, { passive: false });
  screen.addEventListener('touchmove',  e => { e.preventDefault(); for (const t of e.changedTouches) onMove(t.identifier, t.clientX, t.clientY); }, { passive: false });
  screen.addEventListener('touchend',   e => { e.preventDefault(); for (const t of e.changedTouches) onEnd(t.identifier); }, { passive: false });
  screen.addEventListener('touchcancel',e => { e.preventDefault(); for (const t of e.changedTouches) onEnd(t.identifier); }, { passive: false });

  // mouse fallback (desktop testing)
  let mDown = false, mLook = false;
  screen.addEventListener('mousedown', e => {
    if (e.clientX < W * 0.5) { mDown = true; moveV.active = true; moveV.ox = e.clientX; moveV.oy = e.clientY; }
    else { mLook = true; lastLookX = e.clientX; lastLookY = e.clientY; }
  });
  window.addEventListener('mousemove', e => {
    if (mDown) {
      let dx = e.clientX - moveV.ox, dy = e.clientY - moveV.oy, m = Math.hypot(dx, dy), max = 58;
      if (m > max) { dx = dx / m * max; dy = dy / m * max; }
      moveV.x = dx / max; moveV.y = dy / max;
    }
    if (mLook) {
      player.ang += (e.clientX - lastLookX) * 0.005;
      player.pitch = Math.max(-bufH * 0.28, Math.min(bufH * 0.28, player.pitch - (e.clientY - lastLookY) * 0.6));
      lastLookX = e.clientX; lastLookY = e.clientY;
    }
  });
  window.addEventListener('mouseup', () => { mDown = false; mLook = false; moveV.active = false; moveV.x = 0; moveV.y = 0; });

  // keyboard fallback
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

  // RUN button (hold)
  const runBtn = document.getElementById('runBtn');
  ['touchstart', 'mousedown'].forEach(ev => runBtn.addEventListener(ev, e => { e.preventDefault(); running = true; runBtn.classList.add('act'); }, { passive: false }));
  ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev => runBtn.addEventListener(ev, () => { running = false; runBtn.classList.remove('act'); }));

  // HIDE button (tap to toggle)
  const hideBtn = document.getElementById('hideBtn');
  ['touchstart', 'mousedown'].forEach(ev => hideBtn.addEventListener(ev, e => { e.preventDefault(); requestHide(); hideBtn.classList.add('act'); }, { passive: false }));
  ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev => hideBtn.addEventListener(ev, () => hideBtn.classList.remove('act')));
  // keyboard: E to hide/peek out
  window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'e') requestHide(); });
}
