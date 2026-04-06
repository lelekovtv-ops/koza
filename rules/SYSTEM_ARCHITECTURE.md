# KOZA System Architecture Rules

## Data Flow: Screenplay → Rundown → Timeline → Storyboard

```
                    SOURCE OF TRUTH
                         |
              +----- scriptStore -----+
              |    blocks: Block[]    |
              |    (text only)        |
              +-----------+-----------+
                          |
                   useSyncOrchestrator
                          |
              +----- rundownStore ----+
              |  entries: RundownEntry|
              |  (structure + timing  |
              |   + visuals + voice)  |
              +-----------+-----------+
                          |
                  entriesToTimelineShots()
                          |
              +----- timelineStore ---+    +----- voiceTrackStore --+
              |  shots: TimelineShot[]|    |  clips: VoiceClip[]   |
              |  (CACHE — backward    |    |                       |
              |   compat for UI)      |    +-----------------------+
              +----------++-----------+
                         ||
          +--------------++--------------+
          |              |               |
    StoryboardPanel  EmbeddedTrackView  ShotStudio
    (Board/Director) (Timeline tracks)  (Full editor)
```

## Rule 1: Screenplay = Text Truth

- `scriptStore.blocks[]` is the ONLY place to edit screenplay text
- Blocks are NEVER created/deleted by timeline or storyboard directly
- Block types: scene_heading, action, character, parenthetical, dialogue, transition, shot
- Text changes trigger forward sync: blocks → rundown → timeline

## Rule 2: Rundown = Structure Truth

- `rundownStore.entries[]` is the SINGLE authority for:
  - Shot structure (which blocks become which shots)
  - Timing (4-tier: estimated → manual → media → display)
  - Visual data (thumbnails, generation history)
  - Sub-shot hierarchy (parentEntryId)
  - Voice/VO assignments
- RundownEntry replaces both Shot (scriptStore) and TimelineShot (timelineStore)
- Timeline store is a CACHE — projected from rundown for backward compatibility

## Rule 3: Duration Priority (4 tiers)

```
effectiveDuration = displayDurationMs ?? manualDurationMs ?? estimatedDurationMs
```

| Tier | Field | Source | When |
|------|-------|--------|------|
| 1 | estimatedDurationMs | durationEngine.ts | Auto from text (WPM) |
| 2 | manualDurationMs | User drag/input | User sets explicit duration |
| 3 | mediaDurationMs | Rendered asset | Video/audio actual length |
| 4 | displayDurationMs | User override | "Show only 3s of 7s video" |

- Gap = effective - media (black screen if media shorter)
- Trim = media > effective (media cropped in playback)

## Rule 4: Sub-Shot Hierarchy

```
RundownEntry (parentEntryId: null) → "establishing" / "action" / "dialogue"
    |
    +-- splitEntry() → parent becomes "heading" (non-rendering)
    |
    +-- RundownEntry (parentEntryId: parent.id) → sub-shot 1
    +-- RundownEntry (parentEntryId: parent.id) → sub-shot 2
```

- Parent duration = sum of children durations
- Timeline renders ONLY leaf entries (getEffectiveEntries)
- Screenplay does NOT change when splitting (sub-shots are rundown concept)
- mergeSubShots() reverses: children deleted, parent reverts to "action"

## Rule 5: Sync Direction

### Forward (auto, on text change):
```
scriptStore.blocks change
  → useSyncOrchestrator (immediate)
  → rundownStore.rebuildFromBlocks(blocks, scenes)
    → reconcileRundownEntries (preserves locked/manual/visual data)
  → entriesToTimelineShots() (500ms debounce)
    → timelineStore.reorderShots (preserves blob URLs)
```

### Reverse (explicit user action):
```
Timeline duration drag → syncBus "duration-change"
  → rundownStore.setManualDuration()
  → scriptStore.updateBlockProduction(durationMs, "manual")

Timeline shot edit → timelineStore.subscribe
  → rundownStore.updateEntry (visual, prompts, notes)

Storyboard delete → navigateToShot → rundownStore.deleteEntry
  → if autoSynced: scriptStore.deleteBlock (cascade)
```

### Loop Prevention:
- scriptStore._lastOrigin: skip forward sync if origin === "timeline"
- timelineStore._lastOrigin: skip reverse sync if origin === "screenplay"
- SyncBus events carry `origin` field — each listener ignores its own origin

## Rule 6: ID Matching Strategy

- RundownEntry.id = `rde_${timestamp}_${counter}` (stable across rebuilds via reconciliation)
- TimelineShot.id = RundownEntry.id (set by entriesToTimelineShots)
- Matching always by `parentBlockId` as primary key (blockId is stable)
- When matching fails by ID, fall back to parentBlockId → covers migration

## Rule 7: Thumbnail Persistence

```
Generate image → blob saved to IndexedDB (trySaveBlob)
  → objectURL created (blob:http://...)
  → saved to timelineStore.shot.thumbnailUrl + thumbnailBlobKey

Page reload:
  → timelineStore restores from localStorage (has blobKey)
  → async loadBlob(blobKey) → new objectURL
  → rundown→timeline projection (500ms debounce) merges AFTER blob restore

Key: projection preserves ex.thumbnailUrl || projected.thumbnailUrl
```

## Rule 8: Navigation Sync

```
navigateToShot(shot):
  1. selectScene(shot.sceneId)           → ScriptViewer scrolls to scene
  2. selectShot(shot.id)                 → Storyboard highlights shot
  3. requestScrollToBlock(parentBlockId)  → ScriptViewer scrolls to block
  4. seekTo(startMs)                     → Timeline playhead moves

Used by: Board click, Director Cut click, Timeline block click
```

## Rule 9: Duration Engine (single source)

ALL duration calculations MUST use `src/lib/durationEngine.ts`:
- ACTION_WPM = 120 (visual pacing)
- DIALOGUE_WPM = 155 (spoken word)
- HEADING_MS = 1500
- TRANSITION_MS = 1000
- MIN_ACTION_MS = 1500, MAX_ACTION_MS = 8000

NEVER hardcode WPM values in components or other files.

## Rule 10: What NOT to Touch

- `/dev/breakdown-studio` — R&D workbench, DO NOT DELETE
- `/piece` — command-first UI, DO NOT DELETE
- Canvas system (src/lib/canvas/, src/store/blockCanvas.ts) — working node editor
- Voice track store — has its own anchor system, will migrate to entry-relative
