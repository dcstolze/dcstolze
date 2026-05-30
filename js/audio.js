"use strict";
/* ============================================================
   audio.js — all sound is synthesised at runtime with the
   Web Audio API (no audio files). A low dread drone runs
   constantly; stings/heartbeat/scream are generated on demand.
   ============================================================ */

let AC = null, master = null, droneGain = null;

function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { return; }

  master = AC.createGain();
  master.gain.value = 0;
  master.connect(AC.destination);
  master.gain.linearRampToValueAtTime(0.85, AC.currentTime + 1.4);

  // low, slowly wavering dread drone
  droneGain = AC.createGain(); droneGain.gain.value = 0.09; droneGain.connect(master);
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  o.connect(lp); lp.connect(droneGain); o.start();
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.11;
  const lg = AC.createGain(); lg.gain.value = 7;
  lfo.connect(lg); lg.connect(o.frequency); lfo.start();
}

function tone(type, f0, f1, dur, vol, t0) {
  if (!AC) return;
  const t = t0 || AC.currentTime;
  const o = AC.createOscillator(); o.type = type;
  const g = AC.createGain();
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, type, freq, Q) {
  if (!AC) return;
  const t = AC.currentTime;
  const len = (AC.sampleRate * dur) | 0;
  const b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = AC.createBufferSource(); s.buffer = b;
  const f = AC.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1200; if (Q) f.Q.value = Q;
  const g = AC.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

function heartbeat(v) { if (!AC) return; const t = AC.currentTime; for (let k = 0; k < 2; k++) tone('sine', 58, 36, 0.18, 0.5 * v, t + k * 0.15); }
function sfxStep()  { noiseBurst(0.09, 0.12, 'lowpass', 420); }
function sfxKey()   { noiseBurst(0.18, 0.25, 'highpass', 2600); tone('triangle', 640, 640, 0.5, 0.18); tone('triangle', 880, 880, 0.6, 0.13, AC && AC.currentTime + 0.08); }
function sfxNote()  { noiseBurst(0.12, 0.16, 'highpass', 2200); }
function sfxDoor()  { noiseBurst(0.5, 0.22, 'bandpass', 300, 2); tone('sawtooth', 180, 70, 0.5, 0.06); }
function sfxLocked(){ noiseBurst(0.12, 0.2, 'lowpass', 180); tone('square', 90, 60, 0.18, 0.12); }
function sfxScream(){ if (!AC) return; const t = AC.currentTime; noiseBurst(1.3, 0.8, 'bandpass', 1500, 0.7); tone('sawtooth', 950, 70, 1.2, 0.5, t); tone('square', 600, 90, 1.0, 0.25, t + 0.05); }
function sfxWin()   { if (!AC) return; const t = AC.currentTime; [392, 494, 587, 784, 988].forEach((f, i) => tone('sine', f, f, 0.9, 0.22, t + i * 0.16)); }
function sfxBell()  { tone('sine', 1100, 1080, 1.2, 0.12); tone('sine', 1650, 1640, 1.2, 0.06); }
