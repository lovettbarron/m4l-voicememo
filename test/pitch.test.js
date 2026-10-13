'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { yinFrame, pitch } = require('../src/analysis/pitch');
const { sine, harmonic, silence, noise, melody } = require('./helpers/signals');

const SR = 11025;

test('yinFrame finds f0 of a sine within 1%', () => {
  const { f0 } = yinFrame(sine(220, 0.2).subarray(0, 2048), SR);
  assert.ok(Math.abs(f0 - 220) / 220 < 0.01, `f0 ${f0}`);
});

test('yinFrame finds f0 of a harmonic tone, not an overtone', () => {
  const { f0 } = yinFrame(harmonic(150, 0.2).subarray(0, 2048), SR);
  assert.ok(Math.abs(f0 - 150) / 150 < 0.01, `f0 ${f0}`);
});

test('yinFrame reports no pitch for silence and noise', () => {
  assert.equal(yinFrame(silence(0.2).subarray(0, 2048), SR).f0, null);
  assert.equal(yinFrame(noise(0.2).subarray(0, 2048), SR).f0, null);
});

test('pitch names the note of a steady tone', () => {
  const r = pitch(sine(220, 2), SR, [0, 2]);
  assert.equal(r.note, 'A3');
  assert.ok(r.confidence > 0.5);
});

test('pitch estimates A minor for an A-minor melody', () => {
  // A3 C4 E4 A3 E4 C4 A3 B3 A3
  const m = melody([57, 60, 64, 57, 64, 60, 57, 59, 57], 0.4, SR);
  assert.equal(pitch(m, SR, [0, m.length / SR]).key, 'A minor');
});

test('pitch estimates C major for a C-major melody', () => {
  // C4 D4 E4 F4 G4 E4 C4 C4 G4 C4
  const m = melody([60, 62, 64, 65, 67, 64, 60, 60, 67, 60], 0.4, SR);
  assert.equal(pitch(m, SR, [0, m.length / SR]).key, 'C major');
});

test('pitch returns nulls for silence', () => {
  assert.deepEqual(pitch(silence(2), SR, [0, 2]), { note: null, key: null, confidence: 0 });
});
