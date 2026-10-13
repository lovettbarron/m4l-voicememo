# VoiceMemo manual test checklist

Run in Live 12.4+ on macOS 13+. Ticked items were verified on Live 12.4.6 / macOS 27 during development; note the date and setup when you re-run.

**Setup:** a new Live Set, **saved to disk**, with an empty audio track. Drop `device/VoiceMemo.amxd` on it.

## A. Library and list

1. [ ] With Full Disk Access on (Live restarted), the list shows memos with titles; the count matches Voice Memos. Note any extras, such as Recently Deleted.
2. [ ] Typing in the filter box narrows the list by title.
3. [ ] A memo recorded on iPhone or Apple Watch appears in the list by itself within a few seconds of syncing to this Mac. No refresh needed.
4. [ ] A memo still in iCloud shows "Open it once in Voice Memos to download it." and Pull is disabled. Once it downloads, it loads by itself.
5. [ ] The expand button opens the larger list. Selecting a memo there loads it.

## B. Waveform, segments and window

6. [ ] Selecting a short memo shows its waveform within about a second, then numbered segments. It opens on the longest segment.
7. [ ] Selecting a long memo (20+ minutes) shows conversion progress. The waveform appears before full-quality conversion finishes, and Live stays responsive.
8. [ ] A layered (.qta) memo, if you have one, converts and plays mixed down.
9. [ ] Each of these moves the window, and the right-hand readouts update: a segment chip click, the Segment number box, a waveform click with a length preset, and dragging an edge. Chip clicks also update the number box.
10. [ ] 1/2/4/8 bar lengths follow Set tempo, and the window changes when tempo changes. In 6/8, 1 bar is three quarter notes. 5/10/30 s ignore tempo. With SNAP on, bar and seconds windows start on the nearest segment start.

## C. Audition

11. [ ] Audition plays the window through the track, with a playhead. It turns itself off at the end, and pressing it again stops playback.
12. [ ] Switching to another memo while auditioning stops playback and resets the button.

## D. Pull

13. [ ] Saved Set, highlighted slot empty: PULL puts the clip in that slot, named after the memo, and the panel says "Pulled to Track N, slot M". The WAV is in `<Set folder>/Samples/Imported/VoiceMemo/`.
14. [ ] Highlighted slot full: the clip goes to the next empty slot below. With none free, the panel shows "No empty slot at or below the selected one" and no file is written.
15. [ ] With NORM on, the pulled clip peaks at about -1 dBFS.
16. [x] Unsaved Set: the pull lands in `~/Music/Ableton/User Library/VoiceMemo Cache/Pulled/` and still creates the clip.

## E. Live integration

17. [ ] On a MIDI track, the panel shows "Place on an audio track".
18. [ ] After switching Live's theme (Settings → Theme), the device colours follow, which may need a device reload.
19. [ ] After saving, closing and reopening the Set, the same memo and segment are selected and SNAP/AUTO/NORM are restored.
20. [ ] Two instances on two tracks work independently.

## F. Without Full Disk Access

21. [ ] With Full Disk Access off for Live (restart Live), the device shows "macOS is blocking access to Voice Memos." **Open Privacy Settings** opens the Full Disk Access pane.
22. [ ] **Choose a folder instead**, then pick a folder of .m4a or .wav files: the list shows them by file name, and the choice survives a device reload. To return to the library, delete `settings.json` in the cache folder.
