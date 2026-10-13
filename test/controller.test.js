'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const W = require('../src/window');
const { createController } = require('../src/core/controller');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-ctl-'));

function setup(overrides = {}) {
  const dir = tmp();
  const memoPath = path.join(dir, 'a.m4a');
  fs.writeFileSync(memoPath, 'x');
  const memos = [
    { id: 'A', title: 'Riff', date: '2026-10-12T00:00:00.000Z', duration: 30, path: memoPath, status: 'local', ext: 'm4a' },
    { id: 'C', title: 'Cloudy', date: '2026-10-11T00:00:00.000Z', duration: 5, path: null, status: 'cloud', ext: 'm4a' },
  ];
  const sent = [];
  const calls = { convert: 0, writePull: [] };
  const store = new Map();
  const deps = {
    locate: () => ({ mode: 'library', root: dir, dbPath: path.join(dir, 'db') }),
    catalog: { list: () => memos },
    convert: async (memo, cacheDir, { onProgress, onAnalysisReady }) => {
      calls.convert++;
      onProgress('analysis', 1);
      onAnalysisReady('/cache/A.a.wav');
      return { fullWav: '/cache/A.wav', analysisWav: '/cache/A.a.wav' };
    },
    readWav: () => ({ sampleRate: 100, channels: [new Float32Array(3000)] }), // 30 s
    peaks: () => new Float32Array(1200),
    segments: () => [{ start: 1, end: 3 }, { start: 10, end: 14 }],
    loudness: () => ({ peakDb: -3, rmsDb: -18 }),
    tempo: () => ({ bpm: 96, confidence: 0.6 }),
    pitch: () => ({ note: 'A3', key: 'A minor', confidence: 0.7 }),
    classify: () => ({ label: 'music', confidence: 0.8 }),
    cache: { get: (id) => store.get(id) || null, put: (id, m, a) => store.set(id, a) },
    window: W,
    writePull: (args) => { calls.writePull.push(args); return '/set/Samples/Imported/VoiceMemo/Riff-0001-0003.wav'; },
    ...overrides,
  };
  const c = createController({ deps, send: (...m) => sent.push(m), cacheDir: '/cache', home: dir });
  const last = (type) => [...sent].reverse().find((m) => m[0] === type);
  return { c, sent, calls, last, store };
}

test('no Full Disk Access shows no-access state', () => {
  const { c, last } = setup({ locate: () => ({ mode: 'none', reason: 'no-fda', root: '/x' }) });
  c.init({});
  assert.deepEqual(last('state')[1], { name: 'no-access', reason: 'no-fda' });
  assert.deepEqual(last('memos')[1], { items: [] });
});

test('init lists memos and goes idle', () => {
  const { c, last } = setup();
  c.init({});
  assert.equal(last('memos')[1].items.length, 2);
  assert.equal(last('state')[1].name, 'idle');
});

test('selecting a local memo shows waveform, segments, longest-segment window and analysis', async () => {
  const { c, last, sent } = setup();
  c.init({});
  await c.selectMemo('A');
  assert.equal(last('waveform')[1].duration, 30);
  assert.equal(last('waveform')[1].peaks.length, 1200);
  assert.equal(last('segments')[1].items.length, 2);
  assert.deepEqual(last('window')[1], { start: 10, end: 14 }); // the longer of 1-3 s and 10-14 s
  assert.deepEqual(last('segmentindex'), ['segmentindex', 1]);
  const info = last('windowinfo')[1];
  assert.equal(info.analysis.tempo.bpm, 96);
  assert.equal(info.segmentCount, 2);
  assert.deepEqual(last('audio'), ['audio', '/cache/A.wav']);
  assert.equal(last('state')[1].name, 'ready');
  assert.deepEqual(last('audition'), ['audition', 10000, 14000]); // auto is on by default
  assert.deepEqual(last('pullenable'), ['pullenable', 1]);
  assert.ok(sent.findIndex((m) => m[0] === 'waveform') < sent.findIndex((m) => m[0] === 'audio'));
});

test('cloud memo shows notice and does not convert', async () => {
  const { c, last, calls } = setup();
  c.init({});
  await c.selectMemo('C');
  assert.equal(calls.convert, 0);
  assert.equal(last('state')[1].name, 'notice');
  assert.deepEqual(last('pullenable'), ['pullenable', 0]);
});

test('conversion failure reports error state', async () => {
  const { c, last } = setup({ convert: async () => { throw new Error('afconvert failed (1): bad file'); } });
  c.init({});
  await c.selectMemo('A');
  assert.deepEqual(last('state')[1], { name: 'error', message: 'afconvert failed (1): bad file' });
});

test('a throwing analyser only blanks its own field', async () => {
  const { c, last } = setup({ pitch: () => { throw new Error('boom'); } });
  c.init({});
  await c.selectMemo('A');
  const a = last('windowinfo')[1].analysis;
  assert.equal(a.pitch, null);
  assert.equal(a.tempo.bpm, 96);
});

test('length preset and segment param resolve windows', async () => {
  const { c, last } = setup();
  c.init({});
  await c.selectMemo('A');
  c.setParam('segment', 1);
  assert.deepEqual(last('window')[1], { start: 10, end: 14 });
  c.setParam('length', W.PRESETS.indexOf('1bar'));
  assert.deepEqual(last('window')[1], { start: 10, end: 12 });
});

test('tempo change recomputes bar windows', async () => {
  const { c, last } = setup();
  c.init({});
  await c.selectMemo('A');
  c.setParam('segment', 0);
  c.setParam('length', W.PRESETS.indexOf('1bar'));
  c.setTempo(60, 4);
  assert.deepEqual(last('window')[1], { start: 1, end: 5 });
  c.setTempo(60, 3);
  assert.deepEqual(last('window')[1], { start: 1, end: 4 });
});

test('anchor in seg mode selects the containing segment', async () => {
  const { c, last } = setup();
  c.init({});
  await c.selectMemo('A');
  c.anchor(11);
  assert.deepEqual(last('window')[1], { start: 10, end: 14 });
  assert.deepEqual(last('segmentindex'), ['segmentindex', 1]);
});

test('drag sets a manual window until a preset changes', async () => {
  const { c, last } = setup();
  c.init({});
  await c.selectMemo('A');
  c.drag(5, 2);
  assert.deepEqual(last('window')[1], { start: 2, end: 5 });
  c.setParam('segment', 1);
  assert.deepEqual(last('window')[1], { start: 10, end: 14 });
});

test('pull without a target reports error and writes nothing', async () => {
  const { c, last, calls } = setup();
  c.init({});
  await c.selectMemo('A');
  c.setTarget(0, 'No empty slot below selection');
  c.pull();
  assert.equal(calls.writePull.length, 0);
  assert.deepEqual(last('status')[1], { level: 'error', message: 'No empty slot below selection' });
});

test('pull writes the window and forwards the path to Live', async () => {
  const { c, last, calls } = setup();
  c.init({});
  await c.selectMemo('A');
  c.setParam('segment', 0);
  c.setTarget(1, 'T3 · Slot 5');
  c.setSetPath('/set/Song.als');
  c.setParam('norm', 1);
  c.pull();
  assert.deepEqual(calls.writePull[0], {
    fullWav: '/cache/A.wav', title: 'Riff', start: 1, end: 3, normalize: true,
    setPath: '/set/Song.als', cacheDir: '/cache', fadeMs: 5,
  });
  assert.deepEqual(last('pull'), ['pull', '/set/Samples/Imported/VoiceMemo/Riff-0001-0003.wav']);
  c.pullResult(1, 'Pulled to T3 · Slot 5');
  assert.deepEqual(last('status')[1], { level: 'ok', message: 'Pulled to T3 · Slot 5' });
});

test('analysis is cached per memo and reused', async () => {
  let segCalls = 0;
  const { c, store } = setup({ segments: () => { segCalls++; return [{ start: 1, end: 3 }]; } });
  c.init({});
  await c.selectMemo('A');
  assert.ok(store.get('A').segments);
  await c.selectMemo('A');
  assert.equal(segCalls, 1);
});

test('restore selects a memo once the list is loaded', async () => {
  const { c, last, calls } = setup();
  c.restore('A');
  assert.equal(calls.convert, 0);
  c.init({});
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(last('select'), ['select', 'A']);
  assert.equal(calls.convert, 1);
});

test('a newer selection wins over a slower earlier one', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const { c, last } = setup({
    convert: async (memo, dir, { onAnalysisReady }) => {
      if (memo.id === 'A') await slow;
      onAnalysisReady('/cache/x.a.wav');
      return { fullWav: `/cache/${memo.id}.wav`, analysisWav: '/cache/x.a.wav' };
    },
  });
  c.init({});
  const first = c.selectMemo('A');
  await c.selectMemo('C'); // cloud → notice
  release();
  await first;
  assert.equal(last('state')[1].name, 'notice');
  assert.equal(last('audio'), undefined);
});

test('selecting the memo that is already open does not reload it', async () => {
  const { c, calls } = setup();
  c.init({});
  await Promise.all([c.selectMemo('A'), c.selectMemo('A')]);
  await c.selectMemo('A');
  assert.equal(calls.convert, 1);
});

test('a memo that failed to load can be selected again to retry', async () => {
  let fail = true;
  const { c, last, calls } = setup({
    convert: async () => {
      calls.convert++;
      if (fail) throw new Error('afconvert failed');
      return { fullWav: '/cache/A.wav', analysisWav: '/cache/A.a.wav' };
    },
  });
  c.init({});
  await c.selectMemo('A');
  assert.equal(last('state')[1].name, 'error');
  fail = false;
  await c.selectMemo('A');
  assert.equal(last('state')[1].name, 'ready');
});
