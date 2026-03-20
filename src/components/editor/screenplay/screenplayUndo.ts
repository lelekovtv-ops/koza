import type { Block } from "@/lib/screenplayFormat"

export interface ScreenplayUndoSnapshot {
  scenario: string
  blocks: Block[]
}

export interface ScreenplayUndoState {
  undoStack: ScreenplayUndoSnapshot[]
  redoStack: ScreenplayUndoSnapshot[]
}

export const SCREENPLAY_MAX_UNDO_STEPS = 20

export function createUndoState(): ScreenplayUndoState {
  return { undoStack: [], redoStack: [] }
}

export function pushUndoSnapshot(
  state: ScreenplayUndoState,
  snapshot: ScreenplayUndoSnapshot,
  maxSteps: number = SCREENPLAY_MAX_UNDO_STEPS
): ScreenplayUndoState {
  const nextUndo = [...state.undoStack, snapshot]
  const trimmedUndo = nextUndo.length > maxSteps ? nextUndo.slice(nextUndo.length - maxSteps) : nextUndo
  return {
    undoStack: trimmedUndo,
    redoStack: [],
  }
}

export function undoSnapshot(
  state: ScreenplayUndoState,
  current: ScreenplayUndoSnapshot
): { state: ScreenplayUndoState; snapshot: ScreenplayUndoSnapshot | null } {
  if (state.undoStack.length === 0) {
    return { state, snapshot: null }
  }

  const snapshot = state.undoStack[state.undoStack.length - 1]
  return {
    snapshot,
    state: {
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
    },
  }
}

export function redoSnapshot(
  state: ScreenplayUndoState,
  current: ScreenplayUndoSnapshot
): { state: ScreenplayUndoState; snapshot: ScreenplayUndoSnapshot | null } {
  if (state.redoStack.length === 0) {
    return { state, snapshot: null }
  }

  const snapshot = state.redoStack[state.redoStack.length - 1]
  return {
    snapshot,
    state: {
      undoStack: [...state.undoStack, current],
      redoStack: state.redoStack.slice(0, -1),
    },
  }
}
