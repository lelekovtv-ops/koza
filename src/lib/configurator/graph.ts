import type {
  AiNodeMode,
  CompiledGeneratorRequest,
  CompiledPromptResult,
  ConfiguratorFlowEdge,
  ConfiguratorFlowNode,
  ConfiguratorNodeData,
  ConfiguratorTemplateId,
  ConfiguratorTemplateMeta,
} from "@/types/configurator"
import type { ImageGenModel } from "@/lib/pipeline/imageGenerator"
import { DEFAULT_KOZA_DIRECTING_SCENE } from "@/lib/configurator/kozaDirectingMvp"

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function splitDetailText(value: string): string[] {
  return value
    .split(/\n|;|•|\u2022|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value
  }

  return `${value.slice(0, limit).trimEnd()}...`
}

function buildIncomingEdgeMap(edges: ConfiguratorFlowEdge[]) {
  const incoming = new Map<string, ConfiguratorFlowEdge[]>()

  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? []
    list.push(edge)
    incoming.set(edge.target, list)
  }

  return incoming
}

function resolveOrderedSources(
  outputId: string,
  nodes: ConfiguratorFlowNode[],
  edges: ConfiguratorFlowEdge[],
): ConfiguratorFlowNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incoming = buildIncomingEdgeMap(edges)
  const visited = new Set<string>()
  const ordered: string[] = []

  function visit(nodeId: string) {
    if (visited.has(nodeId)) {
      return
    }

    visited.add(nodeId)

    const sources = (incoming.get(nodeId) ?? []).slice().sort((left, right) => left.id.localeCompare(right.id))
    for (const edge of sources) {
      visit(edge.source)
    }

    ordered.push(nodeId)
  }

  visit(outputId)

  return ordered
    .filter((nodeId) => nodeId !== outputId)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is ConfiguratorFlowNode => Boolean(node))
}

function describeAiMode(mode: AiNodeMode): string {
  switch (mode) {
    case "detail_guard":
      return "locks continuity and concrete details"
    case "style_director":
      return "adds visual language and tone"
    case "merge":
      return "merges sources into one coherent brief"
    case "rewrite":
      return "rewrites the brief into a cleaner final prompt"
  }
}

function buildPhotoSentence(caption: string, details: string[]): string {
  if (!caption && details.length === 0) {
    return ""
  }

  const parts: string[] = []

  if (caption) {
    parts.push(`Reference photo anchor: ${caption}.`)
  }

  if (details.length > 0) {
    parts.push(`Preserve visible details from the reference: ${details.join("; ")}.`)
  }

  return parts.join(" ")
}

function buildAiSentence(roleLabel: string, mode: AiNodeMode, instruction: string): string {
  const role = roleLabel.trim() || "AI node"
  const detail = instruction.trim()

  if (!detail) {
    return `${role}: ${describeAiMode(mode)}.`
  }

  return `${role}: ${describeAiMode(mode)}. ${detail}`
}

const BESSON_TEST_SCENE = `EXT. НАБЕРЕЖНАЯ СЕНЫ - ДЕНЬ
Яркий дневной свет. Легкий ветер. Солнце бликует на воде.
АНДРЕ сидит на краю набережной, смотрит вниз. Замкнутый.
Пауза.
АНЖЕЛА входит в кадр и садится рядом. Спокойно. Будто всегда была здесь.
Тишина.
АНЖЕЛА (смотрит на воду) Днем сложнее притворяться.
АНДРЕ (не глядя на нее) Почему?
Камера медленно выходит в общий полупрофиль. Свет мягко подчеркивает лица.
АНЖЕЛА Потому что все видно.
Мимо проходит лодка. Волны бьются о камень.
АНДРЕ (тихо) А если я не хочу видеть?
Анжела поворачивается к нему.
Легкая, понимающая улыбка.
АНЖЕЛА Ты уже смотришь.
Пауза.
Андре впервые поднимает на нее взгляд.
Без защиты. Просто тишина.
Звуки воды. Далекий город.
CUT TO BLACK.`

const BESSON_STYLE_RULES = `STYLE: ANGEL-A (LUC BESSON)
- black and white, high contrast
- soft daylight, slight overexposure
- minimal objects, a lot of emptiness
- reflections from water or glass as depth layer
- static or slow push / slow track
- no abrupt moves
- long takes feeling
- one shot = one micro action
- one shot = one emotion
- natural soft light, no dramatic effect lighting`

const BESSON_ANGELA_DESCRIPTION = `DIRECTOR AGENT
- base state: calm, control
- energy: stable, slowed down
- always looks directly, without tension
- movements are minimal and precise
- pauses are intentional
- reacts without emotional spikes
- never rushes`

const BESSON_ANGELA_DETAILS = `Character consistency details
- calm face
- clean silhouette
- controlled posture
- minimal gestures
- soft presence in frame`

const BESSON_ANDRE_DESCRIPTION = `DIRECTOR AGENT
- base state: anxiety and inner pressure
- energy: twitchy, then slows down
- avoids direct eye contact
- looks down or aside
- body slightly compressed
- reactions come with delay
- arc: resistance to quiet acceptance`

const BESSON_ANDRE_DETAILS = `Character consistency details
- slim and slightly neglected
- simple wrinkled dark clothes
- matte textures
- tired face with light shadows under the eyes
- natural unstyled hair`

const BESSON_LOCATION_DETAILS = `Location lock
- Seine embankment in Paris
- stone riverside edge
- bright daytime reflections on water
- bridge or stable city structure in the background
- wide air around the characters`

const BESSON_CONSISTENCY_RULES = `ROLE
Collect one unified image prompt for each shot while preserving full spatial continuity.
GLOBAL SCENE MEMORY
- lock location, architecture, surrounding structure, time, light, background, props, and character positions
SPATIAL LOCK
- every prompt must describe LEFT, RIGHT, CENTER, BACKGROUND, FOREGROUND
CAMERA DEFINITION
- always specify angle, height, distance, movement feel
ACTION CONTINUITY
- continue the previous action, do not restart it
LIGHT LOCK
- keep one stable phrase for light and black-and-white contrast
OUTPUT FORMAT
- write each image_prompt as a final still-image prompt for an image model, not as a filmmaking memo
- describe only what is visible in the current frame
- never mention future action, future entrances, future cuts, or placeholders for later characters
- avoid wording like "for future character entrance", "camera should", "we see", "next shot", "then", "meanwhile"
- prioritize subject, pose, frame geography, light, and background continuity over abstract interpretation`

export const CONFIGURATOR_TEMPLATES: ConfiguratorTemplateMeta[] = [
  {
    id: "default_directing",
    label: "Default Directing",
    description: "Script -> scene breakdown -> prompt pack -> per-shot generation. Minimal default workflow tied to Bible and directing context.",
  },
  {
    id: "scene_to_image",
    label: "Scene to Image",
    description: "Самый простой пользовательский флоу: prompt -> ai -> generator -> output.",
  },
  {
    id: "reference_lock",
    label: "Reference Lock",
    description: "Сначала фиксируем детали фото, потом объединяем их с текстом и отправляем в generator.",
  },
  {
    id: "pipeline_blueprint",
    label: "Pipeline Blueprint",
    description: "Черновая граф-схема всех важных стадий текущего pipeline, но уже в node-based виде.",
  },
  {
    id: "koza_scene_to_directing_mvp",
    label: "KOZA Directing MVP",
    description: "Scene-to-Directing preset: beats, scene details, director prompts, cinematography prompts и финальный ScenePacket.",
  },
  {
    id: "template_777",
    label: "777",
    description: "Pre-prompt сборка: история, сцена, контекст, смысл, структура, детали и финальное режиссерское видение без prompt-узлов.",
  },
  {
    id: "test_luc_besson",
    label: "Тест ЛЮК БЕССОН",
    description: "Сценарий -> shot breakdown в эстетике Angel-A -> IMAGE PROMPT CONSISTENCY BUILDER -> отдельные shot prompt и generator nodes.",
  },
]

function createNode(
  id: string,
  x: number,
  y: number,
  data: ConfiguratorNodeData,
): ConfiguratorFlowNode {
  return {
    id,
    type: "configNode",
    position: { x, y },
    data,
  }
}

function createEdge(source: string, target: string, label: string): ConfiguratorFlowEdge {
  return { id: makeId("edge"), source, target, label, animated: false }
}

export function createDefaultConfiguratorGraph(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  return createConfiguratorTemplate("default_directing")
}

export function createConfiguratorTemplate(templateId: ConfiguratorTemplateId): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  switch (templateId) {
    case "default_directing":
      return createDefaultDirectingTemplate()
    case "scene_to_image":
      return createSceneToImageTemplate()
    case "reference_lock":
      return createReferenceLockTemplate()
    case "pipeline_blueprint":
      return createPipelineBlueprintTemplate()
    case "koza_scene_to_directing_mvp":
      return createKozaSceneToDirectingTemplate()
    case "template_777":
      return createTemplate777()
    case "test_luc_besson":
      return createLucBessonTestTemplate()
  }
}

function createDefaultDirectingTemplate(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const sceneInputId = makeId("prompt")
  const directorVisionId = makeId("prompt")
  const characterBibleId = makeId("prompt")
  const locationBibleId = makeId("prompt")
  const sceneBreakdownId = makeId("ai")
  const breakdownOutputId = makeId("output")
  const promptComposerId = makeId("ai")
  const promptOutputId = makeId("output")
  const generatorId = makeId("generator")
  const generatorOutputId = makeId("output")

  return {
    nodes: [
      createNode(sceneInputId, 60, 360, {
        kind: "prompt",
        title: "Scene Script",
        promptText: "RAW SCENE: current scene from screenplay.",
        detailHints: "scene raw text; scene boundaries; visible actions",
        binding: "scene.raw",
      }),
      createNode(directorVisionId, 60, 140, {
        kind: "prompt",
        title: "Director Vision",
        promptText: "Director vision and staging rules from Bible.",
        detailHints: "directorial intent; emotional axis; staging rules",
        binding: "bible.directorVision",
      }),
      createNode(characterBibleId, 60, 560, {
        kind: "prompt",
        title: "Characters",
        promptText: "Character bible entries for the selected scene.",
        detailHints: "identity; wardrobe; physical continuity; character references",
        binding: "bible.characters",
      }),
      createNode(locationBibleId, 60, 760, {
        kind: "prompt",
        title: "Location",
        promptText: "Location bible entries for the selected scene.",
        detailHints: "space; environment continuity; location references",
        binding: "bible.locations",
      }),
      createNode(sceneBreakdownId, 430, 360, {
        kind: "ai",
        title: "Stage 1: Scene Breakdown",
        roleLabel: "Scene Breakdown",
        mode: "merge",
        instruction: "Split the scene into shots with action, director vision, and camera vision. Keep the breakdown grounded in the screenplay and scene context.",
      }),
      createNode(breakdownOutputId, 810, 360, {
        kind: "output",
        title: "Shot Breakdown Output",
      }),
      createNode(promptComposerId, 1170, 360, {
        kind: "ai",
        title: "Stage 2: Prompt Composer",
        roleLabel: "Prompt Composer",
        mode: "detail_guard",
        instruction: "Collect shot action, director notes, camera notes, bible character anchors, location anchors, and preserve frame geography, body positions, props, and background continuity across the scene.",
      }),
      createNode(promptOutputId, 1540, 360, {
        kind: "output",
        title: "Prompt Pack Output",
      }),
      createNode(generatorId, 1900, 250, {
        kind: "generator",
        title: "Stage 3: Shot Generator",
        system: "nano-banana-2",
      }),
      createNode(generatorOutputId, 1900, 470, {
        kind: "output",
        title: "Generated Shot Output",
      }),
    ],
    edges: [
      createEdge(sceneInputId, sceneBreakdownId, "scene"),
      createEdge(directorVisionId, sceneBreakdownId, "vision"),
      createEdge(characterBibleId, sceneBreakdownId, "characters"),
      createEdge(locationBibleId, sceneBreakdownId, "location"),
      createEdge(sceneBreakdownId, breakdownOutputId, "shot pack"),
      createEdge(sceneBreakdownId, promptComposerId, "shots"),
      createEdge(directorVisionId, promptComposerId, "vision"),
      createEdge(characterBibleId, promptComposerId, "character anchors"),
      createEdge(locationBibleId, promptComposerId, "location anchors"),
      createEdge(promptComposerId, promptOutputId, "prompt pack"),
      createEdge(promptComposerId, generatorId, "generation prompt"),
      createEdge(generatorId, generatorOutputId, "image"),
    ],
  }
}

function createTemplate777(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const storyHistoryId = makeId("prompt")
  const characterBibleId = makeId("prompt")
  const locationBibleId = makeId("prompt")
  const sceneInputId = makeId("prompt")
  const parserId = makeId("ai")
  const enricherId = makeId("ai")
  const expansionId = makeId("ai")
  const creativeId = makeId("ai")
  const meaningId = makeId("ai")
  const structureId = makeId("ai")
  const sensorId = makeId("ai")
  const detailsId = makeId("ai")
  const directorVisionId = makeId("ai")
  const outputId = makeId("output")

  return {
    nodes: [
      createNode(storyHistoryId, 80, 140, {
        kind: "prompt",
        title: "Story History",
        promptText: "Story history and dramatic context from Bible.",
        detailHints: "dramatic continuity; world history; what happened before the scene",
      }),
      createNode(characterBibleId, 80, 340, {
        kind: "prompt",
        title: "Character Bible",
        promptText: "Character bible JSON or notes.",
        detailHints: "character context; recurring identities; behavior patterns",
      }),
      createNode(locationBibleId, 80, 540, {
        kind: "prompt",
        title: "Location Bible",
        promptText: "Location bible JSON or notes.",
        detailHints: "location context; recurring place rules; continuity anchors",
      }),
      createNode(sceneInputId, 80, 760, {
        kind: "prompt",
        title: "SceneInput",
        promptText: DEFAULT_KOZA_DIRECTING_SCENE,
        detailHints: "scene_id; raw_scene; visible facts; no story changes",
      }),
      createNode(parserId, 460, 760, {
        kind: "ai",
        title: "SceneParserNode",
        roleLabel: "Scene Parser",
        mode: "merge",
        instruction: "Parse raw scene into a concrete JSON scene breakdown with visible actions, mood, objects and framing hints.",
      }),
      createNode(enricherId, 860, 560, {
        kind: "ai",
        title: "ContextEnricherNode",
        roleLabel: "Context Enricher",
        mode: "detail_guard",
        instruction: "Merge parsed scene with story history, character bible and location bible. Return character_context, location_context, constraints and continuity anchors.",
      }),
      createNode(expansionId, 1240, 560, {
        kind: "ai",
        title: "LiteraryExpansionNode",
        roleLabel: "Literary Expander",
        mode: "rewrite",
        instruction: "Expand the scene atmospherically without changing facts. Preserve continuity from story history.",
      }),
      createNode(creativeId, 1640, 180, {
        kind: "ai",
        title: "CreativeNode",
        roleLabel: "Creative Node",
        mode: "style_director",
        instruction: "Propose cinematic entry points, visual tension and spatial ideas grounded in the scene and context.",
      }),
      createNode(meaningId, 1640, 420, {
        kind: "ai",
        title: "MeaningNode",
        roleLabel: "Meaning Node",
        mode: "merge",
        instruction: "Extract the scene meaning, tension and emerging directorial focus from expanded scene plus story history.",
      }),
      createNode(structureId, 1640, 660, {
        kind: "ai",
        title: "DirectingStructureNode",
        roleLabel: "Directing Structure",
        mode: "merge",
        instruction: "Break the expanded scene into beats with purpose, content and emphasis.",
      }),
      createNode(sensorId, 2040, 420, {
        kind: "ai",
        title: "SensorSynthesizerNode",
        roleLabel: "Sensor Synthesizer",
        mode: "detail_guard",
        instruction: "Resolve conflicts between creative, meaning and structure. Keep only ideas that match scene logic and continuity.",
      }),
      createNode(detailsId, 2460, 280, {
        kind: "ai",
        title: "SceneDetailsNode",
        roleLabel: "Scene Details",
        mode: "detail_guard",
        instruction: "Generate blocking, environment details and continuity anchors from parsed scene, context and synthesis.",
      }),
      createNode(directorVisionId, 2460, 620, {
        kind: "ai",
        title: "DirectorVisionNode",
        roleLabel: "Director Vision",
        mode: "merge",
        instruction: "Synthesize meaning, beats, details, atmosphere and continuity into one directorial vision packet with philosophy, emotional axis, staging principles, visual rules and a shot-by-shot directing breakdown. Do not generate image or video prompts.",
      }),
      createNode(outputId, 2880, 620, {
        kind: "output",
        title: "Director Vision Output",
      }),
    ],
    edges: [
      createEdge(sceneInputId, parserId, "raw_scene"),
      createEdge(storyHistoryId, enricherId, "story history"),
      createEdge(characterBibleId, enricherId, "character bible"),
      createEdge(locationBibleId, enricherId, "location bible"),
      createEdge(parserId, enricherId, "parsed_scene"),
      createEdge(sceneInputId, expansionId, "raw_scene"),
      createEdge(storyHistoryId, expansionId, "story history"),
      createEdge(enricherId, expansionId, "context"),
      createEdge(expansionId, creativeId, "expanded_scene"),
      createEdge(expansionId, meaningId, "expanded_scene"),
      createEdge(storyHistoryId, meaningId, "story history"),
      createEdge(expansionId, structureId, "expanded_scene"),
      createEdge(storyHistoryId, structureId, "story history"),
      createEdge(creativeId, sensorId, "creative"),
      createEdge(meaningId, sensorId, "meaning"),
      createEdge(structureId, sensorId, "structure"),
      createEdge(enricherId, sensorId, "context"),
      createEdge(sensorId, detailsId, "synthesis"),
      createEdge(parserId, detailsId, "parsed_scene"),
      createEdge(enricherId, detailsId, "context"),
      createEdge(creativeId, directorVisionId, "creative"),
      createEdge(meaningId, directorVisionId, "meaning"),
      createEdge(structureId, directorVisionId, "beats"),
      createEdge(sensorId, directorVisionId, "synthesis"),
      createEdge(detailsId, directorVisionId, "details"),
      createEdge(storyHistoryId, directorVisionId, "story history"),
      createEdge(directorVisionId, outputId, "director vision packet"),
    ],
  }
}

function createKozaSceneToDirectingTemplate(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const sceneInputId = makeId("prompt")
  const storyHistoryId = makeId("prompt")
  const directorVisionId = makeId("prompt")
  const characterBibleId = makeId("prompt")
  const locationBibleId = makeId("prompt")
  const imageDescriptorsId = makeId("prompt")
  const characterReferenceId = makeId("photo")
  const locationReferenceId = makeId("photo")
  const parserId = makeId("ai")
  const enricherId = makeId("ai")
  const expansionId = makeId("ai")
  const creativeId = makeId("ai")
  const meaningId = makeId("ai")
  const structureId = makeId("ai")
  const sensorId = makeId("ai")
  const detailsId = makeId("ai")
  const directorPromptId = makeId("ai")
  const cinematographyPromptId = makeId("ai")
  const finalPackagingId = makeId("ai")
  const outputId = makeId("output")

  return {
    nodes: [
      createNode(sceneInputId, 40, 260, {
        kind: "prompt",
        title: "SceneInput",
        promptText: "RAW SCENE: insert raw scene text here.",
        detailHints: "scene_id; raw_scene; do not change meaning",
      }),
      createNode(storyHistoryId, 40, 40, {
        kind: "prompt",
        title: "Story History",
        promptText: "Story history and dramatic context from Bible.",
        detailHints: "world history; dramatic continuity; what happened before this scene",
      }),
      createNode(directorVisionId, 40, 150, {
        kind: "prompt",
        title: "Director Vision",
        promptText: "Director vision and film philosophy from Bible.",
        detailHints: "film philosophy; emotional lens; ethics of framing; directorial rules",
      }),
      createNode(characterBibleId, 40, 380, {
        kind: "prompt",
        title: "Character Bible",
        promptText: "Character bible JSON or notes.",
        detailHints: "character context; recurring identities; constraints",
      }),
      createNode(locationBibleId, 40, 600, {
        kind: "prompt",
        title: "Location Bible",
        promptText: "Location bible JSON or notes.",
        detailHints: "location context; recurring places; continuity anchors",
      }),
      createNode(imageDescriptorsId, 40, 820, {
        kind: "prompt",
        title: "Image Descriptors",
        promptText: "Image descriptors or style reference JSON.",
        detailHints: "style context; image descriptors; visual tone",
      }),
      createNode(characterReferenceId, 40, 1040, {
        kind: "photo",
        title: "Character Reference",
        imageUrl: "",
        caption: "Primary character reference from Bible.",
        lockedDetails: "face shape; wardrobe silhouette; age; texture; posture",
      }),
      createNode(locationReferenceId, 40, 1280, {
        kind: "photo",
        title: "Location Reference",
        imageUrl: "",
        caption: "Primary location reference from Bible.",
        lockedDetails: "architecture; props; palette; weathering; spatial depth",
      }),
      createNode(parserId, 320, 260, {
        kind: "ai",
        title: "SceneParserNode",
        roleLabel: "Scene Parser",
        mode: "merge",
        instruction: "Input raw_scene. Output JSON with scene_heading, characters, actions, dialogue, objects, sound_cues, mood, framing_hints.",
      }),
      createNode(enricherId, 600, 260, {
        kind: "ai",
        title: "ContextEnricherNode",
        roleLabel: "Context Enricher",
        mode: "detail_guard",
        instruction: "Input parsed_scene plus story history, character bible, location bible, image descriptors. Output JSON with character_context, location_context, style_context. Context is mandatory.",
      }),
      createNode(expansionId, 880, 260, {
        kind: "ai",
        title: "LiteraryExpansionNode",
        roleLabel: "Literary Expander",
        mode: "rewrite",
        instruction: "Input raw_scene, parsed_scene, context, story history. Output expanded_scene in 1-3 paragraphs. Do not change meaning, only strengthen atmosphere and continuity.",
      }),
      createNode(creativeId, 1180, 60, {
        kind: "ai",
        title: "CreativeNode",
        roleLabel: "Creative Node",
        mode: "style_director",
        instruction: "Input expanded_scene and director vision. Output JSON with creative_entry_points, visual_unexpected_choices, camera_ideas. Every idea must follow the film philosophy.",
      }),
      createNode(meaningId, 1180, 260, {
        kind: "ai",
        title: "MeaningNode",
        roleLabel: "Meaning Node",
        mode: "merge",
        instruction: "Input expanded_scene, story history, and director vision. Output JSON with core_meaning, main_tension, viewer_effect, directorial_focus.",
      }),
      createNode(structureId, 1180, 460, {
        kind: "ai",
        title: "DirectingStructureNode",
        roleLabel: "Directing Structure",
        mode: "merge",
        instruction: "Input expanded_scene, story history, and director vision. Output beats JSON where each beat contains id, purpose, content.",
      }),
      createNode(sensorId, 1480, 260, {
        kind: "ai",
        title: "SensorSynthesizerNode",
        roleLabel: "Sensor Synthesizer",
        mode: "detail_guard",
        instruction: "Input creative, meaning, structure, context, and director vision. Output scene_core, approved_visual_logic, approved_creative, rejected. This is the main conflict filter and no prompts may be generated before this step.",
      }),
      createNode(detailsId, 1760, 140, {
        kind: "ai",
        title: "SceneDetailsNode",
        roleLabel: "Scene Details",
        mode: "detail_guard",
        instruction: "Input synthesis, parsed_scene, context. Output JSON with character_blocking, frame_objects, environment.",
      }),
      createNode(directorPromptId, 1760, 340, {
        kind: "ai",
        title: "DirectorPromptNode",
        roleLabel: "Director Prompt",
        mode: "merge",
        instruction: "Input structure, meaning, synthesis, and director vision. Output beat_id to director action prompt mapping.",
      }),
      createNode(cinematographyPromptId, 1760, 540, {
        kind: "ai",
        title: "CinematographyPromptNode",
        roleLabel: "Cinematography Prompt",
        mode: "merge",
        instruction: "Input structure, details, synthesis, and director vision. Output beat_id to cinematography action prompt mapping.",
      }),
      createNode(finalPackagingId, 2060, 340, {
        kind: "ai",
        title: "FinalPackagingNode",
        roleLabel: "Final Packaging",
        mode: "merge",
        instruction: "Package expanded_scene, story history, director vision, meaning, beats, details, director_prompts, cinematography_prompts, continuity rules, constraints into a single ScenePacket JSON.",
      }),
      createNode(outputId, 2360, 340, {
        kind: "output",
        title: "ScenePacket Output",
      }),
    ],
    edges: [
      createEdge(sceneInputId, parserId, "raw_scene"),
      createEdge(storyHistoryId, enricherId, "story history"),
      createEdge(parserId, enricherId, "parsed_scene"),
      createEdge(characterBibleId, enricherId, "character bible"),
      createEdge(locationBibleId, enricherId, "location bible"),
      createEdge(imageDescriptorsId, enricherId, "image descriptors"),
      createEdge(characterReferenceId, enricherId, "character reference"),
      createEdge(locationReferenceId, enricherId, "location reference"),
      createEdge(sceneInputId, expansionId, "raw_scene"),
      createEdge(storyHistoryId, expansionId, "story history"),
      createEdge(parserId, expansionId, "parsed_scene"),
      createEdge(enricherId, expansionId, "context"),
      createEdge(expansionId, creativeId, "expanded_scene"),
      createEdge(directorVisionId, creativeId, "director vision"),
      createEdge(expansionId, meaningId, "expanded_scene"),
      createEdge(storyHistoryId, meaningId, "story history"),
      createEdge(directorVisionId, meaningId, "director vision"),
      createEdge(expansionId, structureId, "expanded_scene"),
      createEdge(storyHistoryId, structureId, "story history"),
      createEdge(directorVisionId, structureId, "director vision"),
      createEdge(creativeId, sensorId, "creative"),
      createEdge(meaningId, sensorId, "meaning"),
      createEdge(structureId, sensorId, "structure"),
      createEdge(enricherId, sensorId, "context"),
      createEdge(directorVisionId, sensorId, "director vision"),
      createEdge(sensorId, detailsId, "synthesis"),
      createEdge(parserId, detailsId, "parsed_scene"),
      createEdge(enricherId, detailsId, "context"),
      createEdge(characterReferenceId, detailsId, "character reference"),
      createEdge(locationReferenceId, detailsId, "location reference"),
      createEdge(structureId, directorPromptId, "structure"),
      createEdge(meaningId, directorPromptId, "meaning"),
      createEdge(sensorId, directorPromptId, "synthesis"),
      createEdge(directorVisionId, directorPromptId, "director vision"),
      createEdge(structureId, cinematographyPromptId, "structure"),
      createEdge(detailsId, cinematographyPromptId, "details"),
      createEdge(sensorId, cinematographyPromptId, "synthesis"),
      createEdge(directorVisionId, cinematographyPromptId, "director vision"),
      createEdge(expansionId, finalPackagingId, "expanded_scene"),
      createEdge(storyHistoryId, finalPackagingId, "story history"),
      createEdge(directorVisionId, finalPackagingId, "director vision"),
      createEdge(meaningId, finalPackagingId, "meaning"),
      createEdge(structureId, finalPackagingId, "beats"),
      createEdge(detailsId, finalPackagingId, "details"),
      createEdge(directorPromptId, finalPackagingId, "director_prompts"),
      createEdge(cinematographyPromptId, finalPackagingId, "cinematography_prompts"),
      createEdge(sensorId, finalPackagingId, "continuity + constraints"),
      createEdge(finalPackagingId, outputId, "scene packet"),
    ],
  }
}

function createSceneToImageTemplate(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const promptId = makeId("prompt")
  const aiId = makeId("ai")
  const generatorId = makeId("generator")
  const outputId = makeId("output")

  return {
    nodes: [
      createNode(promptId, 40, 240, {
        kind: "prompt",
        title: "Scene Brief",
        promptText: "Interior, tired writer wakes up at a cluttered table while sunrise cuts through dusty blinds.",
        detailHints: "ashtray; old script pages; cracked walls; warm sunrise",
      }),
      createNode(aiId, 390, 240, {
        kind: "ai",
        title: "Prompt Structurer",
        roleLabel: "Prompt AI",
        mode: "merge",
        instruction: "Turn the scene into a clean cinematic image prompt while preserving all concrete physical details.",
      }),
      createNode(generatorId, 760, 150, {
        kind: "generator",
        title: "Image Generator",
        system: "gpt-image",
      }),
      createNode(outputId, 760, 360, {
        kind: "output",
        title: "Readable Prompt",
      }),
    ],
    edges: [
      createEdge(promptId, aiId, "scene text"),
      createEdge(aiId, generatorId, "generation prompt"),
      createEdge(aiId, outputId, "prompt packet"),
    ],
  }
}

function createReferenceLockTemplate(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const promptId = makeId("prompt")
  const photoId = makeId("photo")
  const aiId = makeId("ai")
  const generatorId = makeId("generator")
  const outputId = makeId("output")

  return {
    nodes: [
      createNode(promptId, 40, 160, {
          kind: "prompt",
          title: "Scene Brief",
          promptText: "A tired man wakes up at a cluttered kitchen table at sunrise, cigarette smoke hanging in the room, dusty blinds cutting warm light across the walls.",
          detailHints: "cracked walls; full ashtray; yellow sunrise through blinds; scattered script pages",
        }),
      createNode(photoId, 40, 380, {
          kind: "photo",
          title: "Reference Photo",
          imageUrl: "",
          caption: "Use this node for a face, costume, prop, or location reference.",
          lockedDetails: "do not alter wardrobe silhouette; preserve wall texture; preserve prop placement",
        }),
      createNode(aiId, 390, 240, {
          kind: "ai",
          title: "Detail Keeper",
          roleLabel: "Continuity AI",
          mode: "detail_guard",
          instruction: "Turn all incoming detail anchors into non-negotiable constraints. Do not let style override concrete wardrobe, prop, lighting, or spatial facts.",
        }),
      createNode(generatorId, 780, 120, {
        kind: "generator",
        title: "Image Generator",
        system: "nano-banana",
      }),
      createNode(outputId, 780, 340, {
          kind: "output",
          title: "Final Prompt",
        }),
    ],
    edges: [
      createEdge(promptId, aiId, "scene text"),
      createEdge(photoId, aiId, "detail anchor"),
      createEdge(aiId, generatorId, "generation prompt"),
      createEdge(aiId, outputId, "prompt packet"),
    ],
  }
}

function createPipelineBlueprintTemplate(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const promptId = makeId("prompt")
  const sceneAnalystId = makeId("ai")
  const actionSplitterId = makeId("ai")
  const contextRouterId = makeId("ai")
  const creativePlannerId = makeId("ai")
  const censorId = makeId("ai")
  const shotPlannerId = makeId("ai")
  const continuityId = makeId("ai")
  const composerId = makeId("ai")
  const optimizerId = makeId("ai")
  const generatorId = makeId("generator")
  const outputId = makeId("output")

  return {
    nodes: [
      createNode(promptId, 40, 260, {
        kind: "prompt",
        title: "Scene Input",
        promptText: "Paste screenplay scene text here.",
        detailHints: "optional style hints; story pressure; locked narrative details",
      }),
      createNode(sceneAnalystId, 320, 80, {
        kind: "ai",
        title: "Scene Analyst",
        roleLabel: "Scene Analyst",
        mode: "merge",
        instruction: "Extract dramatic beats, emotional tone, geography, characters, and what matters visually.",
      }),
      createNode(actionSplitterId, 320, 240, {
        kind: "ai",
        title: "Action Splitter",
        roleLabel: "Action Splitter",
        mode: "merge",
        instruction: "Break the scene into visible, filmable actions that can become shots.",
      }),
      createNode(contextRouterId, 320, 400, {
        kind: "ai",
        title: "Context Router",
        roleLabel: "Context Router",
        mode: "detail_guard",
        instruction: "Route location anchors, offscreen pressure, props, and environment transitions into downstream prompts.",
      }),
      createNode(creativePlannerId, 640, 80, {
        kind: "ai",
        title: "Creative Planner",
        roleLabel: "Creative Planner",
        mode: "style_director",
        instruction: "Propose uncommon camera logic and visual hooks without breaking story intent.",
      }),
      createNode(censorId, 640, 240, {
        kind: "ai",
        title: "Censor",
        roleLabel: "Censor",
        mode: "detail_guard",
        instruction: "Reject decorative ideas that weaken genre, meaning, or scene logic.",
      }),
      createNode(shotPlannerId, 640, 400, {
        kind: "ai",
        title: "Shot Planner",
        roleLabel: "Shot Planner",
        mode: "merge",
        instruction: "Turn actions into shots with framing, blocking, and visual progression.",
      }),
      createNode(continuityId, 960, 140, {
        kind: "ai",
        title: "Continuity Supervisor",
        roleLabel: "Continuity Supervisor",
        mode: "detail_guard",
        instruction: "Track what must remain identical or evolve from one shot to the next.",
      }),
      createNode(composerId, 960, 300, {
        kind: "ai",
        title: "Prompt Composer",
        roleLabel: "Prompt Composer",
        mode: "merge",
        instruction: "Assemble shot logic, continuity, environment and detail locks into final image prompts.",
      }),
      createNode(optimizerId, 960, 460, {
        kind: "ai",
        title: "Prompt Optimizer",
        roleLabel: "Prompt Optimizer",
        mode: "rewrite",
        instruction: "Compress prompt bloat, preserve canon, and prepare a cleaner generation prompt.",
      }),
      createNode(generatorId, 1270, 220, {
        kind: "generator",
        title: "Image Generator",
        system: "gpt-image",
      }),
      createNode(outputId, 1270, 420, {
        kind: "output",
        title: "Readable Final Prompt",
      }),
    ],
    edges: [
      createEdge(promptId, sceneAnalystId, "scene text"),
      createEdge(promptId, actionSplitterId, "scene text"),
      createEdge(promptId, contextRouterId, "scene text"),
      createEdge(sceneAnalystId, creativePlannerId, "dramatic analysis"),
      createEdge(actionSplitterId, shotPlannerId, "filmable actions"),
      createEdge(contextRouterId, shotPlannerId, "environment routing"),
      createEdge(creativePlannerId, censorId, "creative options"),
      createEdge(censorId, shotPlannerId, "approved directions"),
      createEdge(shotPlannerId, continuityId, "shot plan"),
      createEdge(contextRouterId, composerId, "world details"),
      createEdge(continuityId, composerId, "continuity memory"),
      createEdge(shotPlannerId, composerId, "shot specs"),
      createEdge(composerId, optimizerId, "raw prompts"),
      createEdge(optimizerId, generatorId, "generation prompt"),
      createEdge(optimizerId, outputId, "prompt packet"),
    ],
  }
}

export function canConnectNodes(sourceData: ConfiguratorNodeData, targetData: ConfiguratorNodeData): boolean {
  if (sourceData.kind === "output" || sourceData.kind === "generator") {
    return false
  }

  if (targetData.kind === "photo" || targetData.kind === "prompt") {
    return false
  }

  return true
}

export function buildConnectionLabel(sourceData: ConfiguratorNodeData, targetData: ConfiguratorNodeData): string {
  if (sourceData.kind === "photo") {
    return targetData.kind === "generator" ? "reference image" : "detail anchor"
  }

  if (sourceData.kind === "prompt") {
    return targetData.kind === "generator" ? "prompt fragment" : "scene text"
  }

  if (sourceData.kind === "ai") {
    if (targetData.kind === "generator") {
      return "generation prompt"
    }

    return targetData.kind === "output" ? "prompt packet" : "transform"
  }

  return "flow"
}

export function compileGeneratorFromGraph(
  system: ImageGenModel,
  outputId: string,
  nodes: ConfiguratorFlowNode[],
  edges: ConfiguratorFlowEdge[],
): CompiledGeneratorRequest {
  const compiledPrompt = compilePromptFromGraph(outputId, nodes, edges)

  return {
    system,
    prompt: compiledPrompt.finalPrompt,
    warnings: compiledPrompt.warnings,
    sourceNodeIds: compiledPrompt.sourceNodeIds,
  }
}

function createLucBessonTestTemplate(): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const sceneId = makeId("prompt")
  const styleId = makeId("prompt")
  const angelaId = makeId("prompt")
  const angelaDetailsId = makeId("prompt")
  const andreId = makeId("prompt")
  const andreDetailsId = makeId("prompt")
  const locationId = makeId("prompt")
  const angelaPhotoId = makeId("photo")
  const angelaPortraitPhotoId = makeId("photo")
  const andrePhotoId = makeId("photo")
  const seineWidePhotoId = makeId("photo")
  const seineBridgePhotoId = makeId("photo")
  const shotPlannerId = makeId("ai")
  const shotOutputId = makeId("output")
  const consistencyBuilderId = makeId("ai")
  const consistencyOutputId = makeId("output")
  const refDistributorId = makeId("ai")
  const refDistributorOutputId = makeId("output")

  return {
    nodes: [
      createNode(sceneId, 80, 720, {
        kind: "prompt",
        title: "Сценарий",
        promptText: BESSON_TEST_SCENE,
        detailHints: "raw scene text for shot breakdown",
      }),
      createNode(styleId, 80, 80, {
        kind: "prompt",
        title: "Стиль правил Люка Бессона",
        promptText: BESSON_STYLE_RULES,
        detailHints: "Angel-A visual, camera, composition, editing, emotion, light rules",
      }),
      createNode(angelaId, 80, 250, {
        kind: "prompt",
        title: "описание Персонаж Ангел А",
        promptText: BESSON_ANGELA_DESCRIPTION,
        detailHints: "behavior, energy, gaze, pauses",
      }),
      createNode(angelaDetailsId, 80, 410, {
        kind: "prompt",
        title: "Детали Ангел А для консистенции",
        promptText: BESSON_ANGELA_DETAILS,
        detailHints: "visual consistency details",
      }),
      createNode(andreId, 80, 1010, {
        kind: "prompt",
        title: "описание Персонаж Андреа",
        promptText: BESSON_ANDRE_DESCRIPTION,
        detailHints: "behavior, anxiety, movement, arc",
      }),
      createNode(andreDetailsId, 80, 1170, {
        kind: "prompt",
        title: "детали Андреа для консистенции",
        promptText: BESSON_ANDRE_DETAILS,
        detailHints: "visual continuity for costume, face, posture",
      }),
      createNode(locationId, 80, 560, {
        kind: "prompt",
        title: "локация",
        promptText: BESSON_LOCATION_DETAILS,
        detailHints: "scene base, background structure, fixed environment",
      }),
      createNode(angelaPhotoId, 80, 1520, {
        kind: "photo",
        title: "Ангел А",
        imageUrl: "",
        caption: "Bible photo node for Angela A.",
        lockedDetails: "same face, same silhouette, same calm presence",
      }),
      createNode(angelaPortraitPhotoId, 350, 1520, {
        kind: "photo",
        title: "Ангел А close-up",
        imageUrl: "",
        caption: "Close portrait reference for Angela A.",
        lockedDetails: "same haircut, same facial proportions, same pearl necklace, same calm direct gaze",
      }),
      createNode(andrePhotoId, 80, 1760, {
        kind: "photo",
        title: "Андреа",
        imageUrl: "",
        caption: "Bible photo node for Andrea.",
        lockedDetails: "same face, same wardrobe, same tired expression",
      }),
      createNode(seineWidePhotoId, 350, 1760, {
        kind: "photo",
        title: "Набережная Сены wide",
        imageUrl: "",
        caption: "Wide Seine embankment and bridge atmosphere reference.",
        lockedDetails: "same bridge silhouettes, same water reflections, same bright hazy daylight, same Paris embankment scale",
      }),
      createNode(seineBridgePhotoId, 350, 2000, {
        kind: "photo",
        title: "Мост Сены detail",
        imageUrl: "",
        caption: "Bridge and river geometry reference for continuity.",
        lockedDetails: "same stone bridge rhythm, same arches, same river texture, same soft overexposed black and white daylight",
      }),
      createNode(shotPlannerId, 520, 760, {
        kind: "ai",
        title: "BessonShotPlannerNode",
        roleLabel: "Shot Planner",
        mode: "merge",
        instruction: "Use the screenplay, character descriptions, character consistency details, location lock, and Luc Besson style rules to split the scene into shots. Each shot must contain short action, directorial intent, and operator vision.",
      }),
      createNode(shotOutputId, 920, 760, {
        kind: "output",
        title: "Besson Shot Output",
      }),
      createNode(consistencyBuilderId, 1320, 760, {
        kind: "ai",
        title: "NODE: IMAGE PROMPT CONSISTENCY BUILDER",
        roleLabel: "Image Prompt Consistency Builder",
        mode: "detail_guard",
        instruction: BESSON_CONSISTENCY_RULES,
      }),
      createNode(consistencyOutputId, 1720, 760, {
        kind: "output",
        title: "Besson Prompt Pack Output",
      }),
      createNode(refDistributorId, 2040, 760, {
        kind: "ai",
        title: "REF DISTRIBUTOR",
        roleLabel: "РАСПРЕДЕЛЯТОР РЕФЕРЕНСОВ",
        mode: "detail_guard",
        instruction: "Using the final shot prompts plus uploaded photo refs, decide which references belong to each shot and how many refs the generator should receive. Output shot-level reference assignments only.",
      }),
      createNode(refDistributorOutputId, 2360, 760, {
        kind: "output",
        title: "REF DISTRIBUTOR Output",
      }),
    ],
    edges: [
      createEdge(sceneId, shotPlannerId, "screenplay"),
      createEdge(styleId, shotPlannerId, "style rules"),
      createEdge(angelaId, shotPlannerId, "Angela A"),
      createEdge(angelaDetailsId, shotPlannerId, "Angela details"),
      createEdge(andreId, shotPlannerId, "Andrea"),
      createEdge(andreDetailsId, shotPlannerId, "Andrea details"),
      createEdge(locationId, shotPlannerId, "location"),
      createEdge(shotPlannerId, shotOutputId, "shot breakdown"),
      createEdge(shotPlannerId, consistencyBuilderId, "shot nodes"),
      createEdge(styleId, consistencyBuilderId, "style lock"),
      createEdge(angelaDetailsId, consistencyBuilderId, "Angela consistency"),
      createEdge(andreDetailsId, consistencyBuilderId, "Andrea consistency"),
      createEdge(locationId, consistencyBuilderId, "location lock"),
      createEdge(consistencyBuilderId, consistencyOutputId, "image prompts"),
      createEdge(consistencyBuilderId, refDistributorId, "final prompts"),
      createEdge(angelaPhotoId, refDistributorId, "Angela photo"),
      createEdge(angelaPortraitPhotoId, refDistributorId, "Angela portrait photo"),
      createEdge(andrePhotoId, refDistributorId, "Andrea photo"),
      createEdge(seineWidePhotoId, refDistributorId, "Seine wide photo"),
      createEdge(seineBridgePhotoId, refDistributorId, "Seine bridge photo"),
      createEdge(locationId, refDistributorId, "location lock"),
      createEdge(refDistributorId, refDistributorOutputId, "ref assignments"),
    ],
  }
}

export function compilePromptFromGraph(
  outputId: string,
  nodes: ConfiguratorFlowNode[],
  edges: ConfiguratorFlowEdge[],
): CompiledPromptResult {
  const orderedSources = resolveOrderedSources(outputId, nodes, edges)
  const warnings: string[] = []
  const sceneBlocks: string[] = []
  const referenceBlocks: string[] = []
  const preservedDetails = new Set<string>()
  const aiInstructions: string[] = []

  for (const node of orderedSources) {
    if (node.data.kind === "prompt") {
      if (node.data.promptText.trim()) {
        sceneBlocks.push(node.data.promptText.trim())
      }

      for (const detail of splitDetailText(node.data.detailHints)) {
        preservedDetails.add(detail)
      }
    }

    if (node.data.kind === "photo") {
      const details = splitDetailText(node.data.lockedDetails)
      for (const detail of details) {
        preservedDetails.add(detail)
      }

      const sentence = buildPhotoSentence(node.data.caption.trim(), details)
      if (sentence) {
        referenceBlocks.push(sentence)
      }
    }

    if (node.data.kind === "ai") {
      aiInstructions.push(buildAiSentence(node.data.roleLabel, node.data.mode, node.data.instruction))
    }

    if (node.data.kind === "generator") {
      aiInstructions.push(`Target image system: ${node.data.system}.`)
    }
  }

  if (sceneBlocks.length === 0) {
    warnings.push("No prompt nodes are connected to this output.")
  }

  if (preservedDetails.size === 0) {
    warnings.push("No locked details were collected from prompt or photo nodes.")
  }

  if (aiInstructions.length === 0) {
    warnings.push("No AI transform node is shaping the final prompt yet.")
  }

  const detailList = Array.from(preservedDetails)
  const sections = [
    {
      title: "Base Scene",
      content: sceneBlocks.join("\n\n") || "Connect one or more prompt nodes.",
    },
    {
      title: "Reference Anchors",
      content: referenceBlocks.join("\n\n") || "Connect photo nodes to lock appearance details.",
    },
    {
      title: "Locked Details",
      content: detailList.join("\n") || "No locked details yet.",
    },
    {
      title: "AI Directives",
      content: aiInstructions.join("\n\n") || "Connect an AI node to define how the prompt should be transformed.",
    },
  ]

  const finalPromptParts = [
    "Cinematic still frame.",
    sceneBlocks.join(" "),
    referenceBlocks.join(" "),
    detailList.length > 0 ? `Preserve exact details: ${detailList.join("; ")}.` : "",
    aiInstructions.join(" "),
    "Do not invent, simplify, or replace concrete props, wardrobe, lighting cues, facial traits, or spatial relationships when they are specified.",
  ].filter(Boolean)

  return {
    finalPrompt: truncate(finalPromptParts.join(" ").replace(/\s+/g, " ").trim(), 2400),
    sections,
    warnings,
    sourceNodeIds: orderedSources.map((node) => node.id),
  }
}