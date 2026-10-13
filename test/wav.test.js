'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const wav = require('../src/audio/wav');
const { sine } = require('./helpers/signals');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-wav-'));
function ramp(n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (i % 1000) / 1000 - 0.5;
  return a;
}
function maxDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
}

test('24-bit stereo round trip preserves samples', () => {
  const p = path.join(tmp(), 'a.wav');
  const ch = [ramp(5000), ramp(5000).map((v) => -v)];
  wav.write(p, { sampleRate: 44100, channels: ch });
  const r = wav.read(p);
  assert.equal(r.sampleRate, 44100);
  assert.equal(r.channels.length, 2);
  assert.equal(r.channels[0].length, 5000);
  assert.ok(maxDiff(r.channels[0], ch[0]) < 1e-6);
  assert.ok(maxDiff(r.channels[1], ch[1]) < 1e-6);
});

test('16-bit round trip within quantisation error', () => {
  const p = path.join(tmp(), 'b.wav');
  const ch = [ramp(3000)];
  wav.write(p, { sampleRate: 11025, channels: ch }, { bitDepth: 16 });
  const r = wav.read(p);
  assert.equal(r.sampleRate, 11025);
  assert.ok(maxDiff(r.channels[0], ch[0]) < 1 / 32767 + 1e-9);
});

test('readRange returns only the requested frames', () => {
  const p = path.join(tmp(), 'c.wav');
  const n = 10000;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = i / n;
  wav.write(p, { sampleRate: 1000, channels: [a] });
  const r = wav.readRange(p, 2.5, 3.0);
  assert.equal(r.channels[0].length, 500);
  assert.ok(Math.abs(r.channels[0][0] - 0.25) < 1e-6);
  assert.ok(Math.abs(r.channels[0][499] - 0.2999) < 1e-6);
});

test('readRange clamps past the end of the file', () => {
  const p = path.join(tmp(), 'd.wav');
  wav.write(p, { sampleRate: 1000, channels: [new Float32Array(10000)] });
  assert.equal(wav.readRange(p, 9, 20).channels[0].length, 1000);
  assert.equal(wav.readRange(p, 12, 20).channels[0].length, 0);
});

test('reads afconvert output (extensible 24-bit and float32)', () => {
  const d = tmp();
  const src = path.join(d, 'src.wav');
  const s = sine(440, 0.5, 44100);
  wav.write(src, { sampleRate: 44100, channels: [s] }, { bitDepth: 16 });
  for (const fmt of ['LEI24@44100', 'LEF32@44100']) {
    const out = path.join(d, `${fmt.slice(0, 5)}.wav`);
    execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', fmt, src, out]);
    const r = wav.read(out);
    assert.equal(r.sampleRate, 44100, fmt);
    assert.equal(r.channels[0].length, s.length, fmt);
    assert.ok(maxDiff(r.channels[0], s) < 1e-4, fmt);
  }
});

test('rejects non-WAV files', () => {
  const p = path.join(tmp(), 'x.wav');
  fs.writeFileSync(p, 'not audio at all');
  assert.throws(() => wav.read(p), /RIFF/);
});

test('process applies fades without mutating input', () => {
  const ones = new Float32Array(1000).fill(1);
  const out = wav.process({ sampleRate: 1000, channels: [ones] }, { fadeMs: 10 });
  assert.equal(ones[0], 1);
  assert.equal(out.channels[0][0], 0);
  assert.equal(out.channels[0][500], 1);
  assert.equal(out.channels[0][999], 0);
});

test('process normalizes peak to target dBFS', () => {
  const a = sine(100, 1, 1000, 0.25);
  const out = wav.process({ sampleRate: 1000, channels: [a] }, { normalize: true, targetDb: -1 });
  let peak = 0;
  for (const v of out.channels[0]) peak = Math.max(peak, Math.abs(v));
  assert.ok(Math.abs(peak - Math.pow(10, -1 / 20)) < 1e-3);
});
