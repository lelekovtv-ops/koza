import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { extractJsonObject, getErrorMessage } from "@/lib/cinematic/stageUtils"
import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import type {
  ConfiguratorAiNodeData,
  ConfiguratorFlowEdge,
  ConfiguratorFlowNode,
  ConfiguratorNodeData,
  ConfiguratorPhotoNodeData,
  ConfiguratorPromptNodeData,
} from "@/types/configurator"

export const DEFAULT_KOZA_DIRECTING_SCENE = "INT. КОМНАТА БОРИСА — НОЧЬ\n\nТусклая лампа дрожит. Пыль висит в воздухе.\n\nБОРИС, усталый писатель, сидит за скрипучим столом. Его пальцы зависают над печатной машинкой.\n\nТишина.\n\nОн медленно нажимает клавишу.\n\nЩЕЛЧОК.\n\nГде-то в глубине комнаты что-то отвечает тихим скрипом.\n\nБОРИС замирает. Поднимает взгляд.\n\nТьма в углу будто сдвигается ближе."

export type KozaDirectingStageName =
  | "SceneParserNode"
  | "ContextEnricherNode"
  | "LiteraryExpansionNode"
  | "CreativeNode"
  | "MeaningNode"
  | "DirectingStructureNode"
  | "SensorSynthesizerNode"
  | "SceneDetailsNode"
  | "DirectorVisionNode"
  | "Director Vision Output"
  | "DirectorPromptNode"
  | "CinematographyPromptNode"
  | "FinalPackagingNode"
  | "ScenePacket Output"
  | "BessonShotPlannerNode"
  | "Besson Shot Output"
  | "NODE: IMAGE PROMPT CONSISTENCY BUILDER"
  | "Besson Prompt Pack Output"
  | "REF DISTRIBUTOR"
  | "REF DISTRIBUTOR Output"

export interface KozaDirectingRunResult {
  modelId: string
  outputs: Record<KozaDirectingStageName, unknown>
  graphPatch?: {
    nodes: ConfiguratorFlowNode[]
    edges: ConfiguratorFlowEdge[]
  }
}

type CapabilitiesResponse = {
  anthropicConfigured?: boolean
  openaiConfigured?: boolean
  googleConfigured?: boolean
}

type PhotoReference = {
  title: string
  imageUrl: string
  caption: string
  lockedDetails: string
}

function isPromptNode(data: ConfiguratorNodeData): data is ConfiguratorPromptNodeData {
  return data.kind === "prompt"
}

function isAiNode(data: ConfiguratorNodeData): data is ConfiguratorAiNodeData {
  return data.kind === "ai"
}

function isPhotoNode(data: ConfiguratorNodeData): data is ConfiguratorPhotoNodeData {
  return data.kind === "photo"
}

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim()
}

function readStreamAsText(response: Response): Promise<string> {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error("No response body")
  }

  const decoder = new TextDecoder()
  let fullText = ""

  return reader.read().then(function processChunk({ done, value }): Promise<string> {
    if (done) {
      fullText += decoder.decode()
      return Promise.resolve(fullText)
    }

    fullText += decoder.decode(value, { stream: true })
    return reader.read().then(processChunk)
  })
}

function isRetriableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes("load failed")
    || message.includes("econnreset")
    || message.includes("terminated")
    || message.includes("failed to pipe response")
    || message.includes("invalid json")
}

function findNodeByTitle<T extends ConfiguratorNodeData["kind"]>(
  nodes: ConfiguratorFlowNode[],
  title: string,
  kind: T,
): Extract<ConfiguratorNodeData, { kind: T }> {
  const node = nodes.find((entry) => entry.data.title === title && entry.data.kind === kind)

  if (!node) {
    throw new Error(`Required node not found: ${title}`)
  }

  return node.data as Extract<ConfiguratorNodeData, { kind: T }>
}

function findNodeInstructions(nodes: ConfiguratorFlowNode[], title: string): string {
  const node = findNodeByTitle(nodes, title, "ai")
  return node.instruction.trim()
}

function getCanonicalCharacterImage(entry: CharacterEntry): string {
  if (entry.generatedPortraitUrl) {
    return entry.generatedPortraitUrl
  }

  const preferred = entry.canonicalImageId
    ? entry.referenceImages.find((image) => image.id === entry.canonicalImageId)?.url
    : ""

  return preferred || entry.referenceImages[0]?.url || ""
}

function getCanonicalLocationImage(entry: LocationEntry): string {
  if (entry.generatedImageUrl) {
    return entry.generatedImageUrl
  }

  const preferred = entry.canonicalImageId
    ? entry.referenceImages.find((image) => image.id === entry.canonicalImageId)?.url
    : ""

  return preferred || entry.referenceImages[0]?.url || ""
}

function summarizeCharacters(characters: CharacterEntry[]): string {
  if (characters.length === 0) {
    return "No characters in Bible yet."
  }

  return characters.slice(0, 8).map((character) => {
    const imageUrl = getCanonicalCharacterImage(character)
    return [
      `- ${character.name}`,
      character.description ? `  description: ${character.description}` : "",
      character.appearancePrompt ? `  appearance: ${character.appearancePrompt}` : "",
      character.sceneIds.length ? `  scenes: ${character.sceneIds.join(", ")}` : "",
      imageUrl ? `  image: ${imageUrl}` : "",
    ].filter(Boolean).join("\n")
  }).join("\n")
}

function summarizeLocations(locations: LocationEntry[]): string {
  if (locations.length === 0) {
    return "No locations in Bible yet."
  }

  return locations.slice(0, 8).map((location) => {
    const imageUrl = getCanonicalLocationImage(location)
    return [
      `- ${location.name}`,
      location.fullHeading ? `  heading: ${location.fullHeading}` : "",
      location.description ? `  description: ${location.description}` : "",
      location.appearancePrompt ? `  appearance: ${location.appearancePrompt}` : "",
      imageUrl ? `  image: ${imageUrl}` : "",
    ].filter(Boolean).join("\n")
  }).join("\n")
}

function summarizeImageDescriptors(characters: CharacterEntry[], locations: LocationEntry[]): string {
  const lines: string[] = []

  for (const character of characters.slice(0, 6)) {
    const imageUrl = getCanonicalCharacterImage(character)
    if (!imageUrl && !character.appearancePrompt) {
      continue
    }

    lines.push([
      `CHARACTER ${character.name}`,
      character.appearancePrompt ? `appearance: ${character.appearancePrompt}` : "",
      imageUrl ? `image_url: ${imageUrl}` : "",
    ].filter(Boolean).join("\n"))
  }

  for (const location of locations.slice(0, 6)) {
    const imageUrl = getCanonicalLocationImage(location)
    if (!imageUrl && !location.appearancePrompt) {
      continue
    }

    lines.push([
      `LOCATION ${location.name}`,
      location.appearancePrompt ? `appearance: ${location.appearancePrompt}` : "",
      imageUrl ? `image_url: ${imageUrl}` : "",
    ].filter(Boolean).join("\n"))
  }

  return lines.length > 0 ? lines.join("\n\n") : "No image descriptors in Bible yet."
}

function summarizeStoryHistory(storyHistory: string): string {
  return storyHistory.trim() || "No story history in Bible yet."
}

function summarizeDirectorVision(directorVision: string): string {
  return directorVision.trim() || "No director vision in Bible yet."
}

function getPrimaryCharacter(characters: CharacterEntry[]): CharacterEntry | null {
  return characters.find((character) => Boolean(getCanonicalCharacterImage(character))) ?? null
}

function getPrimaryLocation(locations: LocationEntry[]): LocationEntry | null {
  return locations.find((location) => Boolean(getCanonicalLocationImage(location))) ?? null
}

function updateNodeText(
  node: ConfiguratorFlowNode,
  nextText: string,
  placeholderTexts: string[],
): ConfiguratorFlowNode {
  if (!isPromptNode(node.data)) {
    return node
  }

  const current = node.data.promptText.trim()
  const shouldReplace = isBlank(current) || placeholderTexts.includes(current)

  if (!shouldReplace) {
    return node
  }

  return {
    ...node,
    data: {
      ...node.data,
      promptText: nextText,
    },
  }
}

function updatePhotoNode(
  node: ConfiguratorFlowNode,
  reference: PhotoReference | null,
): ConfiguratorFlowNode {
  if (!isPhotoNode(node.data) || !reference) {
    return node
  }

  return {
    ...node,
    data: {
      ...node.data,
      imageUrl: node.data.imageUrl || reference.imageUrl,
      caption: node.data.caption && node.data.caption !== "Primary character reference from Bible." && node.data.caption !== "Primary location reference from Bible."
        ? node.data.caption
        : reference.caption,
      lockedDetails: node.data.lockedDetails && !node.data.lockedDetails.includes("face shape; wardrobe silhouette") && !node.data.lockedDetails.includes("architecture; props; palette")
        ? node.data.lockedDetails
        : reference.lockedDetails,
    },
  }
}

function buildPhotoReferences(nodes: ConfiguratorFlowNode[]): PhotoReference[] {
  return nodes
    .filter((node) => isPhotoNode(node.data) && Boolean(node.data.imageUrl.trim()))
    .map((node) => {
      const photoData = node.data as ConfiguratorPhotoNodeData

      return {
        title: photoData.title,
        imageUrl: photoData.imageUrl,
        caption: photoData.caption,
        lockedDetails: photoData.lockedDetails,
      }
    })
}

function getPromptText(nodes: ConfiguratorFlowNode[], title: string): string {
  return findNodeByTitle(nodes, title, "prompt").promptText.trim()
}

function safeJsonParse(rawText: string): Record<string, unknown> {
  try {
    return JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Invalid JSON response: ${getErrorMessage(error)}`)
  }
}

async function repairJsonResponse(
  stageLabel: KozaDirectingStageName,
  modelId: string,
  rawText: string,
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: [
          `Repair the following ${stageLabel} output into one valid JSON object.`,
          "Return JSON only.",
          "Do not add explanations, markdown fences, comments, or prose.",
          "If fields are partially missing, preserve everything recoverable from the source text.",
          "SOURCE:",
          rawText,
        ].join("\n\n"),
      }],
      modelId,
      temperature: 0,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `HTTP ${response.status}`)
  }

  const repairedText = await readStreamAsText(response)
  return safeJsonParse(repairedText)
}

async function executeJsonStage(
  stageLabel: KozaDirectingStageName,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
): Promise<Record<string, unknown>> {
  let attempt = 0
  let lastError: unknown

  while (attempt < 2) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userMessage }],
          modelId,
          system: systemPrompt,
          temperature: 0.2,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
      }

      const rawText = await readStreamAsText(response)
      try {
        return safeJsonParse(rawText)
      } catch (error) {
        if (attempt === 0) {
          attempt += 1
          return await repairJsonResponse(stageLabel, modelId, rawText)
        }

        throw error
      }
    } catch (error) {
      lastError = error
      if (attempt === 0 && isRetriableError(error)) {
        attempt += 1
        continue
      }
      break
    }
  }

  throw new Error(`${stageLabel} failed: ${getErrorMessage(lastError)}`)
}

function buildNodeInstruction(nodes: ConfiguratorFlowNode[], title: string): string {
  const instruction = findNodeInstructions(nodes, title)
  return instruction ? `Node instruction: ${instruction}` : ""
}

const KOZA_REQUIRED_TITLES = [
  "SceneInput",
  "SceneParserNode",
  "ContextEnricherNode",
  "LiteraryExpansionNode",
  "FinalPackagingNode",
  "ScenePacket Output",
] as const

const TEMPLATE_777_REQUIRED_TITLES = [
  "Story History",
  "Character Bible",
  "Location Bible",
  "SceneInput",
  "SceneParserNode",
  "ContextEnricherNode",
  "LiteraryExpansionNode",
  "CreativeNode",
  "MeaningNode",
  "DirectingStructureNode",
  "SensorSynthesizerNode",
  "SceneDetailsNode",
  "DirectorVisionNode",
  "Director Vision Output",
] as const

const LUC_BESSON_REQUIRED_TITLES = [
  "Сценарий",
  "Стиль правил Люка Бессона",
  "описание Персонаж Ангел А",
  "Детали Ангел А для консистенции",
  "описание Персонаж Андреа",
  "детали Андреа для консистенции",
  "локация",
  "BessonShotPlannerNode",
  "Besson Shot Output",
  "NODE: IMAGE PROMPT CONSISTENCY BUILDER",
  "Besson Prompt Pack Output",
  "REF DISTRIBUTOR",
  "REF DISTRIBUTOR Output",
] as const

export function getKozaDirectingMissingTitles(nodes: ConfiguratorFlowNode[]): string[] {
  return KOZA_REQUIRED_TITLES.filter((title) => !nodes.some((node) => node.data.title === title))
}

export function isKozaDirectingMvpGraph(nodes: ConfiguratorFlowNode[]): boolean {
  return getKozaDirectingMissingTitles(nodes).length === 0
}

export function getTemplate777MissingTitles(nodes: ConfiguratorFlowNode[]): string[] {
  return TEMPLATE_777_REQUIRED_TITLES.filter((title) => !nodes.some((node) => node.data.title === title))
}

export function isTemplate777Graph(nodes: ConfiguratorFlowNode[]): boolean {
  return getTemplate777MissingTitles(nodes).length === 0
}

export function getLucBessonMissingTitles(nodes: ConfiguratorFlowNode[]): string[] {
  return LUC_BESSON_REQUIRED_TITLES.filter((title) => !nodes.some((node) => node.data.title === title))
}

export function isLucBessonGraph(nodes: ConfiguratorFlowNode[]): boolean {
  return getLucBessonMissingTitles(nodes).length === 0
}

export function applyKozaDirectingDefaults(
  nodes: ConfiguratorFlowNode[],
  characters: CharacterEntry[],
  locations: LocationEntry[],
  storyHistory: string,
  directorVision: string,
): ConfiguratorFlowNode[] {
  const primaryCharacter = getPrimaryCharacter(characters)
  const primaryLocation = getPrimaryLocation(locations)

  const characterReference = primaryCharacter ? {
    title: "Character Reference",
    imageUrl: getCanonicalCharacterImage(primaryCharacter),
    caption: `${primaryCharacter.name} reference from Bible`,
    lockedDetails: [primaryCharacter.description, primaryCharacter.appearancePrompt].filter(Boolean).join("; "),
  } : null

  const locationReference = primaryLocation ? {
    title: "Location Reference",
    imageUrl: getCanonicalLocationImage(primaryLocation),
    caption: `${primaryLocation.name} reference from Bible`,
    lockedDetails: [primaryLocation.description, primaryLocation.appearancePrompt].filter(Boolean).join("; "),
  } : null

  return nodes.map((node) => {
    if (node.data.title === "SceneInput") {
      return updateNodeText(node, DEFAULT_KOZA_DIRECTING_SCENE, ["RAW SCENE: insert raw scene text here."])
    }

    if (node.data.title === "Story History") {
      return updateNodeText(node, summarizeStoryHistory(storyHistory), ["Story history and dramatic context from Bible."])
    }

    if (node.data.title === "Director Vision") {
      return updateNodeText(node, summarizeDirectorVision(directorVision), ["Director vision and film philosophy from Bible."])
    }

    if (node.data.title === "Character Bible") {
      return updateNodeText(node, summarizeCharacters(characters), ["Character bible JSON or notes."])
    }

    if (node.data.title === "Location Bible") {
      return updateNodeText(node, summarizeLocations(locations), ["Location bible JSON or notes."])
    }

    if (node.data.title === "Image Descriptors") {
      return updateNodeText(node, summarizeImageDescriptors(characters, locations), ["Image descriptors or style reference JSON."])
    }

    if (node.data.title === "Character Reference") {
      return updatePhotoNode(node, characterReference)
    }

    if (node.data.title === "Location Reference") {
      return updatePhotoNode(node, locationReference)
    }

    return node
  })
}

export async function resolveKozaTextModel(): Promise<string> {
  const response = await fetch("/api/system-capabilities", { cache: "no-store" })

  if (!response.ok) {
    return DEFAULT_TEXT_MODEL_ID
  }

  const capabilities = await response.json() as CapabilitiesResponse

  if (capabilities.anthropicConfigured) {
    return DEFAULT_TEXT_MODEL_ID
  }

  if (capabilities.openaiConfigured) {
    return "gpt-4o"
  }

  if (capabilities.googleConfigured) {
    return "gemini-1.5-pro"
  }

  throw new Error("No text model provider is configured. Add Anthropic, OpenAI, or Google keys before running the preset.")
}

export async function runKozaDirectingMvp(
  nodes: ConfiguratorFlowNode[],
  onStage?: (stage: KozaDirectingStageName, output: unknown) => void,
  onStageStart?: (stage: KozaDirectingStageName) => void,
): Promise<KozaDirectingRunResult> {
  const modelId = await resolveKozaTextModel()
  const rawScene = getPromptText(nodes, "SceneInput")
  const storyHistory = getPromptText(nodes, "Story History")
  const directorVision = getPromptText(nodes, "Director Vision")
  const characterBible = getPromptText(nodes, "Character Bible")
  const locationBible = getPromptText(nodes, "Location Bible")
  const imageDescriptors = getPromptText(nodes, "Image Descriptors")
  const references = buildPhotoReferences(nodes)
  const sceneId = `scene-${Date.now().toString(36)}`

  if (!rawScene) {
    throw new Error("SceneInput is empty. Add scene text before running.")
  }

  const outputs = {} as Record<KozaDirectingStageName, unknown>

  onStageStart?.("SceneParserNode")
  const parsedScene = await executeJsonStage(
    "SceneParserNode",
    modelId,
    [
      "You are Scene Parser inside KOZA Directing MVP.",
      "Return JSON only.",
      "Return an object with keys: scene_heading, characters, actions, dialogue, objects, sound_cues, mood, framing_hints.",
      "Keep all story-facing text in the language of the scene.",
      "Each action should be a short concrete visible event.",
      buildNodeInstruction(nodes, "SceneParserNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "raw_scene:",
      rawScene,
    ].join("\n\n"),
  )
  outputs.SceneParserNode = parsedScene
  onStage?.("SceneParserNode", parsedScene)

  onStageStart?.("ContextEnricherNode")
  const contextEnriched = await executeJsonStage(
    "ContextEnricherNode",
    modelId,
    [
      "You are Context Enricher inside KOZA Directing MVP.",
      "Return JSON only.",
      "Return an object with keys: character_context, location_context, style_context, visual_constraints, bible_references, reference_images.",
      "Use Bible data as mandatory grounding.",
      buildNodeInstruction(nodes, "ContextEnricherNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "story_history:",
      storyHistory,
      "character_bible:",
      characterBible,
      "location_bible:",
      locationBible,
      "image_descriptors:",
      imageDescriptors,
      "photo_references:",
      JSON.stringify(references, null, 2),
    ].join("\n\n"),
  )
  outputs.ContextEnricherNode = contextEnriched
  onStage?.("ContextEnricherNode", contextEnriched)

  onStageStart?.("LiteraryExpansionNode")
  const expandedScene = await executeJsonStage(
    "LiteraryExpansionNode",
    modelId,
    [
      "You are Literary Expansion inside KOZA Directing MVP.",
      "Return JSON only.",
      "Return an object with keys: expanded_scene, preserved_facts, atmosphere_notes.",
      "Do not change story facts. Strengthen atmosphere and texture only.",
      buildNodeInstruction(nodes, "LiteraryExpansionNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "raw_scene:",
      rawScene,
      "story_history:",
      storyHistory,
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
    ].join("\n\n"),
  )
  outputs.LiteraryExpansionNode = expandedScene
  onStage?.("LiteraryExpansionNode", expandedScene)

  onStageStart?.("CreativeNode")
  onStageStart?.("MeaningNode")
  onStageStart?.("DirectingStructureNode")
  const [creative, meaning, structure] = await Promise.all([
    executeJsonStage(
      "CreativeNode",
      modelId,
      [
        "You are Creative Node inside KOZA Directing MVP.",
        "Return JSON only.",
        "Return an object with keys: creative_entry_points, visual_unexpected_choices, camera_ideas.",
        "Be cinematic but remain grounded in this specific scene and director vision.",
        buildNodeInstruction(nodes, "CreativeNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "expanded_scene:",
        JSON.stringify(expandedScene, null, 2),
        "director_vision:",
        directorVision,
      ].join("\n\n"),
    ),
    executeJsonStage(
      "MeaningNode",
      modelId,
      [
        "You are Meaning Node inside KOZA Directing MVP.",
        "Return JSON only.",
        "Return an object with keys: core_meaning, main_tension, viewer_effect, directorial_focus.",
        "Use story history for continuity and director vision for interpretation.",
        buildNodeInstruction(nodes, "MeaningNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "expanded_scene:",
        JSON.stringify(expandedScene, null, 2),
        "story_history:",
        storyHistory,
        "director_vision:",
        directorVision,
      ].join("\n\n"),
    ),
    executeJsonStage(
      "DirectingStructureNode",
      modelId,
      [
        "You are Directing Structure Node inside KOZA Directing MVP.",
        "Return JSON only.",
        "Return an object with key beats.",
        "beats must be an array of objects with keys: id, purpose, content, emphasis.",
        "Use story history for dramatic continuity and director vision for scene construction.",
        buildNodeInstruction(nodes, "DirectingStructureNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "expanded_scene:",
        JSON.stringify(expandedScene, null, 2),
        "story_history:",
        storyHistory,
        "director_vision:",
        directorVision,
      ].join("\n\n"),
    ),
  ])
  outputs.CreativeNode = creative
  outputs.MeaningNode = meaning
  outputs.DirectingStructureNode = structure
  onStage?.("CreativeNode", creative)
  onStage?.("MeaningNode", meaning)
  onStage?.("DirectingStructureNode", structure)

  onStageStart?.("SensorSynthesizerNode")
  const sensor = await executeJsonStage(
    "SensorSynthesizerNode",
    modelId,
    [
      "You are Sensor Synthesizer inside KOZA Directing MVP.",
      "Return JSON only.",
      "Return an object with keys: scene_core, approved_visual_logic, approved_creative, rejected, constraints.",
      "Filter out ideas that break meaning, continuity, or visual logic.",
      buildNodeInstruction(nodes, "SensorSynthesizerNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "creative:",
      JSON.stringify(creative, null, 2),
      "meaning:",
      JSON.stringify(meaning, null, 2),
      "structure:",
      JSON.stringify(structure, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
      "director_vision:",
      directorVision,
    ].join("\n\n"),
  )
  outputs.SensorSynthesizerNode = sensor
  onStage?.("SensorSynthesizerNode", sensor)

  onStageStart?.("SceneDetailsNode")
  const details = await executeJsonStage(
    "SceneDetailsNode",
    modelId,
    [
      "You are Scene Details Node inside KOZA Directing MVP.",
      "Return JSON only.",
      "Return an object with keys: character_blocking, frame_objects, environment, continuity_anchors.",
      buildNodeInstruction(nodes, "SceneDetailsNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "synthesis:",
      JSON.stringify(sensor, null, 2),
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
      "photo_references:",
      JSON.stringify(references, null, 2),
    ].join("\n\n"),
  )
  outputs.SceneDetailsNode = details
  onStage?.("SceneDetailsNode", details)

  onStageStart?.("DirectorPromptNode")
  onStageStart?.("CinematographyPromptNode")
  const [directorPrompts, cinematographyPrompts] = await Promise.all([
    executeJsonStage(
      "DirectorPromptNode",
      modelId,
      [
        "You are Director Prompt Node inside KOZA Directing MVP.",
        "Return JSON only.",
        "Return an object with key director_prompts.",
        "director_prompts must be an array of objects with keys: beat_id, prompt.",
        "Apply director vision directly to the action language of each beat.",
        buildNodeInstruction(nodes, "DirectorPromptNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "structure:",
        JSON.stringify(structure, null, 2),
        "meaning:",
        JSON.stringify(meaning, null, 2),
        "synthesis:",
        JSON.stringify(sensor, null, 2),
        "director_vision:",
        directorVision,
      ].join("\n\n"),
    ),
    executeJsonStage(
      "CinematographyPromptNode",
      modelId,
      [
        "You are Cinematography Prompt Node inside KOZA Directing MVP.",
        "Return JSON only.",
        "Return an object with key cinematography_prompts.",
        "cinematography_prompts must be an array of objects with keys: beat_id, prompt.",
        "Apply director vision to lensing, framing, and movement choices.",
        buildNodeInstruction(nodes, "CinematographyPromptNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "structure:",
        JSON.stringify(structure, null, 2),
        "details:",
        JSON.stringify(details, null, 2),
        "synthesis:",
        JSON.stringify(sensor, null, 2),
        "director_vision:",
        directorVision,
      ].join("\n\n"),
    ),
  ])
  outputs.DirectorPromptNode = directorPrompts
  outputs.CinematographyPromptNode = cinematographyPrompts
  onStage?.("DirectorPromptNode", directorPrompts)
  onStage?.("CinematographyPromptNode", cinematographyPrompts)

  onStageStart?.("FinalPackagingNode")
  const scenePacket = await executeJsonStage(
    "FinalPackagingNode",
    modelId,
    [
      "You are Final Packaging inside KOZA Directing MVP.",
      "Return JSON only.",
      "Return one ScenePacket object with keys: scene_id, raw_scene, expanded_scene, parsed_scene, meaning, beats, scene_details, director_prompts, cinematography_prompts, continuity_rules, constraints, bible_context, reference_images, recommended_next_step.",
      "Do not omit arrays even if they are empty.",
      buildNodeInstruction(nodes, "FinalPackagingNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "raw_scene:",
      rawScene,
      "story_history:",
      storyHistory,
      "director_vision:",
      directorVision,
      "expanded_scene:",
      JSON.stringify(expandedScene, null, 2),
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "meaning:",
      JSON.stringify(meaning, null, 2),
      "beats:",
      JSON.stringify(structure, null, 2),
      "scene_details:",
      JSON.stringify(details, null, 2),
      "director_prompts:",
      JSON.stringify(directorPrompts, null, 2),
      "cinematography_prompts:",
      JSON.stringify(cinematographyPrompts, null, 2),
      "sensor:",
      JSON.stringify(sensor, null, 2),
      "bible_context:",
      JSON.stringify({ storyHistory, directorVision, characterBible, locationBible, imageDescriptors }, null, 2),
      "reference_images:",
      JSON.stringify(references, null, 2),
    ].join("\n\n"),
  )
  outputs.FinalPackagingNode = scenePacket
  outputs["ScenePacket Output"] = scenePacket
  onStage?.("FinalPackagingNode", scenePacket)
  onStageStart?.("ScenePacket Output")
  onStage?.("ScenePacket Output", scenePacket)

  return {
    modelId,
    outputs,
  }
}

export async function runTemplate777PrePrompt(
  nodes: ConfiguratorFlowNode[],
  onStage?: (stage: KozaDirectingStageName, output: unknown) => void,
  onStageStart?: (stage: KozaDirectingStageName) => void,
): Promise<KozaDirectingRunResult> {
  const modelId = await resolveKozaTextModel()
  const rawScene = getPromptText(nodes, "SceneInput")
  const storyHistory = getPromptText(nodes, "Story History")
  const characterBible = getPromptText(nodes, "Character Bible")
  const locationBible = getPromptText(nodes, "Location Bible")
  const references = buildPhotoReferences(nodes)
  const sceneId = `scene-${Date.now().toString(36)}`

  if (!rawScene) {
    throw new Error("SceneInput is empty. Add scene text before running.")
  }

  const outputs = {} as Record<KozaDirectingStageName, unknown>

  onStageStart?.("SceneParserNode")
  const parsedScene = await executeJsonStage(
    "SceneParserNode",
    modelId,
    [
      "You are Scene Parser inside KOZA pre-prompt director vision flow.",
      "Return JSON only.",
      "Return an object with keys: scene_heading, characters, actions, dialogue, objects, sound_cues, mood, framing_hints.",
      "Keep all story-facing text in the language of the scene.",
      "Each action should be a short concrete visible event.",
      buildNodeInstruction(nodes, "SceneParserNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "raw_scene:",
      rawScene,
    ].join("\n\n"),
  )
  outputs.SceneParserNode = parsedScene
  onStage?.("SceneParserNode", parsedScene)

  onStageStart?.("ContextEnricherNode")
  const contextEnriched = await executeJsonStage(
    "ContextEnricherNode",
    modelId,
    [
      "You are Context Enricher inside KOZA pre-prompt director vision flow.",
      "Return JSON only.",
      "Return an object with keys: character_context, location_context, visual_constraints, continuity_anchors, bible_references, reference_images.",
      "Use story history, character bible and location bible as mandatory grounding.",
      buildNodeInstruction(nodes, "ContextEnricherNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "story_history:",
      storyHistory,
      "character_bible:",
      characterBible,
      "location_bible:",
      locationBible,
      "photo_references:",
      JSON.stringify(references, null, 2),
    ].join("\n\n"),
  )
  outputs.ContextEnricherNode = contextEnriched
  onStage?.("ContextEnricherNode", contextEnriched)

  onStageStart?.("LiteraryExpansionNode")
  const expandedScene = await executeJsonStage(
    "LiteraryExpansionNode",
    modelId,
    [
      "You are Literary Expansion inside KOZA pre-prompt director vision flow.",
      "Return JSON only.",
      "Return an object with keys: expanded_scene, preserved_facts, atmosphere_notes.",
      "Do not change story facts. Strengthen atmosphere and texture only.",
      buildNodeInstruction(nodes, "LiteraryExpansionNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "raw_scene:",
      rawScene,
      "story_history:",
      storyHistory,
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
    ].join("\n\n"),
  )
  outputs.LiteraryExpansionNode = expandedScene
  onStage?.("LiteraryExpansionNode", expandedScene)

  onStageStart?.("CreativeNode")
  onStageStart?.("MeaningNode")
  onStageStart?.("DirectingStructureNode")
  const [creative, meaning, structure] = await Promise.all([
    executeJsonStage(
      "CreativeNode",
      modelId,
      [
        "You are Creative Node inside KOZA pre-prompt director vision flow.",
        "Return JSON only.",
        "Return an object with keys: creative_entry_points, visual_unexpected_choices, camera_ideas.",
        "Be cinematic but remain grounded in this specific scene and context.",
        buildNodeInstruction(nodes, "CreativeNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "expanded_scene:",
        JSON.stringify(expandedScene, null, 2),
        "story_history:",
        storyHistory,
      ].join("\n\n"),
    ),
    executeJsonStage(
      "MeaningNode",
      modelId,
      [
        "You are Meaning Node inside KOZA pre-prompt director vision flow.",
        "Return JSON only.",
        "Return an object with keys: core_meaning, main_tension, viewer_effect, directorial_focus.",
        "Use story history for continuity and interpretation.",
        buildNodeInstruction(nodes, "MeaningNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "expanded_scene:",
        JSON.stringify(expandedScene, null, 2),
        "story_history:",
        storyHistory,
      ].join("\n\n"),
    ),
    executeJsonStage(
      "DirectingStructureNode",
      modelId,
      [
        "You are Directing Structure Node inside KOZA pre-prompt director vision flow.",
        "Return JSON only.",
        "Return an object with key beats.",
        "beats must be an array of objects with keys: id, purpose, content, emphasis.",
        "Use story history for dramatic continuity.",
        buildNodeInstruction(nodes, "DirectingStructureNode"),
      ].filter(Boolean).join("\n"),
      [
        `scene_id: ${sceneId}`,
        "expanded_scene:",
        JSON.stringify(expandedScene, null, 2),
        "story_history:",
        storyHistory,
      ].join("\n\n"),
    ),
  ])
  outputs.CreativeNode = creative
  outputs.MeaningNode = meaning
  outputs.DirectingStructureNode = structure
  onStage?.("CreativeNode", creative)
  onStage?.("MeaningNode", meaning)
  onStage?.("DirectingStructureNode", structure)

  onStageStart?.("SensorSynthesizerNode")
  const sensor = await executeJsonStage(
    "SensorSynthesizerNode",
    modelId,
    [
      "You are Sensor Synthesizer inside KOZA pre-prompt director vision flow.",
      "Return JSON only.",
      "Return an object with keys: scene_core, approved_visual_logic, approved_creative, rejected, constraints.",
      "Filter out ideas that break meaning, continuity, or visual logic.",
      buildNodeInstruction(nodes, "SensorSynthesizerNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "creative:",
      JSON.stringify(creative, null, 2),
      "meaning:",
      JSON.stringify(meaning, null, 2),
      "structure:",
      JSON.stringify(structure, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
    ].join("\n\n"),
  )
  outputs.SensorSynthesizerNode = sensor
  onStage?.("SensorSynthesizerNode", sensor)

  onStageStart?.("SceneDetailsNode")
  const details = await executeJsonStage(
    "SceneDetailsNode",
    modelId,
    [
      "You are Scene Details Node inside KOZA pre-prompt director vision flow.",
      "Return JSON only.",
      "Return an object with keys: character_blocking, frame_objects, environment, continuity_anchors.",
      buildNodeInstruction(nodes, "SceneDetailsNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "synthesis:",
      JSON.stringify(sensor, null, 2),
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
      "photo_references:",
      JSON.stringify(references, null, 2),
    ].join("\n\n"),
  )
  outputs.SceneDetailsNode = details
  onStage?.("SceneDetailsNode", details)

  onStageStart?.("DirectorVisionNode")
  const directorVisionPacket = await executeJsonStage(
    "DirectorVisionNode",
    modelId,
    [
      "You are Director Vision Node inside KOZA pre-prompt director vision flow.",
      "Return JSON only.",
      "Return an object with keys: philosophy, emotional_axis, staging_principles, visual_rules, rhythm_strategy, continuity_rules, director_notes, recommended_next_step, shots.",
      "shots must be an array of objects with keys: shot_id, label, shot_type, shot_size, composition, camera_motion, shot_description, action_text, director_note, camera_note, visual_description, continuity_note.",
      "Create as many shots as needed to cover the scene efficiently. Each shot must have a concrete directing purpose and readable description.",
      "Do not generate image prompts or video prompts.",
      "Synthesize story history, meaning, beats, details, atmosphere and continuity into one directorial vision packet.",
      buildNodeInstruction(nodes, "DirectorVisionNode"),
    ].filter(Boolean).join("\n"),
    [
      `scene_id: ${sceneId}`,
      "raw_scene:",
      rawScene,
      "story_history:",
      storyHistory,
      "parsed_scene:",
      JSON.stringify(parsedScene, null, 2),
      "context:",
      JSON.stringify(contextEnriched, null, 2),
      "expanded_scene:",
      JSON.stringify(expandedScene, null, 2),
      "creative:",
      JSON.stringify(creative, null, 2),
      "meaning:",
      JSON.stringify(meaning, null, 2),
      "beats:",
      JSON.stringify(structure, null, 2),
      "synthesis:",
      JSON.stringify(sensor, null, 2),
      "details:",
      JSON.stringify(details, null, 2),
      "bible_context:",
      JSON.stringify({ storyHistory, characterBible, locationBible }, null, 2),
      "reference_images:",
      JSON.stringify(references, null, 2),
    ].join("\n\n"),
  )
  outputs.DirectorVisionNode = directorVisionPacket
  outputs["Director Vision Output"] = directorVisionPacket
  onStage?.("DirectorVisionNode", directorVisionPacket)
  onStageStart?.("Director Vision Output")
  onStage?.("Director Vision Output", directorVisionPacket)

  return {
    modelId,
    outputs,
  }
}

function slugifyShotLabel(value: string, index: number): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || `shot-${index + 1}`
}

function makeGeneratedNodeId(prefix: string, shotLabel: string, index: number): string {
  return `besson-generated-${prefix}-${slugifyShotLabel(shotLabel, index)}`
}

function createGeneratedNode(
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

function createGeneratedEdge(source: string, target: string, label: string): ConfiguratorFlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
    animated: false,
  }
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean)
}

function normalizeRefText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textIncludesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

function selectLucBessonReferenceNodes(nodes: ConfiguratorFlowNode[], shot: Record<string, unknown>): ConfiguratorFlowNode[] {
  const photoNodes = nodes.filter((node) => node.data.kind === "photo")
  const shotText = normalizeRefText([
    typeof shot.label === "string" ? shot.label : "",
    typeof shot.action_text === "string" ? shot.action_text : "",
    typeof shot.director_note === "string" ? shot.director_note : "",
    typeof shot.camera_note === "string" ? shot.camera_note : "",
    typeof shot.visual_description === "string" ? shot.visual_description : "",
    typeof shot.shot_description === "string" ? shot.shot_description : "",
    typeof shot.image_prompt === "string" ? shot.image_prompt : "",
  ].join(" "))

  const wantsAngela = textIncludesAny(shotText, ["angela", "angel a", "angel-a", "ангела", "анжела", "ангел"])
  const wantsAndre = textIncludesAny(shotText, ["andrea", "andre", "андре", "андреа"])
  const wantsClosePortrait = textIncludesAny(shotText, ["close up", "close-up", "portrait", "крупный", "лицо", "medium close"])

  const selected = photoNodes.filter((node) => {
    const title = normalizeRefText(node.data.title)
    const caption = normalizeRefText(node.data.kind === "photo" ? node.data.caption : "")
    const details = normalizeRefText(node.data.kind === "photo" ? node.data.lockedDetails : "")
    const descriptor = `${title} ${caption} ${details}`

    const isLocationRef = textIncludesAny(descriptor, ["seine", "bridge", "embankment", "paris", "набереж", "мост", "сены", "river", "location"])
    const isAngelaRef = textIncludesAny(descriptor, ["angela", "angel a", "angel-a", "анжела", "ангел"])
    const isAndreRef = textIncludesAny(descriptor, ["andrea", "andre", "андре", "андреа"])
    const isPortraitRef = textIncludesAny(descriptor, ["close up", "close-up", "portrait", "круп", "face"])

    if (isLocationRef) {
      return true
    }

    if (isAngelaRef && wantsAngela) {
      return wantsClosePortrait ? true : !isPortraitRef
    }

    if (isAndreRef && wantsAndre) {
      return true
    }

    return false
  })

  if (selected.length > 0) {
    return selected
  }

  return photoNodes.filter((node) => {
    const descriptor = normalizeRefText(`${node.data.title} ${node.data.kind === "photo" ? node.data.caption : ""}`)
    return textIncludesAny(descriptor, ["seine", "bridge", "embankment", "paris", "набереж", "мост", "сены", "river", "location"])
  })
}

function enrichLucBessonPromptPack(promptPack: Record<string, unknown>, nodes: ConfiguratorFlowNode[]): Record<string, unknown> {
  const shots = Array.isArray(promptPack.shots) ? promptPack.shots : []

  return {
    ...promptPack,
    shots: shots.map((entry) => {
      const shot = getObjectRecord(entry)
      if (!shot) {
        return entry
      }

      const selectedRefs = selectLucBessonReferenceNodes(nodes, shot)
      return {
        ...shot,
        selected_ref_titles: selectedRefs.map((node) => node.data.title),
      }
    }),
  }
}

function mergeLucBessonRefAssignments(
  promptPack: Record<string, unknown>,
  refAssignments: Record<string, unknown>,
): Record<string, unknown> {
  const promptShots = Array.isArray(promptPack.shots) ? promptPack.shots : []
  const assignmentShots = Array.isArray(refAssignments.shots) ? refAssignments.shots : []
  const assignmentMap = new Map<string, Record<string, unknown>>()

  assignmentShots.forEach((entry, index) => {
    const shot = getObjectRecord(entry)
    if (!shot) {
      return
    }

    const shotId = typeof shot.shot_id === "string" && shot.shot_id.trim()
      ? shot.shot_id.trim()
      : typeof shot.label === "string" && shot.label.trim()
        ? shot.label.trim()
        : `shot-${index + 1}`

    assignmentMap.set(shotId, shot)
  })

  return {
    ...promptPack,
    shots: promptShots.map((entry, index) => {
      const shot = getObjectRecord(entry)
      if (!shot) {
        return entry
      }

      const shotId = typeof shot.shot_id === "string" && shot.shot_id.trim()
        ? shot.shot_id.trim()
        : typeof shot.label === "string" && shot.label.trim()
          ? shot.label.trim()
          : `shot-${index + 1}`

      const assignment = assignmentMap.get(shotId)
      if (!assignment) {
        return shot
      }

      return {
        ...shot,
        selected_ref_titles: getStringArray(assignment.selected_ref_titles),
        max_ref_count: typeof assignment.max_ref_count === "number"
          ? assignment.max_ref_count
          : Number(assignment.max_ref_count) || undefined,
        ref_reason: typeof assignment.ref_reason === "string" ? assignment.ref_reason.trim() : "",
      }
    }),
  }
}

function buildFallbackRefAssignments(promptPack: Record<string, unknown>): Record<string, unknown> {
  const promptShots = Array.isArray(promptPack.shots) ? promptPack.shots : []

  return {
    shots: promptShots.map((entry, index) => {
      const shot = getObjectRecord(entry)
      if (!shot) {
        return entry
      }

      return {
        shot_id: typeof shot.shot_id === "string" && shot.shot_id.trim() ? shot.shot_id.trim() : `shot-${index + 1}`,
        label: typeof shot.label === "string" ? shot.label.trim() : `Shot ${index + 1}`,
        selected_ref_titles: getStringArray(shot.selected_ref_titles),
        max_ref_count: getStringArray(shot.selected_ref_titles).length > 0
          ? Math.min(3, getStringArray(shot.selected_ref_titles).length)
          : 1,
        ref_reason: "Fallback assignment from local reference heuristics.",
      }
    }),
  }
}

function buildLucBessonGraphPatch(sourceNodes: ConfiguratorFlowNode[], promptPack: Record<string, unknown>): { nodes: ConfiguratorFlowNode[]; edges: ConfiguratorFlowEdge[] } {
  const shots = Array.isArray(promptPack.shots) ? promptPack.shots : []
  const patchNodes: ConfiguratorFlowNode[] = []
  const edges: ConfiguratorFlowEdge[] = []
  const baseX = 2120
  const columnGap = 460
  const rowGap = 260

  shots.forEach((entry, index) => {
    const shot = getObjectRecord(entry)
    if (!shot) {
      return
    }

    const label = typeof shot.label === "string" && shot.label.trim() ? shot.label.trim() : `Shot ${index + 1}`
    const promptText = typeof shot.image_prompt === "string" ? shot.image_prompt.trim() : ""
    const directorNote = typeof shot.director_note === "string" ? shot.director_note.trim() : ""
    const cameraNote = typeof shot.camera_note === "string" ? shot.camera_note.trim() : ""
    const actionText = typeof shot.action_text === "string" ? shot.action_text.trim() : ""
    const visualDescription = typeof shot.visual_description === "string" ? shot.visual_description.trim() : ""
    const shotDescription = typeof shot.shot_description === "string" ? shot.shot_description.trim() : ""
    const selectedRefTitles = getStringArray(shot.selected_ref_titles)
    const maxRefCount = typeof shot.max_ref_count === "number" ? shot.max_ref_count : Number(shot.max_ref_count) || 0
    const refReason = typeof shot.ref_reason === "string" ? shot.ref_reason.trim() : ""
    const selectedPhotoNodes = sourceNodes.filter((node) => node.data.kind === "photo" && selectedRefTitles.includes(node.data.title))

    const shotNodeId = makeGeneratedNodeId("shot", label, index)
    const promptNodeId = makeGeneratedNodeId("prompt", label, index)
    const refDistributorNodeId = makeGeneratedNodeId("ref-distributor", label, index)
    const generatorNodeId = makeGeneratedNodeId("generator", label, index)
    const outputNodeId = makeGeneratedNodeId("output", label, index)
    const y = 120 + index * rowGap

    patchNodes.push(
      createGeneratedNode(shotNodeId, baseX, y, {
        kind: "ai",
        title: `${label} Director Block`,
        roleLabel: actionText || label,
        mode: "merge",
        instruction: [
          shotDescription ? `Shot description: ${shotDescription}` : "",
          directorNote ? `Director note: ${directorNote}` : "",
          cameraNote ? `Camera note: ${cameraNote}` : "",
          visualDescription ? `Visual description: ${visualDescription}` : "",
        ].filter(Boolean).join("\n"),
      }),
      createGeneratedNode(promptNodeId, baseX + columnGap, y, {
        kind: "prompt",
        title: `${label} Image Prompt`,
        promptText,
        detailHints: [actionText, directorNote, cameraNote].filter(Boolean).join("; "),
      }),
      createGeneratedNode(refDistributorNodeId, baseX + columnGap * 2, y, {
        kind: "ai",
        title: `${label} REF DISTRIBUTOR`,
        roleLabel: "РАСПРЕДЕЛЯТОР РЕФЕРЕНСОВ",
        mode: "detail_guard",
        instruction: [
          "Pass only the relevant reference anchors for this shot into the image generator.",
          selectedRefTitles.length > 0 ? `Selected refs: ${selectedRefTitles.join(", ")}` : "Selected refs: location anchors only",
          maxRefCount > 0 ? `Max refs: ${maxRefCount}` : "Max refs: auto",
          refReason ? `Why: ${refReason}` : "",
          "Keep character identity refs only when that character is visible in the shot.",
          "Always keep stable location anchors when the Seine embankment or bridge geometry remains visible.",
        ].join("\n"),
      }),
      createGeneratedNode(generatorNodeId, baseX + columnGap * 3, y, {
        kind: "generator",
        title: `${label} Generator`,
        system: "gpt-image",
      }),
      createGeneratedNode(outputNodeId, baseX + columnGap * 4, y, {
        kind: "output",
        title: `${label} Image`,
      }),
    )

    edges.push(
      createGeneratedEdge(shotNodeId, refDistributorNodeId, "directing anchors"),
      createGeneratedEdge(promptNodeId, refDistributorNodeId, "final prompt"),
      createGeneratedEdge(refDistributorNodeId, generatorNodeId, "refs + prompt"),
      createGeneratedEdge(generatorNodeId, outputNodeId, "generated image"),
    )

    selectedPhotoNodes.forEach((photoNode) => {
      edges.push(createGeneratedEdge(photoNode.id, refDistributorNodeId, "selected ref"))
    })
  })

  return { nodes: patchNodes, edges }
}

export async function runLucBessonTemplate(
  nodes: ConfiguratorFlowNode[],
  onStage?: (stage: KozaDirectingStageName, output: unknown) => void,
  onStageStart?: (stage: KozaDirectingStageName) => void,
): Promise<KozaDirectingRunResult> {
  const modelId = await resolveKozaTextModel()
  const scene = getPromptText(nodes, "Сценарий")
  const styleRules = getPromptText(nodes, "Стиль правил Люка Бессона")
  const angela = getPromptText(nodes, "описание Персонаж Ангел А")
  const angelaDetails = getPromptText(nodes, "Детали Ангел А для консистенции")
  const andre = getPromptText(nodes, "описание Персонаж Андреа")
  const andreDetails = getPromptText(nodes, "детали Андреа для консистенции")
  const location = getPromptText(nodes, "локация")
  const references = buildPhotoReferences(nodes)

  if (!scene) {
    throw new Error("Сценарий пустой. Добавь текст сцены перед запуском.")
  }

  const outputs = {} as Record<KozaDirectingStageName, unknown>

  onStageStart?.("BessonShotPlannerNode")
  const shotBreakdown = await executeJsonStage(
    "BessonShotPlannerNode",
    modelId,
    [
      "You are a Luc Besson style shot planner for the Angel-A visual language.",
      "Return JSON only.",
      "Return an object with keys: scene_style, scene_logic, location_lock, shot_count, shots.",
      "shots must be an array of objects with keys: shot_id, label, action_text, director_note, camera_note, visual_description, shot_description, shot_size, composition, camera_motion, emotional_goal, action_state, character_positions, background_lock.",
      "Each shot must represent one micro-action and one emotion.",
      "Keep the language concise, practical, and production-oriented.",
      buildNodeInstruction(nodes, "BessonShotPlannerNode"),
    ].filter(Boolean).join("\n"),
    [
      "screenplay:",
      scene,
      "style_rules:",
      styleRules,
      "character_angela:",
      angela,
      "character_angela_details:",
      angelaDetails,
      "character_andrea:",
      andre,
      "character_andrea_details:",
      andreDetails,
      "location_lock:",
      location,
    ].join("\n\n"),
  )
  outputs.BessonShotPlannerNode = shotBreakdown
  outputs["Besson Shot Output"] = shotBreakdown
  onStage?.("BessonShotPlannerNode", shotBreakdown)
  onStageStart?.("Besson Shot Output")
  onStage?.("Besson Shot Output", shotBreakdown)

  onStageStart?.("NODE: IMAGE PROMPT CONSISTENCY BUILDER")
  const promptPackRaw = await executeJsonStage(
    "NODE: IMAGE PROMPT CONSISTENCY BUILDER",
    modelId,
    [
      "You are IMAGE PROMPT CONSISTENCY BUILDER.",
      "Return JSON only.",
      "Return an object with keys: scene_base, light_lock, style_lock, validation_notes, shots.",
      "shots must be an array of objects with keys: shot_id, label, image_prompt, action_text, director_note, camera_note, visual_description, shot_description, shot_size, composition, camera_motion.",
      "Each image_prompt must explicitly preserve spatial consistency: LEFT, RIGHT, CENTER, BACKGROUND, FOREGROUND, camera angle, camera height, distance, movement feel, and stable light phrasing.",
      "Write each image_prompt as a clean final still-image prompt for an image model, not as a production memo or shot-planning note.",
      "Do not include spoken dialogue, quoted lines, exact words, subtitle text, or transcript fragments in image_prompt.",
      "If a character is talking, convert that into visible expression, mouth state, posture, tension, gesture, or gaze instead of verbal content.",
      "Describe only what is visible in the current frame. Do not mention future actions, future entrances, next shots, placeholders, or editorial intent.",
      "Never imply subtitles, title cards, burned-in captions, visible words, signage emphasis, or any text overlay inside the frame unless the screenplay explicitly requires readable text.",
      "Avoid phrases like: for future character entrance, camera should, we see, then, meanwhile, cut to.",
      "Start from the visible subject and frame geography, then light, then background continuity.",
      "Use the same background wording through all prompts and continue the action state from shot to shot.",
      "Do not output video prompts.",
      buildNodeInstruction(nodes, "NODE: IMAGE PROMPT CONSISTENCY BUILDER"),
    ].filter(Boolean).join("\n"),
    [
      "shot_breakdown:",
      JSON.stringify(shotBreakdown, null, 2),
      "style_rules:",
      styleRules,
      "consistency_rules:",
      findNodeInstructions(nodes, "NODE: IMAGE PROMPT CONSISTENCY BUILDER"),
      "character_angela_details:",
      angelaDetails,
      "character_andrea_details:",
      andreDetails,
      "location_lock:",
      location,
    ].join("\n\n"),
  )
  const promptPackWithFallbackRefs = enrichLucBessonPromptPack(promptPackRaw, nodes)
  outputs["NODE: IMAGE PROMPT CONSISTENCY BUILDER"] = promptPackWithFallbackRefs
  onStage?.("NODE: IMAGE PROMPT CONSISTENCY BUILDER", promptPackWithFallbackRefs)

  onStageStart?.("REF DISTRIBUTOR")
  let refAssignments: Record<string, unknown>
  try {
    refAssignments = await executeJsonStage(
      "REF DISTRIBUTOR",
      modelId,
      [
        "You are REF DISTRIBUTOR for Luc Besson shot generators.",
        "Return JSON only.",
        "Return an object with key shots.",
        "shots must be an array of objects with keys: shot_id, label, selected_ref_titles, max_ref_count, ref_reason.",
        "Your job is only to assign uploaded references to each final shot generator.",
        "Do not rewrite prompts. Do not change shot order. Do not generate image prompts.",
        "Assign character refs only when that character is visible in the shot.",
        "Assign location refs when bridge, Seine embankment, river geometry, or Paris background continuity matters.",
        "max_ref_count should usually be between 1 and 3.",
        buildNodeInstruction(nodes, "REF DISTRIBUTOR"),
      ].filter(Boolean).join("\n"),
      [
        "final_shot_prompts:",
        JSON.stringify(promptPackWithFallbackRefs.shots ?? [], null, 2),
        "available_photo_references:",
        JSON.stringify(references, null, 2),
        "location_lock:",
        location,
      ].join("\n\n"),
    )
  } catch {
    refAssignments = buildFallbackRefAssignments(promptPackWithFallbackRefs)
  }
  outputs["REF DISTRIBUTOR"] = refAssignments
  onStage?.("REF DISTRIBUTOR", refAssignments)

  const promptPack = mergeLucBessonRefAssignments(promptPackWithFallbackRefs, refAssignments)
  outputs["Besson Prompt Pack Output"] = promptPack
  onStageStart?.("Besson Prompt Pack Output")
  onStage?.("Besson Prompt Pack Output", promptPack)
  onStageStart?.("REF DISTRIBUTOR Output")
  outputs["REF DISTRIBUTOR Output"] = refAssignments
  onStage?.("REF DISTRIBUTOR Output", refAssignments)

  return {
    modelId,
    outputs,
    graphPatch: buildLucBessonGraphPatch(nodes, promptPack),
  }
}