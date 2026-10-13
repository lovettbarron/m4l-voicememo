'use strict';
// Keeps the Full Disk Access surface small and auditable: only the files listed in
// README "Privacy and Full Disk Access" may touch the Voice Memos library, and nothing
// in src/ may talk to the network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const PROTECTED_FILES = ['library/locate.js', 'library/catalog.js', 'audio/convert.js'];
const LIBRARY_ACCESS = /VoiceMemos|voicememos|CloudRecordings|node:sqlite|sqlite3|afconvert|afinfo/;
const NETWORK = /require\(\s*['"](node:)?(https?|http2|net|tls|dgram|dns)['"]\s*\)|\bfetch\(|XMLHttpRequest|WebSocket/;

function files(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, base) : e.name.endsWith('.js') ? [path.relative(base, p)] : [];
  });
}
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('only the listed files touch the Voice Memos library', () => {
  const touching = files(SRC).filter((f) => LIBRARY_ACCESS.test(strip(fs.readFileSync(path.join(SRC, f), 'utf8'))));
  assert.deepEqual(touching.sort(), [...PROTECTED_FILES].sort());
});

test('each protected file opens with a PRIVACY note', () => {
  for (const f of PROTECTED_FILES) {
    const head = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').slice(0, 6).join('\n');
    assert.match(head, /PRIVACY:/, f);
  }
});

test('no source file uses the network', () => {
  for (const f of files(SRC)) {
    assert.doesNotMatch(strip(fs.readFileSync(path.join(SRC, f), 'utf8')), NETWORK, f);
  }
});
