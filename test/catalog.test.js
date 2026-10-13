'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { list } = require('../src/library/catalog');
const wav = require('../src/audio/wav');

const EPOCH = 978307200;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-cat-'));
const tone = (p, seconds = 1) => wav.write(p, { sampleRate: 8000, channels: [new Float32Array(8000 * seconds).fill(0.1)] }, { bitDepth: 16 });

function sonomaLibrary() {
  const root = tmp();
  const dbPath = path.join(root, 'CloudRecordings.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE ZCLOUDRECORDING (Z_PK INTEGER PRIMARY KEY, ZDATE REAL, ZDURATION REAL,
    ZCUSTOMLABEL TEXT, ZENCRYPTEDTITLE TEXT, ZPATH TEXT, ZUNIQUEID TEXT, ZEVICTIONDATE REAL)`);
  const ins = db.prepare('INSERT INTO ZCLOUDRECORDING (ZDATE, ZDURATION, ZCUSTOMLABEL, ZENCRYPTEDTITLE, ZPATH, ZUNIQUEID) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run(800000000, 1, '2026-01-01 label', 'Hummed riff', 'a.m4a', 'UUID-A');
  ins.run(810000000, 2, 'Kitchen label', '', 'b.m4a', 'UUID-B');
  ins.run(805000000, 3, null, null, 'c.m4a', 'UUID-C'); // file absent → cloud
  db.close();
  tone(path.join(root, 'a.m4a'));
  tone(path.join(root, 'b.m4a'));
  return { mode: 'library', root, dbPath };
}

function venturaLibrary() {
  const root = tmp();
  const dbPath = path.join(root, 'CloudRecordings.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE ZCLOUDRECORDING (Z_PK INTEGER PRIMARY KEY, ZDATE REAL, ZCUSTOMLABEL TEXT, ZPATH TEXT)');
  db.prepare('INSERT INTO ZCLOUDRECORDING (ZDATE, ZCUSTOMLABEL, ZPATH) VALUES (?, ?, ?)').run(700000000, 'Old idea', 'old.m4a');
  db.close();
  tone(path.join(root, 'old.m4a'));
  return { mode: 'library', root, dbPath };
}

for (const adapter of ['node', 'cli']) {
  test(`macOS 14+ schema via ${adapter} adapter`, () => {
    const loc = sonomaLibrary();
    const memos = list(loc, { adapter });
    assert.deepEqual(memos.map((m) => m.id), ['UUID-B', 'UUID-C', 'UUID-A']);
    const [b, c, a] = memos;
    assert.equal(a.title, 'Hummed riff');
    assert.equal(b.title, 'Kitchen label');
    assert.equal(c.title, 'c');
    assert.equal(a.path, path.join(loc.root, 'a.m4a'));
    assert.equal(a.status, 'local');
    assert.equal(c.status, 'cloud');
    assert.equal(a.duration, 1);
    assert.equal(a.ext, 'm4a');
    assert.equal(a.date, new Date((800000000 + EPOCH) * 1000).toISOString());
  });
}

test('macOS 13 schema uses ZCUSTOMLABEL and pk ids', () => {
  const [m] = list(venturaLibrary(), { adapter: 'cli' });
  assert.equal(m.title, 'Old idea');
  assert.equal(m.id, 'pk1');
  assert.equal(m.duration, null);
});

test('unrecognised schema falls back to folder scan', () => {
  const root = tmp();
  const dbPath = path.join(root, 'CloudRecordings.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE ZCLOUDRECORDING (Z_PK INTEGER PRIMARY KEY, ZSOMETHING TEXT)');
  db.close();
  tone(path.join(root, 'x.wav'));
  const memos = list({ mode: 'library', root, dbPath }, { durationOf: () => 1 });
  assert.equal(memos.length, 1);
  assert.equal(memos[0].title, 'x');
});

test('folder mode lists audio files with afinfo durations', () => {
  const root = tmp();
  tone(path.join(root, 'Take 1.wav'), 2);
  fs.writeFileSync(path.join(root, 'notes.txt'), 'ignore me');
  const memos = list({ mode: 'folder', root });
  assert.equal(memos.length, 1);
  assert.equal(memos[0].title, 'Take 1');
  assert.equal(memos[0].status, 'local');
  assert.ok(Math.abs(memos[0].duration - 2) < 0.01);
});

test('mode none lists nothing', () => {
  assert.deepEqual(list({ mode: 'none', reason: 'no-fda' }), []);
});

test('busy-database fallback deletes its temporary copy of the library', () => {
  const { queryCopy } = require('../src/library/catalog');
  const lib = sonomaLibrary();
  const copies = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('vm-db-')).sort();
  const before = copies();
  const rows = queryCopy(lib.dbPath, 'SELECT ZUNIQUEID FROM ZCLOUDRECORDING ORDER BY Z_PK', 'node');
  assert.deepEqual(rows.map((r) => r.ZUNIQUEID), ['UUID-A', 'UUID-B', 'UUID-C']);
  assert.deepEqual(copies(), before);
});

test('same file name in two folders gives two different memo ids', () => {
  const a = tmp();
  const b = tmp();
  tone(path.join(a, 'New Recording.m4a'));
  tone(path.join(b, 'New Recording.m4a'));
  const [ma] = list({ mode: 'folder', root: a }, { durationOf: () => 1 });
  const [mb] = list({ mode: 'folder', root: b }, { durationOf: () => 1 });
  assert.notEqual(ma.id, mb.id);
  assert.match(ma.id, /^f-[0-9a-f]{16}$/);
});
