/**
 * KOZA Breakdown Test Suite
 * Прогоняет разные сценарии через /api/chat и записывает результаты
 */

const BASE = "http://localhost:3001"
const MODEL = "gpt-4o"

// ── Тестовые сценарии (разные жанры, ~20 сек экранного времени) ──

const SCENARIOS = [
  {
    genre: "Триллер",
    title: "Ночной звонок",
    sceneText: `INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора. БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — номер скрыт. Медленно берёт трубку.

БОРИС
Алло?

Пауза. Тяжёлое дыхание на том конце.

ГОЛОС (V.O.)
Выходи. У тебя пять минут.

Борис роняет трубку. Смотрит в окно — на улице стоит чёрная машина с включёнными фарами.`
  },
  {
    genre: "Мелодрама",
    title: "Последнее письмо",
    sceneText: `INT. КУХНЯ — УТРО

Солнечный свет заливает маленькую кухню. МАРИНА (35) сидит за столом. Перед ней чашка остывшего кофе и конверт. Она долго смотрит на конверт, потом аккуратно открывает.

Читает. Глаза наполняются слезами. Откладывает письмо. Берёт фотографию с холодильника — на ней она и АНДРЕЙ, молодые, счастливые.

МАРИНА
(шёпотом)
Зачем ты так...

Прижимает фотографию к груди. За окном начинается дождь.`
  },
  {
    genre: "Боевик",
    title: "Погоня",
    sceneText: `EXT. ПРОМЗОНА — НОЧЬ

НИКИТА (30) бежит между ржавыми контейнерами. За ним — двое в чёрном. Дышит тяжело. Оглядывается — преследователи ближе.

Резко сворачивает за угол. Тупик. Высокий забор с колючей проволокой.

Никита разбегается и прыгает — цепляется за забор, рвёт куртку. Перелетает на другую сторону. Падает. Встаёт. Бежит дальше.

Преследователи останавливаются у забора. Один достаёт рацию.

ПРЕСЛЕДОВАТЕЛЬ
Ушёл. Восточный периметр.`
  },
  {
    genre: "Хоррор",
    title: "Подвал",
    sceneText: `INT. ПОДВАЛ СТАРОГО ДОМА — НОЧЬ

Луч фонарика выхватывает бетонные стены. ЛЕНА (25) спускается по скрипучей лестнице. Каждый шаг — эхо.

Внизу — запах сырости. Старые коробки, покрытые пылью. В углу — дверь, которой не должно быть.

Лена подходит. Дверь чуть приоткрыта. Из щели — холодный сквозняк. За дверью — звук. Похоже на шёпот.

Лена тянет ручку. Дверь открывается. Темнота. Фонарик мигает и гаснет.

Тишина. Потом — скрип за спиной.`
  },
  {
    genre: "Комедия",
    title: "Собеседование",
    sceneText: `INT. ОФИС — ДЕНЬ

Стерильный белый офис. HR-МЕНЕДЖЕР (40) в костюме сидит за столом. Напротив — КОСТЯ (28), в мятой рубашке, волосы торчат.

HR-МЕНЕДЖЕР
Расскажите о вашем главном достижении.

КОСТЯ
(задумавшись)
Я однажды собрал шкаф из IKEA без инструкции. С первого раза.

HR-менеджер моргает. Записывает что-то.

HR-МЕНЕДЖЕР
А профессиональные достижения?

КОСТЯ
Это и было профессиональное. Я дизайнер мебели.

HR-менеджер роняет ручку. Костя улыбается.`
  },
  {
    genre: "Драма",
    title: "Станция",
    sceneText: `EXT. ЖЕЛЕЗНОДОРОЖНАЯ СТАНЦИЯ — ВЕЧЕР

Пустая платформа. Ветер гонит мусор. СТАРИК (70) сидит на скамейке с чемоданом. Расписание показывает задержку.

Подходит ДЕВОЧКА (8), садится рядом. Болтает ногами.

ДЕВОЧКА
Вы кого ждёте?

СТАРИК
(не сразу)
Никого. Уезжаю.

ДЕВОЧКА
А куда?

Старик смотрит на пути. Долгая пауза.

СТАРИК
Домой.

Вдали гудит поезд. Старик встаёт. Девочка машет ему.`
  },
]

// ── Системные промпты (упрощённые, для тестирования всех стадий) ──

const SCENE_ANALYST_SYSTEM = `You are Scene Analyst in a cinematic pipeline.
Analyze the scene and return a JSON object:
{
  "sceneSummary": "2-3 sentence summary",
  "dramaticBeats": [{"title": "...", "summary": "...", "emotionalShift": "..."}],
  "emotionalTone": "...",
  "geography": "...",
  "characterPresence": ["name1", "name2"],
  "recommendedShotCount": 4
}
Return ONLY valid JSON, no markdown.`

const SHOT_PLANNER_SYSTEM = `You are Shot Planner in a cinematic pipeline.
Given scene analysis, plan specific shots. Return JSON array:
[
  {
    "id": "shot-1",
    "label": "Establishing shot",
    "shotSize": "Wide|Medium|Close-up|Extreme Close-up",
    "cameraMotion": "Static|Pan Left|Pan Right|Push In|Pull Out|Tracking|Handheld|Crane",
    "subjectFocus": "what camera sees",
    "action": "what happens",
    "directorNote": "director's intent",
    "cameraNote": "operator instruction",
    "duration": 3000
  }
]
Return ONLY valid JSON array, no markdown. Aim for 3-6 shots for a 20-second scene.`

const PROMPT_COMPOSER_SYSTEM = `You are Prompt Composer in a cinematic pipeline.
Given shot plan, compose image generation prompts. Return JSON array:
[
  {
    "shotId": "shot-1",
    "imagePrompt": "detailed prompt for image generation, cinematic, specific visual details",
    "visualDescription": "what viewer sees in this frame"
  }
]
Return ONLY valid JSON array, no markdown. Each imagePrompt should be 2-3 sentences, hyper-specific and visual.`

// ── Helper ──

async function callChat(system, userMessage, model = MODEL) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      modelId: model,
      system,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  // Read stream
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    full += decoder.decode(value, { stream: true })
  }
  full += decoder.decode()
  return full
}

function parseJSON(text) {
  // Try to extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text)
}

// ── Main ──

async function runBreakdown(scenario) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`🎬 ${scenario.genre}: "${scenario.title}"`)
  console.log(`${"=".repeat(60)}`)

  // Stage 1: Scene Analysis
  console.log("  [1/3] Scene Analyst...")
  const analysisRaw = await callChat(SCENE_ANALYST_SYSTEM, scenario.sceneText)
  let analysis
  try {
    analysis = parseJSON(analysisRaw)
    console.log(`  ✓ Analysis: ${analysis.dramaticBeats?.length || 0} beats, tone: ${analysis.emotionalTone}`)
  } catch (e) {
    console.log(`  ✗ Parse error: ${e.message}`)
    analysis = { sceneSummary: analysisRaw.slice(0, 200), dramaticBeats: [], emotionalTone: "unknown", recommendedShotCount: 4 }
  }

  // Stage 2: Shot Planner
  console.log("  [2/3] Shot Planner...")
  const shotPlanRaw = await callChat(
    SHOT_PLANNER_SYSTEM,
    `Scene analysis:\n${JSON.stringify(analysis, null, 2)}\n\nOriginal scene:\n${scenario.sceneText}`
  )
  let shots
  try {
    shots = parseJSON(shotPlanRaw)
    console.log(`  ✓ Shots: ${shots.length} planned`)
  } catch (e) {
    console.log(`  ✗ Parse error: ${e.message}`)
    shots = []
  }

  // Stage 3: Prompt Composer
  console.log("  [3/3] Prompt Composer...")
  const promptsRaw = await callChat(
    PROMPT_COMPOSER_SYSTEM,
    `Shot plan:\n${JSON.stringify(shots, null, 2)}\n\nScene:\n${scenario.sceneText}`
  )
  let prompts
  try {
    prompts = parseJSON(promptsRaw)
    console.log(`  ✓ Prompts: ${prompts.length} composed`)
  } catch (e) {
    console.log(`  ✗ Parse error: ${e.message}`)
    prompts = []
  }

  return { scenario, analysis, shots, prompts }
}

function formatResults(results) {
  const lines = []
  lines.push("# KOZA Breakdown Test Results")
  lines.push(`**Date:** ${new Date().toISOString().split("T")[0]}`)
  lines.push(`**Model:** ${MODEL}`)
  lines.push(`**Scenarios tested:** ${results.length}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const r of results) {
    lines.push(`## ${r.scenario.genre}: "${r.scenario.title}"`)
    lines.push("")

    // Сцена
    lines.push("### Текст сцены (~20 сек)")
    lines.push("```")
    lines.push(r.scenario.sceneText.trim())
    lines.push("```")
    lines.push("")

    // Анализ
    lines.push("### Анализ сцены")
    lines.push(`- **Саммари:** ${r.analysis?.sceneSummary || "—"}`)
    lines.push(`- **Тон:** ${r.analysis?.emotionalTone || "—"}`)
    lines.push(`- **География:** ${r.analysis?.geography || "—"}`)
    lines.push(`- **Персонажи:** ${(r.analysis?.characterPresence || []).join(", ") || "—"}`)
    lines.push(`- **Рекомендуемое кол-во кадров:** ${r.analysis?.recommendedShotCount || "—"}`)
    lines.push(`- **Биты:** ${r.analysis?.dramaticBeats?.length || 0}`)
    for (const beat of (r.analysis?.dramaticBeats || [])) {
      lines.push(`  - **${beat.title || "Beat"}:** ${beat.summary || ""} (${beat.emotionalShift || ""})`)
    }
    lines.push("")

    // Таблица кадров
    lines.push("### Раскадровка")
    lines.push("")
    lines.push("| # | Кадр | Действие / Режиссёр / Оператор | Промпт |")
    lines.push("|---|------|-------------------------------|--------|")

    for (let i = 0; i < r.shots.length; i++) {
      const shot = r.shots[i]
      const prompt = r.prompts.find(p => p.shotId === shot.id)

      const col2Parts = []
      if (shot.action) col2Parts.push(`**Действие:** ${shot.action}`)
      if (shot.directorNote) col2Parts.push(`**Режиссёр:** ${shot.directorNote}`)
      if (shot.cameraNote) col2Parts.push(`**Оператор:** ${shot.cameraNote}`)
      if (shot.shotSize) col2Parts.push(`**План:** ${shot.shotSize}`)
      if (shot.cameraMotion) col2Parts.push(`**Движение:** ${shot.cameraMotion}`)

      const col2 = col2Parts.join(" / ") || shot.subjectFocus || "—"
      const col3 = prompt?.imagePrompt || "—"

      lines.push(`| ${i + 1} | ${shot.label || `Shot ${i+1}`} | ${col2.replace(/\n/g, " ")} | ${col3.replace(/\n/g, " ")} |`)
    }

    lines.push("")
    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

// ── Run ──

async function main() {
  console.log("🚀 KOZA Breakdown Test Suite")
  console.log(`Testing ${SCENARIOS.length} scenarios with model: ${MODEL}`)
  console.log("")

  const results = []

  for (const scenario of SCENARIOS) {
    try {
      const result = await runBreakdown(scenario)
      results.push(result)
    } catch (e) {
      console.error(`  ✗ FAILED: ${e.message}`)
      results.push({
        scenario,
        analysis: { sceneSummary: `ERROR: ${e.message}` },
        shots: [],
        prompts: [],
      })
    }
  }

  // Write results
  const output = formatResults(results)
  const fs = await import("fs")
  const outPath = "/Users/macbookbpm/Desktop/KOZA/DOCUMENTATION/breakdown-test-results.md"
  fs.writeFileSync(outPath, output, "utf-8")
  console.log(`\n✅ Results written to: ${outPath}`)
  console.log(`Total scenarios: ${results.length}`)
  console.log(`Successful: ${results.filter(r => r.shots.length > 0).length}`)
}

main().catch(console.error)
