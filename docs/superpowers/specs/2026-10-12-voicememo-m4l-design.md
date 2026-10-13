# VoiceMemo — Max for Live device design

Date: 2026-10-12
Status: Approved design, pending spec review

## 1. Goal

A Max for Live Audio Effect for Ableton Live 12 that browses Apple Voice Memos (synced via iCloud to the Mac), runs light analysis on a chosen recording, and pulls a chosen window of it into a Session clip slot.

Interaction: open device → select a recording → select a predefined clip window → Pull.

### Success criteria
- Memos from the user's iCloud-synced library appear in the device with title, date, duration, and local/cloud status, on macOS 13 Ventura through macOS 27.
- Selecting a memo shows its waveform within ~1 s for a typical (<5 min) memo; analysis results follow without blocking the UI.
- A window can be chosen from auto-detected segments or fixed-length presets (bars at Set tempo, or seconds) that snap to segment edges.
- Pull creates an audio clip in the selected track's Session slot (or next empty slot below) containing exactly that window.
- When the library is unreadable (no Full Disk Access), the device explains how to fix it and offers a folder-based fallback.

### Non-goals (YAGNI)
- Arrangement placement, Simpler loading, drag-and-drop out of the device.
- Transcripts, editing/renaming memos, writing back to the Voice Memos library.
- Individual layers of layered (`.qta`) recordings — they are mixed down.
- Windows support, Live 11 support, macOS < 13.
- Accurate MIR: tempo/key/speech-music are rough estimates and labelled as such ("≈").

## 2. Platform constraints (from research)

| Topic | Fact | Consequence |
|---|---|---|
| Library path, macOS 13 | `~/Library/Application Support/com.apple.voicememos/Recordings` | Probe both paths, in order of the newer path first |
| Library path, macOS 14+ | `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings` | |
| Catalog | `CloudRecordings.db` (Core Data SQLite), table `ZCLOUDRECORDING` | Column set varies by OS → map columns via `PRAGMA table_info` at runtime |
| Title column | `ZENCRYPTEDTITLE` (14+, plaintext despite name), `ZCUSTOMLABEL` (older; both present on macOS 27) | Prefer non-empty `ZENCRYPTEDTITLE`, then `ZCUSTOMLABEL`, then filename |
| Path / duration | `ZPATH` is a bare filename relative to the Recordings dir; `ZDURATION` (s) present on macOS 27 | Join with root; use `ZDURATION` when present, else `afinfo` |
| Memo length | Real library contains a 67-min memo → 534 MB 24-bit WAV | Never load full-res audio into memory or `buffer~` (see 3.2) |
| Date | `ZDATE` = seconds since 2001-01-01 | Unix = `ZDATE + 978307200` |
| Cloud-only memos | No documented flag | Status = `cloud` if file at `ZPATH` is missing |
| Formats | `.m4a` (AAC/ALAC); `.qta` for layered recordings (macOS 15.2+) | Always convert to WAV with `/usr/bin/afconvert` |
| Privacy | Folder protected by TCC (+SIP on Group Containers since 15) | Live needs Full Disk Access. **Spike verified (2026-10-12, Live 12.4.6, macOS 27.0.1):** without FDA every access is `EPERM`; with FDA granted to Live (and Live restarted), node.script (`node → N4M PM → Live`), `node:sqlite`, `/usr/bin/sqlite3` and `afconvert` all succeed |
| Node for Max | Live 12.4.6 bundles Max 9.1.5 / Node 22.18 with `node:sqlite` | Use `node:sqlite` when available, else spawn `/usr/bin/sqlite3 -json` |
| Clip creation | `ClipSlot.create_audio_clip(abs_path)`, Live 12.0.5+ | Minimum Live 12.0.5; target audio track, empty slot |
| UI | Device height fixed at 169 px; keyboard unreliable in M4L | Fixed width ~760 px; every action clickable and exposed as a Live parameter |

Minimum: **Live 12.0.5, macOS 13**. Primary test target: Live 12.4.x on macOS 27.

## 3. Architecture

```
VoiceMemo.amxd (Audio Effect)
├─ UI layer (presentation mode)
│   ├─ v8ui memo-list.js        list rows, filter, selection
│   ├─ v8ui wave-view.js        waveform overlay: segments, window bracket, progress
│   ├─ live.* parameters        Segment, Length, Snap, Auto, Norm, Audition, Pull
│   └─ live.colors              theme tracking
├─ node.script vm-core.js       message router (Max ⇄ modules), owns state
│   ├─ library/locate.js        find library or folder; probe access
│   ├─ library/catalog.js       list memos (sqlite adapter + folder scanner)
│   ├─ audio/convert.js         afconvert → cached WAV
│   ├─ audio/wav.js             WAV read/write, slice, fade, normalize
│   ├─ audio/peaks.js           downsampled min/max for display
│   ├─ analysis/segments.js     silence segmentation
│   ├─ analysis/loudness.js     peak / RMS (dBFS)
│   ├─ analysis/tempo.js        onset envelope + autocorrelation BPM
│   ├─ analysis/pitch.js        YIN f0 → pitch-class histogram → key
│   ├─ analysis/classify.js     speech vs music heuristic
│   ├─ analysis/cache.js        JSON sidecar per memo
│   └─ window.js                window model: presets, snapping, bars↔seconds
├─ [js] lom-bridge.js           LOM: selected track/slot, tempo, create_audio_clip
└─ sfplay~                     disk-streamed audition of selected window
```

Unit boundaries: every module under `library/`, `audio/`, `analysis/` and `window.js` is plain Node with no Max dependency and is unit-testable. `vm-core.js` is the only file that imports `max-api`. `lom-bridge.js` runs in Max's `[js]` (LOM is not available from Node) and talks to `vm-core` via patch messages.

### 3.1 Module contracts

- `locate({home, overridePath}) → {mode: 'library'|'folder'|'none', root, dbPath?, reason?}`
  Tries override folder (if set), then 14+ path, then 13 path. Access is tested by opening the DB read-only; `EPERM`/"authorization denied" → `reason: 'no-fda'`.
- `catalog.list(location) → Memo[]` where `Memo = {id, title, date (ISO), duration (s), path (abs), status: 'local'|'cloud', ext}`. DB opened **read-only**; recordings in Recently Deleted (if a column identifying them exists) are excluded. Folder mode scans `*.m4a|*.qta|*.wav|*.aif*` with `afinfo` for duration, title = filename, date = mtime. Sorted newest first.
- `convert(memo, cacheDir) → {fullWav, analysisWav}` — full-res for slicing, plus mono 11025 Hz 16-bit analysis WAV (`afconvert -d LEI16@11025 -c 1`; ~79 MB/hour) for peaks + analysis. Full-res conversion — `afconvert -f WAVE -d LEI24@44100`, channel count from `afinfo` preserved for mono/stereo, anything >2 channels (e.g. layered `.qta`) mixed to stereo with `-c 2`; skipped if the cached WAV is newer than the source.
- `wav.read(path) → {sampleRate, channels: Float32Array[]}` (analysis WAV only); `wav.write(path, audio)`; `wav.readRange(path, startS, endS)` reads only the byte range of a PCM WAV (header parsed, then `fs.read` at offset) — used for slicing the full-res WAV; `wav.process(audio, {fadeMs, normalize})`.
- `peaks(audio, bins) → Float32Array` (interleaved min/max of mono sum).
- `segments(mono, sr, {thresholdDb=-40, minSilenceMs=300, minSegmentMs=250, padMs=30}) → [{start, end}]` (seconds).
- `loudness(mono, sr, [start,end]) → {peakDb, rmsDb}`.
- `tempo(mono, sr, [start,end]) → {bpm|null, confidence}`; range 60–180 BPM, null when confidence low or window < 4 s.
- `pitch(mono, sr, [start,end]) → {note|null, key|null, confidence}`; YIN on 2048-sample frames; key via Krumhansl profile correlation over voiced-frame pitch-class histogram.
- `classify(mono, sr, [start,end]) → {label: 'speech'|'music'|'unknown', confidence}`; features: ZCR coefficient of variation, voiced-frame ratio and pitch stability (spectral flatness dropped to avoid an FFT).
- `window.resolve({preset, anchorS, segments, tempo, snap, duration}) → {start, end}`; presets `seg`, `1|2|4|8 bar`, `5|10|30 s`. Snap moves start to nearest segment start within 1 s; end is clamped to memo duration.
- `cache.get(id, mtime)` / `cache.put(id, mtime, analysis)` in `<cacheDir>/<id>.json`.

### 3.2 Long memos
- Display and analysis use only the analysis WAV. Audition uses `sfplay~` streaming the full-res WAV from disk with a seek to the window start (no `buffer~` load). Pull reads only the window's byte range.
- Segmentation runs once per memo (one linear pass over the analysis WAV, ~40M samples for an hour). Loudness/tempo/pitch/class are computed on demand for the selected window, memoised, and persisted in the cache.
- Full-res conversion of long memos runs with progress (afconvert duration estimate vs elapsed); the analysis WAV is converted first so the waveform appears quickly.

### 3.3 Paths
- Cache: `~/Music/Ableton/User Library/VoiceMemo Cache/` (WAVs + JSON).
- Pulled clips: `<Set project folder>/Samples/Imported/VoiceMemo/<title>-<mmss>-<mmss>.wav` when the Set is saved (path from LOM `Song.file_path` if available, else cache dir `Pulled/`). Filenames sanitized; collisions get `-2`, `-3`…

## 4. Data flow

1. **Load**: `vm-core` → `locate` → `catalog.list` → UI list. No-access → access panel state.
2. **Select memo**: `convert` (progress) → `wav.read` → `peaks` (from analysis WAV) → UI waveform; `sfplay~ open <fullWav>` → `cache.get` or run analysis (`segments` first, pushed to UI immediately; then per-segment `loudness`, `tempo`, `pitch`, `classify`) → `cache.put`. If Auto is on, audition segment 1.
3. **Choose window**: segment chip click, Segment stepper, Length preset, waveform click (anchor), or bracket drag → `window.resolve` → UI bracket + right panel analysis for the window (computed on demand, memoized). `lom-bridge` reports tempo for bar math.
4. **Pull**: `vm-core` → `wav.readRange` + `wav.process` (5 ms fades, optional normalize to -1 dBFS) → write file → `lom-bridge pull <path>` → resolve target slot → `create_audio_clip` → result message to UI.

Target slot: `Song.view.highlighted_clip_slot` if it belongs to the device's own track and is empty; otherwise the first empty slot at or below it on the device's track; if none, the device reports "no empty slot". (An Audio Effect lives on an audio track, so track-type errors only arise if the device is placed on a return/master — reported as "place on an audio track".)

## 5. UI

Fixed width ~760 px, height 169 px.

```
┌─ VoiceMemo ─────────────────────────────────────────────────────────────────────────────────┐
│┌ MEMOS ───────── ⟳ ⤢┐┌ "Hummed riff 3" · 2:14 · 12 Oct ──────────────────┐┌ WINDOW ──────────┐│
││ ⌕ filter…          ││  ▁▂▅█▇▅▂▁   ▁▃▆█▆▃▁▁   ▂▅▇█▇▆▅▃▂▁    ▁▂▄▆▅▃▁      ││ 0:42.1 → 0:50.3  ││
││▸Hummed riff 3  2:14││ [──1──]    [══2══]   [───3─────]    [──4──]       ││ 8.2 s · 4 bars   ││
││ 12 Oct · local     ││            ⟦▓▓▓▓▓▓▓▓▓▓⟧                         ││ Pk -3.1  RMS -18 ││
││ Kitchen beat   0:48││ 0:00        0:40        1:20         2:00        ││ ♩≈ 96   Key≈A min││
││ 11 Oct · ☁︎ cloud   │├────────────────────────────────────────────────────┤│ ◉ Music  ○ Speech││
││ Lyric idea     1:02││ SEG ‹ 2 ›  LEN [Seg|1|2|4|8 bar|5|10|30s] SNAP ●   ││──────────────────││
││ 09 Oct · local     ││ ▶ Audition   AUTO ●   NORM ●            ⚙          ││  → T3 · Slot 5   ││
││ …                  ││                                                    ││ ┏━━━━ PULL ━━━━┓ ││
│└────────────────────┘└────────────────────────────────────────────────────┘└──────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
   ~190 px                         ~400 px                                         ~150 px
```

- **Memos (~190 px)**: v8ui list, two-line rows, filter field, ⟳ rescan, ⤢ opens the same list in a floating `pcontrol` window for long libraries. Cloud rows are dimmed.
- **Center (~400 px)**: header with title/duration/date; waveform with numbered segment chips and draggable window bracket; control row. ⚙ opens a small panel for silence threshold, min gap, fade length.
- **Window (~150 px)**: window range/length (bars when tempo known), Peak/RMS, BPM≈, Key≈, speech/music, target slot, PULL button.
- **States** (center panel content): `no-access` (Grant Full Disk Access → [Open Settings] · or [Use a folder…]), `empty` (no memos; explain iCloud sync), `loading/analyzing` (progress bar over waveform), `ready`, `error` (message + retry).
- **Live parameters** (saved with Set, mappable): Segment (int), Length (enum), Snap, Auto, Norm (toggles), Audition, Pull (buttons). Last-selected memo id stored in a hidden parameter / `pattr` to restore on Set reload.
- Text ≥ 9 pt; colours from `live.colors`; all interactions mouse-driven.

## 6. Error handling

| Situation | Detection | Behaviour |
|---|---|---|
| No Full Disk Access | DB open fails with EPERM / authorization denied | `no-access` state; [Open Settings] runs `open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"`; [Use a folder…] uses Max `opendialog fold`, persisted |
| Library absent (Voice Memos never used / iCloud off) | Neither path exists | `empty` state with explanation; folder option offered |
| Schema unrecognised | Required columns (`ZPATH`) missing | Fall back to folder scan of the Recordings dir; log columns found to Max console |
| `node:sqlite` unavailable | `require` throws | Use `/usr/bin/sqlite3 -readonly -json` |
| Cloud-only memo selected | File missing | Inline notice "Not downloaded — open it once in Voice Memos", Pull disabled |
| afconvert failure / unsupported file | Non-zero exit | `error` state with stderr summary; memo marked unplayable for session |
| Analysis exception | try/catch per analyser | That field shows "—"; others unaffected |
| Window invalid (beyond end, < 50 ms) | `window.resolve` | Clamp; disable Pull if < 50 ms |
| Unsaved Set | `Song.file_path` empty | Write to cache `Pulled/`; status line notes location |
| No empty slot / wrong track type | lom-bridge checks | Message on the Pull button area; nothing created |
| create_audio_clip throws (old Live) | LOM error | "Requires Live 12.0.5+" message |
| DB locked by Voice Memos | SQLITE_BUSY | Retry 3× with 200 ms backoff, then copy DB+WAL to temp and read the copy |

The device never writes to the Voice Memos library; DB is always opened read-only (or a temp copy).

## 7. Testing

- **Unit (`node --test`, plain Node 22)**: `wav`, `peaks`, `segments`, `loudness`, `tempo`, `pitch`, `classify`, `window`, `cache` using synthetic fixtures generated in tests (sines at known frequencies, click tracks at known BPM, tone/silence alternations, white noise vs harmonic tone).
- **Catalog**: fixture SQLite DBs created in test setup mimicking macOS 13 (`ZCUSTOMLABEL`) and 14+ (`ZENCRYPTEDTITLE`) schemas; folder-mode scan against a temp dir; both `node:sqlite` and `sqlite3` CLI adapters.
- **Locate**: fake home dirs exercising each path, plus a permission-denied simulation.
- **Integration (manual checklist, in Live 12.4 on macOS 27)**: FDA denied/granted flows, real library listing, `.m4a` and `.qta` conversion, segment display, preset snapping, audition, Pull into selected/next-empty slot, unsaved vs saved Set, theme switch, Set reload restores state.
- **Spike (done)**: FDA inheritance verified; throwaway code in `spike/` (delete once the device is built).

## 8. Repository layout

```
voicememo/
├─ device/VoiceMemo.amxd          (generated; loads device/voicememo-*.js by file name; frozen release is a follow-up)
├─ device/VoiceMemo.maxpat
├─ src/                            Node modules (Section 3)
├─ src/max/vm-core.js, lom-bridge.js, memo-list.js, wave-view.js
├─ test/                           node --test suites + fixture builders
├─ docs/superpowers/specs/, docs/superpowers/plans/
└─ package.json                    (no runtime deps; test script only)
```
