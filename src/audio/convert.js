'use strict';
// PRIVACY: reads one recording at a time (needs Full Disk Access) via /usr/bin/afinfo and
// /usr/bin/afconvert. Writes WAV copies only into the device's cache folder, never into the library.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { safeId } = require('../util/ids');

function probe(src) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/afinfo', [src], { encoding: 'utf8' }, (err, out) => {
      if (err) return reject(new Error(`afinfo failed: ${String(err.message).split('\n')[0]}`));
      const ch = /(\d+)\s+ch,/.exec(out);
      const dur = /estimated duration:\s*([\d.]+)/.exec(out);
      resolve({ channels: ch ? Number(ch[1]) : 2, duration: dur ? Number(dur[1]) : null });
    });
  });
}

function isFresh(dst, src) {
  try {
    return fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
  } catch {
    return false;
  }
}

function afconvert(args, src, dst, expectedBytes, onProgress) {
  const tmp = `${dst}.part.wav`;
  return new Promise((resolve, reject) => {
    const proc = spawn('/usr/bin/afconvert', [...args, src, tmp]);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    const timer = setInterval(() => {
      try {
        onProgress(Math.min(0.99, fs.statSync(tmp).size / expectedBytes));
      } catch {
        // tmp not created yet
      }
    }, 200);
    const fail = (msg) => {
      clearInterval(timer);
      fs.rmSync(tmp, { force: true });
      reject(new Error(msg));
    };
    proc.on('error', (e) => fail(`afconvert failed: ${e.message}`));
    proc.on('close', (code) => {
      if (code !== 0) return fail(`afconvert failed (${code}): ${stderr.trim().split('\n')[0] || 'unknown error'}`);
      clearInterval(timer);
      fs.renameSync(tmp, dst);
      onProgress(1);
      resolve(dst);
    });
  });
}

async function convert(memo, cacheDir, { onProgress = () => {}, onAnalysisReady = () => {} } = {}) {
  if (!memo.path || !fs.existsSync(memo.path)) {
    throw Object.assign(new Error('Recording not downloaded'), { code: 'ENOENT' });
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const base = path.join(cacheDir, safeId(memo.id));
  const analysisWav = `${base}.a.wav`;
  const fullWav = `${base}.wav`;
  const info = await probe(memo.path);
  const duration = info.duration || memo.duration || 60;

  if (!isFresh(analysisWav, memo.path)) {
    await afconvert(['-f', 'WAVE', '-d', 'LEI16@11025', '-c', '1', '--mix'], memo.path, analysisWav,
      duration * 11025 * 2, (f) => onProgress('analysis', f));
  }
  onAnalysisReady(analysisWav);

  if (!isFresh(fullWav, memo.path)) {
    const channels = Math.min(2, info.channels);
    const mix = info.channels > 2 ? ['-c', '2', '--mix'] : [];
    await afconvert(['-f', 'WAVE', '-d', 'LEI24@44100', ...mix], memo.path, fullWav,
      duration * 44100 * 3 * channels, (f) => onProgress('full', f));
  }
  return { fullWav, analysisWav };
}

module.exports = { convert, probe };
