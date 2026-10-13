'use strict';

const PRESETS = ['seg', '1bar', '2bar', '4bar', '8bar', '5s', '10s', '30s'];
const MIN_LENGTH = 0.05;
const SNAP_RANGE = 1;

function presetLength(preset, tempo = 120, beatsPerBar = 4) {
  const m = /^(\d+)(bar|s)$/.exec(preset);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 's' ? n : (n * beatsPerBar * 60) / tempo;
}

function nearestSegmentStart(t, segments) {
  let best = null;
  for (const s of segments) {
    const d = Math.abs(s.start - t);
    if (d <= SNAP_RANGE && (best === null || d < Math.abs(best - t))) best = s.start;
  }
  return best;
}

function resolve({ preset, anchorS = null, segmentIndex = 0, segments = [], tempo = 120, beatsPerBar = 4, snap = true, duration }) {
  if (!(duration > 0)) return null;
  const idx = Math.max(0, Math.min(segments.length - 1, segmentIndex));
  if (preset === 'seg') {
    if (!segments.length) return { start: 0, end: duration };
    return { start: segments[idx].start, end: Math.min(duration, segments[idx].end) };
  }
  const len = presetLength(preset, tempo, beatsPerBar);
  if (len === null) throw new Error(`unknown preset ${preset}`);
  let start = anchorS !== null ? anchorS : segments.length ? segments[idx].start : 0;
  if (snap && segments.length) {
    const snapped = nearestSegmentStart(start, segments);
    if (snapped !== null) start = snapped;
  }
  start = Math.max(0, Math.min(duration, start));
  return { start, end: Math.min(duration, start + len) };
}

function fromDrag({ start, end }, duration) {
  return {
    start: Math.max(0, Math.min(duration, Math.min(start, end))),
    end: Math.max(0, Math.min(duration, Math.max(start, end))),
  };
}

function isPullable(w) {
  return !!w && w.end - w.start >= MIN_LENGTH - 1e-9;
}

function bars(seconds, tempo, beatsPerBar = 4) {
  return (seconds * tempo) / 60 / beatsPerBar;
}

function segmentAt(t, segments) {
  return segments.findIndex((s) => t >= s.start && t <= s.end);
}

module.exports = { PRESETS, MIN_LENGTH, presetLength, resolve, fromDrag, isPullable, bars, segmentAt };
