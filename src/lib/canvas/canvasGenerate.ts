/**
 * Canvas Generate — runs image/video generation from canvas nodes.
 *
 * Extracts the same pipeline as StoryboardPanel's generateShotImage
 * but driven by canvas node data instead of shot data.
 */

import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { useTimelineStore } from "@/store/timeline"
import { useProjectsStore } from "@/store/projects"
import { useLibraryStore } from "@/store/library"
import { useBlockCanvasStore } from "@/store/blockCanvas"
import { buildImagePrompt } from "@/lib/promptBuilder"
import { getShotGenerationReferenceImages, convertReferenceImagesToDataUrls } from "@/lib/imageGenerationReferences"
import { trySaveBlob } from "@/lib/fileStorage"
import type { Node } from "@xyflow/react"

// ─── Run image generation from an ImageGen node ─────────────

export async function runImageGenNode(node: Node): Promise<{ imageUrl: string; blobKey: string | null }> {
  const store = useBlockCanvasStore.getState()
  const shotId = store.activeShotId
  const shot = shotId ? useTimelineStore.getState().shots.find((s) => s.id === shotId) : null

  const nodeData = node.data as Record<string, unknown>
  const model = (nodeData.model as string) || "nano-banana-2"

  // Collect prompt from connected PromptBuilder node
  const prompt = collectPromptFromGraph(node.id, store.nodes, store.edges)

  // Collect reference images from shot's bible data
  const { characters, locations, props: bibleProps } = useBibleStore.getState()
  const { projectStyle } = useBoardStore.getState()
  let referenceImages: string[] = []

  if (shot) {
    const refs = getShotGenerationReferenceImages(shot, characters, locations, bibleProps)
    referenceImages = await convertReferenceImagesToDataUrls(refs)
  }

  const referenceInstruction = referenceImages.length > 0
    ? "Use the provided reference images as hard visual anchors. Preserve the exact face identity, hair, costume silhouette, proportions, and environment design from those references."
    : ""

  const finalPrompt = [prompt, referenceInstruction].filter(Boolean).join("\n\n")

  // API call
  const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
  const body = model === "gpt-image"
    ? { prompt: finalPrompt, referenceImages }
    : { prompt: finalPrompt, model, referenceImages, stylePrompt: projectStyle || undefined }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `Generation failed: ${response.status}`)
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const err = await response.json()
    throw new Error((err as { error?: string }).error || "API returned JSON instead of image")
  }

  const arrayBuffer = await response.arrayBuffer()
  const blob = new Blob([arrayBuffer], { type: contentType || "image/png" })
  if (blob.size < 1000) {
    throw new Error(`Image too small (${blob.size} bytes)`)
  }

  const blobKey = `canvas-gen-${node.id}-${Date.now()}`
  let persisted = false
  try { persisted = await trySaveBlob(blobKey, blob) } catch { /* ok */ }

  const imageUrl = URL.createObjectURL(blob)

  // Add to library
  const projectId = useProjectsStore.getState().activeProjectId || "global"
  useLibraryStore.getState().addFile({
    id: blobKey,
    name: `Canvas generation.png`,
    type: "image",
    mimeType: "image/png",
    size: blob.size,
    url: imageUrl,
    thumbnailUrl: imageUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ["generated", "canvas"],
    projectId,
    folder: "/canvas",
    origin: "generated",
  })

  // Also update the shot if we have one
  if (shot) {
    const entry = { url: imageUrl, blobKey: persisted ? blobKey : null, timestamp: Date.now(), source: "generate" as const }
    const history = [...(shot.generationHistory || []), entry]
    useTimelineStore.getState().updateShot(shot.id, {
      thumbnailUrl: imageUrl,
      thumbnailBlobKey: persisted ? blobKey : null,
      generationHistory: history,
      activeHistoryIndex: history.length - 1,
    })
  }

  return { imageUrl, blobKey: persisted ? blobKey : null }
}

// ─── Collect prompt by walking edges backwards ──────────────

function collectPromptFromGraph(nodeId: string, nodes: Node[], edges: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[]): string {
  // Find edges going INTO this node's text-in handle
  const textEdge = edges.find((e) => e.target === nodeId && e.targetHandle === "text-in")
  if (!textEdge) {
    // No connected prompt — try to build from shot data
    const store = useBlockCanvasStore.getState()
    const shotId = store.activeShotId
    const shot = shotId ? useTimelineStore.getState().shots.find((s) => s.id === shotId) : null
    if (shot) {
      const { characters, locations, props: bibleProps } = useBibleStore.getState()
      const { projectStyle } = useBoardStore.getState()
      return buildImagePrompt(shot, characters, locations, projectStyle, bibleProps)
    }
    return ""
  }

  // Get the source node
  const sourceNode = nodes.find((n) => n.id === textEdge.source)
  if (!sourceNode) return ""

  const d = sourceNode.data as Record<string, unknown>

  switch (sourceNode.type) {
    case "promptBuilder":
      return (d.prompt as string) || ""
    case "promptEditor":
      return (d.useEdited ? d.editedPrompt : d.prompt) as string || ""
    case "blockText":
      return (d.text as string) || ""
    default:
      return ""
  }
}
