# Known Bugs & Issues

## CRITICAL (data loss risk)

### BUG-001: entryByBlockId Map loses sub-shots
- **File**: `src/hooks/useSyncOrchestrator.ts:340`
- **Problem**: `new Map(entries.map(e => [e.parentBlockId, e]))` — when multiple entries share same parentBlockId (sub-shots), only last entry is kept in map
- **Impact**: Visual edits to sub-shots silently lost in reverse sync
- **Fix**: Use `Map<string, RundownEntry[]>` with array per blockId

### BUG-002: reorderEntry() wrong sibling filter
- **File**: `src/store/rundown.ts:131-132`
- **Problem**: Filters by `parentBlockId === entry.parentBlockId` — each entry has unique parentBlockId, so top-level reorder finds 0 siblings
- **Fix**: Remove parentBlockId from filter, keep only `parentEntryId === entry.parentEntryId`

## HIGH (race conditions)

### RACE-001: Debounce collision
- **File**: `src/hooks/useSyncOrchestrator.ts`
- **Problem**: 500ms debounce on rundown→timeline projection + immediate timeline.subscribe reverse sync = race if user edits screenplay + timeline within 500ms
- **Fix**: Add origin tracking to rundownStore, or serialize sync operations

### RACE-002: Blob restore timing
- **Problem**: Timeline store restores blob URLs async from IndexedDB. Rundown→timeline projection (500ms debounce) may still fire before restore completes on slow devices
- **Fix**: Timeline store should expose `restoreComplete` promise, projection waits for it

## MEDIUM

### BUG-003: Dialogue grouping loses multi-line
- **File**: `src/lib/rundownBuilder.ts:195-198`
- **Problem**: Multiple consecutive dialogue blocks for same character only keep last text
- **Fix**: Accumulate pendingDialogueText across multiple dialogue blocks

### LEAK-001: Drag event listeners not cleaned on unmount
- **File**: `src/components/editor/screenplay/EmbeddedTrackView.tsx:504-505`
- **Problem**: `document.addEventListener("mousemove/mouseup")` added on mouseDown — if component unmounts during drag, listeners persist
- **Fix**: Use AbortController or cleanup in useEffect return

### BUG-004: Old shotSyncEngine still runs alongside rundown
- **File**: `src/hooks/useSyncOrchestrator.ts:152-227`
- **Problem**: Old 300ms debounced blocks→shots→timeline path still active. Runs in parallel with new rundown path. Creates duplicate shots.
- **Fix**: Remove old path entirely (Phase 6 cleanup)

## LOW

### BUG-005: Missing null check in shot-child-reorder
- **File**: `src/hooks/useSyncOrchestrator.ts:318`
- **Problem**: `reorderEntry(shotId, newOrder)` called without checking entry exists
- **Fix**: Add `const entry = entries.find(...)` check

### ARCH-001: Duplicate getTopLevel/getLeafEntries logic
- **Locations**: `src/lib/rundownHierarchy.ts` AND `src/store/rundown.ts`
- **Fix**: Use lib functions everywhere, remove store duplicates
