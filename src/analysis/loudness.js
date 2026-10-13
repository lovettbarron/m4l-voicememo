'use strict';
const { sampleRange } = require('./range');

const FLOOR_DB = -120;
const toDb = (v) => (v > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(v)) : FLOOR_DB);

function loudness(mono, sr, win) {
  const [s, e] = sampleRange(mono.length, sr, win);
  let peak = 0;
  let sum = 0;
  for (let i = s; i < e; i++) {
    const v = mono[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  const rms = e > s ? Math.sqrt(sum / (e - s)) : 0;
  return { peakDb: toDb(peak), rmsDb: toDb(rms) };
}

module.exports = { loudness, FLOOR_DB };
