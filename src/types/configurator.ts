import type { Edge, Node } from "@xyflow/react"

import type { ImageGenModel } from "@/lib/pipeline/imageGenerator"

export type ConfiguratorNodeKind = "photo" | "prompt" | "ai" | "generator" | "output"

export type ConfiguratorTemplateId = "default_directing" | "scene_to_image" | "reference_lock" | "pipeline_blueprint" | "koza_scene_to_directing_mvp" | "template_777" | "test_luc_besson"

export type AiNodeMode = "detail_guard" | "style_director" | "merge" | "rewrite"

interface ConfiguratorBaseNodeData {
  [key: string]: unknown
  kind: ConfiguratorNodeKind
  title: string
}

export interface ConfiguratorPhotoNodeData extends ConfiguratorBaseNodeData {
  kind: "photo"
  imageUrl: string
  caption: string
  lockedDetails: string
}

export interface ConfiguratorPromptNodeData extends ConfiguratorBaseNodeData {
  kind: "prompt"
  promptText: string
  detailHints: string
}

export interface ConfiguratorAiNodeData extends ConfiguratorBaseNodeData {
  kind: "ai"
  roleLabel: string
  mode: AiNodeMode
  instruction: string
}

export interface ConfiguratorGeneratorNodeData extends ConfiguratorBaseNodeData {
  kind: "generator"
  system: ImageGenModel
  requestPreview?: string
  sourceCount?: number
  shotActionText?: string
  shotDirectorNote?: string
  shotCameraNote?: string
  shotVisualDescription?: string
  canGenerate?: boolean
  generationStatus?: "idle" | "running" | "done" | "error"
  generationError?: string
  generatedImageUrl?: string
  referencePreviews?: Array<{
    id: string
    title: string
    imageUrl: string
  }>
  onGenerate?: () => void
}

export interface ConfiguratorOutputNodeData extends ConfiguratorBaseNodeData {
  kind: "output"
  previewPrompt?: string
  sourceCount?: number
  imageUrl?: string
}

export type ConfiguratorNodeData =
  | ConfiguratorPhotoNodeData
  | ConfiguratorPromptNodeData
  | ConfiguratorAiNodeData
  | ConfiguratorGeneratorNodeData
  | ConfiguratorOutputNodeData

export type ConfiguratorFlowNode = Node<ConfiguratorNodeData, "configNode">
export type ConfiguratorFlowEdge = Edge

export interface CompiledPromptSection {
  title: string
  content: string
}

export interface CompiledPromptResult {
  finalPrompt: string
  sections: CompiledPromptSection[]
  warnings: string[]
  sourceNodeIds: string[]
}

export interface CompiledGeneratorRequest {
  system: ImageGenModel
  prompt: string
  warnings: string[]
  sourceNodeIds: string[]
}

export interface ConfiguratorTemplateMeta {
  id: ConfiguratorTemplateId
  label: string
  description: string
}