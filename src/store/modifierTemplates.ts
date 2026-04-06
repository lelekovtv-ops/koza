import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import type { BlockModifier, ModifierType } from "@/lib/productionTypes"

// ─── Types ───────────────────────────────────────────────────

export interface ModifierTemplate {
  id: string
  name: string
  description: string
  type: ModifierType
  modifier: BlockModifier
  builtIn: boolean
  createdAt: number
}

// ─── Built-in Templates ──────────────────────────────────────

const BUILT_IN_TEMPLATES: ModifierTemplate[] = [
  {
    id: "tmpl-ai-avatar",
    name: "AI Avatar",
    description: "Talking head — character speaks to camera with lip-sync",
    type: "ai-avatar",
    modifier: {
      type: "ai-avatar",
      templateId: "tmpl-ai-avatar",
      canvasData: null,
      params: { lipSync: true, faceCloseUp: true },
    },
    builtIn: true,
    createdAt: 0,
  },
  {
    id: "tmpl-ken-burns",
    name: "Ken Burns",
    description: "Slow zoom/pan on still image — documentary style",
    type: "effect",
    modifier: {
      type: "effect",
      templateId: "tmpl-ken-burns",
      canvasData: null,
      params: { effect: "ken-burns", zoomStart: 1.0, zoomEnd: 1.15, panDirection: "left-to-right", durationMs: 5000 },
    },
    builtIn: true,
    createdAt: 0,
  },
  {
    id: "tmpl-split-screen",
    name: "Split Screen",
    description: "Two images side by side — comparison or parallel action",
    type: "effect",
    modifier: {
      type: "effect",
      templateId: "tmpl-split-screen",
      canvasData: null,
      params: { effect: "split-screen", layout: "vertical", ratio: 0.5 },
    },
    builtIn: true,
    createdAt: 0,
  },
  {
    id: "tmpl-text-reveal",
    name: "Text Reveal",
    description: "Animated text reveal — title cards and lower thirds",
    type: "title-card",
    modifier: {
      type: "title-card",
      templateId: "tmpl-text-reveal",
      canvasData: null,
      params: { animation: "reveal", font: "serif", align: "center", bgOpacity: 0.6 },
    },
    builtIn: true,
    createdAt: 0,
  },
  {
    id: "tmpl-b-roll-gen",
    name: "B-Roll Generator",
    description: "AI-generated B-roll from action description",
    type: "b-roll",
    modifier: {
      type: "b-roll",
      templateId: "tmpl-b-roll-gen",
      canvasData: null,
      params: { source: "ai-generate", fallback: "stock" },
    },
    builtIn: true,
    createdAt: 0,
  },
]

// ─── Store ───────────────────────────────────────────────────

interface ModifierTemplateState {
  templates: ModifierTemplate[]
  addTemplate: (template: Omit<ModifierTemplate, "id" | "createdAt" | "builtIn">) => string
  updateTemplate: (id: string, patch: Partial<ModifierTemplate>) => void
  removeTemplate: (id: string) => void
  getTemplate: (id: string) => ModifierTemplate | undefined
  getTemplatesByType: (type: ModifierType) => ModifierTemplate[]
}

const createId = () => `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useModifierTemplateStore = create<ModifierTemplateState>()(
  persist(
    (set, get) => ({
      templates: BUILT_IN_TEMPLATES,

      addTemplate: (template) => {
        const id = createId()
        const full: ModifierTemplate = {
          ...template,
          id,
          builtIn: false,
          createdAt: Date.now(),
          modifier: { ...template.modifier, templateId: id },
        }
        set((state) => ({ templates: [...state.templates, full] }))
        return id
      },

      updateTemplate: (id, patch) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id && !t.builtIn ? { ...t, ...patch } : t
          ),
        }))
      },

      removeTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id || t.builtIn),
        }))
      },

      getTemplate: (id) => get().templates.find((t) => t.id === id),

      getTemplatesByType: (type) => get().templates.filter((t) => t.type === type),
    }),
    {
      name: "koza-modifier-templates-v1",
      storage: safeStorage,
    },
  ),
)
