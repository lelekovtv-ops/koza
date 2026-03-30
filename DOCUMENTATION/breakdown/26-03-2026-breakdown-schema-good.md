# KOZA Breakdown Pipeline Schema
## 26.03.2026

---

## Общая схема (7 стадий)

```
СЦЕНАРИЙ (текст сцены)
       │
       ▼
┌──────────────────────┐
│  1. SCENE ANALYST    │  Fast model (gpt-5.4-mini)
│  Анализ сцены        │
│                      │
│  Вход: текст сцены,  │
│        bible, style  │
│  Выход:              │
│   - sceneSummary     │
│   - dramaticBeats[]  │
│   - emotionalTone    │
│   - geography        │
│   - characterPresence│
│   - propCandidates   │
│   - visualMotifs     │
│   - continuityRisks  │
│   - recommendedShots │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  2. ACTION SPLITTER  │  Fast model (gpt-5.4-mini)
│  Разбивка на действия│
│                      │
│  Вход: analysis,     │
│        sceneText,    │
│        config, bible │
│  Выход:              │
│   - ActionSplitStep[]│
│     (id, action,     │
│      characters,     │
│      location)       │
│                      │
│  Fallback: локальный │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────────┐
│3. CONTEXT│ │4. CREATIVE  │   ПАРАЛЛЕЛЬНО
│  ROUTER │ │   PLANNER   │
│         │ │             │
│ Fast    │ │ Heavy model │
│ model   │ │(gpt-5.4)    │
│         │ │             │
│Выход:   │ │Выход:       │
│-primary │ │-operator    │
│ Location│ │ Mission     │
│-secondary│ │-pressure   │
│ Locations│ │ Points     │
│-propAnch│ │-filmHistory │
│-environ │ │ References  │
│ Transit │ │-sceneIdeas  │
│-prompt  │ │-globalGuid  │
│ Hints   │ │             │
│         │ │Fallback:    │
│Fallback:│ │ локальный   │
│локальный│ │             │
└────┬────┘ └──────┬──────┘
     │             │
     └──────┬──────┘
            ▼
┌──────────────────────┐
│  5. CENSOR           │  Fast model (gpt-5.4-mini)
│  Цензура/модерация   │
│                      │
│  Вход: analysis,     │
│    actions, creative │
│    Plan, sceneText   │
│  Выход:              │
│   - verdict          │
│   - approvedDirect[] │
│   - rejectedDirect[] │
│   - warnings[]       │
│   - finalInstruction │
│                      │
│  Fallback: локальный │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  6. SHOT PLANNER     │  Heavy model (gpt-5.4)
│  Планирование кадров │
│                      │
│  Вход: analysis,     │
│    actions, context, │
│    creative, censor, │
│    config, bible     │
│  Выход:              │
│   - ShotSpec[]       │
│     (id, label,      │
│      shotSize,       │
│      cameraMotion,   │
│      subjectFocus,   │
│      action,         │
│      directorNote,   │
│      cameraNote)     │
│                      │
│  Fallback: локальный │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  CONTINUITY          │  Локальный (без AI)
│  SUPERVISOR          │
│                      │
│  Проверяет:          │
│   - memories[]       │
│   - risks[]          │
│   - relations[]      │
│  между кадрами       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  7. PROMPT COMPOSER  │  Heavy model (gpt-5.4)
│  Композитор промптов │
│                      │
│  Вход: shotSpecs,    │
│    analysis, actions,│
│    context, creative,│
│    censor, continuity│
│  Выход:              │
│   - PromptComposerShot[]
│     (shotId, label,  │
│      imagePrompt,    │
│      videoPrompt,    │
│      visualDescr,    │
│      directorNote,   │
│      cameraNote,     │
│      shotSize,       │
│      cameraMotion,   │
│      duration,       │
│      caption, notes) │
│                      │
│  Fallback: локальный │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  COMPOSE JENKINS     │  Локальный (без AI)
│  SHOTS               │
│                      │
│  Объединяет ShotSpec │
│  + PromptComposer    │
│  → JenkinsShot[]     │
│                      │
│  + calculateDurations│
│  (1 стр ≈ 60 сек)   │
│  + extractCameraMeta │
│  (shotSize, motion)  │
└──────────┬───────────┘
           │
           ▼
    РЕЗУЛЬТАТ: JenkinsShot[]
```

---

## Настройки движка (BreakdownEngineConfig)

| Параметр | Варианты | По умолчанию | Описание |
|----------|----------|-------------|----------|
| shotDensity | lean / balanced / dense | balanced | Плотность кадров (lean=×0.75, dense=×1.35) |
| continuityStrictness | flexible / standard / strict | standard | Строгость непрерывности (лимит предупреждений 2/4/6) |
| textRichness | simple / rich / lush | rich | Детализация текстовых описаний |
| relationMode | minimal / balanced / explicit | balanced | Связи между кадрами |
| fallbackMode | balanced / prefer_speed / fail_fast | balanced | Стратегия при ошибке AI (fail_fast = без fallback) |
| keyframePolicy | opening_anchor / story_turns / every_major_shift | story_turns | Политика ключевых кадров |

---

## Модели

### Маршрутизация по стадиям (по умолчанию)
- **Fast model:** gpt-5.4-mini-2026-03-17 → Scene Analyst, Action Splitter, Context Router, Censor
- **Heavy model:** gpt-5.4-2026-03-05 → Creative Planner, Shot Planner, Prompt Composer

### Доступные модели для ручного выбора
- claude-sonnet-4-20250514
- gpt-4o
- gemini-1.5-pro

---

## Входные данные

### Обязательно
- **sceneText** — текст сцены в формате сценария

### Опционально
- **sceneId** — ID сцены
- **modelId** — принудительная модель для всех стадий
- **bible** — контекст библии проекта (персонажи + локации с appearance prompts)
- **style** — стилистический контекст (CinematicStyleContext)
- **config** — настройки движка (BreakdownEngineConfig)
- **screenplayContext** — контекст соседних сцен (previous/current/next)

---

## Выходные данные (JenkinsShot)

```typescript
{
  label: string          // "Establishing shot"
  type: "image"
  duration: number       // ms (1500–8000, рассчитывается по длине текста)
  notes: string          // общие заметки
  shotSize?: string      // "Wide" | "Medium" | "Close-up" | "ECU" | etc.
  cameraMotion?: string  // "Static" | "Push In" | "Tracking" | "Handheld" | etc.
  caption?: string       // краткое описание кадра
  directorNote?: string  // заметка режиссёра
  cameraNote?: string    // заметка оператора
  videoPrompt?: string   // промпт для генерации видео
  imagePrompt?: string   // промпт для генерации изображения
  visualDescription?: string // визуальное описание кадра
}
```

---

## Fallback-стратегия

Каждая AI-стадия (кроме Scene Analyst) имеет **локальный fallback**:
- Если AI-вызов падает → используется детерминированная локальная функция
- `composeActionStepsLocally()`, `composeContextRouterLocally()`, `composeShotSpecsLocally()`, etc.
- Контролируется через `fallbackMode` в конфиге
- `fail_fast` — без fallback, ошибка = стоп

---

## Поток данных между стадиями

```
Scene Analyst → analysis
      ↓
Action Splitter(analysis) → actionSplit
      ↓
Context Router(analysis, actionSplit) ─┐
Creative Planner(analysis, actionSplit)┘→ [PARALLEL]
      ↓
Censor(analysis, actionSplit, creativePlan) → censorReport
      ↓
Shot Planner(analysis, actionSplit, contextPlan, creativePlan, censorReport) → shotSpecs
      ↓
Continuity Supervisor(shotSpecs) → continuity [LOCAL]
      ↓
Prompt Composer(shotSpecs, analysis, actionSplit, contextPlan, creativePlan, censor, continuity) → promptPackages
      ↓
composeJenkinsShots(shotSpecs, promptPackages) → JenkinsShot[] [LOCAL]
```

---

## API

Все AI-стадии идут через единый эндпоинт:
```
POST /api/chat
{
  messages: [{ role: "user", content: "..." }],
  modelId: "gpt-5.4-2026-03-05",
  system: "You are Scene Analyst..."
}
→ text/stream response
```

Клиентская функция: `breakdownScene(sceneText, options)` / `breakdownSceneDetailed(sceneText, options)`
Файл: `src/lib/jenkins.ts`
