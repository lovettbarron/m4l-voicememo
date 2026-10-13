'use strict';

const round3 = (x) => Math.round(x * 1000) / 1000;
const FLOOR_DB = -120;
const ABSOLUTE_SILENCE_DB = -75; // below any phone mic's room noise: never counts as sound

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

// thresholdDb is relative to the recording's loud parts (95th-percentile frame level), so quiet
// phone recordings segment like loud ones. It never drops below the noise floor (10th percentile)
// plus a margin, and always sits at least 20 dB under the loud parts so soft playing stays active.
function silenceLevelDb(frameDb, thresholdDb) {
  if (!frameDb.length) return 0;
  const sorted = Float64Array.from(frameDb).sort();
  const loud = percentile(sorted, 0.95);
  const noise = percentile(sorted, 0.1);
  const relative = Math.min(Math.max(loud + thresholdDb, noise + 6), loud - 20);
  return Math.max(relative, ABSOLUTE_SILENCE_DB);
}

function segments(mono, sr, opts = {}) {
  const { thresholdDb = -40, minSilenceMs = 300, minSegmentMs = 250, padMs = 30 } = opts;
  const hop = Math.max(1, Math.round(sr * 0.01));
  const nFrames = Math.floor(mono.length / hop);
  const frameDb = new Float64Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    const base = f * hop;
    let sum = 0;
    for (let i = 0; i < hop; i++) {
      const v = mono[base + i];
      sum += v * v;
    }
    frameDb[f] = Math.max(FLOOR_DB, 10 * Math.log10(sum / hop || 1e-30));
  }
  const thrDb = silenceLevelDb(frameDb, thresholdDb);
  const runs = [];
  let runStart = -1;
  for (let f = 0; f < nFrames; f++) {
    const active = frameDb[f] > thrDb;
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
