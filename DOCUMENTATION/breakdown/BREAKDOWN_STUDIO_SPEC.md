# Breakdown Studio — Pipeline Constructor

Technical specification for the visual pipeline system. Written for future chat sessions to understand architecture and conventions.

---

## Overview

Breakdown Studio lives at `/dev/breakdown-studio`. It is a visual pipeline editor where the user builds, tests, and applies breakdown pipelines that convert a screenplay scene into a set of shot prompts ready for image generation.

The same pipeline engine runs in two places:
1. **Breakdown Studio** (test bench) — interactive, with live preview
2. **fincher.ts** (production) — called from StoryboardPanel during real breakdown

---

## Architecture

### Node Graph (ReactFlow)

The pipeline is a directed acyclic graph rendered with ReactFlow. Nodes are connected by edges that define data flow.

### Node Types

| Type | Purpose | Example |
|------|---------|---------|
| **AI Module** | LLM call | Scene Analyst, Shot Planner, Prompt Composer |
| **Data Node** | Static input | Scene text, Style string, Director prompt, Bible object |
| **Output Node** | Final result | Collects pipeline output |
| **Code Node** | Deterministic transform | JSON Parser, Prompt Merger |
| **ForEach Node** | Per-item execution | Run Prompt Composer once per shot |

### AI Module Schema

```typescript
interface PipelineModule {
  moduleId: string;
  name: string;
  systemPrompt: string;
  model: string;           // e.g. "gemini-2.5-flash"
  temperature: number;     // 0.0 - 1.0
  inputs: string[];        // moduleIds this depends on
  outputs: string[];       // moduleIds that depend on this
  color: string;           // hex color for UI
  enabled: boolean;
}
```

### Pipeline Preset Schema

```typescript
interface PipelinePreset {
  id: string;
  name: string;
  description: string;
  imageStyle: string;      // maps to projectStyle preset
  directorPrompt: string;  // injected into all AI modules
  pipeline: PipelineModule[];
}
```

Presets stored in `BUILT_IN_PRODUCTION_PRESETS` array in `src/store/breakdownConfig.ts`.

---

## Built-in Presets

### Fincher (5 modules)

| # | Module | Role |
|---|--------|------|
| 1 | **Scene Analyst** | Analyzes scene: tone, geography, characters present, props mentioned, visual motifs |
| 2 | **Prop Scanner** | Finds ALL props in scene, marks existing (in Bible) vs new, assigns importance level |
| 3 | **Shot Planner** | Plans shots in Fincher style: surveillance angles, geometric composition, single light source. Outputs `shots[]` with type, size, angle, characters, action |
| 4 | **Prop Distributor** | Per-shot: decides which props are VISIBLE given camera angle, shot size, depth. Returns `visibleProps[]` with placement/size_in_frame + `excludedProps[]` with reasons |
| 5 | **Prompt Composer** | Per-shot via ForEach. Adaptive: hasRefImage → name only; close-up → skip location; wide → include location. Target: 200-350 chars |

### Animation / Disney (2 modules)

| # | Module | Role |
|---|--------|------|
| 1 | **Shot Planner** | Animated fantasy shots: emotion first, dynamic angles, color=emotion. Outputs `shots[]` including `visibleCharacters[]`, `visibleProps[]`, `propPlacement` |
| 2 | **Prompt Composer** | Per-shot via ForEach. Props MANDATORY with Bible descriptions. Translates to English. No brand names (Disney/Pixar stripped) |

---

## Pipeline Execution Flow

This flow is identical in Breakdown Studio and `fincher.ts`:

```
1. Collect inputs: scene, style, directorPrompt, bible (chars, locs, props with hasRefImage flags)
2. Topological sort modules (BFS from data nodes)
3. For each module in order:
   a. Build context = all previous module results + scene + style + bible
   b. ForEach detection:
      - If module has "shotPlan" in inputs AND previous result contains shots[] array
      - → Run module once PER SHOT (batch=1 for Gemini models)
   c. Call LLM with systemPrompt + context
   d. Parse JSON response
   e. Store result in Map<moduleId, parsedJSON>
4. Final extraction:
   a. Find module whose result has shots[] → shot plan
   b. Find module whose result has prompts[] → image prompts
   c. Merge: each shot gets its imagePrompt from matching prompt
5. Return merged shot list
```

### ForEach Specifics

- Triggered when a module's inputs reference a result that contains `shots[]`
- Runs the module N times, once per shot
- For Gemini models: `batch=1` (serial execution due to rate limits)
- For Claude models: can batch higher
- Each iteration receives the single shot object + full context

---

## Smart Reference Image Selection

Runs **after** pipeline completes, **before** image generation.

```
1. Build numbered catalog from Bible:
   [0] ПЕРСОНАЖ: МАРИНА — appearance description...
   [1] ЛОКАЦИЯ: Квартира — description...
   [2] ПРЕДМЕТ: Шкатулка — description...

2. Send to Gemini Flash: "Given this prompt, which refs are relevant?"

3. Model returns: [0, 2] (array of indices)

4. Priority order:
   - Props mentioned in prompt (highest)
   - Main character(s)
   - Secondary characters
   - Location (lowest)

5. Max 6 refs selected (API supports up to 8)

6. Results cached per prompt text (no re-computation on regenerate)
```

Pre-picked refs are shown in the UI next to each shot **before** the user clicks Generate.

---

## Stend → Project Synchronization

This is how the Pipeline Constructor connects to the real project.

### Activation

1. User builds/selects preset in Breakdown Studio
2. Clicks "Применить к проекту"
3. Preset saved to `breakdownConfig.activePipelinePreset` (Zustand store)

### Production Execution (`fincher.ts`)

- `runPipelinePreset(preset, scene, bible, style)` — runs the full pipeline with ForEach support
- Called from `StoryboardPanel.tsx` when user clicks breakdown button

### Prompt Priority

```typescript
// In generation and inspector:
const prompt = shot.imagePrompt || buildImagePrompt(shot);
```

- If pipeline produced `imagePrompt` → use it (pipeline takes priority)
- If no pipeline → fallback to legacy `buildImagePrompt()`
- `buildScenePromptDrafts()` is **skipped entirely** when `activePipelinePreset` is set

### Re-breakdown

When user triggers re-breakdown on the storyboard, it runs the **exact same pipeline** as the Breakdown Studio test bench. There is no separate "production" pipeline — one system, two entry points.

---

## Bible → Director Integration

Located in `src/app/bible/page.tsx`, Director section.

```typescript
// src/store/breakdownConfig.ts
const BUILT_IN_PRODUCTION_PRESETS: PipelinePreset[] = [
  {
    id: "fincher",
    name: "David Fincher",
    description: "...",
    imageStyle: "cinematic-dark",
    directorPrompt: "...",
    pipeline: [ /* 5 modules */ ]
  },
  {
    id: "animation",
    name: "Анимация",
    description: "...",
    imageStyle: "animation",
    directorPrompt: "...",
    pipeline: [ /* 2 modules */ ]
  }
];
```

One click on a Director card in Bible → activates the full preset (image style + director prompt + pipeline modules).

**Adding a new preset:** Add an entry to `BUILT_IN_PRODUCTION_PRESETS`. That's it — the UI, pipeline engine, and project sync all pick it up automatically.

---

## Session Persistence

| Data | Storage | Mechanism |
|------|---------|-----------|
| Scene text, style, Bible text, preset ID | localStorage | Auto-save, debounced 1s |
| Bible images (characters, locations, props) | IndexedDB | `blobKey` per item, via `fileStorage.ts` |
| Generated shot images | IndexedDB | `blobKey` per shot |
| Shot generation history | In-memory | `Map<shotIndex, url[]>`, up to 20 versions |
| Pipeline node layout | localStorage | Saved with preset config |

On page reload: localStorage restores text state, then IndexedDB images load asynchronously.

---

## Key Constraints & Gotchas

| Constraint | Details |
|------------|---------|
| **Gemini content policy** | "Disney", "Pixar" and similar brand names are stripped from prompts before sending to Gemini |
| **Gemini rate limits** | ForEach uses `batch=1` for all Gemini models (serial per-shot execution) |
| **Optimal prompt length** | Nano Banana 2 works best with 200-350 character prompts |
| **Nano Banana 2** | = Gemini 2.5 Flash Image generation endpoint |
| **Ref image limit** | API accepts up to 8 reference images, we send max 6 |
| **Stale closures** | All `setBible` calls use functional updates (`prev => ...`) to avoid stale closure bugs |
| **Ref tracking** | `bibleRef` and `generatingShotsRef` used for `generateImage` to avoid stale state |

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/app/dev/breakdown-studio/page.tsx` | Pipeline Constructor UI (ReactFlow canvas, node editors, preset management) |
| `src/store/breakdownConfig.ts` | `PipelinePreset` type, `BUILT_IN_PRODUCTION_PRESETS`, Zustand store for active preset |
| `src/lib/fincher.ts` | `runPipelinePreset()` — production pipeline execution with ForEach |
| `src/components/editor/screenplay/StoryboardPanel.tsx` | Calls pipeline on breakdown, skips legacy promptBuilder when preset active |
| `src/components/ui/ImageEditOverlay.tsx` | AI image editing with reference attachment |
| `src/app/bible/page.tsx` | Director section with one-click preset activation |
| `src/store/bible.ts` | Bible Zustand store, director profiles |
| `src/lib/projectStyle.ts` | Image style presets (Fincher, Анимация, etc.) |
| `src/app/api/nano-banana/route.ts` | Image generation API route, ref limit = 8 |
| `src/lib/fileStorage.ts` | IndexedDB wrapper for blob storage |
