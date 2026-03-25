# Configurator Redesign

## Goal

Rebuild the visual configurator around explicit graph semantics instead of a hard-coded cinematic pipeline.

The immediate target is not Bible integration. The target is a sandbox where the user can see:

- what each node consumes
- what each node produces
- how detail anchors move through the graph
- how the final prompt is assembled

## Problems In The Current Pipeline UI

- The graph is visually rich but structurally linear.
- Connections exist mostly as stage order, not as typed data flow.
- Bible, prompt logic, continuity logic, and image generation are mixed too early.
- The user cannot freely build alternative chains like `photo -> ai -> output` or `prompt -> output`.

## External Patterns Worth Borrowing

### Langflow

- Single-purpose components.
- Fast prototyping through drag, connect, configure.
- The flow itself is the product, not a hidden implementation detail.

### n8n

- Connections are meaningful because data mapping is explicit.
- Nodes are reusable because inputs and outputs are visible.
- Multi-branch flows stay understandable through labeled links.

### ComfyUI

- Image generation is graph-native, not hidden behind a wizard.
- Inputs, transforms, and outputs can be freely recombined.
- Visual control matters as much as execution.

## Proposed KOZA Sandbox Model

### Node Families

- `photo`
  - input only
  - stores a reference image plus locked visual details
- `prompt`
  - input only
  - stores scene text, intent, or prompt fragments
- `ai`
  - transform node
  - configurable role plus configurable instruction describing what it does
- `generator`
  - terminal execution node
  - chooses the image system such as `gpt-image` or `nano-banana`
  - receives an already assembled generation prompt from upstream graph nodes
- `output`
  - output only
  - compiles the final prompt from upstream nodes

### Required UX Rules

- Every connection should show a semantic label like `detail anchor`, `scene text`, `prompt packet`.
- Connections should be made directly on-node via visible handles so a non-technical user can build flows without hidden gestures.
- Output should expose both sections and one final prompt string.
- AI nodes should be provider-agnostic while the product is still exploring configuration.
- Generator nodes should expose provider choice as a simple dropdown instead of a backend-only setting.
- The graph should work even if Bible is completely disconnected.

## How To Integrate The Existing Pipeline

Do not migrate the old `/pipeline` canvas as a single visual block.

Instead, migrate the pipeline in three layers.

### 1. User Layer

For normal users, provide a small number of starter templates:

- `Scene to Image`
- `Reference Lock`
- `Pipeline Blueprint`

This keeps the entry point simple while still allowing advanced graph editing later.

### 2. Graph Layer

Treat each current stage as a configurable transform node with explicit input and output contracts:

- `sceneAnalyst`
- `actionSplitter`
- `contextRouter`
- `creativePlanner`
- `censor`
- `shotPlanner`
- `continuitySupervisor`
- `promptComposer`
- `promptOptimizer`
- `imageGenerator`

This prevents the current hidden sequence from leaking into the new UI.

### 3. Execution Layer

Reuse the existing pipeline logic as backend executors behind nodes rather than rewriting it immediately.

That means:

- current cinematic/pipeline functions stay useful
- the graph becomes the orchestration surface
- the user edits nodes and connections, not a hard-coded stage chain

## Ordinary User Mode

The sandbox should be usable even by someone who does not understand the internal pipeline.

That requires:

- human-readable node titles
- visible input/output handles
- simple template loading
- generator system choice in plain UI
- advanced pipeline blueprint available, but not the default starting point

## Why This Should Come Before Bible Integration

- Bible binding will stay brittle until the graph contract is stable.
- If node input and output semantics are not fixed, Bible injection will keep leaking into every stage.
- A stable graph contract makes Bible just another optional upstream source later.

## Next Step After Sandbox Validation

- Add typed execution contracts per node family.
- Add optional `bible source` node instead of implicit global Bible injection.
- Keep AI nodes provider-agnostic for normal users, but allow advanced execution presets later.
- Execute existing pipeline stages behind graph nodes instead of duplicating stage logic.
- Preserve the same graph structure when later connecting to real generation.