'use strict';

function peaks(mono, bins) {
  const out = new Float32Array(Math.max(0, bins) * 2);
  const n = mono.length;
  if (!n) return out;
  for (let b = 0; b < bins; b++) {
    const s = Math.floor((b * n) / bins);
    const e = Math.max(s + 1, Math.floor(((b + 1) * n) / bins));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = s; i < e && i < n; i++) {
      const v = mono[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[2 * b] = lo === Infinity ? 0 : lo;
    out[2 * b + 1] = hi === -Infinity ? 0 : hi;
  }
  return out;
}

module.exports = { peaks };
