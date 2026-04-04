import type { Block } from "@/lib/screenplayFormat"
import type { TimelineShot } from "@/store/timeline"

// ── Scene interface ──────────────────────────────────────────

export interface Scene {
  id: string
  index: number
  title: string
  headingBlockId: string
  blockIds: string[]
  color: string
  estimatedDurationMs: number
}

export const SCENE_COLORS = [
  "#4A7C6F", "#7C4A6F", "#6F7C4A", "#4A6F7C", "#7C6F4A", "#6F4A7C",
  "#5A8C7F", "#8C5A7F", "#7F8C5A", "#5A7F8C", "#8C7F5A", "#7F5A8C",
] as const

// ── Duration estimation ──────────────────────────────────────

const DIALOGUE_WPM = 150
const ACTION_WPM = 100 // action/description reads slower visually
const SCENE_HEADING_MS = 2000 // establishing shot buffer
const MIN_SCENE_MS = 3000

/**
 * Estimate scene duration from its blocks.
 * Dialogue = spoken at ~150wpm. Action = visual pacing ~100wpm.
 * Scene heading = 2s establishing shot.
 */
function estimateSceneDurationMs(sceneBlocks: Block[]): number {
  let totalMs = 0

  for (const block of sceneBlocks) {
    const words = block.text.trim().split(/\s+/).filter(Boolean).length
    if (words === 0) continue

    switch (block.type) {
      case "scene_heading":
        totalMs += SCENE_HEADING_MS
        break
      case "dialogue":
        totalMs += (words / DIALOGUE_WPM) * 60_000 + 300 // 300ms pause per line
        break
      case "parenthetical":
        totalMs += 500
        break
      case "character":
        // small beat before character speaks
        totalMs += 200
        break
      case "transition":
        totalMs += 1500
        break
      case "action":
      default:
        totalMs += (words / ACTION_WPM) * 60_000
        break
    }
  }

  return Math.max(MIN_SCENE_MS, Math.round(totalMs))
}

// ── Scene parser ─────────────────────────────────────────────

export function parseScenes(blocks: Block[]): Scene[] {
  const scenes: Scene[] = []
  let current: Scene | null = null

  for (const block of blocks) {
    if (block.type === "scene_heading") {
      // Finalize previous scene
      if (current) scenes.push(current)

      const sceneIndex = scenes.length + 1
      current = {
        id: `scene-${block.id}`,
        index: sceneIndex,
        title: block.text.trim() || "UNTITLED SCENE",
        headingBlockId: block.id,
        blockIds: [block.id],
        color: SCENE_COLORS[(sceneIndex - 1) % SCENE_COLORS.length],
        estimatedDurationMs: 0, // calculated after
      }
    } else {
      if (!current) {
        current = {
          id: "scene-untitled-0",
          index: 0,
          title: "UNTITLED SCENE",
          headingBlockId: "",
          blockIds: [block.id],
          color: SCENE_COLORS[0],
          estimatedDurationMs: 0,
        }
      } else {
        current.blockIds.push(block.id)
      }
    }
  }

  if (current) scenes.push(current)

  // Calculate durations from block content
  const blockMap = new Map(blocks.map((b) => [b.id, b]))
  for (const scene of scenes) {
    const sceneBlocks = scene.blockIds.map((id) => blockMap.get(id)).filter((b): b is Block => b != null)
    scene.estimatedDurationMs = estimateSceneDurationMs(sceneBlocks)
  }

  return scenes
}

export function getSceneForBlock(scenes: Scene[], blockId: string): Scene | null {
  return scenes.find((s) => s.blockIds.includes(blockId)) ?? null
}

export function getSceneByIndex(scenes: Scene[], index: number): Scene | null {
  return scenes.find((s) => s.index === index) ?? null
}

export function getBlockSceneIndex(scenes: Scene[], blockId: string): number | null {
  const scene = getSceneForBlock(scenes, blockId)
  return scene ? scene.index : null
}

// ── Legacy: timeline shot generation ─────────────────────────

const DEFAULT_SCENE_DURATION = 5000

function sceneIdFromText(text: string): string {
  const trimmed = text.trim().toUpperCase()
  let h = 0x811c9dc5
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `scene-${(h >>> 0).toString(36)}`
}

export function parseScenesToShots(blocks: Block[]): TimelineShot[] {
  let order = 0
  const shots: TimelineShot[] = []

  for (const block of blocks) {
    if (block.type !== "scene_heading") continue
    const label = block.text.trim()
    if (!label) continue

    const id = sceneIdFromText(label)

    shots.push({
      id,
      order: order++,
      duration: DEFAULT_SCENE_DURATION,
      type: "image",
      thumbnailUrl: null,
      originalUrl: null,
      thumbnailBlobKey: null,
      originalBlobKey: null,
      sceneId: id,
      label,
      notes: "",
      shotSize: "",
      cameraMotion: "",
      caption: "",
      directorNote: "",
      cameraNote: "",
      videoPrompt: "",
      imagePrompt: "",
      visualDescription: "",
      svg: "",
      blockRange: null,
      locked: false,
      autoSynced: false,
      sourceText: "",
      generationHistory: [],
      activeHistoryIndex: null,
    })
  }

  return shots
}
