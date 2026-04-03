import { create } from "zustand"

export type PanelId = "script" | "timeline" | "emotions" | "plan" | "inspector" | "generator"

export interface PanelState {
  id: PanelId
  visible: boolean
  minimized: boolean
  position: { x: number; y: number }
  size: { w: number; h: number }
  zIndex: number
}

const DEFAULT_PANELS: Record<PanelId, Omit<PanelState, "id">> = {
  script:    { visible: false, minimized: false, position: { x: 40, y: 60 },  size: { w: 480, h: 600 }, zIndex: 100 },
  timeline:  { visible: false, minimized: false, position: { x: 60, y: 40 },  size: { w: 900, h: 500 }, zIndex: 100 },
  emotions:  { visible: false, minimized: false, position: { x: 540, y: 60 }, size: { w: 700, h: 300 }, zIndex: 100 },
  plan:      { visible: false, minimized: false, position: { x: 100, y: 80 }, size: { w: 800, h: 500 }, zIndex: 100 },
  inspector: { visible: false, minimized: false, position: { x: 800, y: 60 }, size: { w: 360, h: 500 }, zIndex: 100 },
  generator: { visible: false, minimized: false, position: { x: 540, y: 60 }, size: { w: 500, h: 500 }, zIndex: 100 },
}

interface PanelsStore {
  panels: Record<PanelId, PanelState>
  nextZ: number

  openPanel: (id: PanelId) => void
  closePanel: (id: PanelId) => void
  togglePanel: (id: PanelId) => void
  focusPanel: (id: PanelId) => void
  minimizePanel: (id: PanelId) => void
  restorePanel: (id: PanelId) => void
  movePanel: (id: PanelId, x: number, y: number) => void
  resizePanel: (id: PanelId, w: number, h: number) => void
  closeAll: () => void
}

export const usePanelsStore = create<PanelsStore>((set, get) => ({
  panels: Object.fromEntries(
    (Object.keys(DEFAULT_PANELS) as PanelId[]).map((id) => [id, { id, ...DEFAULT_PANELS[id] }]),
  ) as Record<PanelId, PanelState>,
  nextZ: 101,

  openPanel: (id) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], visible: true, minimized: false, zIndex: s.nextZ } },
      nextZ: s.nextZ + 1,
    })),

  closePanel: (id) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], visible: false, minimized: false } },
    })),

  togglePanel: (id) => {
    const panel = get().panels[id]
    if (panel.visible && !panel.minimized) {
      get().closePanel(id)
    } else {
      get().openPanel(id)
    }
  },

  focusPanel: (id) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], zIndex: s.nextZ } },
      nextZ: s.nextZ + 1,
    })),

  minimizePanel: (id) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], minimized: true } },
    })),

  restorePanel: (id) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], minimized: false, zIndex: s.nextZ } },
      nextZ: s.nextZ + 1,
    })),

  movePanel: (id, x, y) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], position: { x, y } } },
    })),

  resizePanel: (id, w, h) =>
    set((s) => ({
      panels: { ...s.panels, [id]: { ...s.panels[id], size: { w, h } } },
    })),

  closeAll: () =>
    set((s) => ({
      panels: Object.fromEntries(
        Object.entries(s.panels).map(([id, p]) => [id, { ...p, visible: false, minimized: false }]),
      ) as Record<PanelId, PanelState>,
    })),
}))
