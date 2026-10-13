'use strict';

const round3 = (x) => Math.round(x * 1000) / 1000;

function segments(mono, sr, opts = {}) {
  const { thresholdDb = -40, minSilenceMs = 300, minSegmentMs = 250, padMs = 30 } = opts;
  const hop = Math.max(1, Math.round(sr * 0.01));
  const nFrames = Math.floor(mono.length / hop);
  const thr = Math.pow(10, thresholdDb / 20);
  const thrSq = thr * thr;
  const runs = [];
  let runStart = -1;
  for (let f = 0; f < nFrames; f++) {
    const base = f * hop;
    let sum = 0;
    for (let i = 0; i < hop; i++) {
      const v = mono[base + i];
      sum += v * v;
    }
    const active = sum / hop > thrSq;
    if (active && runStart < 0) runStart = f;
    if (!active && runStart >= 0) {
      runs.push([runStart, f]);
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push([runStart, nFrames]);

  const frameMs = (hop / sr) * 1000;
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && (r[0] - last[1]) * frameMs < minSilenceMs) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }

  const duration = mono.length / sr;
  const pad = padMs / 1000;
  const frameS = hop / sr;
  return merged
    .filter(([a, b]) => (b - a) * frameMs >= minSegmentMs)
    .map(([a, b]) => ({
      start: round3(Math.max(0, a * frameS - pad)),
      end: round3(Math.min(duration, b * frameS + pad)),
    }));
}

module.exports = { segments };
