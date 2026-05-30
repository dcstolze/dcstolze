// audio.js — procedural Web Audio for the 3D game (no audio files).
// Dread drone + a chase layer run continuously; stings are made on demand.
let AC = null, master = null, droneGain = null, chaseGain = null;

export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = AC.createGain(); master.gain.value = 0; master.connect(AC.destination);
  master.gain.linearRampToValueAtTime(0.85, AC.currentTime + 1.4);

  droneGain = AC.createGain(); droneGain.gain.value = 0.09; droneGain.connect(master);
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  o.connect(lp); lp.connect(droneGain); o.start();
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.11;
  const lg = AC.createGain(); lg.gain.value = 7; lfo.connect(lg); lg.connect(o.frequency); lfo.start();

  chaseGain = AC.createGain(); chaseGain.gain.value = 0; chaseGain.connect(master);
  const cf = AC.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 900; cf.connect(chaseGain);
  [110, 116.5, 220].forEach((f, i) => { const co = AC.createOscillator(); co.type = i === 2 ? 'square' : 'sawtooth'; co.frequency.value = f; const cg = AC.createGain(); cg.gain.value = i === 2 ? 0.18 : 0.5; co.connect(cg); cg.connect(cf); co.start(); });
  const throb = AC.createOscillator(); throb.type = 'sine'; throb.frequency.value = 4.5; const tg = AC.createGain(); tg.gain.value = 0.5; throb.connect(tg); tg.connect(chaseGain.gain); throb.start();
}
export function resumeAudio() { if (AC && AC.state === 'suspended') AC.resume(); }
export function suspendAudio() { if (AC) AC.suspend(); }

function tone(type, f0, f1, dur, vol, t0) {
  if (!AC) return; const t = t0 || AC.currentTime;
  const o = AC.createOscillator(); o.type = type; const g = AC.createGain();
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, type, freq, Q) {
  if (!AC) return; const t = AC.currentTime, len = (AC.sampleRate * dur) | 0;
  const b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = AC.createBufferSource(); s.buffer = b;
  const f = AC.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1200; if (Q) f.Q.value = Q;
  const g = AC.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

export function heartbeat(v) { if (!AC) return; const t = AC.currentTime; for (let k = 0; k < 2; k++) tone('sine', 58, 36, 0.18, 0.5 * v, t + k * 0.15); }
export function sfxStep(run) { noiseBurst(0.09, run ? 0.16 : 0.1, 'lowpass', run ? 520 : 380); }
export function sfxKey() { noiseBurst(0.18, 0.25, 'highpass', 2600); tone('triangle', 640, 640, 0.5, 0.18); tone('triangle', 880, 880, 0.6, 0.13, AC && AC.currentTime + 0.08); }
export function sfxDrawer() { noiseBurst(0.35, 0.28, 'lowpass', 700); tone('sawtooth', 140, 90, 0.35, 0.07); }
export function sfxDoor() { noiseBurst(0.5, 0.22, 'bandpass', 300, 2); tone('sawtooth', 180, 70, 0.5, 0.06); }
export function sfxLocked() { noiseBurst(0.12, 0.2, 'lowpass', 180); tone('square', 90, 60, 0.18, 0.12); }
export function sfxScream() { if (!AC) return; const t = AC.currentTime; noiseBurst(1.3, 0.8, 'bandpass', 1500, 0.7); tone('sawtooth', 950, 70, 1.2, 0.5, t); tone('square', 600, 90, 1.0, 0.25, t + 0.05); }
export function sfxWin() { if (!AC) return; const t = AC.currentTime; [392, 494, 587, 784, 988].forEach((f, i) => tone('sine', f, f, 0.9, 0.22, t + i * 0.16)); }
export function sfxBell() { tone('sine', 1100, 1080, 1.2, 0.12); tone('sine', 1650, 1640, 1.2, 0.06); }
export function setChaseAudio(level) { if (!AC || !chaseGain) return; chaseGain.gain.setTargetAtTime(0.16 * level, AC.currentTime, 0.25); }
