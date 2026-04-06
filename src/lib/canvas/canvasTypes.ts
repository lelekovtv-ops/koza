/**
 * Canvas Types — shared type definitions for the node-based block canvas system.
 *
 * Defines port data types, node categories, and serializable canvas state.
 * Pure types file — no logic, no imports from stores.
 */

// ─── Port Data Types (determines valid connections) ─────────

export type PortDataType =
  | "text"    // string content (prompts, descriptions)
  | "image"   // image URL / blob reference
  | "video"   // video URL / blob reference
  | "audio"   // audio URL / blob reference
  | "number"  // numeric value (duration, opacity, etc.)
  | "style"   // StyleModifier object
  | "bible"   // Bible reference data (characters, locations, props)
  | "any"     // accepts anything (Router / utility nodes)

// ─── Port Definition ────────���───────────────────────────────

export interface PortDef {
  id: string             // unique within node, e.g. "text-out", "image-in"
  label: string
  dataType: PortDataType
  direction: "input" | "output"
  multi?: boolean        // can accept multiple connections (default false)
}

// ─── Node Category ──���───────────────────────────────────────

export type NodeCategory =
  | "source"       // Block Text, Image Import, Video Import, Audio Import
  | "reference"    // Bible Ref, Style Input
  | "processing"   // Prompt Builder, Prompt Editor, Color Grading
  | "generation"   // Image Gen, Video Gen (have Run button)
  | "output"       // Shot Output, Preview
  | "helper"       // Router, Sticky Note, Compare

// ─── Node Type Definition (registry entry) ──────────────────

export interface NodeTypeDefinition {
  type: string                          // ReactFlow node type key
  label: string                         // display name
  category: NodeCategory
  color: string                         // border/accent color hex
  inputs: PortDef[]
  outputs: PortDef[]
  defaultData: Record<string, unknown>
  hasRunButton?: boolean                // generation nodes show Run
}

// ─── Port Color Map ─��───────────────────────────────────────

export const PORT_COLORS: Record<PortDataType, string> = {
  text:   "#8B5CF6",
  image:  "#10B981",
  video:  "#EF4444",
  audio:  "#F59E0B",
  number: "#3B82F6",
  style:  "#A855F7",
  bible:  "#D97706",
  any:    "#6B7280",
}

// ─── Serializable Canvas State ──────────────────────────────

export interface CanvasNodeState {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface CanvasEdgeState {
  id: string
  source: string
  sourceHandle: string | null
  target: string
  targetHandle: string | null
}

export interface CanvasData {
  nodes: CanvasNodeState[]
  edges: CanvasEdgeState[]
  viewport?: { x: number; y: number; zoom: number }
}
