'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeId } = require('../src/util/ids');
const { createCache } = require('../src/analysis/cache');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vm-cache-'));

test('safeId strips unsafe characters', () => {
  assert.equal(safeId('ABC-12.x_y'), 'ABC-12.x_y');
  assert.equal(safeId('a/b c:d'), 'a_b_c_d');
  assert.equal(safeId(42), '42');
});

test('round trip and mtime invalidation', () => {
  const c = createCache(tmp());
  assert.equal(c.get('m1', 100), null);
  c.put('m1', 100, { segments: [{ start: 0, end: 1 }] });
  assert.deepEqual(c.get('m1', 100), { segments: [{ start: 0, end: 1 }] });
  assert.equal(c.get('m1', 101), null);
});

test('corrupt file returns null', () => {
  const d = tmp();
  const c = createCache(d);
  fs.writeFileSync(path.join(d, 'm2.json'), '{not json');
  assert.equal(c.get('m2', 1), null);
});

test('creates the directory if missing', () => {
  const d = path.join(tmp(), 'nested', 'cache');
  createCache(d).put('x', 1, {});
  assert.ok(fs.existsSync(path.join(d, 'x.json')));
});

test('entries from before level-relative segmentation (v1) are ignored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-cache-'));
  fs.writeFileSync(path.join(dir, 'memo.json'), JSON.stringify({ version: 1, mtimeMs: 5, analysis: { segments: [] } }));
  assert.equal(createCache(dir).get('memo', 5), null);
});
