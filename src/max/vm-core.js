'use strict';
// node.script entry: the only module that talks to max-api.
const maxApi = require('max-api');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const { createController } = require('../core/controller');
const { locate } = require('../library/locate');
const catalog = require('../library/catalog');
const { convert } = require('../audio/convert');
const wav = require('../audio/wav');
const { peaks } = require('../audio/peaks');
const { segments } = require('../analysis/segments');
const { loudness } = require('../analysis/loudness');
const { tempo } = require('../analysis/tempo');
const { pitch } = require('../analysis/pitch');
const { classify } = require('../analysis/classify');
const { createCache } = require('../analysis/cache');
const window = require('../window');
const { writePull } = require('../pull');

const CACHE_DIR = path.join(os.homedir(), 'Music', 'Ableton', 'User Library', 'VoiceMemo Cache');
const SETTINGS = path.join(CACHE_DIR, 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(patch) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...loadSettings(), ...patch }, null, 2));
}

// max-api sometimes rejects with non-Error values; show whatever arrived.
function describe(e) {
  if (e instanceof Error) return `${e.name}: ${e.message || '(no message)'} ${(e.stack || '').split('\n')[1] || ''}`.trim();
  try {
    return `${typeof e} ${JSON.stringify(e)}`;
  } catch {
    return String(e);
  }
}

let queue = Promise.resolve();
// Object payloads go out as-is: node.script converts them to uniquely named Max dictionaries
// (setDict would need a pre-existing [dict] in the patch).
function send(type, ...args) {
  queue = queue
    .then(() => maxApi.outlet(type, ...args))
    .catch((e) => maxApi.post(`vm-core send ${type} failed: ${describe(e)} payload=${JSON.stringify(args).slice(0, 300)}`));
  return queue;
}

const controller = createController({
  deps: {
    locate,
    catalog,
    convert,
    readWav: wav.read,
    peaks,
    segments,
    loudness,
    tempo,
    pitch,
    classify,
    cache: createCache(CACHE_DIR),
    window,
    writePull,
  },
  send,
  cacheDir: CACHE_DIR,
  home: os.homedir(),
});

const joined = (parts) => parts.map(String).join(' ');

maxApi.addHandlers({
  init: () => controller.init({ overridePath: loadSettings().overridePath || null }),
  refresh: () => controller.refresh(),
  folder: (...parts) => {
    const p = joined(parts);
    saveSettings({ overridePath: p });
    controller.setFolder(p);
  },
  select: (...parts) => controller.selectMemo(joined(parts)),
  restore: (...parts) => controller.restore(joined(parts)),
  segment: (i) => controller.setParam('segment', i),
  param: (name, value) => controller.setParam(String(name), value),
  anchor: (s) => controller.anchor(s),
  drag: (s, e) => controller.drag(s, e),
  audition: () => controller.audition(),
  pull: () => controller.pull(),
  pullresult: (ok, ...msg) => controller.pullResult(ok, joined(msg)),
  tempo: (bpm, num, den) => controller.setTempo(bpm, num, den),
  setpath: (...parts) => controller.setSetPath(joined(parts)),
  target: (ok, ...label) => controller.setTarget(ok, joined(label)),
  opensettings: () =>
    execFile('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles']),
});

// New memos sync in from iCloud while Live is open; check every few seconds (stat only).
setInterval(() => controller.poll(), 4000).unref();

send('ready');
