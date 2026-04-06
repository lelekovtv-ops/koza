import { useBibleStore } from "@/store/bible"
import { useScenesStore } from "@/store/scenes"
import { useScriptStore } from "@/store/script"
import { useProjectProfilesStore } from "@/store/projectProfiles"
import { slugify, type CharacterEntry, type LocationEntry } from "@/lib/bibleParser"
import type { JenkinsShot } from "@/lib/breakdownTypes"

// ── Constants ──────────────────────────────────────────────────

export const SHOT_SIZE_OPTIONS = ["WIDE", "MEDIUM", "CLOSE", "EXTREME CLOSE", "OVER SHOULDER", "POV", "INSERT", "AERIAL", "TWO SHOT"] as const
export const CAMERA_MOTION_OPTIONS = ["Static", "Pan Left", "Pan Right", "Pan Up", "Tilt Down", "Push In", "Pull Out", "Track Left", "Track Right", "Track Around", "Dolly In", "Crane Up", "Crane Down", "Drone In", "Handheld", "Steadicam"] as const

export const IMAGE_GEN_MODELS = [
  { id: "gpt-image", label: "GPT Image", price: "$0.04" },
  { id: "nano-banana", label: "NB1", price: "$0.039" },
  { id: "nano-banana-2", label: "NB2", price: "$0.045" },
  { id: "nano-banana-pro", label: "NB Pro", price: "$0.13" },
] as const

export const DIRECTOR_ASSISTANT_SYSTEM = [
  "You are a Director Assistant inside a cinematic storyboard system.",
  "Your role is to help a human director develop shots, not replace them.",
  "You receive a single shot Action plus optional scene context and optional bible context.",
  "Your job is to enhance the action, clarify visual behavior, strengthen intention, and keep it cinematic and natural.",
  "Return short director notes only.",
  "Use 2 to 4 short lines maximum.",
  "Each line should express intention, focus, emotional direction, or visual meaning.",
  "Use clear language, visual thinking, and subtle emotion.",
  "Do not rewrite the action.",
  "Do not create multiple shots.",
  "Do not invent new actions.",
  "Do not describe camera.",
  "Do not use technical terms.",
  "Do not explain your reasoning.",
  "Preserve the user's original intent.",
  "If bible context is relevant, integrate it naturally without forcing it.",
].join("\n")

export const DIRECTOR_ASSISTANT_MAX_LINES = 4
export const DIRECTOR_UPDATE_DEBOUNCE_MS = 250
export const MAX_DIRECTOR_SHOTS_PER_SCENE = 30

// ── Types ──────────────────────────────────────────────────────

export type EditableShotField = "caption" | "directorNote" | "cameraNote" | "imagePrompt" | "videoPrompt"
export type DirectorFieldVisibility = "all" | "action" | "director" | "camera"

export const DIRECTOR_FIELD_VISIBILITY_OPTIONS: Array<{ value: DirectorFieldVisibility; label: string; description: string }> = [
  { value: "all", label: "Show All", description: "Action, Director, and Camera" },
  { value: "action", label: "Action Only", description: "Keep only the action line" },
  { value: "director", label: "Director Only", description: "Keep only director notes" },
  { value: "camera", label: "Camera Only", description: "Keep only camera notes" },
]

// ── Pure Functions ─────────────────────────────────────────────

export function mergeProfileText(existing: string, incoming: string): string {
  const nextIncoming = incoming.trim()
  const nextExisting = existing.trim()

  if (!nextIncoming) {
    return nextExisting
  }

  if (!nextExisting) {
    return nextIncoming
  }

  if (nextExisting.includes(nextIncoming)) {
    return nextExisting
  }

  return `${nextExisting}\n\n${nextIncoming}`.trim()
}

export function formatSummaryTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const tenths = Math.floor((totalSeconds * 10) % 10)

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`
}

export function sanitizeDirectorAssistantText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""))
    .filter(Boolean)
    .slice(0, DIRECTOR_ASSISTANT_MAX_LINES)
    .join("\n")
}

export function mergeDirectorNotes(existing: string, addition: string): string {
  const current = existing.trim()
  const next = addition.trim()

  if (!next) return current
  if (!current) return next
  if (current.includes(next)) return current

  return `${current}\n${next}`
}

export async function readStreamedText(response: Response): Promise<string> {
  if (!response.body) {
    return await response.text()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fullText += decoder.decode(value, { stream: true })
  }

  fullText += decoder.decode()
  return fullText
}

export function buildSceneContextText(sceneId: string | null, scenes: ReturnType<typeof useScenesStore.getState>["scenes"], scriptBlocks: ReturnType<typeof useScriptStore.getState>["blocks"]): string {
  if (!sceneId) return ""

  const scene = scenes.find((entry) => entry.id === sceneId)
  if (!scene) return ""

  const excerpt = scene.blockIds
    .slice(0, 6)
    .map((blockId) => scriptBlocks.find((block) => block.id === blockId)?.text?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500)

  return [
    `Scene: ${scene.title}`,
    excerpt ? `Excerpt: ${excerpt}` : "",
  ].filter(Boolean).join("\n")
}

export function applyLucBessonProfileToScene({
  lucBessonProfile,
  targetScene,
  selectedSceneContext,
  setProjectStyle,
  updateDirectorVision,
  replaceSceneShots,
}: {
  lucBessonProfile: NonNullable<ReturnType<typeof useProjectProfilesStore.getState>["lucBessonByProjectId"][string]>
  targetScene: { id: string; title: string; blockIds: string[] }
  selectedSceneContext: string
  setProjectStyle: (value: string) => void
  updateDirectorVision: (value: string) => void
  replaceSceneShots: (
    sceneId: string,
    sceneText: string,
    sceneBlockIds: string[],
    jenkinsShots: JenkinsShot[],
  ) => number
}) {
  useBibleStore.setState((state) => {
    const nextCharacters = [...state.characters]
    const nextLocations = [...state.locations]

    lucBessonProfile.characterOverrides.forEach((override) => {
      const entryId = slugify(override.name)
      const existingIndex = nextCharacters.findIndex((entry) => entry.id === entryId)

      if (existingIndex >= 0) {
        const current = nextCharacters[existingIndex]
        nextCharacters[existingIndex] = {
          ...current,
          description: mergeProfileText(current.description, override.description),
          appearancePrompt: mergeProfileText(current.appearancePrompt, override.appearancePrompt),
          sceneIds: current.sceneIds.includes(targetScene.id) ? current.sceneIds : [...current.sceneIds, targetScene.id],
        }
        return
      }

      nextCharacters.push({
        id: entryId,
        name: override.name,
        description: override.description,
        referenceImages: [],
        canonicalImageId: null,
        generatedPortraitUrl: null,
        portraitBlobKey: null,
        appearancePrompt: override.appearancePrompt,
        sceneIds: [targetScene.id],
        dialogueCount: 0,
      } satisfies CharacterEntry)
    })

    lucBessonProfile.locationOverrides.forEach((override) => {
      const entryId = slugify(override.name)
      const existingIndex = nextLocations.findIndex((entry) => entry.id === entryId)

      if (existingIndex >= 0) {
        const current = nextLocations[existingIndex]
        nextLocations[existingIndex] = {
          ...current,
          description: mergeProfileText(current.description, override.description),
          appearancePrompt: mergeProfileText(current.appearancePrompt, override.appearancePrompt),
          sceneIds: current.sceneIds.includes(targetScene.id) ? current.sceneIds : [...current.sceneIds, targetScene.id],
        }
        return
      }

      nextLocations.push({
        id: entryId,
        name: override.name,
        fullHeading: override.name,
        intExt: "INT",
        timeOfDay: "",
        description: override.description,
        referenceImages: [],
        canonicalImageId: null,
        generatedImageUrl: null,
        imageBlobKey: null,
        appearancePrompt: override.appearancePrompt,
        sceneIds: [targetScene.id],
      } satisfies LocationEntry)
    })

    return {
      characters: nextCharacters,
      locations: nextLocations,
    }
  })

  if (lucBessonProfile.stylePrompt.trim()) {
    setProjectStyle(lucBessonProfile.stylePrompt.trim())
  }

  if (lucBessonProfile.directorVisionPrompt.trim()) {
    updateDirectorVision(lucBessonProfile.directorVisionPrompt.trim())
  }

  replaceSceneShots(
    targetScene.id,
    lucBessonProfile.sceneText.trim() || selectedSceneContext || targetScene.title,
    targetScene.blockIds,
    lucBessonProfile.shots.map((shot, i) => ({
      id: `luc-${i}`,
      label: shot.label,
      type: "image" as const,
      duration: 3200,
      notes: shot.refReason,
      shotSize: "",
      cameraMotion: "",
      caption: shot.visualDescription,
      directorNote: shot.directorNote,
      cameraNote: shot.cameraNote,
      videoPrompt: "",
      imagePrompt: shot.imagePrompt,
      visualDescription: shot.visualDescription,
      svg: "",
    })),
  )
}
