'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

test('vm-core registers handlers and announces ready', async () => {
  const handlers = {};
  const outlets = [];
  const fake = {
    addHandlers: (h) => Object.assign(handlers, h),
    outlet: async (...a) => { outlets.push(a); },
    // Max's setDict only writes to dicts that already exist in the patch, so vm-core must not use it.
    setDict: async () => { throw new Error('setDict needs an existing [dict]'); },
    post: () => {},
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    return req === 'max-api' ? fake : orig.call(this, req, ...rest);
  };
  try {
    require(path.join(__dirname, '..', 'src', 'max', 'vm-core.js'));
  } finally {
    Module._load = orig;
  }
  await new Promise((r) => setImmediate(r));
  for (const h of ['init', 'refresh', 'folder', 'select', 'restore', 'segment', 'param', 'anchor', 'drag',
    'audition', 'pull', 'pullresult', 'tempo', 'setpath', 'target', 'opensettings']) {
    assert.equal(typeof handlers[h], 'function', h);
  }
  assert.deepEqual(outlets[0], ['ready']);

  // Object payloads go straight out of the outlet; node.script turns them into Max dictionaries.
  handlers.target(1, 'Track', '4,', 'slot', '1');
  await new Promise((r) => setTimeout(r, 20));
  const t = outlets.find((o) => o[0] === 'target');
  assert.ok(t, 'target was sent');
  assert.deepEqual(t[1], { ok: true, label: 'Track 4, slot 1' });
});
