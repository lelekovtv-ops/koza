import { PORT_COLORS, type PortDataType } from "@/lib/canvas/canvasTypes"

// ─── Weavy-style node base ──────────────────────────────────

export const nodeBase =
  "rounded-xl border border-white/[0.08] bg-[#1C1D21] text-white/80 transition-all duration-150"

export const nodeHover = "hover:border-white/[0.12] hover:bg-[#1E1F24]"

export const nodeSelected = "border-white/[0.18] bg-[#1F2025]"

// ─── Handle styles — clean small dots ───────────────────────

export function handleStyle(dataType?: PortDataType) {
  const color = dataType ? PORT_COLORS[dataType] : "#555"
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: color,
    borderWidth: 2,
    borderColor: "#1C1D21",
  }
}

// ─── Category colors for minimap ────────────────────────────

export const CATEGORY_RING_COLORS: Record<string, string> = {
  blockText: "#10B981",
  imageImport: "#10B981",
  videoImport: "#EF4444",
  audioImport: "#F59E0B",
  bibleRef: "#D97706",
  styleInput: "#8B5CF6",
  promptBuilder: "#3B82F6",
  promptEditor: "#3B82F6",
  imageGen: "#D4A853",
  videoGen: "#EF4444",
  shotOutput: "#FFFFFF",
  output: "#FFFFFF",
  preview: "#6B7280",
  router: "#6B7280",
  stickyNote: "#FBBF24",
  compare: "#6B7280",
}
