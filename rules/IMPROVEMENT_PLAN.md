# Improvement Plan

## Phase A: Bug Fixes (immediate)

1. **Fix BUG-001**: entryByBlockId → Map<string, RundownEntry[]> in useSyncOrchestrator reverse sync
2. **Fix BUG-002**: reorderEntry filter — remove parentBlockId check
3. **Fix LEAK-001**: AbortController for drag handlers in EmbeddedTrackView
4. **Fix BUG-004**: Remove old shotSyncEngine path from useSyncOrchestrator (lines 152-227)
5. **Fix BUG-005**: Null check before reorderEntry

## Phase B: Remove Legacy Code

1. Delete `src/lib/shotSyncEngine.ts` — replaced by rundownBuilder
2. Delete `src/lib/syncBus.ts` — replaced by direct store calls
3. Remove `Shot` interface from productionTypes.ts
4. Remove `ShotGroup` interface
5. Remove `SyncEventType`, `SyncEvent` types
6. Remove `shots[]`, `shotGroups[]` from scriptStore
7. Remove shot CRUD from scriptStore (addShotToBlock, removeShotFromBlock, etc.)
8. Remove `TimelineShot` from timelineStore → use RundownEntry directly
9. Delete `src/lib/rundownBridge.ts` — no longer needed after direct consumption

## Phase C: Test Coverage

1. **useSyncOrchestrator.test.ts** — critical, 0% coverage now:
   - Forward sync: blocks change → rundown rebuilds → timeline updates
   - Reverse sync: timeline edit → rundown updates
   - Loop prevention: no infinite cycles
   - Blob preservation: visual data survives rebuild
2. **rundownStore.test.ts** — store mutations:
   - splitEntry / mergeSubShots
   - deleteEntry cascading
   - setManualDuration / setDisplayDuration
3. **Integration test**: full round-trip
   - Write text → auto-rundown → split shots → generate image → reload → data intact

## Phase D: Timeline UX

1. **Move mode (Slip)**: Actually offset media start within block (store slipOffsetMs on entry)
2. **Ripple mode**: When resizing, shift all subsequent blocks' startMs
3. **Roll mode**: Visual feedback — highlight neighbor block being affected
4. **Snap to grid**: Snap durations to frame boundaries (1/24s = 41.67ms)
5. **Zoom to fit**: Button to auto-zoom timeline to show all blocks
6. **Waveform on voice track**: Show audio waveform for TTS/uploaded voice clips

## Phase E: ScriptViewer Improvements

1. **Bidirectional scroll**: Click block in script → seek timeline to that point
2. **Inline duration editing**: Click duration badge → edit in place
3. **Scene color bar**: Vertical colored bar on left side per scene (like DaVinci)
4. **Playhead indicator**: Thin line showing current time position in script text
5. **Sub-shot badges**: Show sub-shot count when entry is split

## Phase F: Voice Integration

1. **voiceTrack → entry-relative anchors**: Replace shot-relative with entryId anchors
2. **Auto-TTS during playback**: Speak dialogue entries at correct time
3. **VO separate track**: Voice-over on dedicated audio track in timeline
4. **Subtitle rendering**: Show dialogue text synced with playhead in all views
5. **Per-character voice settings**: Pitch, speed, language per Bible character

## Phase G: Export & Production

1. **Export timeline as EDL/XML**: For import into DaVinci Resolve
2. **Export as video**: Stitch images with durations + audio
3. **Export as PDF**: Storyboard printout with thumbnails + notes
4. **Production schedule**: Estimate shooting days from scene durations
