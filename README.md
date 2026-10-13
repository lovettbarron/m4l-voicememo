# VoiceMemo for Ableton Live

A Max for Live audio effect that brings your Apple Voice Memos into Live. Pick a recording, pick a window of it, and pull that window into a Session clip slot as a WAV file.

It also gives a rough read on the selected window: peak and RMS level, an estimated tempo, an estimated key, and whether it sounds more like speech or music.

Recordings sync to your Mac through iCloud as usual. The device reads them in place and never changes your Voice Memos library.

## Requirements

- macOS 13 Ventura or later
- Ableton Live 12.0.5 or later, with Max for Live (Live Suite, or Standard with the Max for Live add-on)
- Voice Memos with iCloud sync turned on, on the same Mac
- Full Disk Access for Ableton Live (see below), or a folder of exported memos

## Install

1. Download this repository: **Code → Download ZIP** on GitHub, or `git clone`.
2. Keep the folder together. `device/VoiceMemo.amxd` loads the scripts beside it, plus the code in `src/`.
3. Optional: in Live's browser, choose **Add Folder…** under Places and add the downloaded folder so the device is easy to find.
4. Drag `device/VoiceMemo.amxd` onto an **audio track**.

Nothing needs to be installed with npm. The device uses only Node and macOS built-ins (`node:sqlite`, `/usr/bin/sqlite3`, `/usr/bin/afconvert`, `/usr/bin/afinfo`).

## Full Disk Access

macOS keeps the Voice Memos library in a protected folder, and there is no public API for reading it. To read it directly, Live needs Full Disk Access:

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Turn on **Ableton Live**. If it isn't listed, press **+** and choose it from Applications.
3. Quit and reopen Live. The permission takes effect only after a restart.

Things to know before you grant it:

- **It applies to all of Live,** not just this device. Every plug-in and Max for Live device running inside Live inherits it. Grant it only if you're comfortable with that.
- **You can turn it off at any time** in the same settings pane.
- **You can skip it.** In Voice Memos, select recordings and choose **File → Export** (or Share → Save to Files) to save them into an ordinary folder, such as one in Music. When the device can't reach the library, it offers **Choose a folder instead**. Point it at that folder.

[Privacy and auditing](#privacy-and-auditing) below lists exactly which code uses this access.

## Using it

1. **Pick a recording** in the list on the left. Type in the box above it to filter by title. The expand button opens a larger list.
2. **Pick a window.** The device finds segments separated by silence, shown as numbered chips under the waveform.
   - **Seg** with the number box selects a whole segment.
   - **1, 2, 4, 8 bar** use the Set's tempo. **5, 10, 30 s** are fixed lengths. Click the waveform to place the window.
   - **SNAP** moves the start of a bar or seconds window to the nearest segment start within a second, so it begins on a note rather than in silence.
   - Drag the window's edges to fine-tune it.
3. **Audition** plays the window, with a playhead. Press it again to stop. **AUTO** auditions automatically when you open a recording.
4. **Select a clip slot** on the device's track and press **PULL**. The clip goes into the selected slot, or the first empty slot below it. The right-hand panel shows where it will land.

**NORM** normalizes the pulled clip. The gear button opens settings for the silence threshold (how far below the recording's loud parts counts as silence, so quiet phone recordings split as well as loud ones), the minimum gap between segments, and the edge fade.

Where pulled files go:
- **Saved Set:** `<Set folder>/Samples/Imported/VoiceMemo/`, so Live's Collect All and Save keeps them with the project.
- **Unsaved Set:** `~/Music/Ableton/User Library/VoiceMemo Cache/Pulled/`

### About the analysis

The analysis is meant as a quick hint, not a measurement.

- **Tempo and key** are estimates. They work best on rhythmic or tonal material, and they show "—" when the device isn't confident.
- **Speech or music** is a simple heuristic.

### Limits

- A recording stored only in iCloud has to download before the device can read it. Open it once in Voice Memos.
- Recordings in Voice Memos' **Recently Deleted** folder may still appear in the list.
- On a very long recording, the first selection takes a few seconds while the audio is converted. After that it's cached.

## Privacy and auditing

The device works entirely on your Mac. It makes no network connections, and it opens the Voice Memos library read-only.

Only three files read from the library. Each one begins with a `PRIVACY:` note. (The controller also checks a recording's modification time so it knows when its cache is stale.)

| File | What it does with the library |
| --- | --- |
| [`src/library/locate.js`](src/library/locate.js) | Checks which library folder exists and is readable. Lists folders only. |
| [`src/library/catalog.js`](src/library/catalog.js) | Reads titles, dates, durations and file names from `CloudRecordings.db`, read-only (`node:sqlite` with `readOnly`, or `sqlite3 -readonly`). If Voice Memos has the database locked, it queries a temporary copy and deletes the copy straight after. |
| [`src/audio/convert.js`](src/audio/convert.js) | Converts the one recording you select to WAV with Apple's `afconvert`. |

An automated test, [`test/privacy-boundary.test.js`](test/privacy-boundary.test.js), enforces three rules:
- No other file in `src/` refers to the library, its database, or the macOS audio tools.
- Each of the three files keeps its `PRIVACY:` note.
- Nothing in `src/` uses the network (`http`, `https`, `net`, `tls`, `dgram`, `dns`, `fetch`, `WebSocket`).

Run `npm test` to check this yourself.

**What the device writes,** inside `~/Music/Ableton/User Library/VoiceMemo Cache/` unless noted:
- WAV copies of recordings you've selected, used for analysis and audition.
- Cached analysis results.
- `settings.json`, which holds the folder you chose, if any.
- Only if Voice Memos has its database locked: a temporary copy in the system temp folder, deleted as soon as it has been read.
- Pulled clips, when the Set is unsaved.

Delete that folder at any time to clear everything. Pulled clips in a saved Set live in that Set's folder.

**Other code worth knowing about:**
- [`src/max/vm-core.js`](src/max/vm-core.js) connects Node to Max. Its "open settings" action runs `/usr/bin/open` on the Full Disk Access settings pane.
- [`src/max/lom-bridge.js`](src/max/lom-bridge.js) talks to Live to find the target clip slot and create the clip.

## Troubleshooting

- **"macOS is blocking access to Voice Memos" after granting access.** Quit and reopen Live completely.
- **The list is empty.** Check that Voice Memos on this Mac shows your recordings. iCloud sync may still be catching up.
- **"Clip not created."** Creating clips from Max for Live needs Live 12.0.5 or later.
- **"No empty slot at or below the selected one."** Select a higher slot, or add scenes.
- **Anything else:** click the wrench in the device title bar to open it in Max, then check **Window → Max Console** for lines from `node.script`.

## Development

- `npm test` runs the unit tests (Node 22 or later; Live 12.4 ships Node 22.18).
- `npm run build` regenerates `device/VoiceMemo.amxd` and the `device/voicememo-*.js` scripts from `src/`. Don't edit the generated files directly.
- Design notes: [`docs/superpowers/specs/2026-10-12-voicememo-m4l-design.md`](docs/superpowers/specs/2026-10-12-voicememo-m4l-design.md). Manual test pass: [`docs/testing-checklist.md`](docs/testing-checklist.md).

The analysis and window logic in `src/` is plain Node with no Max dependencies, so it can be tested outside Live. Only `src/max/` and `src/ui/` run inside Max.
