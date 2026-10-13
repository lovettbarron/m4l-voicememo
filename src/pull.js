'use strict';
const fs = require('fs');
const path = require('path');
const wav = require('./audio/wav');

function sanitize(name) {
  const cleaned = String(name || '')
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = Array.from(cleaned).slice(0, 60).join('').trim();
  return clipped || 'memo';
}

function mmss(seconds) {
  const t = Math.max(0, Math.floor(seconds));
  return String(Math.floor(t / 60)).padStart(2, '0') + String(t % 60).padStart(2, '0');
}

function pullDir({ setPath, cacheDir }) {
  return setPath
    ? path.join(path.dirname(setPath), 'Samples', 'Imported', 'VoiceMemo')
    : path.join(cacheDir, 'Pulled');
}

function uniquePath(dir, base) {
  let p = path.join(dir, `${base}.wav`);
  for (let n = 2; fs.existsSync(p); n++) p = path.join(dir, `${base}-${n}.wav`);
  return p;
}

function writePull({ fullWav, title, start, end, normalize = false, setPath = null, cacheDir, fadeMs = 5 }) {
  const dir = pullDir({ setPath, cacheDir });
  fs.mkdirSync(dir, { recursive: true });
  const out = uniquePath(dir, `${sanitize(title)}-${mmss(start)}-${mmss(end)}`);
  return wav.copyRange(fullWav, out, start, end, { fadeMs, normalize, targetDb: -1 });
}

module.exports = { sanitize, mmss, pullDir, writePull };
