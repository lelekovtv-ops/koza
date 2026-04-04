/**
 * SFX Extractor — scans action blocks for sound-related keywords.
 *
 * Produces SfxHint[] with description and estimated timing
 * for auto-populating the SFX track on the timeline.
 */

import type { Block } from "./screenplayFormat"

export interface SfxHint {
  blockId: string
  description: string
  suggestedStartMs: number
  suggestedDurationMs: number
  confidence: "high" | "medium" | "low"
}

// ─── Sound keyword dictionaries (RU + EN) ────────────────────

const SFX_PATTERNS: { pattern: RegExp; description: string; durationMs: number; confidence: "high" | "medium" | "low" }[] = [
  // Explicit sound cues
  { pattern: /звук[иа]?\s+(.{3,30})/i, description: "SFX: $1", durationMs: 2000, confidence: "high" },
  { pattern: /sound\s+of\s+(.{3,30})/i, description: "SFX: $1", durationMs: 2000, confidence: "high" },
  { pattern: /SFX:\s*(.+)/i, description: "SFX: $1", durationMs: 2000, confidence: "high" },

  // Explosions / impacts
  { pattern: /взрыв|explosi|blast|бах|грохот|boom/i, description: "Explosion", durationMs: 3000, confidence: "high" },
  { pattern: /удар|impact|crash|врез/i, description: "Impact", durationMs: 1500, confidence: "high" },

  // Doors
  { pattern: /дверь\s*(хлопает|открыв|закрыв|стучит)|door\s*(slam|open|close|knock)/i, description: "Door", durationMs: 1000, confidence: "high" },
  { pattern: /стук\s*в\s*дверь|knock/i, description: "Door knock", durationMs: 1500, confidence: "high" },

  // Footsteps / movement
  { pattern: /шаги|footstep|шагает|идёт|бежит|running/i, description: "Footsteps", durationMs: 3000, confidence: "medium" },

  // Weather
  { pattern: /дождь|rain|ливень|downpour/i, description: "Rain", durationMs: 5000, confidence: "medium" },
  { pattern: /гром|thunder|молния|lightning/i, description: "Thunder", durationMs: 2000, confidence: "high" },
  { pattern: /ветер|wind|буря|storm/i, description: "Wind", durationMs: 4000, confidence: "medium" },

  // Vehicles
  { pattern: /машин[аы]|car|автомоб|vehicle/i, description: "Car engine", durationMs: 3000, confidence: "medium" },
  { pattern: /мотор|engine|заводит/i, description: "Engine start", durationMs: 2000, confidence: "medium" },
  { pattern: /сирен|siren/i, description: "Siren", durationMs: 4000, confidence: "high" },
  { pattern: /тормоз|brake|screech/i, description: "Brakes screech", durationMs: 1500, confidence: "high" },

  // Gunshots
  { pattern: /выстрел|gunshot|стреля|shoot|пистолет|gun/i, description: "Gunshot", durationMs: 1000, confidence: "high" },

  // Glass / breaking
  { pattern: /стекл[оа]|glass|разбив|shatter|бьёт/i, description: "Glass breaking", durationMs: 1500, confidence: "high" },

  // Phone / tech
  { pattern: /телефон\s*(звонит|вибрир)|phone\s*(ring|buzz)|звонок/i, description: "Phone ring", durationMs: 2000, confidence: "high" },
  { pattern: /сообщени|notification|уведомлен/i, description: "Notification", durationMs: 500, confidence: "medium" },

  // Water
  { pattern: /вод[аы]\s*(льётся|плеск|кап)|water\s*(splash|drip|pour)/i, description: "Water", durationMs: 3000, confidence: "medium" },
  { pattern: /плеск|splash/i, description: "Splash", durationMs: 1500, confidence: "medium" },

  // Animals
  { pattern: /собак[аи]|лает|dog|bark/i, description: "Dog bark", durationMs: 2000, confidence: "medium" },
  { pattern: /птиц[аы]|bird|чириканье|chirp/i, description: "Birds", durationMs: 3000, confidence: "low" },

  // Music cues (from screenplay text, not МУЗЫКА: blocks)
  { pattern: /музыка\s+(звучит|играет|начинает)/i, description: "Music cue", durationMs: 5000, confidence: "high" },
  { pattern: /music\s+(plays|starts|begins)/i, description: "Music cue", durationMs: 5000, confidence: "high" },

  // Ambient
  { pattern: /тишин[аы]|silence|тихо|quiet/i, description: "Silence", durationMs: 2000, confidence: "low" },
  { pattern: /толп[аы]|crowd|людей|people\s+chatter/i, description: "Crowd ambience", durationMs: 4000, confidence: "medium" },

  // Screams / voice effects
  { pattern: /крик|кричит|scream|yell/i, description: "Scream", durationMs: 1500, confidence: "high" },
  { pattern: /шёпот|whisper/i, description: "Whisper", durationMs: 2000, confidence: "medium" },
]

/**
 * Extract SFX hints from action blocks.
 * Returns hints sorted by position (suggestedStartMs).
 */
export function extractSfxHints(
  blocks: Block[],
  blockTimings?: Map<string, number>,
): SfxHint[] {
  const hints: SfxHint[] = []
  let estimatedMs = 0

  for (const block of blocks) {
    // Only scan action and shot blocks for SFX
    if (block.type !== "action" && block.type !== "shot") {
      // Advance time estimate for non-action blocks
      if (block.type === "scene_heading") estimatedMs += 2000
      else if (block.type === "dialogue") {
        const words = block.text.trim().split(/\s+/).length
        estimatedMs += Math.max(800, Math.round((words / 155) * 60_000) + 300)
      }
      continue
    }

    const startMs = blockTimings?.get(block.id) ?? estimatedMs
    const text = block.text

    for (const { pattern, description, durationMs, confidence } of SFX_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        const desc = description.includes("$1") && match[1]
          ? description.replace("$1", match[1].trim())
          : description

        hints.push({
          blockId: block.id,
          description: desc,
          suggestedStartMs: startMs,
          suggestedDurationMs: durationMs,
          confidence,
        })
      }
    }

    // Advance time estimate
    const words = text.trim().split(/\s+/).length
    estimatedMs += Math.max(2000, Math.min(15000, Math.round((words / 60) * 60_000)))
  }

  return hints.sort((a, b) => a.suggestedStartMs - b.suggestedStartMs)
}
