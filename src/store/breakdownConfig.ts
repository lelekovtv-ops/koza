import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { BreakdownEngineConfig } from "@/lib/cinematic/config"
import { DEFAULT_BREAKDOWN_ENGINE_CONFIG, resolveBreakdownConfig } from "@/lib/cinematic/config"

export type BreakdownSpeed = "fast" | "balanced" | "quality"

interface BreakdownConfigState {
  /** Global config applied to all scenes by default */
  global: BreakdownEngineConfig
  /** Per-scene overrides (sceneId → partial config) */
  sceneOverrides: Record<string, Partial<BreakdownEngineConfig>>
  /** Whether to auto-generate prompts after breakdown */
  autoPromptBuild: boolean
  /** Speed preset: fast=all flash, balanced=mixed, quality=all heavy */
  breakdownSpeed: BreakdownSpeed
  /** Model for creative/quality stages (Shot Planner, Creative Planner, Prompt Composer) */
  qualityModel: string
  /** Model for structural stages (Scene Analyst, Action Splitter, Context Router, Censor) */
  structuralModel: string

  setGlobal: (config: Partial<BreakdownEngineConfig>) => void
  resetGlobal: () => void
  setSceneOverride: (sceneId: string, config: Partial<BreakdownEngineConfig>) => void
  clearSceneOverride: (sceneId: string) => void
  setAutoPromptBuild: (enabled: boolean) => void
  setBreakdownSpeed: (speed: BreakdownSpeed) => void
  setQualityModel: (model: string) => void
  setStructuralModel: (model: string) => void
  /** Resolve final config for a scene: override merged over global */
  getConfigForScene: (sceneId: string) => BreakdownEngineConfig
}

export const useBreakdownConfigStore = create<BreakdownConfigState>()(
  persist(
    (set, get) => ({
      global: { ...DEFAULT_BREAKDOWN_ENGINE_CONFIG },
      sceneOverrides: {},
      autoPromptBuild: true,
      breakdownSpeed: "balanced" as BreakdownSpeed,
      qualityModel: "gpt-4o",
      structuralModel: "gemini-2.5-flash",

      setGlobal: (config) =>
        set((state) => ({
          global: { ...state.global, ...config },
        })),

      resetGlobal: () =>
        set({ global: { ...DEFAULT_BREAKDOWN_ENGINE_CONFIG } }),

      setSceneOverride: (sceneId, config) =>
        set((state) => ({
          sceneOverrides: {
            ...state.sceneOverrides,
            [sceneId]: { ...state.sceneOverrides[sceneId], ...config },
          },
        })),

      clearSceneOverride: (sceneId) =>
        set((state) => {
          const next = { ...state.sceneOverrides }
          delete next[sceneId]
          return { sceneOverrides: next }
        }),

      setAutoPromptBuild: (enabled) => set({ autoPromptBuild: enabled }),
      setBreakdownSpeed: (speed) => set({ breakdownSpeed: speed }),
      setQualityModel: (model) => set({ qualityModel: model }),
      setStructuralModel: (model) => set({ structuralModel: model }),

      getConfigForScene: (sceneId) => {
        const { global, sceneOverrides } = get()
        const override = sceneOverrides[sceneId]
        if (!override) return global
        return resolveBreakdownConfig({ ...global, ...override })
      },
    }),
    {
      name: "koza-breakdown-config-v1",
    },
  ),
)
