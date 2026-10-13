'use strict';
const TAU = 2 * Math.PI;

function sine(freq, seconds, sr = 11025, amp = 0.5) {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((TAU * freq * i) / sr);
  return a;
}

function harmonic(freq, seconds, sr = 11025, amp = 0.5) {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (TAU * freq * i) / sr;
    a[i] = amp * (0.6 * Math.sin(t) + 0.3 * Math.sin(2 * t) + 0.1 * Math.sin(3 * t));
  }
  return a;
}

function silence(seconds, sr = 11025) {
  return new Float32Array(Math.round(seconds * sr));
}

function noise(seconds, sr = 11025, amp = 0.5, seed = 1) {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    a[i] = amp * ((s / 0xffffffff) * 2 - 1);
  }
  return a;
}

function clicks(bpm, seconds, sr = 11025) {
  const a = silence(seconds, sr);
  const step = (sr * 60) / bpm;
  for (let pos = 0; pos < a.length; pos += step) {
    const i0 = Math.round(pos);
    for (let k = 0; k < 200 && i0 + k < a.length; k++) {
      a[i0 + k] = 0.9 * Math.exp(-k / 30) * Math.sin((TAU * 1000 * k) / sr);
    }
  }
  return a;
}

function concat(...arrays) {
  const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function melody(midiNotes, noteSeconds, sr = 11025) {
  return concat(...midiNotes.map((m) => harmonic(midiToHz(m), noteSeconds, sr)));
}

// Alternating unvoiced noise bursts, pitch-gliding voiced bursts and short gaps.
function speechLike(seconds, sr = 11025) {
  const parts = [];
  let total = 0;
  let k = 0;
  while (total < seconds) {
    parts.push(noise(0.12, sr, 0.3, 7 + k));
    const n = Math.round(0.15 * sr);
    const glide = new Float32Array(n);
    let phase = 0;
    const f0 = k % 2 ? 110 : 140;
    for (let i = 0; i < n; i++) {
      const f = f0 + (150 * i) / n;
      phase += (TAU * f) / sr;
      glide[i] = 0.4 * Math.sin(phase);
    }
    parts.push(glide, silence(0.08, sr));
    total += 0.35;
    k++;
  }
  return concat(...parts);
}

module.exports = { sine, harmonic, silence, noise, clicks, concat, melody, midiToHz, speechLike };
