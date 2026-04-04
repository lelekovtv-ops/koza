import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"

// ─── Types ───────────────────────────────────────────────────

export type DialogueType = "dialogue" | "voiceover" | "narration"

export interface DialogueLine {
  id: string
  characterId: string
  characterName: string
  text: string
  parenthetical?: string
  type: DialogueType
  sceneId: string | null
  shotIds: string[]
  /** Estimated duration in ms (auto-calculated from text length) */
  estimatedDurationMs: number
  order: number
}

export interface DialogueTrack {
  characterId: string
  characterName: string
  lines: DialogueLine[]
}

// ─── Duration estimation ─────────────────────────────────────

/** Words per minute by type */
const WPM: Record<DialogueType, number> = {
  dialogue: 150,
  voiceover: 120,
  narration: 110,
}

const MIN_DURATION_MS = 800
const PAUSE_AFTER_LINE_MS = 300

export function estimateDurationMs(text: string, type: DialogueType = "dialogue"): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return MIN_DURATION_MS
  const wpm = WPM[type]
  const ms = (words / wpm) * 60_000 + PAUSE_AFTER_LINE_MS
  return Math.max(MIN_DURATION_MS, Math.round(ms))
}

/**
 * Calculate recommended shot duration based on dialogue lines assigned to it.
 * Returns duration in ms. If no dialogue, returns null (keep current duration).
 * Adds a small buffer (500ms) for visual breathing room.
 */
export function getRecommendedShotDurationMs(lines: DialogueLine[]): number | null {
  if (lines.length === 0) return null
  const totalDialogue = lines.reduce((sum, l) => sum + l.estimatedDurationMs, 0)
  const VISUAL_BUFFER_MS = 500
  return totalDialogue + VISUAL_BUFFER_MS
}

// ─── Helpers ─────────────────────────────────────────────────

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

function detectDialogueType(characterName: string, parenthetical?: string): DialogueType {
  const upper = (parenthetical ?? "").toUpperCase()
  if (/V\.?O\.?/.test(characterName) || /V\.?O\.?/.test(upper)) return "voiceover"
  if (/NARRATOR|РАССКАЗЧИК/i.test(characterName)) return "narration"
  if (/O\.?S\.?/.test(upper)) return "dialogue" // off-screen is still dialogue
  return "dialogue"
}

// ─── Store ───────────────────────────────────────────────────

type ProjectDialogue = {
  lines: DialogueLine[]
}

interface DialogueState {
  activeProjectId: string | null
  projectDialogues: Record<string, ProjectDialogue>
  lines: DialogueLine[]

  // Actions
  setActiveProject: (projectId: string | null) => void
  setLines: (lines: DialogueLine[]) => void
  updateLine: (id: string, patch: Partial<DialogueLine>) => void
  removeLine: (id: string) => void
  assignToShot: (lineId: string, shotId: string) => void
  unassignFromShot: (lineId: string, shotId: string) => void
  clearShotAssignments: (shotId: string) => void

  /** Get lines for a specific shot, ordered */
  getLinesForShot: (shotId: string) => DialogueLine[]
  /** Get total dialogue duration for a shot in ms */
  getShotDialogueDurationMs: (shotId: string) => number
  /** Get all lines grouped by character */
  getTracks: () => DialogueTrack[]
}

const createEmptyProjectDialogue = (): ProjectDialogue => ({ lines: [] })

function updateCurrentProject(
  state: DialogueState,
  patch: Partial<ProjectDialogue>,
): Pick<DialogueState, "projectDialogues"> {
  if (!state.activeProjectId) return { projectDialogues: state.projectDialogues }
  return {
    projectDialogues: {
      ...state.projectDialogues,
      [state.activeProjectId]: {
        lines: patch.lines ?? state.lines,
      },
    },
  }
}

export const useDialogueStore = create<DialogueState>()(
  persist(
    (set, get) => ({
      activeProjectId: null,
      projectDialogues: {},
      lines: [],

      setActiveProject: (projectId) => {
        const state = get()
        // Save current
        const updated = state.activeProjectId
          ? {
              ...state.projectDialogues,
              [state.activeProjectId]: { lines: state.lines },
            }
          : state.projectDialogues

        const project = projectId ? (updated[projectId] ?? createEmptyProjectDialogue()) : createEmptyProjectDialogue()

        set({
          activeProjectId: projectId,
          projectDialogues: updated,
          lines: project.lines,
        })
      },

      setLines: (lines) =>
        set((state) => {
          const next = { lines }
          return { ...next, ...updateCurrentProject(state, next) }
        }),

      updateLine: (id, patch) =>
        set((state) => {
          const lines = state.lines.map((l) => (l.id === id ? { ...l, ...patch } : l))
          return { lines, ...updateCurrentProject({ ...state, lines }, { lines }) }
        }),

      removeLine: (id) =>
        set((state) => {
          const lines = state.lines.filter((l) => l.id !== id)
          return { lines, ...updateCurrentProject({ ...state, lines }, { lines }) }
        }),

      assignToShot: (lineId, shotId) =>
        set((state) => {
          const lines = state.lines.map((l) =>
            l.id === lineId && !l.shotIds.includes(shotId)
              ? { ...l, shotIds: [...l.shotIds, shotId] }
              : l,
          )
          return { lines, ...updateCurrentProject({ ...state, lines }, { lines }) }
        }),

      unassignFromShot: (lineId, shotId) =>
        set((state) => {
          const lines = state.lines.map((l) =>
            l.id === lineId ? { ...l, shotIds: l.shotIds.filter((s) => s !== shotId) } : l,
          )
          return { lines, ...updateCurrentProject({ ...state, lines }, { lines }) }
        }),

      clearShotAssignments: (shotId) =>
        set((state) => {
          const lines = state.lines.map((l) =>
            l.shotIds.includes(shotId)
              ? { ...l, shotIds: l.shotIds.filter((s) => s !== shotId) }
              : l,
          )
          return { lines, ...updateCurrentProject({ ...state, lines }, { lines }) }
        }),

      getLinesForShot: (shotId) =>
        get()
          .lines.filter((l) => l.shotIds.includes(shotId))
          .sort((a, b) => a.order - b.order),

      getShotDialogueDurationMs: (shotId) =>
        get()
          .lines.filter((l) => l.shotIds.includes(shotId))
          .reduce((sum, l) => sum + l.estimatedDurationMs, 0),

      getTracks: () => {
        const lines = get().lines
        const grouped = new Map<string, DialogueLine[]>()
        for (const line of lines) {
          const key = line.characterId
          if (!grouped.has(key)) grouped.set(key, [])
          grouped.get(key)!.push(line)
        }
        return Array.from(grouped.entries()).map(([characterId, charLines]) => ({
          characterId,
          characterName: charLines[0]?.characterName ?? "",
          lines: charLines.sort((a, b) => a.order - b.order),
        }))
      },
    }),
    {
      name: "koza-dialogue-v1",
      storage: safeStorage,
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        projectDialogues: state.projectDialogues,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const projectId = state.activeProjectId
        if (projectId && state.projectDialogues[projectId]) {
          state.lines = state.projectDialogues[projectId].lines
        }
      },
    },
  ),
)

// ─── Extraction from screenplay blocks ───────────────────────

interface ScreenplayBlock {
  id: string
  type: string
  text: string
}

interface SceneInfo {
  id: string
  blockIds: string[]
}

/**
 * Heuristic: detect action text that the parser misclassified as dialogue.
 * Action lines tend to be longer, describe physical actions, mention characters
 * in third person, and contain stage direction patterns.
 */
function isLikelyActionText(text: string): boolean {
  // Very long "dialogue" is likely action/description
  if (text.length > 200) return true

  // Contains third-person stage directions: "Ариэль поднимает...", "Макс входит..."
  // Pattern: Capitalized name + verb (Russian 3rd person verbs end in -ет, -ит, -ёт, -ут, -ют, -ся)
  if (/^[A-ZА-ЯЁ][a-zа-яё]+\s+([\wа-яё]+(?:ет|ит|ёт|ут|ют|ся|ает|яет|ает|ует|ёт))\b/.test(text)) return true

  // Contains multiple sentences with action verbs and is long
  if (text.length > 100 && /\.\s+[A-ZА-ЯЁ]/.test(text)) return true

  // Scene direction patterns
  if (/^(Камера|Крупн|Общий|Средн|Свет|Тишина|Пауза|Музыка|FADE|CUT|DISSOLVE)/i.test(text)) return true

  // Contains explicit stage directions: parenthetical-style actions embedded in text
  // e.g. "На палубе корабля стоит ПРИНЦ ЭРИК (18)"
  if (/[A-ZА-ЯЁ]{2,}\s*\(\d+\)/.test(text)) return true

  // Multiple character names mentioned (describing what people do)
  const capsWords = text.match(/[A-ZА-ЯЁ]{2,}/g) ?? []
  if (capsWords.length >= 2 && text.length > 80) return true

  return false
}

/**
 * Extract DialogueLines from screenplay blocks.
 * Groups character + parenthetical + dialogue sequences.
 */
export function extractDialogueLines(
  blocks: ScreenplayBlock[],
  scenes: SceneInfo[],
  existingCharacterIds: Map<string, string>, // name→id
): DialogueLine[] {
  const lines: DialogueLine[] = []
  let order = 0

  // Build block→scene lookup
  const blockToScene = new Map<string, string>()
  for (const scene of scenes) {
    for (const blockId of scene.blockIds) {
      blockToScene.set(blockId, scene.id)
    }
  }

  let currentCharacter: string | null = null
  let currentCharacterId: string | null = null
  let currentParenthetical: string | null = null
  let currentSceneId: string | null = null

  for (const block of blocks) {
    const sceneId: string | null = blockToScene.get(block.id) ?? currentSceneId

    if (block.type === "scene_heading") {
      currentSceneId = blockToScene.get(block.id) ?? currentSceneId
      currentCharacter = null
      currentCharacterId = null
      currentParenthetical = null
      continue
    }

    if (block.type === "character") {
      // Strip extensions like (V.O.), (CONT'D)
      const raw = block.text.trim()
      const cleaned = raw
        .replace(/\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D)\)\s*/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()

      currentCharacter = raw
      currentCharacterId = existingCharacterIds.get(cleaned.toUpperCase()) ?? cleaned.toUpperCase()
      currentParenthetical = null
      continue
    }

    if (block.type === "parenthetical") {
      currentParenthetical = block.text.replace(/^\(|\)$/g, "").trim()
      continue
    }

    if (block.type === "dialogue" && currentCharacter) {
      const text = block.text.trim()
      if (!text) continue

      // Filter out action text misclassified as dialogue by the parser.
      // Real dialogue is spoken text — not stage directions.
      if (isLikelyActionText(text)) {
        currentCharacter = null
        currentCharacterId = null
        currentParenthetical = null
        continue
      }

      const type = detectDialogueType(currentCharacter, currentParenthetical ?? undefined)

      lines.push({
        id: createId(),
        characterId: currentCharacterId ?? currentCharacter,
        characterName: currentCharacter
          .replace(/\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D)\)\s*/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim(),
        text,
        parenthetical: currentParenthetical ?? undefined,
        type,
        sceneId: sceneId ?? null,
        shotIds: [],
        estimatedDurationMs: estimateDurationMs(text, type),
        order: order++,
      })

      currentParenthetical = null
      continue
    }

    // Action or other block types reset the character context
    if (block.type === "action" || block.type === "scene_heading" || block.type === "transition") {
      currentCharacter = null
      currentCharacterId = null
      currentParenthetical = null
    }
  }

  return lines
}
