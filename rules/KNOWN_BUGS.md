# Known Bugs & Issues

## CRITICAL (data loss risk)

### ~~BUG-001: entryByBlockId Map loses sub-shots~~ ✅ FIXED (8ce0f51)
- **Fix applied**: `Map<string, RundownEntry[]>` with array per blockId

### ~~BUG-002: reorderEntry() wrong sibling filter~~ ✅ FIXED (8ce0f51)
- **Fix applied**: Removed parentBlockId from filter, kept only `parentEntryId === entry.parentEntryId`

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

### ~~LEAK-001: Drag event listeners not cleaned on unmount~~ ✅ FIXED (8ce0f51)
- **Fix applied**: AbortController + cleanup in EmbeddedTrackView

### ~~BUG-004: Old shotSyncEngine still runs alongside rundown~~ ✅ FIXED (8ce0f51)
- **Fix applied**: Removed old path entirely (−80 lines from useSyncOrchestrator)

## LOW

### ~~BUG-005: Missing null check in shot-child-reorder~~ ✅ FIXED (8ce0f51)
- **Fix applied**: Added `entries.find()` check before reorderEntry call

### ARCH-001: Duplicate getTopLevel/getLeafEntries logic
- **Locations**: `src/lib/rundownHierarchy.ts` AND `src/store/rundown.ts`
- **Fix**: Use lib functions everywhere, remove store duplicates
