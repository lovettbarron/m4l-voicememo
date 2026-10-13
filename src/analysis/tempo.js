'use strict';
const { sampleRange } = require('./range');

const MIN_ONSET_STRENGTH = 0.02; // mean positive log-energy flux per frame

function onsetEnvelope(mono, s, e, hop) {
  const win = hop * 2;
  const n = Math.max(0, Math.floor((e - s - win) / hop));
  const env = new Float32Array(n);
  let prev = null;
  for (let k = 0; k < n; k++) {
    const base = s + k * hop;
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const v = mono[base + i];
      sum += v * v;
    }
    const le = Math.log(1e-10 + sum / win);
    env[k] = prev === null ? 0 : Math.max(0, le - prev);
    prev = le;
  }
  // 3-tap smoothing so onsets falling between frames don't split the autocorrelation peak.
  const smooth = new Float32Array(n);
  for (let k = 0; k < n; k++) smooth[k] = 0.25 * (env[k - 1] || 0) + 0.5 * env[k] + 0.25 * (env[k + 1] || 0);
  let mean = 0;
  for (let k = 0; k < n; k++) mean += smooth[k];
  mean /= n || 1;
  for (let k = 0; k < n; k++) smooth[k] -= mean;
  return { env: smooth, strength: mean };
}

function tempo(mono, sr, win, { minBpm = 60, maxBpm = 180, minConfidence = 0.2 } = {}) {
  const [s, e] = sampleRange(mono.length, sr, win);
  if ((e - s) / sr < 4) return { bpm: null, confidence: 0 };
  const hop = Math.max(1, Math.round(sr / 86));
  const fr = sr / hop;
  const { env, strength } = onsetEnvelope(mono, s, e, hop);
  // Steady tones have tiny periodic energy ripple; require real onsets.
  if (strength < MIN_ONSET_STRENGTH) return { bpm: null, confidence: 0 };
  const n = env.length;
  const acf = (lag) => {
    let sum = 0;
    for (let k = 0; k + lag < n; k++) sum += env[k] * env[k + lag];
    return sum;
  };
  const r0 = acf(0);
  if (!(r0 > 1e-9)) return { bpm: null, confidence: 0 };
  const minLag = Math.max(2, Math.floor((60 * fr) / maxBpm));
  const maxLag = Math.ceil((60 * fr) / minBpm);
  const vals = new Map();
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) vals.set(lag, acf(lag));
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) if (vals.get(lag) > vals.get(best)) best = lag;
  // Octave check: when the true period isn't a whole number of frames, the double period
  // can out-score it. Prefer the half lag if it is nearly as strong.
  let halfBest = -1;
  for (let lag = Math.round(best / 2) - 1; lag <= Math.round(best / 2) + 1; lag++) {
    if (lag >= minLag && (halfBest < 0 || vals.get(lag) > vals.get(halfBest))) halfBest = lag;
  }
  if (halfBest >= 0 && vals.get(halfBest) >= 0.8 * vals.get(best)) best = halfBest;
  const a = vals.get(best - 1);
  const b = vals.get(best);
  const c = vals.get(best + 1);
  const den = a - 2 * b + c;
  const lag = den !== 0 ? best + (0.5 * (a - c)) / den : best;
  const confidence = Math.max(0, Math.min(1, b / r0));
  if (confidence < minConfidence) return { bpm: null, confidence };
  return { bpm: Math.round(((60 * fr) / lag) * 10) / 10, confidence };
}

module.exports = { tempo };
