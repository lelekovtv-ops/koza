#!/usr/bin/env node
/**
 * Test script: runs the Pipeline Constructor chain and analyzes final prompts.
 * Usage: node scripts/test-pipeline.mjs
 */

const BASE = "http://localhost:3000"

const SCENE_TEXT = `INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора.
БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — скрытый номер.
Берёт трубку.

БОРИС
Алло?

Пауза. Тяжёлое дыхание на том конце.`

const STYLE = "Anime style, cel shading, dramatic lighting"

const BIBLE = {
  screenplay: "Криминальный триллер. Борис — бывший следователь, замешанный в старом деле.",
  characters: [{ name: "БОРИС", appearance: "55 лет, усталое лицо, щетина, мятая рубашка", hasRefImage: false }],
  locations: [{ name: "КВАРТИРА БОРИСА", description: "Тесная комната, старый телевизор, стол с документами", hasRefImage: false }],
  props: [
    { name: "Телефон", description: "Старый мобильный, скрытый номер", hasRefImage: false },
    { name: "Пепельница", description: "Полная окурков", hasRefImage: false },
    { name: "Документы", description: "Старые дела, папки, бумаги", hasRefImage: false },
    { name: "Телевизор", description: "Старый ТВ, единственный источник света", hasRefImage: false },
  ],
}

async function callChat(system, userMessage, model = "claude-sonnet-4-20250514", temperature = 0.7) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: userMessage }], modelId: model, system, temperature }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    full += decoder.decode(value, { stream: true })
  }
  return full + decoder.decode()
}

function tryParse(text) {
  try {
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
    const match = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : null
  } catch { return null }
}

function buildContext(results) {
  const parts = []
  for (const [key, val] of Object.entries(results)) {
    parts.push(`${key}: ${JSON.stringify(val)}`)
  }
  parts.push(`scene: ${SCENE_TEXT}`)
  parts.push(`style: ${STYLE}`)
  parts.push(`screenplay: ${BIBLE.screenplay}`)
  parts.push(`characters: ${JSON.stringify(BIBLE.characters)}`)
  parts.push(`locations: ${JSON.stringify(BIBLE.locations)}`)
  parts.push(`props: ${JSON.stringify(BIBLE.props)}`)
  return parts.join("\n\n")
}

// ── Module prompts (copied from page.tsx) ──

const SCENE_ANALYST_PROMPT = `You are Scene Analyst — the first stage of a cinematic pipeline.
Analyze the scene and return structured analysis.

Return ONE valid JSON:
{
  "sceneSummary": "суть сцены в 2-3 предложениях",
  "emotionalTone": "эмоциональный тон",
  "geography": "пространство сцены, как устроена физически",
  "characterPresence": ["имена персонажей"],
  "propCandidates": ["важные предметы"],
  "visualMotifs": ["визуальные мотивы"],
  "continuityRisks": ["риски непрерывности"],
  "recommendedShotCount": 6
}

Respond in Russian. JSON only, no markdown.`

const PROP_SCANNER_PROMPT = `You are Prop Scanner — a production designer's assistant.

Analyze the scene text carefully. Find EVERY physical object, prop, and set piece mentioned or implied.

You receive: scene text + existing Bible props.

For EACH prop determine:
1. Is it already in Bible? → mark as "existing"
2. New discovery? → mark as "new"
3. For each prop: Russian description + English appearance prompt for image generation
4. Mark which props are ALREADY in Bible vs NEW

importance: "high" = ключевой для сцены, "medium" = присутствует, "low" = фоновый.

Return ONE valid JSON:
{
  "discoveredProps": [
    {
      "name": "name",
      "description": "описание",
      "appearancePrompt": "English visual description for image gen, 20-30 words",
      "importance": "high/medium/low",
      "status": "existing/new",
      "mentionedIn": "цитата из сцены"
    }
  ]
}
JSON only, no markdown.`

const SHOT_PLANNER_PROMPT = `You are Shot Planner — a Fincher-style cinematographer.

Based on scene analysis AND discovered props, plan 4-8 shots.

═══ ПРИНЦИПЫ ═══
- КАМЕРА НАБЛЮДАЕТ. Surveillance footage.
- ГЕОМЕТРИЯ. Предметы = улики.
- ОДИН ИСТОЧНИК СВЕТА. Жёсткая граница свет/тень.
- ПЕРВЫЙ КАДР — самый нестандартный.

═══ ПРОПСЫ В КАДРЕ ═══
Для КАЖДОГО кадра укажи какие КОНКРЕТНЫЕ предметы ВИДНЫ в этом кадре.
Используй список из Prop Scanner. Предмет может быть виден, но не в фокусе.

Return JSON:
{
  "shots": [
    {
      "id": "shot-1",
      "title": "название",
      "shotSize": "Wide/Medium/Close-up/ECU",
      "angle": "конкретный ракурс подробно",
      "cameraMotion": "Static/Push In/Tracking/Pan/Crane/Handheld",
      "composition": "что где в кадре",
      "light": "источник света и тени",
      "color": "палитра",
      "lens": "объектив mm + движение",
      "subject": "главный субъект",
      "purpose": "монтажная функция",
      "visibleProps": ["Пепельница", "Документы", "Телевизор"],
      "propNotes": "Пепельница на переднем плане как якорь, ТВ даёт свет из фона"
    }
  ]
}

Russian descriptions. JSON only.`

const PROP_DISTRIBUTOR_PROMPT = `You are Prop Distributor — an experienced set decorator and director of photography combined.

You receive: shot plan, discovered props (with descriptions), scene text, and Bible data.

YOUR JOB: For EACH shot, decide which props are ACTUALLY VISIBLE given the specific camera angle, shot size, and composition. Think like a DP looking through the viewfinder.

═══ RULES OF VISIBILITY ═══

1. SHOT SIZE determines what fits in frame:
   - ECU (extreme close-up): ONLY the subject detail. Maybe 1 prop if it's IN HAND or touching the subject.
   - Close-up: Face/object + immediate surroundings (30cm radius). 1-3 small props max.
   - Medium: Waist up or desk area. Props on the table, in hands, on nearby surfaces.
   - Wide/Establishing: Entire room visible. Most props CAN be seen, but distant ones are small.

2. CAMERA ANGLE determines what's blocked:
   - High angle (looking down): Table surface visible, wall items NOT visible.
   - Low angle (looking up): Floor items NOT visible, ceiling/upper shelves visible.
   - Eye level: Standard — what a person sitting/standing would see.
   - POV through object: The "through" object is foreground blur, only things BEYOND it are sharp.
   - Over-the-shoulder: Character's back blocks center, props visible on sides.

3. DEPTH matters:
   - Foreground (0-1m from camera): Large in frame, can be out of focus (bokeh). Good for framing.
   - Midground (1-3m): Sharp focus zone. This is where the subject usually is.
   - Background (3m+): Small, often soft. Set dressing, not hero props.

4. WHEN TO EXCLUDE a prop (CRITICAL):
   - Prop is BEHIND the camera → exclude
   - Prop is blocked by subject/furniture → exclude
   - Prop would clutter a clean composition → exclude with reason
   - Prop is on a surface not in frame (e.g. table prop in a ceiling shot) → exclude
   - Adding prop would contradict the shot's purpose (intimate moment doesn't need background noise) → exclude
   - Prop is in the scene but CHARACTER HASN'T INTERACTED with it yet at this point → note timing

5. WHEN TO INCLUDE a prop:
   - Prop is narratively important for THIS specific moment
   - Prop creates visual depth (foreground element for framing)
   - Prop provides context/atmosphere (ashtray = nervousness, documents = work)
   - Prop is a continuity requirement (was in previous shot, must persist)

═══ OUTPUT ═══

Return JSON:
{
  "shots": [
    {
      "shotId": "shot-1",
      "shotSize": "from shot plan",
      "angle": "from shot plan",
      "visibleProps": [
        {
          "name": "Пепельница",
          "placement": "foreground left, out of focus",
          "size_in_frame": "large, ~15% of frame",
          "reason": "Визуальный якорь, подчёркивает нервозность"
        }
      ],
      "excludedProps": [
        {
          "name": "Занавеска",
          "reason": "Камера направлена на стол сверху — окно за кадром"
        }
      ],
      "propAdvice": "Не перегружать кадр — это крупный план рук, пепельница даёт глубину через боке"
    }
  ]
}

Rules:
- Respond in Russian (names, reasons, advice)
- Be SPECIFIC about placement (foreground/mid/background + left/center/right)
- size_in_frame helps the prompt composer know how prominent the prop should be
- ALWAYS explain WHY excluded — this teaches the system
- propAdvice is your professional opinion for the prompt writer
- JSON only, no markdown`

const PROMPT_COMPOSER_PROMPT = `You are Prompt Composer for Gemini image generation (target: 200-350 characters).

You receive: ONE shot (current_item), propDistribution, Bible data (characters, locations, props — some may have hasRefImage=true meaning a reference image exists).

═══ ADAPTIVE RULES ═══

CHARACTER in frame:
- hasRefImage=true (ref photo exists) → write ONLY name, NO appearance text. The ref image speaks for itself.
- hasRefImage=false → include short appearance (age, build, hair, clothing — max 15 words). This is the ONLY way to keep consistency.

LOCATION:
- Wide/Establishing shot → include key visual elements (walls, light source, condition — max 10 words)
- Medium shot → brief setting hint (3-5 words: "cramped dim room")
- Close-up/ECU → SKIP location entirely. Wasted budget.

PROPS (use propDistribution data):
- size_in_frame "large" or foreground → include with material/color (e.g. "overflowing ceramic ashtray")
- size_in_frame "small" or background → name only (e.g. "TV glow behind")
- Excluded by Prop Distributor → do NOT mention
- hasRefImage=true → name + placement only, no description
- hasRefImage=false → name + short visual description

═══ PROMPT STRUCTURE ═══
{Style}. {Shot size + angle}. {Subject — adaptive}. {Visible props — adaptive}. {Light source + shadow direction}. {Color palette}. {Lens}. 16:9. No text, no watermark.

═══ BUDGET ═══
- Target: 40-60 words (200-350 chars)
- NEVER exceed 80 words
- Every word must describe something VISIBLE
- No mood/emotion words (tension, atmosphere, feeling) — only physical things

Return JSON:
{
  "shotId": "from current_item",
  "label": "shot title",
  "directorNote": "режиссёрская заметка (рус)",
  "cameraNote": "заметка оператора (рус)",
  "imagePrompt": "English prompt 40-60 words",
  "hasCharRef": false,
  "hasLocRef": false,
  "promptChars": 280
}

JSON only, no markdown.`

// ═══ RUN ═══

async function main() {
  const results = {}
  const timings = {}

  console.log("═══ PIPELINE TEST ═══\n")

  // Stage 1: Scene Analyst
  console.log("▶ Stage 1: Scene Analyst...")
  let t = Date.now()
  const analysisRaw = await callChat(SCENE_ANALYST_PROMPT, buildContext(results), "claude-sonnet-4-20250514", 0.3)
  const analysis = tryParse(analysisRaw)
  results["scene-analyst"] = analysis
  timings["scene-analyst"] = Date.now() - t
  console.log(`  ✓ ${timings["scene-analyst"]}ms`)
  console.log(`  Summary: ${analysis?.sceneSummary || "PARSE FAIL"}`)
  console.log(`  Props found: ${analysis?.propCandidates?.join(", ") || "none"}\n`)

  // Stage 1.5: Prop Scanner
  console.log("▶ Stage 1.5: Prop Scanner...")
  t = Date.now()
  const propsRaw = await callChat(PROP_SCANNER_PROMPT, buildContext(results), "claude-sonnet-4-20250514", 0.3)
  const props = tryParse(propsRaw)
  results["prop-scanner"] = props
  timings["prop-scanner"] = Date.now() - t
  console.log(`  ✓ ${timings["prop-scanner"]}ms`)
  const discovered = props?.discoveredProps || []
  console.log(`  Discovered: ${discovered.length} props`)
  for (const p of discovered) {
    console.log(`    ${p.status === "new" ? "🆕" : "📦"} ${p.name} [${p.importance}] — ${p.description}`)
  }
  console.log()

  // Stage 2: Shot Planner
  console.log("▶ Stage 2: Shot Planner...")
  t = Date.now()
  const shotPlanRaw = await callChat(SHOT_PLANNER_PROMPT, buildContext(results), "claude-sonnet-4-20250514", 0.5)
  const shotPlan = tryParse(shotPlanRaw)
  results["shot-planner"] = shotPlan
  timings["shot-planner"] = Date.now() - t
  console.log(`  ✓ ${timings["shot-planner"]}ms`)
  const shots = shotPlan?.shots || []
  console.log(`  Shots: ${shots.length}`)
  for (const s of shots) {
    console.log(`    ${s.id}: ${s.shotSize} — ${s.title}`)
    console.log(`      Props: ${s.visibleProps?.join(", ") || "none"}`)
  }
  console.log()

  // Stage 2.5: Prop Distributor
  console.log("▶ Stage 2.5: Prop Distributor...")
  t = Date.now()
  const propDistRaw = await callChat(PROP_DISTRIBUTOR_PROMPT, buildContext(results), "claude-sonnet-4-20250514", 0.3)
  const propDist = tryParse(propDistRaw)
  results["prop-distributor"] = propDist
  timings["prop-distributor"] = Date.now() - t
  console.log(`  ✓ ${timings["prop-distributor"]}ms`)
  const distShots = propDist?.shots || []
  for (const s of distShots) {
    console.log(`\n    ${s.shotId} (${s.shotSize}, ${s.angle}):`)
    console.log(`      ✅ Visible:`)
    for (const p of (s.visibleProps || [])) {
      console.log(`         ${p.name} → ${p.placement} (${p.size_in_frame})`)
    }
    console.log(`      ❌ Excluded:`)
    for (const p of (s.excludedProps || [])) {
      console.log(`         ${p.name} → ${p.reason}`)
    }
    console.log(`      💡 Advice: ${s.propAdvice}`)
  }
  console.log()

  // Stage 3: Prompt Composer (per-shot)
  console.log("▶ Stage 3: Prompt Composer (per shot)...")
  const prompts = []
  for (const shot of shots) {
    t = Date.now()
    const ctx = buildContext(results) + `\n\ncurrent_item: ${JSON.stringify(shot)}`
    const promptRaw = await callChat(
      PROMPT_COMPOSER_PROMPT + `\n\nYou are processing ONE item from the array. Focus only on this specific shot:\n${JSON.stringify(shot)}`,
      ctx,
      "claude-sonnet-4-20250514",
      0.5,
    )
    const parsed = tryParse(promptRaw)
    const elapsed = Date.now() - t
    prompts.push({ ...parsed, _elapsed: elapsed })
    console.log(`  ${shot.id}: ${elapsed}ms`)
  }
  results["prompt-composer"] = { prompts }

  // ═══ ANALYSIS ═══
  console.log("\n\n" + "═".repeat(70))
  console.log("FINAL PROMPTS ANALYSIS")
  console.log("═".repeat(70))

  for (const p of prompts) {
    if (!p?.imagePrompt) { console.log("\n⚠️  PARSE FAIL for shot"); continue }
    const chars = p.imagePrompt.length
    const words = p.imagePrompt.split(/\s+/).length
    console.log(`\n┌─ ${p.shotId}: ${p.label}`)
    console.log(`│  Director: ${p.directorNote}`)
    console.log(`│  Camera: ${p.cameraNote}`)
    console.log(`│  hasCharRef: ${p.hasCharRef}, hasLocRef: ${p.hasLocRef}`)
    console.log(`│  📏 ${chars} chars, ${words} words`)
    console.log(`│`)
    console.log(`│  PROMPT:`)
    console.log(`│  "${p.imagePrompt}"`)
    console.log(`│`)

    // Quality checks
    const issues = []
    if (chars > 400) issues.push(`⚠️  TOO LONG (${chars} > 400 chars)`)
    if (chars < 150) issues.push(`⚠️  TOO SHORT (${chars} < 150 chars)`)
    if (words > 80) issues.push(`⚠️  TOO MANY WORDS (${words} > 80)`)
    if (/tension|mood|atmosphere|emotion|feeling/i.test(p.imagePrompt)) issues.push("⚠️  ABSTRACT WORDS detected")
    if (!/16:9/i.test(p.imagePrompt)) issues.push("⚠️  Missing 16:9")
    if (!/no text/i.test(p.imagePrompt)) issues.push("⚠️  Missing 'no text'")
    // Check if appearance was included (since hasRefImage=false)
    if (!p.hasCharRef && !/stubble|wrinkle|shirt|55|old|tired|beard/i.test(p.imagePrompt)) {
      issues.push("⚠️  No character appearance (hasRefImage=false but no description)")
    }

    if (issues.length === 0) {
      console.log(`│  ✅ All checks passed`)
    } else {
      for (const iss of issues) console.log(`│  ${iss}`)
    }
    console.log(`└─`)
  }

  // Summary
  console.log("\n" + "═".repeat(70))
  console.log("SUMMARY")
  console.log("═".repeat(70))
  const avgChars = Math.round(prompts.filter(p => p?.imagePrompt).reduce((s, p) => s + p.imagePrompt.length, 0) / prompts.filter(p => p?.imagePrompt).length)
  const avgWords = Math.round(prompts.filter(p => p?.imagePrompt).reduce((s, p) => s + p.imagePrompt.split(/\s+/).length, 0) / prompts.filter(p => p?.imagePrompt).length)
  const totalTime = Object.values(timings).reduce((s, t) => s + t, 0) + prompts.reduce((s, p) => s + (p._elapsed || 0), 0)
  console.log(`  Shots: ${prompts.length}`)
  console.log(`  Avg prompt: ${avgChars} chars, ${avgWords} words`)
  console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`)
  console.log(`  Stage times: ${Object.entries(timings).map(([k, v]) => `${k}: ${(v/1000).toFixed(1)}s`).join(", ")}`)
}

main().catch(console.error)
