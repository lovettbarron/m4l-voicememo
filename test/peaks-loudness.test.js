'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sampleRange } = require('../src/analysis/range');
const { peaks } = require('../src/audio/peaks');
const { loudness } = require('../src/analysis/loudness');
const { sine, silence, concat } = require('./helpers/signals');

test('sampleRange clamps and orders', () => {
  assert.deepEqual(sampleRange(1000, 100, [1, 2]), [100, 200]);
  assert.deepEqual(sampleRange(1000, 100, [-1, 50]), [0, 1000]);
  assert.deepEqual(sampleRange(1000, 100, [5, 1]), [500, 500]);
});

test('peaks returns min/max per bin', () => {
  const p = peaks(Float32Array.from([-1, 1, -0.5, 0.5]), 2);
  assert.deepEqual(Array.from(p), [-1, 1, -0.5, 0.5]);
});

test('peaks handles empty input and more bins than samples', () => {
  assert.deepEqual(Array.from(peaks(new Float32Array(0), 3)), [0, 0, 0, 0, 0, 0]);
  const p = peaks(Float32Array.from([0.5]), 4);
  assert.equal(p.length, 8);
  assert.equal(p[1], 0.5);
});

test('loudness of a half-scale sine', () => {
  const { peakDb, rmsDb } = loudness(sine(100, 1, 11025, 0.5), 11025, [0, 1]);
  assert.ok(Math.abs(peakDb - -6.02) < 0.05, `peak ${peakDb}`);
  assert.ok(Math.abs(rmsDb - -9.03) < 0.05, `rms ${rmsDb}`);
});

test('loudness measures only the requested window', () => {
  const a = concat(silence(1), sine(100, 1, 11025, 0.5));
  assert.equal(loudness(a, 11025, [0, 1]).peakDb, -120);
  assert.ok(loudness(a, 11025, [1, 2]).peakDb > -7);
});

test('loudness of silence and empty windows is floored, not -Infinity', () => {
  const r = loudness(silence(1), 11025, [0.5, 0.5]);
  assert.deepEqual(r, { peakDb: -120, rmsDb: -120 });
});
