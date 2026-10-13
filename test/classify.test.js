'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/analysis/classify');
const { melody, speechLike, silence } = require('./helpers/signals');

const SR = 11025;

test('sustained melody is music', () => {
  const m = melody([57, 60, 64, 67, 64, 60, 57, 55, 57, 60], 0.5, SR);
  const r = classify(m, SR, [0, m.length / SR]);
  assert.equal(r.label, 'music', JSON.stringify(r));
  assert.ok(r.confidence > 0.3);
});

test('speech-like bursts are speech', () => {
  const s = speechLike(6, SR);
  const r = classify(s, SR, [0, s.length / SR]);
  assert.equal(r.label, 'speech', JSON.stringify(r));
});

test('silence is unknown', () => {
  assert.deepEqual(classify(silence(3), SR, [0, 3]), { label: 'unknown', confidence: 0 });
});
