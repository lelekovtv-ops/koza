# Session Report — 2026-04-03

## PIECE: Command-First Production Interface

### Ключевые результаты

**Ребрендинг KOZA → PIECE**
- GlobalNav, layout title, все страницы, KozaLogo → текстовый PIECE
- SVG логотип сохранён в `/public/piece-logo.svg`

**Segment Engine (31 тест)**
- `segmentsToSimpleTracks()` — 3 трека (VIDEO/VOICE/MUSIC) вместо 7
- `applyTimelineEdit()` — move/resize/reorder с paired segments
- `getTitleOverlays()`, `getSectionMarkers()` — вспомогательные проекции
- Bidirectional sync: Script ↔ Timeline через `segmentsToText()`

**Production Plan**
- `buildProductionPlan()` — граф задач из сегментов (TTS, VideoGen, LipSync, ImageGen, MusicGen, SFX, TitleCard, Assemble)
- Зависимости, critical path, estimated time
- `useProductionPlan` React hook с simulate/run
- `ProductionDashboard` UI компонент

**Smart Distribute**
- `/api/smart-distribute` — Claude анализирует скрипт → обогащает production plan
- Режиссёрские решения: промты, камера, transitions, emotion notes
- Director Note, Color Grade, Pacing

**/piece — Command-First UI**
- Тёмный экран + CommandBar внизу (единственный вход)
- Никакой мыши — система решает layout
- Intent parser: slash commands (`/script`, `/timeline`, `/gen`) + natural language
- Длинные фразы (4+ слов) → всегда чат, не перехватываются

**Claude Chat**
- Стрим ответов на экран с glow-эффектом
- Слова появляются по одному: blur → clear, translateY, fade-in
- Вопросы подсвечиваются золотыми точками
- Thinking indicator (три пульсирующие точки)

**Script Panel**
- Авто-открытие когда Claude пишет сценарий (детекция формата [СЕКЦИЯ] + ГОЛОС:)
- Block-based editing: `parseScriptBlocks()` → `findRelevantBlock()` → отправляет только 1 блок
- Экономия токенов: ~50 вместо ~500 на правку
- Если блок не найден — спрашивает пользователя

**Generator Panel**
- Nano-banana API (Gemini 2.5 Flash Image)
- Авто-генерация из блоков скрипта: берёт ГРАФИКА: → строит промт → генерирует
- "сгенерируй первую сцену" → находит блок → генерит кадр

**Auto-Layout Panels**
- `FloatingPanel` — без drag, система решает позицию
- `computeLayout(order, total, active)` — предыдущие сжимаются влево, активная большая
- Apple spring curve: `cubic-bezier(0.16, 1, 0.3, 1)`
- Breathing gold border на активной панели
- Неактивные — полупрозрачные, тусклые, без pointer events

**Session Store**
- `usePieceSessionStore` — Zustand + persist
- Скрипт, сообщения, изображения, состояние панелей
- Авто-создание сессии при первом визите
- Имя сессии отображается вверху

### Файлы созданные/изменённые

**Новые файлы (21):**
```
src/app/piece/page.tsx
src/components/piece/CommandBar.tsx
src/components/piece/FloatingPanel.tsx
src/components/piece/VerticalTimeline.tsx
src/components/piece/EmotionCurves.tsx
src/components/piece/ImageGenerator.tsx
src/components/piece/PipelineConnector.tsx
src/store/panels.ts
src/store/pieceSession.ts
src/lib/intentParser.ts
src/lib/segmentEngine.ts
src/lib/productionPlan.ts
src/lib/useProductionPlan.ts
src/lib/__tests__/segmentEngine.test.ts
src/app/api/smart-distribute/route.ts
src/app/dev/segment-lab/page.tsx
src/app/dev/segment-lab/ProductionDashboard.tsx
src/app/dev/segment-lab/productionPlan.ts
src/app/dev/segment-lab/useProductionPlan.ts
src/app/dev/segment-lab/useTimelineDrag.ts
public/piece-logo.svg
dev.sh
```

**Изменённые файлы (ребрендинг + стили):**
```
src/components/app/GlobalNav.tsx (KOZA → PIECE)
src/components/ui/KozaLogo.tsx (SVG → текст PIECE)
src/components/board/BoardAssistant.tsx (KOZA → PIECE)
src/app/layout.tsx (title)
src/app/timeline/page.tsx
src/app/dev/page.tsx
src/app/lab/page.tsx
src/app/bible/page.tsx
src/app/globals.css (fadeInWord, borderBreath animations)
package.json (next pinned 16.1.7, dev:clean script)
start-dev.sh (clean .next, remove --webpack)
```

### Архитектурные решения

1. **Segment[] = единый источник правды** — текст и таймлайн это проекции
2. **Production Plan = DAG задач** — каждая задача знает зависимости
3. **CommandBar = единственный вход** — мышь не нужна
4. **Блочное редактирование** — LLM получает только нужный блок
5. **Auto-layout** — система решает где панели, пользователь только говорит
6. **Сессии** — всё сохраняется в localStorage

### Следующие шаги (не реализовано)

1. **Контекст активного окна** — "перегенерируй" = в текущем окне
2. **Список сессий** — переключение между проектами
3. **Pipeline connectors** — визуальные связи между панелями (PipelineConnector.tsx создан, не подключён)
4. **TTS** — ElevenLabs API route
5. **Video generation** — Kling/Seedance API route
6. **Assembly** — Remotion/FFmpeg финальная сборка

### Коммит
`9feaf24` — feat: PIECE command-first UI, production pipeline, rebrand (32 files, +8180 lines)

### Тесты
31 passed (segmentEngine: YouTube/Film parsing, roundtrip, tracks, board, simpleTracks, titleOverlays, sectionMarkers, applyTimelineEdit)
