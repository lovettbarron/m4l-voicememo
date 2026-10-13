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

test('threshold is measured below the recording\'s loud parts', () => {
  const quietPart = sine(200, 1, SR, 0.5 * Math.pow(10, -30 / 20)); // 30 dB under the loud part
  const a = concat(sine(200, 1), silence(1), quietPart);
  assert.equal(segments(a, SR).length, 2); // default -40: the quiet part still counts
  assert.equal(segments(a, SR, { thresholdDb: -20 }).length, 1);
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

// A quiet phone recording of plucked guitar: notes decay well below -40 dBFS between plucks,
// over a room-noise floor. Silence must be judged against the recording's own level.
function quietPlucks(seconds, sr = SR) {
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) {
    const t = (i / sr) % 0.5;
    out[i] = 0.03 * Math.exp(-t * 4) * Math.sin(2 * Math.PI * 196 * (i / sr));
  }
  return out;
}
function roomNoise(seconds, amp = 0.0005, sr = SR) {
  const out = new Float32Array(Math.round(seconds * sr));
  let s = 7;
  for (let i = 0; i < out.length; i++) { s = (s * 16807) % 2147483647; out[i] = amp * ((s / 2147483647) * 2 - 1); }
  return out;
}
const mix = (a, b) => a.map((v, i) => v + (b[i] || 0));

test('quiet recordings segment by their own level, not a fixed -40 dBFS', () => {
  const take = concat(quietPlucks(5), new Float32Array(SR * 2), quietPlucks(4), new Float32Array(SR * 2), quietPlucks(3));
  const segs = segments(mix(take, roomNoise(16)), SR);
  assert.equal(segs.length, 3, JSON.stringify(segs));
  assert.ok(near(segs[0].start, 0, 0.1) && near(segs[0].end, 5, 0.3), JSON.stringify(segs[0]));
  assert.ok(near(segs[2].start, 13, 0.1), JSON.stringify(segs[2]));
});

test('continuous playing with soft passages stays one segment', () => {
  const soft = quietPlucks(4).map((v) => v * 0.2);
  const segs = segments(mix(concat(quietPlucks(4), soft, quietPlucks(4)), roomNoise(12, 0.002)), SR);
  assert.equal(segs.length, 1, JSON.stringify(segs));
});
