import type { BreakdownModelOption, BreakdownTextModelId } from "@/features/breakdown/types"

export const BREAKDOWN_MODELS: BreakdownModelOption[] = [
  { id: "claude-sonnet-4-20250514", label: "claude-sonnet" },
  { id: "gpt-4o", label: "gpt-4o" },
  { id: "gemini-1.5-pro", label: "gemini" },
]

export function mapBoardModelToBreakdownModel(modelId: string): BreakdownTextModelId {
  if (modelId.startsWith("gpt")) return "gpt-4o"
  if (modelId.startsWith("gemini")) return "gemini-1.5-pro"
  return "claude-sonnet-4-20250514"
}