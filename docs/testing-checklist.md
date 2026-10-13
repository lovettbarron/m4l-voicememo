# VoiceMemo manual test checklist (Live 12.4, macOS 27)

Setup: device on an empty audio track, Set saved to disk.

1. [ ] Full Disk Access off for Live → device shows "locked by macOS privacy settings"; Open Settings opens Privacy & Security → Full Disk Access.
2. [ ] "Use a folder…" → pick a folder of .m4a/.wav → list shows files by name; folder choice survives device reload.
3. [ ] Full Disk Access on (Live restarted), folder override cleared (delete `settings.json` in the cache dir) → list shows memos with titles, dates, durations; count matches the Voice Memos app (note any extras, e.g. Recently Deleted, in this file).
4. [ ] Filter field narrows the list on Enter.
5. [ ] Selecting a short memo shows a waveform within ~1 s, then segments; first segment auditions automatically.
6. [ ] Selecting the long (67-min) memo shows conversion progress, the waveform appears before full-quality conversion finishes, and Live stays responsive.
7. [ ] A cloud-only memo (if any) shows "Not downloaded" and Pull is disabled.
8. [ ] A layered (.qta) memo, if available, converts and plays (mixed down).
9. [ ] Segment chip click, Segment numbox, waveform click and bracket drag all move the window; panel readouts update.
10. [ ] Length presets: 1/2/4/8 bar lengths follow Set tempo (change tempo → window length changes); 5/10/30 s ignore tempo; Snap on snaps to segment starts.
11. [ ] ▶ Audition plays exactly the window through the track.
12. [ ] PULL with the highlighted slot empty → clip appears there, named after the memo; WAV is in `<Set folder>/Samples/Imported/VoiceMemo/`.
13. [ ] PULL with highlighted slot full → clip goes to next empty slot below; with none, panel shows "No empty slot below selection" and no file is written.
14. [ ] NORM on → pulled clip peaks at about -1 dBFS.
15. [ ] Unsaved Set → pull lands in `VoiceMemo Cache/Pulled/` and still creates the clip.
16. [ ] Device after an instrument on a MIDI track → panel shows "Place on an audio track".
17. [ ] Switch Live theme (Settings → Theme) → device colours follow.
18. [ ] Save, close and reopen the Set → same memo reselected, parameters restored.
19. [ ] Two instances on two tracks work independently.
20. [ ] ⤢ opens the larger browser window; selecting there loads the memo.
