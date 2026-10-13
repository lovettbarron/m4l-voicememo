'use strict';

function sampleRange(length, sr, [start, end]) {
  const s = Math.max(0, Math.min(length, Math.floor(start * sr)));
  const e = Math.max(s, Math.min(length, Math.floor(end * sr)));
  return [s, e];
}

module.exports = { sampleRange };
