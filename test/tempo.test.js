'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tempo } = require('../src/analysis/tempo');
const { clicks, noise, sine } = require('./helpers/signals');

const SR = 11025;

for (const bpm of [90, 120, 150]) {
  test(`click track at ${bpm} BPM`, () => {
    const r = tempo(clicks(bpm, 10), SR, [0, 10]);
    assert.ok(r.bpm !== null && Math.abs(r.bpm - bpm) <= 2, JSON.stringify(r));
  });
}

test('windows shorter than 4 s return null', () => {
  assert.equal(tempo(clicks(120, 10), SR, [0, 3]).bpm, null);
});

test('noise and steady tones return null', () => {
  assert.equal(tempo(noise(8), SR, [0, 8]).bpm, null);
  assert.equal(tempo(sine(220, 8), SR, [0, 8]).bpm, null);
});
