'use strict';
// The committed device must work from any checkout and must not leak the builder's home folder.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DEVICE = path.join(__dirname, '..', 'device');

test('device references its scripts by file name, with no absolute paths', () => {
  const amxd = fs.readFileSync(path.join(DEVICE, 'VoiceMemo.amxd'), 'latin1');
  assert.doesNotMatch(amxd, /\/Users\/|\/home\/|[A-Z]:\\\\/);
  for (const name of ['voicememo-core.js', 'voicememo-lom.js', 'voicememo-list.js', 'voicememo-wave.js', 'voicememo-panel.js']) {
    assert.ok(amxd.includes(name), `amxd names ${name}`);
    assert.ok(fs.existsSync(path.join(DEVICE, name)), `${name} sits next to the device`);
  }
});
