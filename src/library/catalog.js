'use strict';
// PRIVACY: reads the Voice Memos database (needs Full Disk Access). Read-only: node:sqlite with
// readOnly, or /usr/bin/sqlite3 -readonly. Reads titles, dates, durations and file names only;
// in folder mode it lists the chosen folder and asks /usr/bin/afinfo for each file's length.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CORE_DATA_EPOCH = 978307200;
const AUDIO_EXT = /\.(m4a|qta|wav|aiff?)$/i;
const OPTIONAL_COLUMNS = ['Z_PK', 'ZENCRYPTEDTITLE', 'ZCUSTOMLABEL', 'ZDURATION', 'ZUNIQUEID'];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function nodeAdapter(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  return { all: (sql) => db.prepare(sql).all(), close: () => db.close() };
}

function cliAdapter(dbPath) {
  return {
    all: (sql) => {
      const out = execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', dbPath, sql], { encoding: 'utf8' });
      return out.trim() ? JSON.parse(out) : [];
    },
    close() {},
  };
}

function hasNodeSqlite() {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

function query(dbPath, sql, adapter) {
  const db = adapter === 'cli' || (adapter === 'auto' && !hasNodeSqlite()) ? cliAdapter(dbPath) : nodeAdapter(dbPath);
  try {
    return db.all(sql);
  } finally {
    db.close();
  }
}

// Last resort when Voice Memos holds the database busy: query a private temp copy,
// then delete it so no copy of the library outlives the read.
function queryCopy(dbPath, sql, adapter) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-db-'));
  try {
    const dst = path.join(dir, path.basename(dbPath));
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, dst + suffix);
    }
    return query(dst, sql, adapter);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function queryWithRetry(dbPath, sql, adapter) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return query(dbPath, sql, adapter);
    } catch (e) {
      if (!/locked|busy/i.test(e.message)) throw e;
      sleep(200);
    }
  }
  return queryCopy(dbPath, sql, adapter);
}

function toMemo(r, root) {
  const rel = r.ZPATH || null;
  const abs = rel ? (path.isAbsolute(rel) ? rel : path.join(root, rel)) : null;
  const title =
    [r.ZENCRYPTEDTITLE, r.ZCUSTOMLABEL].map((t) => (t || '').trim()).find(Boolean) ||
    (rel ? path.basename(rel, path.extname(rel)) : 'Untitled');
  return {
    id: r.ZUNIQUEID || `pk${r.Z_PK}`,
    title,
    date: r.ZDATE == null ? null : new Date((r.ZDATE + CORE_DATA_EPOCH) * 1000).toISOString(),
    duration: typeof r.ZDURATION === 'number' ? r.ZDURATION : null,
    path: abs,
    status: abs && fs.existsSync(abs) ? 'local' : 'cloud',
    ext: rel ? path.extname(rel).slice(1).toLowerCase() : '',
  };
}

function listLibrary(location, adapter) {
  const cols = queryWithRetry(location.dbPath, 'PRAGMA table_info(ZCLOUDRECORDING)', adapter).map((c) => c.name);
  if (!cols.includes('ZPATH') || !cols.includes('ZDATE')) return null;
  const select = ['ZPATH', 'ZDATE', ...OPTIONAL_COLUMNS.filter((c) => cols.includes(c))];
  const rows = queryWithRetry(location.dbPath, `SELECT ${select.join(', ')} FROM ZCLOUDRECORDING`, adapter);
  return rows.map((r) => toMemo(r, location.root));
}

function afinfoDuration(file) {
  try {
    const out = execFileSync('/usr/bin/afinfo', [file], { encoding: 'utf8' });
    const m = /estimated duration:\s*([\d.]+)/.exec(out);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function listFolder(root, durationOf = afinfoDuration) {
  return fs
    .readdirSync(root)
    .filter((f) => AUDIO_EXT.test(f))
    .map((f) => {
      const abs = path.join(root, f);
      return {
        id: `f-${f}`,
        title: path.basename(f, path.extname(f)),
        date: fs.statSync(abs).mtime.toISOString(),
        duration: durationOf(abs),
        path: abs,
        status: 'local',
        ext: path.extname(f).slice(1).toLowerCase(),
      };
    });
}

function list(location, { adapter = 'auto', durationOf = afinfoDuration } = {}) {
  let memos = [];
  if (location.mode === 'library') memos = listLibrary(location, adapter) || listFolder(location.root, durationOf);
  else if (location.mode === 'folder') memos = listFolder(location.root, durationOf);
  return memos.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

module.exports = { list, queryCopy };
