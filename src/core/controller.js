'use strict';
const fs = require('fs');

const PEAK_BINS = 600;

function createController({ deps, send, cacheDir, home }) {
  const st = {
    overridePath: null,
    memos: [],
    memo: null,
    files: null,
    mono: null,
    sr: 0,
    duration: 0,
    segments: [],
    windows: {},
    window: null,
    anchorS: null,
    manual: null,
    params: { segment: 0, length: 0, snap: 1, auto: 1, norm: 0 },
    settings: { thresholdDb: -40, minSilenceMs: 300, fadeMs: 5 },
    tempo: 120,
    beatsPerBar: 4,
    setPath: null,
    target: { ok: false, label: 'No target yet' },
    token: 0,
    pendingRestore: null,
  };

  const W = deps.window;
  const settingsKey = () => `${st.settings.thresholdDb}|${st.settings.minSilenceMs}`;
  const mtimeOf = (p) => {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      return 0;
    }
  };

  function init({ overridePath = null } = {}) {
    st.overridePath = overridePath;
    refresh();
  }

  function refresh() {
    const loc = deps.locate({ home, overridePath: st.overridePath });
    st.loc = loc;
    st.libSig = loc.mode === 'none' ? null : librarySignature(loc);
    if (loc.mode === 'none') {
      st.memos = [];
      send('memos', { items: [] });
      send('state', { name: loc.reason === 'no-fda' ? 'no-access' : 'empty', reason: loc.reason });
      return;
    }
    try {
      st.memos = deps.catalog.list(loc);
    } catch (e) {
      send('state', { name: 'error', message: `Could not read library: ${e.message}` });
      return;
    }
    send('memos', { items: st.memos });
    if (!st.memos.length) send('state', { name: 'empty', reason: 'no-memos' });
    else if (!st.memo) send('state', { name: 'idle' });
    // The open memo was still in iCloud and has now downloaded: load it.
    if (st.memo && st.memo.status !== 'local') {
      const now = st.memos.find((m) => m.id === st.memo.id);
      if (now && now.status === 'local') {
        st.loadFailed = true; // lets selectMemo reload the same id
        setImmediate(() => selectMemo(now.id));
      }
    }
    if (st.pendingRestore) {
      const id = st.pendingRestore;
      st.pendingRestore = null;
      if (st.memos.some((m) => m.id === id)) {
        send('select', id);
        setImmediate(() => selectMemo(id, { restoring: true }));
      }
    }
  }

  function librarySignature(loc) {
    try {
      return deps.catalog.signature ? deps.catalog.signature(loc) : null;
    } catch {
      return null;
    }
  }

  // Called on a timer: picks up memos that sync in from iCloud while the device is open.
  function poll() {
    if (!st.loc || st.loc.mode === 'none') return;
    const sig = librarySignature(st.loc);
    if (sig !== null && sig !== st.libSig) refresh();
  }

  function setFolder(p) {
    st.overridePath = p || null;
    refresh();
  }

  function restore(id) {
    if (!id || (st.memo && st.memo.id === id)) return;
    if (st.memos.length && st.memos.some((m) => m.id === id)) {
      send('select', id);
      return selectMemo(id, { restoring: true });
    }
    st.pendingRestore = id;
    return Promise.resolve();
  }

  function showWaveform(analysisWav) {
    const a = deps.readWav(analysisWav);
    st.mono = a.channels[0];
    st.sr = a.sampleRate;
    st.duration = st.mono.length / st.sr;
    send('waveform', { peaks: Array.from(deps.peaks(st.mono, PEAK_BINS)), duration: st.duration });
  }

  async function selectMemo(id, { restoring = false } = {}) {
    const memo = st.memos.find((m) => m.id === id);
    if (!memo) return;
    // Double-clicks and the Set-restore chain re-send the open memo; only a failed load reloads.
    if (st.memo && st.memo.id === id && !st.loadFailed) return;
    st.loadFailed = false;
    send('stop'); // the previous memo's audition must not keep playing
    const token = ++st.token;
    const current = () => token === st.token;
    Object.assign(st, { memo, files: null, mono: null, segments: [], windows: {}, window: null, anchorS: null, manual: null });
    const savedSegment = st.params.segment;
    st.params.segment = 0;
    send('header', { title: memo.title, date: memo.date, duration: memo.duration });
    if (memo.status !== 'local') {
      send('state', { name: 'notice', message: 'Open it once in Voice Memos to download it.' });
      send('pullenable', 0);
      return;
    }
    send('state', { name: 'loading' });
    let files;
    try {
      files = await deps.convert(memo, cacheDir, {
        onProgress: (phase, fraction) => current() && send('progress', { phase, fraction }),
        onAnalysisReady: (p) => current() && showWaveform(p),
      });
      if (!current()) return;
      if (!st.mono) showWaveform(files.analysisWav);
    } catch (e) {
      if (current()) {
        st.loadFailed = true;
        send('state', { name: 'error', message: e.message });
      }
      return;
    }
    st.files = files;
    send('audio', files.fullWav);
    loadSegments();
    // Open on the longest segment: short scraps (count-ins, handling noise) usually come first.
    // A Set reload keeps the segment saved with it.
    st.params.segment = restoring
      ? Math.max(0, Math.min(Number(savedSegment) || 0, st.segments.length - 1))
      : longestSegment(st.segments);
    send('segmentindex', st.params.segment);
    recompute();
    send('state', { name: 'ready' });
    if (st.params.auto) audition();
  }

  function longestSegment(segs) {
    let best = 0;
    segs.forEach((g, i) => { if (g.end - g.start > segs[best].end - segs[best].start) best = i; });
    return best;
  }

  function loadSegments() {
    const cached = deps.cache.get(st.memo.id, mtimeOf(st.memo.path));
    if (cached && cached.settingsKey === settingsKey()) {
      st.segments = cached.segments;
      st.windows = cached.windows || {};
    } else {
      st.segments = deps.segments(st.mono, st.sr, {
        thresholdDb: st.settings.thresholdDb,
        minSilenceMs: st.settings.minSilenceMs,
      });
      st.windows = {};
      persist();
    }
    send('segments', { items: st.segments });
  }

  function persist() {
    if (!st.memo) return;
    try {
      deps.cache.put(st.memo.id, mtimeOf(st.memo.path), { settingsKey: settingsKey(), segments: st.segments, windows: st.windows });
    } catch {
      // cache is best-effort
    }
  }

  function analysisFor(w) {
    const key = `${w.start.toFixed(3)}-${w.end.toFixed(3)}`;
    if (!st.windows[key]) {
      const range = [w.start, w.end];
      const safe = (fn) => {
        try {
          return fn(st.mono, st.sr, range);
        } catch {
          return null;
        }
      };
      st.windows[key] = { loudness: safe(deps.loudness), tempo: safe(deps.tempo), pitch: safe(deps.pitch), classify: safe(deps.classify) };
      persist();
    }
    return st.windows[key];
  }

  function recompute() {
    if (!st.mono) return;
    const preset = W.PRESETS[st.params.length] || 'seg';
    st.window = st.manual || W.resolve({
      preset,
      anchorS: st.anchorS,
      segmentIndex: st.params.segment,
      segments: st.segments,
      tempo: st.tempo,
      beatsPerBar: st.beatsPerBar,
      snap: !!st.params.snap,
      duration: st.duration,
    });
    if (!st.window) return;
    const length = st.window.end - st.window.start;
    send('window', { start: st.window.start, end: st.window.end });
    send('windowinfo', {
      start: st.window.start,
      end: st.window.end,
      length,
      bars: W.bars(length, st.tempo, st.beatsPerBar),
      segment: st.params.segment,
      segmentCount: st.segments.length,
      analysis: analysisFor(st.window),
    });
    send('pullenable', W.isPullable(st.window) ? 1 : 0);
  }

  function setParam(name, value) {
    const v = Number(value);
    if (name in st.params) {
      st.params[name] = v;
      if (name === 'segment') {
        st.anchorS = null;
        st.manual = null;
        send('segmentindex', v); // keeps the saved number box in step with chip clicks
      }
      if (name === 'length') st.manual = null;
      if (name !== 'auto' && name !== 'norm') recompute();
      return;
    }
    if (name in st.settings) {
      st.settings[name] = v;
      if (name !== 'fadeMs' && st.mono) {
        st.segments = deps.segments(st.mono, st.sr, { thresholdDb: st.settings.thresholdDb, minSilenceMs: st.settings.minSilenceMs });
        persist();
        send('segments', { items: st.segments });
        recompute();
      }
    }
  }

  function anchor(seconds) {
    const t = Number(seconds);
    st.manual = null;
    if ((W.PRESETS[st.params.length] || 'seg') === 'seg') {
      const i = W.segmentAt(t, st.segments);
      if (i < 0) return;
      st.params.segment = i;
      send('segmentindex', i);
    } else st.anchorS = t;
    recompute();
  }

  function drag(start, end) {
    if (!st.mono) return;
    st.manual = W.fromDrag({ start: Number(start), end: Number(end) }, st.duration);
    recompute();
  }

  function audition() {
    if (!st.window || !st.files) return;
    send('audition', Math.round(st.window.start * 1000), Math.round(st.window.end * 1000));
  }

  function pull() {
    if (!st.files || !W.isPullable(st.window)) {
      send('status', { level: 'error', message: 'Choose a window first' });
      return;
    }
    if (!st.target.ok) {
      send('status', { level: 'error', message: st.target.label });
      return;
    }
    try {
      const out = deps.writePull({
        fullWav: st.files.fullWav,
        title: st.memo.title,
        start: st.window.start,
        end: st.window.end,
        normalize: !!st.params.norm,
        setPath: st.setPath,
        cacheDir,
        fadeMs: st.settings.fadeMs,
      });
      send('pull', out);
    } catch (e) {
      send('status', { level: 'error', message: `Pull failed: ${e.message}` });
    }
  }

  function pullResult(ok, message) {
    send('status', { level: Number(ok) ? 'ok' : 'error', message: String(message) });
  }

  // Live's tempo counts quarter notes in every signature, so a bar is num * 4/den of them.
  function setTempo(bpm, numerator, denominator = 4) {
    const num = Number(numerator) > 0 ? Number(numerator) : 4;
    const den = Number(denominator) > 0 ? Number(denominator) : 4;
    st.tempo = Number(bpm) > 0 ? Number(bpm) : 120;
    st.beatsPerBar = (num * 4) / den;
    recompute();
  }

  function setSetPath(p) {
    st.setPath = p ? String(p) : null;
  }

  function setTarget(ok, label) {
    st.target = { ok: !!Number(ok), label: String(label) };
    send('target', st.target);
  }

  return { init, refresh, poll, setFolder, restore, selectMemo, setParam, anchor, drag, audition, pull, pullResult, setTempo, setSetPath, setTarget };
}

module.exports = { createController };
