import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"

export type BreakdownSpeed = "fast" | "balanced" | "quality"

/** Pipeline preset saved from Pipeline Constructor */
export interface PipelinePreset {
  name: string
  presetId?: string // "fincher" | "disney" | custom
  style?: string // image generation style directive
  modules: Array<{
    moduleId: string
    name: string
    systemPrompt: string
    model: string
    temperature?: number
    inputs: string[]
    outputs: string[]
  }>
}

/** Full production preset: style + director + pipeline modules */
export interface ProductionPreset {
  id: string
  name: string
  description: string
  imageStyle: string
  directorPrompt: string
  pipeline: PipelinePreset
}

export const BUILT_IN_PRODUCTION_PRESETS: ProductionPreset[] = [
  {
    id: "fincher",
    name: "Fincher",
    description: "Surveillance, геометрия, один свет, steel blue. 5 модулей.",
    imageStyle: "Film noir, high contrast black and white, dramatic chiaroscuro lighting, deep shadows",
    directorPrompt: `Ты — Дэвид Финчер + Эрик Мессершмидт. КАМЕРА НАБЛЮДАЕТ. Surveillance footage. ГЕОМЕТРИЯ. Предметы = улики. ОДИН ИСТОЧНИК СВЕТА. ЦВЕТ БОЛЕЕТ. Steel blue тени. ПЕРВЫЙ КАДР — самый нестандартный.`,
    pipeline: {
      name: "Fincher",
      presetId: "fincher",
      style: "",
      modules: [], // null = use default fincher.ts
    },
  },
  {
    id: "animation",
    name: "Анимация",
    description: "Эмоции, динамика, яркие цвета. 2 модуля, быстро.",
    imageStyle: "3D animation, vibrant saturated colors, expressive cartoon characters, volumetric lighting, fantasy illustration",
    directorPrompt: `Режиссёр анимации. ЭМОЦИЯ В ПЕРВУЮ ОЧЕРЕДЬ. ЧЁТКАЯ ПОСТАНОВКА. ДИНАМИЧЕСКИЕ РАКУРСЫ. ЦВЕТ = ЭМОЦИЯ. СВЕТ — персонаж. ПРОПСЫ КРИТИЧНЫ. ПЕРСОНАЖИ ВЫРАЗИТЕЛЬНЫ.`,
    pipeline: {
      name: "Анимация",
      presetId: "animation",
      style: "",
      modules: [
        {
          moduleId: "shot-planner", name: "Shot Planner",
          systemPrompt: `You are Shot Planner for an animated production.
Plan 4-6 shots. PROPS ARE CRITICAL: list visibleProps, propPlacement, visibleCharacters for each.
DO NOT include visual style in descriptions — style is applied separately.
Return JSON: {"shots":[{"id":"shot-1","title":"...","shotSize":"...","angle":"...","subject":"...","visibleCharacters":["..."],"visibleProps":["..."],"propPlacement":"...","composition":"...","light":"...","color":"...","lens":"...","emotion":"..."}]}
Russian descriptions. JSON only, no markdown.`,
          model: "gemini-2.5-flash", temperature: 0.5, inputs: ["scene", "bible"], outputs: ["shotPlan"],
        },
        {
          moduleId: "prompt-composer", name: "Prompt Composer",
          systemPrompt: `You are Prompt Composer for image generation.
visibleProps MUST appear in imagePrompt with Bible descriptions. TRANSLATE prop names to English.
hasRefImage=true → name only. hasRefImage=false → short appearance (15 words).
DO NOT include visual style (anime, realistic, etc.) in prompts — style is applied as a separate layer.
NEVER use brand names (Disney, Pixar, etc). Target 40-70 words. Describe CONTENT only.
Return JSON: {"shotId":"...","label":"...","directorNote":"...","cameraNote":"...","imagePrompt":"..."}. JSON only.`,
          model: "gemini-2.5-flash", temperature: 0.5, inputs: ["shotPlan", "scene", "bible"], outputs: ["imagePrompts"],
        },
      ],
    },
  },
]

interface BreakdownConfigState {
  /** Whether to auto-generate prompts after breakdown */
  autoPromptBuild: boolean
  /** Speed preset */
  breakdownSpeed: BreakdownSpeed
  /** Model for breakdown */
  qualityModel: string
  /** Model for structural stages */
  structuralModel: string
  /** Active pipeline preset from Pipeline Constructor */
  activePipelinePreset: PipelinePreset | null

  setAutoPromptBuild: (enabled: boolean) => void
  setBreakdownSpeed: (speed: BreakdownSpeed) => void
  setQualityModel: (model: string) => void
  setStructuralModel: (model: string) => void
  setActivePipelinePreset: (preset: PipelinePreset | null) => void
}

export const useBreakdownConfigStore = create<BreakdownConfigState>()(
  persist(
    (set) => ({
      autoPromptBuild: true,
      breakdownSpeed: "balanced" as BreakdownSpeed,
      qualityModel: "gemini-2.5-flash",
      structuralModel: "gemini-2.5-flash",
      activePipelinePreset: null,

      setAutoPromptBuild: (enabled) => set({ autoPromptBuild: enabled }),
      setBreakdownSpeed: (speed) => set({ breakdownSpeed: speed }),
      setQualityModel: (model) => set({ qualityModel: model }),
      setStructuralModel: (model) => set({ structuralModel: model }),
      setActivePipelinePreset: (preset) => set({ activePipelinePreset: preset }),
    }),
    {
      name: "koza-breakdown-config-v2",
      storage: safeStorage,
    },
  ),
)
