'use strict';
// PRIVACY: probes the Voice Memos library folders (needs Full Disk Access). Lists directories only;
// reads no file contents and writes nothing.
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIBRARY_DIRS = [
  'Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings',
  'Library/Application Support/com.apple.voicememos/Recordings',
];

function tryRead(dir, fsImpl) {
  try {
    fsImpl.readdirSync(dir);
    return 'ok';
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') return 'denied';
    return 'missing';
  }
}

function locate({ home = os.homedir(), overridePath = null, fsImpl = fs } = {}) {
  if (overridePath) {
    return tryRead(overridePath, fsImpl) === 'ok'
      ? { mode: 'folder', root: overridePath }
      : { mode: 'none', reason: 'folder-unreadable' };
  }
  let denied = null;
  for (const rel of LIBRARY_DIRS) {
    const root = path.join(home, rel);
    const r = tryRead(root, fsImpl);
    if (r === 'denied') {
      denied = denied || root;
      continue;
    }
    if (r === 'missing') continue;
    const dbPath = path.join(root, 'CloudRecordings.db');
    return fsImpl.existsSync(dbPath) ? { mode: 'library', root, dbPath } : { mode: 'folder', root };
  }
  return denied ? { mode: 'none', reason: 'no-fda', root: denied } : { mode: 'none', reason: 'not-found' };
}

module.exports = { locate, LIBRARY_DIRS };
