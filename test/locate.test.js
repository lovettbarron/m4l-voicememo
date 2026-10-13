'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { locate, LIBRARY_DIRS } = require('../src/library/locate');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-home-'));
function mkLib(home, idx, withDb = true) {
  const root = path.join(home, LIBRARY_DIRS[idx]);
  fs.mkdirSync(root, { recursive: true });
  if (withDb) fs.writeFileSync(path.join(root, 'CloudRecordings.db'), '');
  return root;
}

test('prefers the macOS 14+ library', () => {
  const home = tmp();
  mkLib(home, 1);
  const root = mkLib(home, 0);
  assert.deepEqual(locate({ home }), { mode: 'library', root, dbPath: path.join(root, 'CloudRecordings.db') });
});

test('falls back to the macOS 13 library', () => {
  const home = tmp();
  const root = mkLib(home, 1);
  assert.equal(locate({ home }).root, root);
});

test('library dir without database is folder mode', () => {
  const home = tmp();
  const root = mkLib(home, 0, false);
  assert.deepEqual(locate({ home }), { mode: 'folder', root });
});

test('nothing found', () => {
  assert.deepEqual(locate({ home: tmp() }), { mode: 'none', reason: 'not-found' });
});

test('EPERM means missing Full Disk Access', () => {
  const home = tmp();
  const fsImpl = {
    ...fs,
    readdirSync: (p) => {
      if (p.includes('Group Containers')) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      return fs.readdirSync(p);
    },
  };
  const r = locate({ home, fsImpl });
  assert.equal(r.mode, 'none');
  assert.equal(r.reason, 'no-fda');
  assert.equal(r.root, path.join(home, LIBRARY_DIRS[0]));
});

test('override folder wins and reports unreadable folders', () => {
  const home = tmp();
  mkLib(home, 0);
  const folder = tmp();
  assert.deepEqual(locate({ home, overridePath: folder }), { mode: 'folder', root: folder });
  assert.deepEqual(locate({ home, overridePath: path.join(folder, 'missing') }), { mode: 'none', reason: 'folder-unreadable' });
});
