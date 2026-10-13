'use strict';
const { sampleRange } = require('./range');
const { yinFrame } = require('./pitch');

const FRAME = 1024;
const HOP = 512;
const MAX_FRAMES = 600; // ~28 s of contiguous frames at 11025 Hz
const GATE = Math.pow(10, -45 / 20);

function classify(mono, sr, win) {
  const [s, e] = sampleRange(mono.length, sr, win);
  const total = Math.max(0, Math.floor((e - s - FRAME) / HOP) + 1);
  const count = Math.min(total, MAX_FRAMES);
  const s0 = s + Math.floor((total - count) / 2) * HOP; // centre block for long windows
  let active = 0;
  let voiced = 0;
  let stable = 0;
  let pairs = 0;
  let prevMidi = null;
  const zcrs = [];
  for (let k = 0; k < count; k++) {
    const x = mono.subarray(s0 + k * HOP, s0 + k * HOP + FRAME);
    let sum = 0;
    let zc = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i] * x[i];
      if (i && (x[i] >= 0) !== (x[i - 1] >= 0)) zc++;
    }
    if (Math.sqrt(sum / x.length) < GATE) {
      prevMidi = null;
      continue;
    }
    active++;
    zcrs.push(zc / x.length);
    const { f0 } = yinFrame(x, sr);
    if (!f0) {
      prevMidi = null;
      continue;
    }
    voiced++;
    const midi = 69 + 12 * Math.log2(f0 / 440);
    if (prevMidi !== null) {
      pairs++;
      if (Math.abs(midi - prevMidi) < 0.5) stable++;
    }
    prevMidi = midi;
  }
  if (active < 5) return { label: 'unknown', confidence: 0 };
  const voicedRatio = voiced / active;
  const stability = pairs ? stable / pairs : 0;
  const mean = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;
  const sd = Math.sqrt(zcrs.reduce((a, b) => a + (b - mean) ** 2, 0) / zcrs.length);
  const zcrCv = mean > 0 ? sd / mean : 0;
  const score = 0.4 * voicedRatio + 0.4 * stability + 0.2 * (1 - Math.min(1, zcrCv));
  const label = score >= 0.6 ? 'music' : score <= 0.4 ? 'speech' : 'unknown';
  return { label, confidence: Math.min(1, Math.abs(score - 0.5) * 2) };
}

module.exports = { classify };
