/**
 * Post-breakdown step: takes propCandidates from SceneAnalyst
 * and enriches Bible props with ready-to-generate appearancePrompts.
 *
 * Purely additive — never deletes or overwrites existing data.
 */
import { useBibleStore } from "@/store/bible"
import type { SceneAnalysis } from "@/lib/cinematic/sceneAnalyst"

interface EnrichedProp {
  name: string
  appearancePrompt: string
}

/**
 * Calls LLM to generate visual appearance prompts for prop candidates
 * that don't yet have one in the Bible.
 */
async function fetchPropAppearancePrompts(
  propNames: string[],
  sceneText: string,
): Promise<EnrichedProp[]> {
  if (propNames.length === 0) return []

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: `Ты — художник-постановщик. Для каждого предмета из списка напиши короткое визуальное описание (appearancePrompt) для генерации изображения.

Описание должно содержать: материал, цвет, форма, состояние, эпоха/стиль. Ориентируйся на контекст сцены.
Пиши на русском. Каждое описание — 1-2 предложения, максимум 80 слов.

Предметы: ${propNames.join(", ")}

Текст сцены:
${sceneText.slice(0, 1500)}

Верни JSON массив:
[{"name": "точное название из списка", "appearancePrompt": "визуальное описание"}]

Только JSON, без markdown.`,
      }],
      temperature: 0.3,
    }),
  })

  if (!res.ok) return []

  const reader = res.body?.getReader()
  if (!reader) return []

  const chunks: string[] = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(new TextDecoder().decode(value))
  }

  const raw = chunks.join("").trim()
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is EnrichedProp =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).appearancePrompt === "string",
    )
  } catch {
    return []
  }
}

/**
 * Called after breakdown completes. Enriches Bible with props
 * from sceneAnalyst.propCandidates that are missing appearancePrompt.
 *
 * - Adds new props that don't exist in Bible yet (with prompt)
 * - Fills empty appearancePrompt for existing props
 * - Never overwrites existing prompts or images
 */
export async function enrichPropsFromBreakdown(
  analysis: SceneAnalysis,
  sceneText: string,
  sceneId: string,
): Promise<void> {
  const candidates = analysis.propCandidates
  if (candidates.length === 0) return

  const bible = useBibleStore.getState()

  // Find which candidates need enrichment
  const needPrompt: string[] = []

  for (const name of candidates) {
    const existing = bible.props.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    )
    if (!existing || !existing.appearancePrompt.trim()) {
      needPrompt.push(name)
    }
  }

  if (needPrompt.length === 0) return

  const enriched = await fetchPropAppearancePrompts(needPrompt, sceneText)
  if (enriched.length === 0) return

  const { addProp, updateProp } = useBibleStore.getState()

  for (const item of enriched) {
    if (!item.appearancePrompt.trim()) continue

    const existing = useBibleStore.getState().props.find(
      (p) => p.name.toLowerCase() === item.name.toLowerCase(),
    )

    if (existing) {
      // Only fill if empty — never overwrite user data
      if (!existing.appearancePrompt.trim()) {
        updateProp(existing.id, { appearancePrompt: item.appearancePrompt })
      }
    } else {
      // Add new prop to Bible
      const id = item.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-zа-яё0-9-]/gi, "")
      addProp({
        id,
        name: item.name,
        description: "",
        sceneIds: [sceneId],
        referenceImages: [],
        canonicalImageId: null,
        generatedImageUrl: null,
        imageBlobKey: null,
        appearancePrompt: item.appearancePrompt,
      })
    }
  }
}
