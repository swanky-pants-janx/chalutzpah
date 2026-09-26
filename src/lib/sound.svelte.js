// Tiny synthesized sound effects (no audio files): Web Audio oscillators and noise.

import { load, save } from './storage.js';

export const sound = $state({ muted: load('chalutzpah:muted', false) });

export function toggleMute() {
  sound.muted = !sound.muted;
  save('chalutzpah:muted', sound.muted);
  if (!sound.muted) play('click');
}

// Browsers only allow audio after the player interacts with the page.
let unlocked = false;
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

let ctx = null;
function audio() {
  if (typeof window === 'undefined' || !unlocked) return null;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(ac, { freq, type = 'sine', start = 0, dur = 0.2, gain = 0.2, slideTo = null }) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(ac, { start = 0, dur = 0.06, gain = 0.25, freq = 1800 }) {
  const t = ac.currentTime + start;
  const length = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(t);
}

const EFFECTS = {
  click: (ac) => tone(ac, { freq: 520, dur: 0.06, gain: 0.08, type: 'triangle' }),
  dice: (ac) => {
    for (let i = 0; i < 7; i++) noise(ac, { start: i * 0.055 + Math.random() * 0.02, dur: 0.05, gain: 0.35, freq: 1400 + Math.random() * 1600 });
  },
  build: (ac) => {
    tone(ac, { freq: 190, dur: 0.18, gain: 0.3, slideTo: 110 });
    noise(ac, { dur: 0.04, gain: 0.2, freq: 900 });
  },
  turn: (ac) => {
    tone(ac, { freq: 660, dur: 0.25, gain: 0.12 });
    tone(ac, { freq: 990, start: 0.12, dur: 0.35, gain: 0.12 });
  },
  trade: (ac) => {
    tone(ac, { freq: 1320, dur: 0.12, gain: 0.08, type: 'triangle' });
    tone(ac, { freq: 1760, start: 0.07, dur: 0.18, gain: 0.08, type: 'triangle' });
  },
  card: (ac) => noise(ac, { dur: 0.16, gain: 0.18, freq: 3200 }),
  jackal: (ac) => {
    tone(ac, { freq: 140, dur: 0.5, gain: 0.14, type: 'sawtooth', slideTo: 70 });
    tone(ac, { freq: 700, start: 0.05, dur: 0.35, gain: 0.05, type: 'square', slideTo: 420 });
  },
  gain: (ac) => tone(ac, { freq: 880, dur: 0.1, gain: 0.05, type: 'triangle' }),
  victory: (ac) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, { freq: f, start: i * 0.13, dur: 0.5, gain: 0.14, type: 'triangle' }));
  },
  error: (ac) => tone(ac, { freq: 150, dur: 0.18, gain: 0.12, type: 'square' }),
};

export function play(name) {
  if (sound.muted || !EFFECTS[name]) return;
  try {
    const ac = audio();
    if (ac) EFFECTS[name](ac);
  } catch {
    // audio is optional
  }
}
