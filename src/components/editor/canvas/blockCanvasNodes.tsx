"use client"

/**
 * Node Types Registry — re-exports all canvas node components.
 *
 * This is the single entry point for BlockCanvas to get all available node types.
 */

import { BlockTextNode } from "./nodes/BlockTextNode"
import { BibleRefNode } from "./nodes/BibleRefNode"
import { StyleInputNode } from "./nodes/StyleInputNode"
import { PromptBuilderNode } from "./nodes/PromptBuilderNode"
import { ImageGenNode } from "./nodes/ImageGenNode"
import { OutputNode } from "./nodes/OutputNode"
import { ImageImportNode } from "./nodes/ImageImportNode"
import { PromptEditorNode } from "./nodes/PromptEditorNode"
import { VideoGenNode } from "./nodes/VideoGenNode"
import { RouterNode } from "./nodes/RouterNode"
import { StickyNoteNode } from "./nodes/StickyNoteNode"
import { CompareNode } from "./nodes/CompareNode"

export const blockCanvasNodeTypes = {
  blockText: BlockTextNode,
  bibleRef: BibleRefNode,
  styleInput: StyleInputNode,
  promptBuilder: PromptBuilderNode,
  imageGen: ImageGenNode,
  output: OutputNode,
  shotOutput: OutputNode,
  imageImport: ImageImportNode,
  promptEditor: PromptEditorNode,
  videoGen: VideoGenNode,
  router: RouterNode,
  stickyNote: StickyNoteNode,
  compare: CompareNode,
  preview: OutputNode, // Preview reuses Output node visual
}

// Re-export individual types for consumers
export { BlockTextNode } from "./nodes/BlockTextNode"
export { BibleRefNode } from "./nodes/BibleRefNode"
export { StyleInputNode } from "./nodes/StyleInputNode"
export { PromptBuilderNode } from "./nodes/PromptBuilderNode"
export { ImageGenNode } from "./nodes/ImageGenNode"
export { OutputNode } from "./nodes/OutputNode"
export { ImageImportNode } from "./nodes/ImageImportNode"
export { PromptEditorNode } from "./nodes/PromptEditorNode"
export { VideoGenNode } from "./nodes/VideoGenNode"
export { RouterNode } from "./nodes/RouterNode"
export { StickyNoteNode } from "./nodes/StickyNoteNode"
export { CompareNode } from "./nodes/CompareNode"
