/**
 * Director Vision Translator
 *
 * Переводит абстрактную режиссёрскую заметку в конкретные визуальные указания
 * для генератора изображений.
 *
 * "Ощущение ловушки, НЕЗНАКОМЕЦ как маятник"
 *   → "claustrophobic vertical framing, narrow concrete corridor converging
 *      to vanishing point, harsh single overhead light, figure small in frame,
 *      long stretched shadow on floor, low camera angle emphasizing towering walls"
 */

const SYSTEM_PROMPT = `You are a Director-to-Visual translator for a cinematic storyboard system.

Your job: take a director's abstract note and translate it into CONCRETE visual language that an image generator can render.

RULES:
- Output ONLY visual descriptions — what the camera SEES
- Convert emotions → lighting, color temperature, contrast
- Convert metaphors → composition, perspective, framing
- Convert atmosphere → textures, weather, depth of field, lens effects
- Convert character states → body language, posture, facial micro-expressions
- Convert "feelings" → spatial relationships, scale, negative space
- Keep it under 2-3 sentences
- Write in the SAME language as the input (Russian → Russian, English → English)
- No instructions, no "should", no "must" — only visual descriptions

TRANSLATION PATTERNS:
- "тревога/anxiety" → тесное кадрирование, искажённая перспектива, холодный свет, резкие тени
- "одиночество/loneliness" → много пустого пространства, маленькая фигура, приглушённые цвета
- "опасность/danger" → низкий ракурс, красные акценты, размытый задний план, контрастное освещение
- "ловушка/trap" → замкнутая композиция, стены сжимают кадр, нет выхода в перспективе
- "надежда/hope" → луч света, тёплый акцент среди холодных тонов, открытое пространство вдали
- "власть/power" → ракурс снизу, фигура доминирует, симметрия, жёсткий свет
- "уязвимость/vulnerability" → ракурс сверху, мягкий рассеянный свет, открытая поза

EXAMPLE:
Input: "Сделать зрителя соучастником подслушивания и усилить чувство, что тайна уже наблюдаема самой комнатой."
Output: "Съёмка через щель или дверной проём, часть кадра перекрыта тёмным силуэтом стены, эффект подглядывания. Комната слегка искажена широкоугольным объективом, углы затемнены виньеткой, создавая ощущение что пространство наблюдает."

EXAMPLE:
Input: "Ощущение ловушки, НЕЗНАКОМЕЦ как маятник"
Output: "Вертикальная композиция, бетонные стены сжимают кадр с обеих сторон. Фигура в центре, раскачивающийся источник света создаёт мерцающие тени, чередующиеся полосы света и тьмы на лице и стенах."

Return ONLY the visual translation, nothing else.`

export interface DirectorVisionInput {
  directorNote: string
  cameraNote?: string
  sceneContext?: string
}

export function buildDirectorVisionPrompt(input: DirectorVisionInput): string {
  const parts = [`Режиссёрская заметка: ${input.directorNote}`]
  if (input.cameraNote) parts.push(`Операторская заметка: ${input.cameraNote}`)
  if (input.sceneContext) parts.push(`Контекст сцены: ${input.sceneContext}`)
  return parts.join("\n")
}

export async function translateDirectorVision(input: DirectorVisionInput): Promise<string> {
  const userMessage = buildDirectorVisionPrompt(input)

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      modelId: "gpt-4o",
      system: SYSTEM_PROMPT,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    throw new Error(`Vision translator failed: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let result = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  result += decoder.decode()

  return result.trim()
}

/**
 * Локальный fallback — простая замена ключевых слов на визуальные описания.
 * Используется если AI недоступен.
 */
export function translateDirectorVisionLocally(directorNote: string): string {
  let visual = directorNote

  const replacements: [RegExp, string][] = [
    [/ощущени[еяю]\s*ловушк[иы]/gi, "замкнутая композиция, стены сжимают кадр, нет выхода в перспективе"],
    [/тревог[аи]/gi, "тесное кадрирование, холодный свет, резкие диагональные тени"],
    [/одиночеств[оа]/gi, "много пустого пространства вокруг фигуры, приглушённые цвета"],
    [/опасност[ьи]/gi, "низкий ракурс, контрастное освещение, размытый задний план"],
    [/страх/gi, "искажённая перспектива, тёмные углы, единственный источник света"],
    [/надежд[аы]/gi, "тёплый луч света среди холодных тонов, открытое пространство"],
    [/как маятник/gi, "раскачивающийся источник света, мерцающие полосы тени"],
    [/подслушивани[еяю]/gi, "съёмка через щель, часть кадра перекрыта тёмным силуэтом"],
    [/подглядывани[еяю]/gi, "кадр через дверной проём, виньетка по краям"],
    [/соучастник/gi, "POV-ракурс, камера на уровне глаз наблюдателя"],
    [/внутренн\w+ страх/gi, "искажённая перспектива, лицо частично в тени, дрожащий свет"],
    [/демонстрировать/gi, ""],
    [/усилить чувство/gi, ""],
    [/сделать зрителя/gi, ""],
  ]

  for (const [pattern, replacement] of replacements) {
    visual = visual.replace(pattern, replacement)
  }

  return visual.replace(/\s{2,}/g, " ").replace(/^[,.\s]+|[,.\s]+$/g, "").trim()
}
