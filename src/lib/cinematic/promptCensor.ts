/**
 * Prompt Censor — финальная валидация и оптимизация промпта перед генерацией.
 *
 * Задачи:
 * 1. Якоря: проверить что персонажи/локации/предметы в промпте соответствуют сцене
 * 2. Противоречия: время суток, INT/EXT, настроение
 * 3. Мусор: дубли, пустые инструкции, слишком длинные описания
 * 4. Предметы: в будущем — парсинг реквизита из сценария и валидация
 */

import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import type { TimelineShot } from "@/store/timeline"

// ─── Types ───

export type CensorSeverity = "error" | "warning" | "info"

export interface CensorIssue {
  severity: CensorSeverity
  code: string
  message: string
  suggestion?: string
}

export interface CensorResult {
  issues: CensorIssue[]
  optimizedPrompt: string
  removed: string[]
}

// ─── Censor Rules ───

function checkCharacterAnchors(
  prompt: string,
  shot: TimelineShot,
  characters: CharacterEntry[],
): CensorIssue[] {
  const issues: CensorIssue[] = []
  const lower = prompt.toLowerCase()
  const sceneText = (shot.sourceText || "").toLowerCase()

  for (const char of characters) {
    if (!char.name || char.name.length < 2) continue
    const name = char.name.toLowerCase()
    const inPrompt = lower.includes(name)
    const inScene = sceneText.includes(name) || char.sceneIds.includes(shot.sceneId || "")

    // Персонаж в промпте, но не в сцене
    if (inPrompt && !inScene && sceneText.length > 10) {
      issues.push({
        severity: "warning",
        code: "char_not_in_scene",
        message: `Персонаж "${char.name}" упомянут в промпте, но не найден в тексте сцены.`,
        suggestion: `Убедитесь что ${char.name} действительно присутствует в этой сцене.`,
      })
    }

    // Персонаж в сцене, но не в промпте
    if (!inPrompt && inScene) {
      issues.push({
        severity: "info",
        code: "char_missing_from_prompt",
        message: `Персонаж "${char.name}" есть в сцене, но не упомянут в промпте.`,
        suggestion: `Добавьте ${char.name} в промпт если он должен быть виден в кадре.`,
      })
    }
  }

  return issues
}

function checkLocationAnchors(
  prompt: string,
  shot: TimelineShot,
  locations: LocationEntry[],
): CensorIssue[] {
  const issues: CensorIssue[] = []
  const lower = prompt.toLowerCase()

  for (const loc of locations) {
    if (!loc.name || loc.name.length < 3) continue
    const inPrompt = lower.includes(loc.name.toLowerCase())
    const isSceneLoc = loc.sceneIds.includes(shot.sceneId || "")

    // Локация в промпте, но это не локация этой сцены
    if (inPrompt && !isSceneLoc) {
      issues.push({
        severity: "warning",
        code: "loc_wrong_scene",
        message: `Локация "${loc.name}" упомянута, но не привязана к этой сцене.`,
      })
    }
  }

  return issues
}

function checkTimeOfDayContradiction(
  prompt: string,
  shot: TimelineShot,
  locations: LocationEntry[],
): CensorIssue[] {
  const issues: CensorIssue[] = []
  const lower = prompt.toLowerCase()
  const sceneLoc = locations.find((l) => l.sceneIds.includes(shot.sceneId || ""))
  const timeOfDay = sceneLoc?.timeOfDay?.toLowerCase() || ""

  if (!timeOfDay) return issues

  const nightWords = ["ночь", "night", "ночной", "ночное"]
  const dayWords = ["день", "day", "дневной", "дневное", "утро", "morning", "dawn"]

  const isNightScene = nightWords.some((w) => timeOfDay.includes(w))
  const isDayScene = dayWords.some((w) => timeOfDay.includes(w))

  if (isNightScene && dayWords.some((w) => lower.includes(w) && !lower.includes("ночь") && !lower.includes("night"))) {
    issues.push({
      severity: "error",
      code: "time_contradiction",
      message: `Сцена помечена как "${timeOfDay}", но промпт содержит дневное освещение.`,
      suggestion: "Уберите упоминания дневного света или измените время суток.",
    })
  }

  if (isDayScene && nightWords.some((w) => lower.includes(w) && !lower.includes("день") && !lower.includes("day"))) {
    issues.push({
      severity: "error",
      code: "time_contradiction",
      message: `Сцена помечена как "${timeOfDay}", но промпт содержит ночное освещение.`,
      suggestion: "Уберите упоминания ночного света или измените время суток.",
    })
  }

  return issues
}

function checkRedundancy(prompt: string): { issues: CensorIssue[]; cleaned: string; removed: string[] } {
  const issues: CensorIssue[] = []
  const removed: string[] = []
  let cleaned = prompt

  // Дубликаты строк
  const lines = cleaned.split("\n")
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const line of lines) {
    const normalized = line.trim().toLowerCase()
    if (!normalized) { deduped.push(line); continue }
    if (seen.has(normalized)) {
      removed.push(line.trim())
      issues.push({ severity: "info", code: "duplicate_line", message: `Удалена дублирующаяся строка: "${line.trim().slice(0, 50)}..."` })
    } else {
      seen.add(normalized)
      deduped.push(line)
    }
  }
  cleaned = deduped.join("\n")

  // Двойные пробелы
  cleaned = cleaned.replace(/  +/g, " ")

  // Пустые строки подряд
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

  // Слишком длинный промпт
  if (cleaned.length > 3000) {
    issues.push({
      severity: "warning",
      code: "prompt_too_long",
      message: `Промпт очень длинный (${cleaned.length} символов). Генераторы лучше работают с промптами до 2000-2500 символов.`,
      suggestion: "Отключите некоторые модификаторы или сократите описания.",
    })
  }

  return { issues, cleaned, removed }
}

// ─── Continuity Censor (cross-shot, full scene) ───

export interface ContinuityCensorResult {
  issues: CensorIssue[]
  /** Per-shot suggestions injected into prompts */
  shotDirectives: Map<string, string[]>
}

/**
 * Анализирует все шоты одной сцены вместе.
 * Проверяет: позиции персонажей, screen direction, последовательность появлений,
 * пропавшие/появившиеся без причины объекты.
 */
export function censorSceneContinuity(
  sceneShots: TimelineShot[],
  characters: CharacterEntry[],
  locations: LocationEntry[],
): ContinuityCensorResult {
  const issues: CensorIssue[] = []
  const shotDirectives = new Map<string, string[]>()

  if (sceneShots.length < 2) return { issues, shotDirectives }

  const sorted = [...sceneShots].sort((a, b) => a.order - b.order)

  // ── 1. Трекинг присутствия персонажей по шотам ──
  const charPresenceMap = new Map<string, { shotIds: string[]; firstShot: number; lastShot: number }>()

  for (let i = 0; i < sorted.length; i++) {
    const shot = sorted[i]
    const promptLower = [shot.imagePrompt, shot.caption, shot.label, shot.notes, shot.directorNote].join(" ").toLowerCase()

    for (const char of characters) {
      if (!char.name || char.name.length < 2) continue
      if (promptLower.includes(char.name.toLowerCase())) {
        const entry = charPresenceMap.get(char.name) || { shotIds: [], firstShot: i, lastShot: i }
        entry.shotIds.push(shot.id)
        entry.lastShot = i
        charPresenceMap.set(char.name, entry)
      }
    }
  }

  // ── 2. Проверка разрывов в присутствии персонажа ──
  // Если персонаж в shot 1 и shot 4, но не в 2 и 3 — это подозрительно
  for (const [name, presence] of charPresenceMap) {
    if (presence.firstShot === presence.lastShot) continue
    for (let i = presence.firstShot + 1; i < presence.lastShot; i++) {
      if (!presence.shotIds.includes(sorted[i].id)) {
        const gapShot = sorted[i]
        issues.push({
          severity: "warning",
          code: "char_continuity_gap",
          message: `"${name}" пропадает в Shot ${i + 1}, хотя есть в Shot ${presence.firstShot + 1} и Shot ${presence.lastShot + 1}.`,
          suggestion: `Если ${name} не уходит из сцены — добавьте его в кадр ${i + 1} хотя бы на фоне. Если уходит — добавьте указание "уходит" в предыдущем шоте.`,
        })

        // Добавляем директиву для шота
        const directives = shotDirectives.get(gapShot.id) || []
        directives.push(`${name} должен быть виден в этом кадре (присутствует в предыдущем и следующем).`)
        shotDirectives.set(gapShot.id, directives)
      }
    }
  }

  // ── 3. Проверка screen direction (180° rule) ──
  // Ищем ключевые слова направления в промптах
  const directionWords = {
    left: ["слева", "left", "лево", "налево", "влево"],
    right: ["справа", "right", "право", "направо", "вправо"],
  }

  let lastDirection: "left" | "right" | null = null
  let lastDirectionShotIndex = -1

  for (let i = 0; i < sorted.length; i++) {
    const prompt = [sorted[i].imagePrompt, sorted[i].caption, sorted[i].cameraNote, sorted[i].directorNote].join(" ").toLowerCase()

    let currentDirection: "left" | "right" | null = null
    if (directionWords.left.some((w) => prompt.includes(w))) currentDirection = "left"
    if (directionWords.right.some((w) => prompt.includes(w))) currentDirection = "right"

    // Если направление резко поменялось без монтажной отбивки — предупреждаем
    if (lastDirection && currentDirection && lastDirection !== currentDirection && i - lastDirectionShotIndex === 1) {
      // Проверяем, не является ли это reverse shot (допустимо)
      const isReverseShot = prompt.includes("reverse") || prompt.includes("обратный") || prompt.includes("реверс")
      if (!isReverseShot) {
        issues.push({
          severity: "warning",
          code: "screen_direction_flip",
          message: `Shot ${lastDirectionShotIndex + 1} → Shot ${i + 1}: смена screen direction (${lastDirection}→${currentDirection}) без reverse shot.`,
          suggestion: "Проверьте правило 180°. Если это не reverse shot — укажите причину смены направления.",
        })
      }
    }

    if (currentDirection) {
      lastDirection = currentDirection
      lastDirectionShotIndex = i
    }
  }

  // ── 4. Внезапное появление персонажа ──
  for (const [name, presence] of charPresenceMap) {
    if (presence.firstShot > 0) {
      const firstShotIndex = presence.firstShot
      const prevShot = sorted[firstShotIndex - 1]
      const prevPrompt = [prevShot.imagePrompt, prevShot.caption, prevShot.directorNote].join(" ").toLowerCase()

      // Если персонаж не упоминается в предыдущем кадре — нужен вход
      if (!prevPrompt.includes(name.toLowerCase())) {
        const hasEntrance = prevPrompt.includes("входит") || prevPrompt.includes("появля") || prevPrompt.includes("enter") || prevPrompt.includes("приходит")
        if (!hasEntrance) {
          issues.push({
            severity: "info",
            code: "char_sudden_appear",
            message: `"${name}" появляется в Shot ${firstShotIndex + 1} без подготовки в Shot ${firstShotIndex}.`,
            suggestion: `Добавьте вход ${name} в предыдущий кадр (дверь открывается, шаги, тень) или объясните появление.`,
          })
        }
      }
    }
  }

  // ── 5. Проверка что первый и последний шоты имеют "якорный" характер ──
  const firstShot = sorted[0]
  const firstPrompt = [firstShot.imagePrompt, firstShot.caption, firstShot.directorNote].join(" ").toLowerCase()
  const hasEstablishing = firstPrompt.includes("establishing") || firstPrompt.includes("общий план") || firstPrompt.includes("wide") || (firstShot.shotSize || "").toLowerCase().includes("wide")

  if (!hasEstablishing && sorted.length >= 3) {
    issues.push({
      severity: "info",
      code: "no_establishing",
      message: "Сцена не начинается с общего плана. Это может затруднить ориентацию зрителя.",
      suggestion: "Рассмотрите добавление establishing shot (общий план) в начало сцены.",
    })
  }

  return { issues, shotDirectives }
}

// ─── Main Censor Function ───

export function censorPrompt(
  prompt: string,
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[],
): CensorResult {
  const allIssues: CensorIssue[] = []

  // 1. Якоря персонажей
  allIssues.push(...checkCharacterAnchors(prompt, shot, characters))

  // 2. Якоря локаций
  allIssues.push(...checkLocationAnchors(prompt, shot, locations))

  // 3. Противоречия времени суток
  allIssues.push(...checkTimeOfDayContradiction(prompt, shot, locations))

  // 4. Очистка от мусора и дубликатов
  const { issues: redundancyIssues, cleaned, removed } = checkRedundancy(prompt)
  allIssues.push(...redundancyIssues)

  return {
    issues: allIssues,
    optimizedPrompt: cleaned.trim(),
    removed,
  }
}

// ─── Quick severity check ───

export function hasErrors(result: CensorResult): boolean {
  return result.issues.some((i) => i.severity === "error")
}

export function hasWarnings(result: CensorResult): boolean {
  return result.issues.some((i) => i.severity === "warning")
}
