/**
 * Node Registry — single source of truth for all canvas node types.
 *
 * Defines port schemas, categories, colors, and default data for every node.
 * Used by connection validator, node palette, and graph compiler.
 */

import type { NodeTypeDefinition, NodeCategory } from "./canvasTypes"

// ─── Registry ───────────────────────────────────────────────

export const NODE_REGISTRY: Record<string, NodeTypeDefinition> = {

  // ── Source ─────────────────────────────────────────────────

  blockText: {
    type: "blockText",
    label: "Block Text",
    category: "source",
    color: "#10B981",
    inputs: [],
    outputs: [
      { id: "text-out", label: "Text", dataType: "text", direction: "output" },
    ],
    defaultData: { label: "Block Text", text: "", blockType: "action" },
  },

  imageImport: {
    type: "imageImport",
    label: "Image Import",
    category: "source",
    color: "#10B981",
    inputs: [],
    outputs: [
      { id: "image-out", label: "Image", dataType: "image", direction: "output" },
    ],
    defaultData: { label: "Image Import", imageUrl: null, fileName: null },
  },

  videoImport: {
    type: "videoImport",
    label: "Video Import",
    category: "source",
    color: "#EF4444",
    inputs: [],
    outputs: [
      { id: "video-out", label: "Video", dataType: "video", direction: "output" },
    ],
    defaultData: { label: "Video Import", videoUrl: null, fileName: null },
  },

  audioImport: {
    type: "audioImport",
    label: "Audio Import",
    category: "source",
    color: "#F59E0B",
    inputs: [],
    outputs: [
      { id: "audio-out", label: "Audio", dataType: "audio", direction: "output" },
    ],
    defaultData: { label: "Audio Import", audioUrl: null, fileName: null },
  },

  // ── Reference ─────────────────────────────────────────────

  bibleRef: {
    type: "bibleRef",
    label: "Bible",
    category: "reference",
    color: "#D97706",
    inputs: [],
    outputs: [
      { id: "text-out", label: "Text", dataType: "text", direction: "output" },
      { id: "bible-out", label: "Bible Data", dataType: "bible", direction: "output" },
    ],
    defaultData: { label: "Bible", characters: [], locations: [], props: [] },
  },

  styleInput: {
    type: "styleInput",
    label: "Style Layer",
    category: "reference",
    color: "#8B5CF6",
    inputs: [],
    outputs: [
      { id: "style-out", label: "Style", dataType: "style", direction: "output" },
      { id: "text-out", label: "Prompt", dataType: "text", direction: "output" },
    ],
    defaultData: { label: "Style Layer", styleName: "From Project", stylePrompt: "", enabled: true },
  },

  // ── Processing ────────────────────────────────────────────

  promptBuilder: {
    type: "promptBuilder",
    label: "Prompt Builder",
    category: "processing",
    color: "#3B82F6",
    inputs: [
      { id: "text-in", label: "Text", dataType: "text", direction: "input", multi: true },
      { id: "bible-in", label: "Bible", dataType: "bible", direction: "input" },
      { id: "style-in", label: "Style", dataType: "style", direction: "input" },
    ],
    outputs: [
      { id: "text-out", label: "Prompt", dataType: "text", direction: "output" },
    ],
    defaultData: { label: "Prompt Builder", prompt: "", isProcessing: false },
  },

  promptEditor: {
    type: "promptEditor",
    label: "Prompt Editor",
    category: "processing",
    color: "#3B82F6",
    inputs: [
      { id: "text-in", label: "Text", dataType: "text", direction: "input" },
    ],
    outputs: [
      { id: "text-out", label: "Text", dataType: "text", direction: "output" },
    ],
    defaultData: { label: "Prompt Editor", editedPrompt: "", useEdited: false },
  },

  // ── Generation ────────────────────────────────────────────

  imageGen: {
    type: "imageGen",
    label: "Image Generation",
    category: "generation",
    color: "#D4A853",
    inputs: [
      { id: "text-in", label: "Prompt", dataType: "text", direction: "input" },
      { id: "image-in", label: "Reference", dataType: "image", direction: "input" },
    ],
    outputs: [
      { id: "image-out", label: "Image", dataType: "image", direction: "output" },
    ],
    defaultData: { label: "Image Generation", model: "nano-banana-2", thumbnailUrl: null, isGenerating: false },
    hasRunButton: true,
  },

  videoGen: {
    type: "videoGen",
    label: "Video Generation",
    category: "generation",
    color: "#EF4444",
    inputs: [
      { id: "text-in", label: "Prompt", dataType: "text", direction: "input" },
      { id: "image-in", label: "Start Frame", dataType: "image", direction: "input" },
    ],
    outputs: [
      { id: "video-out", label: "Video", dataType: "video", direction: "output" },
    ],
    defaultData: { label: "Video Generation", model: "video-gen-1", videoUrl: null, isGenerating: false },
    hasRunButton: true,
  },

  // ── Output ────────────────────────────────────────────────

  shotOutput: {
    type: "shotOutput",
    label: "Shot Output",
    category: "output",
    color: "#FFFFFF",
    inputs: [
      { id: "image-in", label: "Image", dataType: "image", direction: "input" },
      { id: "video-in", label: "Video", dataType: "video", direction: "input" },
      { id: "text-in", label: "Prompt", dataType: "text", direction: "input" },
      { id: "number-in", label: "Duration", dataType: "number", direction: "input" },
    ],
    outputs: [],
    defaultData: { label: "Shot Output", thumbnailUrl: null, prompt: "", duration: 3000 },
  },

  preview: {
    type: "preview",
    label: "Preview",
    category: "output",
    color: "#6B7280",
    inputs: [
      { id: "image-in", label: "Image", dataType: "image", direction: "input" },
      { id: "video-in", label: "Video", dataType: "video", direction: "input" },
    ],
    outputs: [],
    defaultData: { label: "Preview", mediaUrl: null, mediaType: "image" },
  },

  // ── Helper ────────────────────────────────────────────────

  router: {
    type: "router",
    label: "Router",
    category: "helper",
    color: "#6B7280",
    inputs: [
      { id: "any-in", label: "Input", dataType: "any", direction: "input" },
    ],
    outputs: [
      { id: "any-out-1", label: "Out 1", dataType: "any", direction: "output" },
      { id: "any-out-2", label: "Out 2", dataType: "any", direction: "output" },
      { id: "any-out-3", label: "Out 3", dataType: "any", direction: "output" },
    ],
    defaultData: { label: "Router" },
  },

  stickyNote: {
    type: "stickyNote",
    label: "Sticky Note",
    category: "helper",
    color: "#FBBF24",
    inputs: [],
    outputs: [],
    defaultData: { label: "Note", text: "" },
  },

  compare: {
    type: "compare",
    label: "Compare",
    category: "helper",
    color: "#6B7280",
    inputs: [
      { id: "image-a", label: "Image A", dataType: "image", direction: "input" },
      { id: "image-b", label: "Image B", dataType: "image", direction: "input" },
    ],
    outputs: [],
    defaultData: { label: "Compare", mode: "slider" },
  },
}

// ─── Helpers ────────────────────────────────────────────────

/** Get all nodes grouped by category */
export function getNodesByCategory(): Record<NodeCategory, NodeTypeDefinition[]> {
  const groups: Record<NodeCategory, NodeTypeDefinition[]> = {
    source: [],
    reference: [],
    processing: [],
    generation: [],
    output: [],
    helper: [],
  }
  for (const def of Object.values(NODE_REGISTRY)) {
    groups[def.category].push(def)
  }
  return groups
}

/** Get node definition by type key */
export function getNodeDef(type: string): NodeTypeDefinition | undefined {
  return NODE_REGISTRY[type]
}

/** Get port definition for a node's specific handle */
export function getPortDef(nodeType: string, handleId: string): import("./canvasTypes").PortDef | undefined {
  const def = NODE_REGISTRY[nodeType]
  if (!def) return undefined
  return [...def.inputs, ...def.outputs].find((p) => p.id === handleId)
}
