'use strict';
const { sampleRange } = require('./range');

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Krumhansl-Kessler key profiles, index 0 = tonic.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const FRAME = 2048;
const HOP = 512;
const GATE = 0.01; // about -40 dBFS RMS

function yinFrame(x, sr, { minF = 70, maxF = 1000, threshold = 0.15 } = {}) {
  const maxLag = Math.min(Math.floor(sr / minF), Math.floor(x.length / 2));
  const minLag = Math.max(2, Math.floor(sr / maxF));
  const w = x.length - maxLag;
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    let d = 0;
    for (let i = 0; i < w; i++) {
      const v = x[i] - x[i + tau];
      d += v * v;
    }
    running += d;
    cmnd[tau] = running > 0 ? (d * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return { f0: null, clarity: 0 };
  let refined = tau;
  if (tau > 1 && tau < maxLag) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const den = a - 2 * b + c;
    if (den !== 0) refined = tau + (0.5 * (a - c)) / den;
  }
  return { f0: sr / refined, clarity: 1 - cmnd[tau] };
}

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function estimateKey(hist) {
  let best = { key: null, corr: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [['major', MAJOR], ['minor', MINOR]]) {
      const rotated = hist.map((_, pc) => profile[(pc - tonic + 12) % 12]);
      const corr = pearson(hist, rotated);
      if (corr > best.corr) best = { key: `${NAMES[tonic]} ${mode}`, corr };
    }
  }
  return best;
}

function framePositions(s, e, maxFrames) {
  const count = Math.max(0, Math.floor((e - s - FRAME) / HOP) + 1);
  const step = Math.max(1, Math.ceil(count / maxFrames));
  const out = [];
  for (let k = 0; k < count; k += step) out.push(s + k * HOP);
  return out;
}

function pitch(mono, sr, win, { maxFrames = 400 } = {}) {
  const [s, e] = sampleRange(mono.length, sr, win);
  const positions = framePositions(s, e, maxFrames);
  const hist = new Array(12).fill(0);
  const midis = [];
  for (const p of positions) {
    const x = mono.subarray(p, p + FRAME);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    if (Math.sqrt(sum / x.length) < GATE) continue;
    const { f0, clarity } = yinFrame(x, sr);
    if (!f0) continue;
    const midi = 69 + 12 * Math.log2(f0 / 440);
    midis.push(midi);
    hist[((Math.round(midi) % 12) + 12) % 12] += clarity;
  }
  if (midis.length < 3) return { note: null, key: null, confidence: 0 };
  midis.sort((a, b) => a - b);
  const median = Math.round(midis[Math.floor(midis.length / 2)]);
  const note = `${NAMES[((median % 12) + 12) % 12]}${Math.floor(median / 12) - 1}`;
  const { key, corr } = estimateKey(hist);
  const voicedRatio = midis.length / positions.length;
  return { note, key, confidence: Math.max(0, Math.min(1, voicedRatio * Math.max(0, corr))) };
}

module.exports = { yinFrame, pitch };
