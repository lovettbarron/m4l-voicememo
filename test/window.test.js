'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/window');

const segs = [{ start: 1, end: 3 }, { start: 10, end: 14 }, { start: 20, end: 21 }];

test('presetLength handles bars and seconds', () => {
  assert.equal(W.presetLength('seg'), null);
  assert.equal(W.presetLength('1bar', 120), 2);
  assert.equal(W.presetLength('4bar', 120, 3), 6);
  assert.equal(W.presetLength('10s', 90), 10);
});

test('seg preset selects the indexed segment, clamping the index', () => {
  assert.deepEqual(W.resolve({ preset: 'seg', segmentIndex: 1, segments: segs, duration: 30 }), { start: 10, end: 14 });
  assert.deepEqual(W.resolve({ preset: 'seg', segmentIndex: 9, segments: segs, duration: 30 }), { start: 20, end: 21 });
});

test('seg preset without segments covers whole memo', () => {
  assert.deepEqual(W.resolve({ preset: 'seg', segments: [], duration: 12.5 }), { start: 0, end: 12.5 });
});

test('fixed preset starts at the indexed segment when no anchor', () => {
  assert.deepEqual(W.resolve({ preset: '2bar', segmentIndex: 1, segments: segs, tempo: 120, duration: 30 }), { start: 10, end: 14 });
});

test('anchor snaps to a segment start within 1 s', () => {
  assert.deepEqual(W.resolve({ preset: '5s', anchorS: 10.6, segments: segs, duration: 30 }), { start: 10, end: 15 });
  assert.deepEqual(W.resolve({ preset: '5s', anchorS: 12, segments: segs, duration: 30 }), { start: 12, end: 17 });
});

test('snap off keeps the anchor', () => {
  assert.deepEqual(W.resolve({ preset: '5s', anchorS: 10.6, segments: segs, snap: false, duration: 30 }), { start: 10.6, end: 15.6 });
});

test('end is clamped to duration', () => {
  assert.deepEqual(W.resolve({ preset: '30s', anchorS: 20, segments: segs, duration: 30 }), { start: 20, end: 30 });
});

test('zero duration resolves to null; unknown preset throws', () => {
  assert.equal(W.resolve({ preset: 'seg', duration: 0 }), null);
  assert.throws(() => W.resolve({ preset: '3parsecs', duration: 10 }), /unknown preset/);
});

test('fromDrag orders and clamps', () => {
  assert.deepEqual(W.fromDrag({ start: 8, end: -1 }, 5), { start: 0, end: 5 });
});

test('isPullable rejects windows shorter than 50 ms', () => {
  assert.equal(W.isPullable({ start: 1, end: 1.04 }), false);
  assert.equal(W.isPullable({ start: 1, end: 1.05 }), true);
  assert.equal(W.isPullable(null), false);
});

test('bars and segmentAt', () => {
  assert.equal(W.bars(4, 120), 2);
  assert.equal(W.segmentAt(12, segs), 1);
  assert.equal(W.segmentAt(5, segs), -1);
});
