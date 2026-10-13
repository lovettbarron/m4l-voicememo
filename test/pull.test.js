'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitize, mmss, pullDir, writePull } = require('../src/pull');
const wav = require('../src/audio/wav');
const { sine } = require('./helpers/signals');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-pull-'));

test('sanitize keeps readable unicode and strips path separators', () => {
  assert.equal(sanitize('Riff / take 2: 🎸'), 'Riff _ take 2_ 🎸');
  assert.equal(sanitize('   '), 'memo');
  const long = sanitize('🎸'.repeat(100));
  assert.equal(Array.from(long).length, 60);
  assert.ok(!long.includes('�'));
});

test('mmss formats minutes and seconds', () => {
  assert.equal(mmss(42.9), '0042');
  assert.equal(mmss(3725), '6205');
});

test('pullDir uses Set project folder when known', () => {
  assert.equal(pullDir({ setPath: '/p/My Set Project/My Set.als', cacheDir: '/c' }), '/p/My Set Project/Samples/Imported/VoiceMemo');
  assert.equal(pullDir({ setPath: null, cacheDir: '/c' }), '/c/Pulled');
});

test('writePull writes the exact window and never overwrites', () => {
  const d = tmp();
  const full = path.join(d, 'full.wav');
  wav.write(full, { sampleRate: 44100, channels: [sine(220, 10, 44100, 0.25), sine(220, 10, 44100, 0.25)] });
  const setPath = path.join(d, 'Proj', 'Song.als');
  const a = writePull({ fullWav: full, title: 'Riff', start: 2, end: 4.5, setPath, cacheDir: d });
  assert.equal(a, path.join(d, 'Proj', 'Samples', 'Imported', 'VoiceMemo', 'Riff-0002-0004.wav'));
  const r = wav.read(a);
  assert.equal(r.channels.length, 2);
  assert.equal(r.channels[0].length, 2.5 * 44100);
  const b = writePull({ fullWav: full, title: 'Riff', start: 2, end: 4.5, setPath, cacheDir: d });
  assert.ok(b.endsWith('Riff-0002-0004-2.wav'));
});

test('writePull normalizes to -1 dBFS when asked', () => {
  const d = tmp();
  const full = path.join(d, 'full.wav');
  wav.write(full, { sampleRate: 44100, channels: [sine(220, 2, 44100, 0.25)] });
  const p = writePull({ fullWav: full, title: 'n', start: 0, end: 2, normalize: true, cacheDir: d });
  let peak = 0;
  for (const v of wav.read(p).channels[0]) peak = Math.max(peak, Math.abs(v));
  assert.ok(Math.abs(peak - 0.891) < 0.005, `peak ${peak}`);
  assert.ok(p.startsWith(path.join(d, 'Pulled')));
});
