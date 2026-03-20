import type { Block } from "@/lib/screenplayFormat"
import type { TimelineShot } from "@/store/timeline"

const DEFAULT_SCENE_DURATION = 5000

/**
 * Deterministic ID from scene heading text.
 * Uses a simple FNV-1a-inspired hash to produce a stable, URL-safe string.
 */
function sceneIdFromText(text: string): string {
  const trimmed = text.trim().toUpperCase()
  let h = 0x811c9dc5
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `scene-${(h >>> 0).toString(36)}`
}

/**
 * Extract scene_heading blocks and convert each to a TimelineShot stub.
 */
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
    })
  }

  return shots
}
