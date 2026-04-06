# Session Report — 2026-04-04 (Part 2)

## Unified Screenplay-Storyboard-Timeline System

### Контекст
Главная архитектурная задача: создать полную двустороннюю связку между сценарием, раскадровкой и таймлайном. Блок = единица продакшна с генерациями, голосовыми дорожками, модификаторами.

### Ключевые решения

**Block расширен, не заменён** — вместо нового ProductionBlock, существующий Block получил опциональные production-поля (durationMs, visual, modifier, voiceClipId, shotGroupId, locked). Slate.js прозрачно пропускает незнакомые поля. Один store, один источник правды.

**Style Layer** — стиль (аниме, реализм, нуар) ОТДЕЛЁН от контента промптов. Breakdown генерирует style-free промпты. Стиль добавляется отдельным слоем при генерации картинки. Можно переключить стиль без re-breakdown.

**SyncBus** — event emitter для двусторонней синхронизации. Origin tracking предотвращает бесконечные петли (screenplay → timeline → screenplay → ...).

**Breakdown Merge** — re-breakdown обновляет существующие шоты вместо создания новых. Картинки и locked промпты сохраняются.

---

### Что создано (файлы)

#### Архитектура (10 файлов)
```
src/lib/productionTypes.ts         — ProductionVisual, BlockModifier, ShotGroup, SyncEvent, ChangeOrigin
src/lib/syncBus.ts                 — Event emitter для bidirectional sync
src/hooks/useSyncOrchestrator.ts   — Единый хук (заменил useSceneSync + useShotSync)
src/lib/blockEnricher.ts           — Auto-duration из WPM
src/lib/importPipeline.ts          — Unified import: detect format → parse → enrich
src/lib/importers/markdownImporter.ts — Strip markdown (ChatGPT paste)
src/lib/importers/fdxImporter.ts   — Final Draft XML parser
src/lib/sfxExtractor.ts            — Action blocks → SFX hints (40+ patterns RU/EN)
src/lib/ttsProvider.ts             — TTS абстракция (ElevenLabs / Web Speech)
src/lib/styleLayer.ts              — Style отделён от контента (compose/strip/recompose)
```

#### Страницы (3 файла)
```
src/app/scriptwriter/page.tsx      — Чистый редактор, без зависимостей
src/app/studio/page.tsx            — Landing (Create PIECE / Import / Scriptwriter) + production workspace
src/app/api/reset/route.ts         — Очистка всех данных + redirect
```

#### Canvas per-block (2 файла)
```
src/components/editor/canvas/BlockCanvas.tsx        — ReactFlow нодовый граф per-shot
src/components/editor/canvas/blockCanvasNodes.tsx    — 6 типов нод (BlockText, BibleRef, Style, PromptBuilder, ImageGen, Output)
```

#### Breakdown enrichment (1 файл)
```
src/features/breakdown/enrichFromBreakdown.ts  — Блоки обогащаются при breakdown (visual, shotGroupId, duration)
```

#### Store (1 файл)
```
src/store/modifierTemplates.ts     — Template library (5 built-in: AI Avatar, Ken Burns, Split Screen, Text Reveal, B-Roll)
```

#### Тесты (7 файлов, +87 новых тестов)
```
src/lib/__tests__/blockEnricher.test.ts    — 10 тестов
src/lib/__tests__/syncBus.test.ts          — 8 тестов
src/lib/__tests__/sfxExtractor.test.ts     — 14 тестов
src/lib/__tests__/importPipeline.test.ts   — 22 теста
src/lib/__tests__/productionTypes.test.ts  — 6 тестов
src/lib/__tests__/modifierTemplates.test.ts — 4 теста
src/lib/__tests__/ttsProvider.test.ts      — 5 тестов
src/lib/__tests__/styleLayer.test.ts       — 14 тестов
```

---

### Что изменено (существующие файлы)

```
src/lib/screenplayFormat.ts        — Block + optional production fields
src/store/script.ts                — +origin, +shotGroups, +updateBlockProduction, убраны demo-сценарии
src/store/timeline.ts              — +origin на мутациях
src/store/voiceTrack.ts            — +blockId на VoiceClip, +VoiceTrackChannel, +buildChannelsFromClips
src/store/breakdownConfig.ts       — Gemini дефолт, убран style из pipeline presets
src/lib/fincher.ts                 — Style убран из breakdown context, дефолт Gemini
src/lib/promptBuilder.ts           — buildImageStyleSuffix не вшивает стиль, buildVideoPrompt style-free
src/lib/promptAI.ts                — Style убран из LLM контекста
src/app/api/nano-banana/route.ts   — +stylePrompt отдельный параметр
src/app/workspace/page.tsx         — useSyncOrchestrator вместо двух хуков
src/app/scriptwriter/page.tsx      — +кнопка "To Studio"
src/app/dev/settings/page.tsx      — +Reset All Data кнопка
src/components/editor/ScriptWriterOverlay.tsx  — useSyncOrchestrator
src/components/editor/screenplay/StoryboardPanel.tsx — drag-resize на TRACKS, manual duration, Canvas button, breakdown merge, enrichFromBreakdown, click-to-seek, stylePrompt в генерации
```

---

### Метрики
- **285 тестов** (было 198, +87 новых), все проходят
- **0 TS ошибок**
- **~25 файлов** создано/изменено
- **24/24 шагов плана** выполнено

### Turbopack fix
- Next.js обновлён 16.1.7 → 16.2.2 (200+ Turbopack фиксов)
- turbopackFileSystemCacheForDev отключён
- rm -rf .next убран из start-dev.sh

### Ветка
`feat/rundown-vertical-timeline`

### Что осталось на следующую сессию
- Canvas per-block: добавить интерактивность нод (редактирование параметров, запуск генерации из Canvas)
- Decompose StoryboardPanel (4600 строк) и Timeline (13K строк) на компоненты
- Мини-таймлайн поверх стори-борда (тонкая полоска внизу для навигации)
- TTS интеграция в UI (кнопка "Generate Voice" на voice clips)
- Real-time voice preview (Web Speech при наведении на dialogue block)

### Архитектурная диаграмма

```
                    ┌──────────────┐
                    │  Scriptwriter │ (independent, no deps)
                    │  /scriptwriter│
                    └──────┬───────┘
                           │ "To Studio" → Block[]
                    ┌──────▼───────┐
                    │    Studio     │ (main production)
                    │   /studio    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐ ┌─────▼─────┐ ┌───▼────────┐
     │ Screenplay  │ │ Storyboard │ │  Timeline   │
     │ (Slate.js)  │ │  (Board)   │ │  (Tracks)   │
     └─────┬───────┘ └─────┬─────┘ └─────┬──────┘
           │               │             │
           └───────┬───────┴─────────────┘
                   │
           ┌───────▼───────┐
           │   SyncBus      │ (bidirectional event emitter)
           │ origin tracking│
           └───────┬───────┘
                   │
           ┌───────▼───────┐
           │  Block[] +     │ (single source of truth)
           │  ShotGroup[]   │
           │  scriptStore   │
           └───────────────┘

Style Layer: applied at generation time ONLY
  Content prompt + Style modifier → Final prompt
  Switch style instantly, no re-breakdown needed
```
