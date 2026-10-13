'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segments } = require('../src/analysis/segments');
const { sine, silence, concat } = require('./helpers/signals');

const SR = 11025;
const near = (a, b, tol = 0.05) => Math.abs(a - b) < tol;

test('splits on silences and merges short gaps', () => {
  const a = concat(sine(200, 1), silence(1), sine(200, 2), silence(0.2), sine(200, 1), silence(0.5));
  const segs = segments(a, SR);
  assert.equal(segs.length, 2, JSON.stringify(segs));
  assert.ok(near(segs[0].start, 0) && near(segs[0].end, 1), JSON.stringify(segs[0]));
  assert.ok(near(segs[1].start, 2) && near(segs[1].end, 5.2), JSON.stringify(segs[1]));
});

test('drops blips shorter than minSegmentMs', () => {
  const a = concat(silence(1), sine(200, 0.1), silence(1), sine(200, 1));
  const segs = segments(a, SR);
  assert.equal(segs.length, 1);
  assert.ok(near(segs[0].start, 2.1));
});

test('silence and empty input give no segments', () => {
  assert.deepEqual(segments(silence(3), SR), []);
  assert.deepEqual(segments(new Float32Array(0), SR), []);
});

test('respects threshold', () => {
  const quiet = sine(200, 1, SR, 0.005); // about -49 dBFS RMS
  assert.equal(segments(quiet, SR).length, 0);
  assert.equal(segments(quiet, SR, { thresholdDb: -60 }).length, 1);
});

test('segments handles 10 minutes of audio quickly', () => {
  const block = concat(sine(200, 5), silence(1));
  const parts = [];
  for (let i = 0; i < 100; i++) parts.push(block);
  const a = concat(...parts); // 600 s
  const t0 = Date.now();
  const segs = segments(a, SR);
  const ms = Date.now() - t0;
  assert.equal(segs.length, 100);
  assert.ok(ms < 1500, `took ${ms} ms`);
});
