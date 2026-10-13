'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { convert, probe } = require('../src/audio/convert');
const wav = require('../src/audio/wav');
const { sine } = require('./helpers/signals');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-conv-'));

function stereoM4a(dir) {
  const src = path.join(dir, 'src.wav');
  wav.write(src, { sampleRate: 44100, channels: [sine(220, 2, 44100), sine(330, 2, 44100)] }, { bitDepth: 16 });
  const m4a = path.join(dir, 'memo.m4a');
  execFileSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', src, m4a]);
  return m4a;
}

test('probe reads channels and duration', async () => {
  const info = await probe(stereoM4a(tmp()));
  assert.equal(info.channels, 2);
  assert.ok(Math.abs(info.duration - 2) < 0.1);
});

test('converts to mono analysis WAV and stereo full WAV, then reuses cache', async () => {
  const d = tmp();
  const memo = { id: 'UUID/1', path: stereoM4a(d), duration: 2 };
  const progress = [];
  let ready = null;
  const out = await convert(memo, path.join(d, 'cache'), {
    onProgress: (phase, f) => progress.push([phase, f]),
    onAnalysisReady: (p) => { ready = p; },
  });
  assert.equal(path.basename(out.analysisWav), 'UUID_1.a.wav');
  assert.equal(ready, out.analysisWav);
  const a = wav.read(out.analysisWav);
  assert.equal(a.sampleRate, 11025);
  assert.equal(a.channels.length, 1);
  assert.ok(Math.abs(a.channels[0].length / 11025 - 2) < 0.1);
  const f = wav.read(out.fullWav);
  assert.equal(f.sampleRate, 44100);
  assert.equal(f.channels.length, 2);
  assert.deepEqual(progress.filter(([, x]) => x === 1).map(([p]) => p), ['analysis', 'full']);

  const mtime = fs.statSync(out.fullWav).mtimeMs;
  await convert(memo, path.join(d, 'cache'));
  assert.equal(fs.statSync(out.fullWav).mtimeMs, mtime);
});

test('missing source rejects with ENOENT', async () => {
  await assert.rejects(convert({ id: 'x', path: '/nope/missing.m4a' }, tmp()), (e) => e.code === 'ENOENT');
});

test('unreadable audio rejects with afconvert error and leaves no partial file', async () => {
  const d = tmp();
  const bad = path.join(d, 'bad.m4a');
  fs.writeFileSync(bad, 'garbage');
  const cache = path.join(d, 'cache');
  await assert.rejects(convert({ id: 'bad', path: bad }, cache), /afinfo failed|afconvert failed/);
  assert.deepEqual(fs.existsSync(cache) ? fs.readdirSync(cache).filter((f) => f.endsWith('.part.wav')) : [], []);
});

test('two conversions of the same memo at once both finish (double-click while converting)', async () => {
  const d = tmp();
  const memo = { id: 'dup', path: stereoM4a(d), duration: 2 };
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('conversion never settled')), 10000));
    const [a, b] = await Promise.race([Promise.all([convert(memo, path.join(d, 'c')), convert(memo, path.join(d, 'c'))]), timeout]);
    assert.deepEqual(a, b);
    assert.equal(wav.read(a.fullWav).channels.length, 2);
  } finally {
    process.off('uncaughtException', onUncaught);
  }
  assert.deepEqual(uncaught, []);
  assert.deepEqual(fs.readdirSync(path.join(d, 'c')).filter((n) => n.includes('.part')), []);
});
