# Store Map — What Lives Where

## scriptStore (`src/store/script.ts`)
**Role**: Screenplay text only
**Persisted**: Yes (localStorage)

| Field | Type | Notes |
|-------|------|-------|
| blocks | Block[] | SOURCE OF TRUTH for text |
| shots | Shot[] | @deprecated → use rundownStore |
| shotGroups | ShotGroup[] | @deprecated |
| title, author, draft, date | string | Metadata |
| flow | FlowConfig | Per-project flow |

## rundownStore (`src/store/rundown.ts`)
**Role**: Structure, timing, visuals, hierarchy
**Persisted**: Yes (localStorage)

| Field | Type | Notes |
|-------|------|-------|
| entries | RundownEntry[] | THE authority for structure + timing |
| selectedEntryId | string | null | Current selection |
| projectRundowns | Record<string, RundownEntry[]> | Per-project storage |

## timelineStore (`src/store/timeline.ts`)
**Role**: CACHE + playback UI state + audio
**Persisted**: Yes (localStorage + IndexedDB for blobs)

| Field | Type | Notes |
|-------|------|-------|
| shots | TimelineShot[] | CACHE — projected from rundownStore |
| audioClips | AudioClip[] | Independent audio tracks |
| currentTime | number | Playhead position (ms) |
| isPlaying | boolean | Playback state |
| zoom, scrollLeft | number | UI state |
| selectedShotId | string | null | Selection |

## voiceTrackStore (`src/store/voiceTrack.ts`)
**Role**: Voice clips, TTS, VO
**Persisted**: Yes

| Field | Type | Notes |
|-------|------|-------|
| clips | VoiceClip[] | Voice/VO clips |
| Anchors | VoiceClipAnchor | TODO: migrate to entry-relative |

## scenesStore (`src/store/scenes.ts`)
**Role**: Scene boundaries (derived from blocks)
**Persisted**: No (computed)

## bibleStore (`src/store/bible.ts`)
**Role**: Characters, locations, props, director vision
**Persisted**: Yes

## navigationStore (`src/store/navigation.ts`)
**Role**: UI navigation state
**Persisted**: No

| Field | Type | Notes |
|-------|------|-------|
| storyboardViewMode | string | scenes/board/list/inspector/tracks/pieces |
| scrollToBlockId | string | null | Script scroll sync |
| selectedSceneId | via scenesStore | Scene selection |
