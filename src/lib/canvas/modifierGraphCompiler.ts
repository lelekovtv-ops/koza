/**
 * Modifier Graph Compiler — converts Block + modifier type into a node graph.
 *
 * Each ModifierType maps to a predefined graph layout.
 * "canvas" type restores saved canvasData as-is.
 */

import type { Node, Edge } from "@xyflow/react"
import type { Block } from "@/lib/screenplayFormat"
import type { TimelineShot } from "@/store/timeline"
import type { ModifierType } from "@/lib/productionTypes"
import { useBibleStore } from "@/store/bible"
import { buildImagePrompt } from "@/lib/promptBuilder"
import { PORT_COLORS } from "./canvasTypes"

// ─── Edge helper ────────────────────────────────────────────

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  color: string,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "smoothstep",
    animated: false,
    style: { stroke: color, strokeWidth: 2 },
  }
}

// ─── Compile block into initial graph ───────────────────────

export function compileBlockToGraph(
  block: Block,
  shot: TimelineShot | null,
  modifierType?: ModifierType,
): { nodes: Node[]; edges: Edge[] } {
  const type = modifierType || block.modifier?.type || "default"

  switch (type) {
    case "canvas":
      // Should never reach here — canvas type means saved data exists
      return buildDefaultGraph(block, shot)
    case "ai-avatar":
      return buildAiAvatarGraph(block, shot)
    case "effect":
      return buildEffectGraph(block, shot)
    case "b-roll":
      return buildBRollGraph(block, shot)
    case "title-card":
      return buildTitleCardGraph(block, shot)
    default:
      return buildDefaultGraph(block, shot)
  }
}

// ─── Default: Text → Prompt → ImageGen → Output ────────────

function buildDefaultGraph(block: Block, shot: TimelineShot | null): { nodes: Node[]; edges: Edge[] } {
  const bible = useBibleStore.getState()
  const sceneChars = bible.characters.filter((c) =>
    shot?.caption?.toUpperCase().includes(c.name.toUpperCase()) ||
    block.text.toUpperCase().includes(c.name.toUpperCase()),
  )
  const sceneLocs = bible.locations.filter((l) =>
    shot?.sceneId && l.sceneIds.includes(shot.sceneId),
  )
  const sceneProps = bible.props.filter((p) =>
    shot?.sceneId && p.sceneIds.includes(shot.sceneId),
  )

  const prompt = shot
    ? buildImagePrompt(shot, bible.characters, bible.locations, undefined, bible.props)
    : ""

  const nodes: Node[] = [
    {
      id: "block-text",
      type: "blockText",
      position: { x: 0, y: 80 },
      data: { label: "Block Text", text: block.text, blockType: block.type },
    },
    {
      id: "bible-ref",
      type: "bibleRef",
      position: { x: 0, y: 280 },
      data: {
        label: "Bible",
        characters: sceneChars.map((c) => c.name),
        locations: sceneLocs.map((l) => l.name),
        props: sceneProps.map((p) => p.name),
      },
    },
    {
      id: "style-input",
      type: "styleInput",
      position: { x: 0, y: 460 },
      data: {
        label: "Style Layer",
        styleName: "From Project",
        stylePrompt: bible.directorVision || "No style set",
        enabled: true,
      },
    },
    {
      id: "prompt-builder",
      type: "promptBuilder",
      position: { x: 320, y: 160 },
      data: { label: "Prompt Builder", prompt, isProcessing: false },
    },
    {
      id: "image-gen",
      type: "imageGen",
      position: { x: 640, y: 120 },
      data: {
        label: "Image Generation",
        model: "nano-banana-2",
        thumbnailUrl: shot?.thumbnailUrl || block.visual?.thumbnailUrl || null,
        isGenerating: false,
      },
    },
    {
      id: "shot-output",
      type: "shotOutput",
      position: { x: 640, y: 360 },
      data: {
        label: "Shot Output",
        thumbnailUrl: shot?.thumbnailUrl || block.visual?.thumbnailUrl || null,
        prompt,
        duration: shot?.duration || block.durationMs || 3000,
      },
    },
  ]

  const edges: Edge[] = [
    edge("e-text-prompt", "block-text", "prompt-builder", "text-out", "text-in", PORT_COLORS.text),
    edge("e-bible-prompt", "bible-ref", "prompt-builder", "text-out", "bible-in", PORT_COLORS.bible),
    edge("e-style-prompt", "style-input", "prompt-builder", "text-out", "style-in", PORT_COLORS.style),
    edge("e-prompt-gen", "prompt-builder", "image-gen", "text-out", "text-in", PORT_COLORS.text),
    edge("e-gen-output", "image-gen", "shot-output", "image-out", "image-in", PORT_COLORS.image),
  ]

  return { nodes, edges }
}

// ─── AI Avatar: face closeup + lip sync hint ────────────────

function buildAiAvatarGraph(block: Block, shot: TimelineShot | null): { nodes: Node[]; edges: Edge[] } {
  const base = buildDefaultGraph(block, shot)

  // Modify prompt builder hint for face closeup
  const pb = base.nodes.find((n) => n.id === "prompt-builder")
  if (pb) {
    pb.data = {
      ...pb.data,
      label: "Prompt Builder (Avatar)",
      prompt: `[CLOSE-UP FACE, lip sync ready] ${(pb.data as Record<string, unknown>).prompt || ""}`,
    }
  }

  // Add audio import for lip sync reference
  base.nodes.push({
    id: "audio-import",
    type: "audioImport",
    position: { x: 0, y: 620 },
    data: { label: "Voice Audio", audioUrl: null, fileName: null },
  })

  return base
}

// ─── Effect: Image → Effect processing → Output ────────────

function buildEffectGraph(block: Block, shot: TimelineShot | null): { nodes: Node[]; edges: Edge[] } {
  const params = block.modifier?.params || {}

  const nodes: Node[] = [
    {
      id: "image-import",
      type: "imageImport",
      position: { x: 0, y: 120 },
      data: {
        label: "Source Image",
        imageUrl: shot?.thumbnailUrl || block.visual?.thumbnailUrl || null,
        fileName: null,
      },
    },
    {
      id: "shot-output",
      type: "shotOutput",
      position: { x: 480, y: 120 },
      data: {
        label: "Shot Output",
        thumbnailUrl: shot?.thumbnailUrl || null,
        prompt: `Effect: ${params.effect || "none"}`,
        duration: shot?.duration || block.durationMs || 3000,
      },
    },
    {
      id: "sticky-params",
      type: "stickyNote",
      position: { x: 240, y: 280 },
      data: {
        label: "Effect Params",
        text: Object.entries(params).map(([k, v]) => `${k}: ${v}`).join("\n"),
      },
    },
  ]

  const edges: Edge[] = [
    edge("e-img-output", "image-import", "shot-output", "image-out", "image-in", PORT_COLORS.image),
  ]

  return { nodes, edges }
}

// ─── B-Roll: Text → Prompt (b-roll) → Gen → Output ─────────

function buildBRollGraph(block: Block, shot: TimelineShot | null): { nodes: Node[]; edges: Edge[] } {
  const base = buildDefaultGraph(block, shot)

  const pb = base.nodes.find((n) => n.id === "prompt-builder")
  if (pb) {
    pb.data = {
      ...pb.data,
      label: "Prompt Builder (B-Roll)",
      prompt: `[B-ROLL, cinematic establishing shot, no characters] ${(pb.data as Record<string, unknown>).prompt || ""}`,
    }
  }

  return base
}

// ─── Title Card: Text → Output (no generation) ─────────────

function buildTitleCardGraph(block: Block, shot: TimelineShot | null): { nodes: Node[]; edges: Edge[] } {
  const params = block.modifier?.params || {}

  const nodes: Node[] = [
    {
      id: "block-text",
      type: "blockText",
      position: { x: 0, y: 120 },
      data: { label: "Title Text", text: block.text, blockType: block.type },
    },
    {
      id: "shot-output",
      type: "shotOutput",
      position: { x: 400, y: 120 },
      data: {
        label: "Title Card Output",
        thumbnailUrl: null,
        prompt: `Title: ${block.text}`,
        duration: (params.durationMs as number) || block.durationMs || 3000,
      },
    },
    {
      id: "sticky-style",
      type: "stickyNote",
      position: { x: 200, y: 280 },
      data: {
        label: "Title Style",
        text: `Animation: ${params.animation || "reveal"}\nFont: ${params.font || "serif"}\nAlign: ${params.align || "center"}`,
      },
    },
  ]

  const edges: Edge[] = [
    edge("e-text-output", "block-text", "shot-output", "text-out", "text-in", PORT_COLORS.text),
  ]

  return { nodes, edges }
}
