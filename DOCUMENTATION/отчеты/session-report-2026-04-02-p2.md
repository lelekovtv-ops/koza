# Session Report — 2 апреля 2026 (часть 2: вечерняя сессия)

## Обзор

Архитектурная сессия: 3 новых движка, Segment Lab прототип, universal parser. 185 тестов. Принято решение о миграции на Segment-модель.

**Rollback point:** `898a697` (git checkout для возврата основного проекта)

---

## 1. Placement Engine

**Файл:** `src/lib/placementEngine.ts` (591 строк, 21 тест)

Решает проблему visual/voice desync. Шот ставится туда где говорит его персонаж.

**Алгоритм:** character affinity — извлекает имена персонажей из shot.caption, ищет ближайший dialogue-блок этого персонажа, размещает шот на его позиции.

**Ключевые функции:**
- `buildSceneTimingMap()` — блоки → TimedBlock[] (WPM: dialogue 155, action 60)
- `mapShotsToBlocks()` — sequential + character affinity
- `placeShotsOnTimeline()` — абсолютные позиции
- `placeVoiceClips()` — voice синхронизирован с covering shots
- `placeScene()` / `placeAllScenes()` — convenience pipelines

**Интегрирован в основной проект:**
- `storyboard.ts` — per-shot blockRange вместо одного на сцену
- `StoryboardPanel.tsx` — замена equal-distribution в EmbeddedTrackView
- `voiceTrack.ts` — `generateFromPlacement()` с shot-relative anchor

---

## 2. Auto-Shot Sync (Live Script → Timeline)

**Файлы:** `src/lib/shotSyncEngine.ts` (442 строк, 23 теста) + `src/hooks/useShotSync.ts` (85 строк)

Пишешь текст — шоты появляются автоматически. 300ms debounce.

**Маппинг:**
- `scene_heading` → establishing shot
- `action` → action shot
- `character + dialogue` → dialogue shot
- `transition` → skip

**Два режима sync:**
1. Structural (блок добавлен/удалён/тип изменился) → полный reconcile
2. Text-only (текст изменился в существующем блоке) → быстрое обновление caption/duration

**Никогда не трогает:** locked shots, manual shots, breakdown-generated shots (`autoSynced: false`)

**Интегрирован:** workspace + ScriptWriterOverlay + editor (duration badges + status dots)

---

## 3. Universal Parser

**Файл:** `src/lib/screenplayFormat.ts` (модифицирован, 9 новых тестов)

Один парсер для всех форматов:
- `[SECTION — Ns]` → `scene_heading` (YouTube/Reels/Ad)
- `ГОЛОС: text` → `character` + `dialogue`
- `ГРАФИКА:` / `ТИТР:` / `МУЗЫКА:` → `action`
- `INT./EXT.` → `scene_heading` (кино)
- Микс форматов в одном документе

---

## 4. Segment Lab (прототип — НЕ интегрирован)

**Файлы:** `src/lib/segmentEngine.ts` (536 строк, 18 тестов) + `src/app/dev/segment-lab/page.tsx` (~800 строк)

### Концепция: Unified Organism
Всё = Segment. Script, Timeline, Board = три проекции одного Segment[].

### Segment модель
```typescript
interface Segment {
  id, content, role (SegmentRole), track (TrackId),
  startMs, durationMs, sectionId, order, media, sourceLine
}
```

### 7 треков
- V1 SETUP A (говорящая голова) — co-dependent с ГОЛОС
- V2 SETUP B (B-roll / ГРАФИКА)
- V3 SETUP C (ТИТР / overlay)
- V4 SETUP D (доп. слой)
- VOICE, TITLES, MUSIC

### Реализованные фичи
- **Три панели:** Script (editable textarea) + Timeline (DaVinci) + Board (A/B cards)
- **Playback:** Space, J/K/L, ←→, Home/End, auto-scroll
- **Script Sync:** подсветка активной строки при воспроизведении
- **Click-to-seek:** клик в текст → playhead прыгает + timeline скроллится
- **Duration badges:** справа от каждой строки в скрипте
- **Drag resize:** тянешь правый край блока → длительность меняется
- **Drag move:** тянешь блок → startMs меняется
- **Collapsible visual:** VISUAL ▶ → 4 sub-трека (V1-V4)
- **Text Tool:** тулбар Select/Text, клик на трек → попап → ввод текста → вставка в скрипт
- **Board interleave:** A/B карточки по секциям с isRepeated
- **Set Preview:** одно фото на Setup A → все A-карточки

---

## 5. Другие изменения в основном проекте

- `TimelineShot.autoSynced: boolean` — отличает auto-created от breakdown
- `StoryboardPanel` — Split button на карточке шота (AI-разбивка одного шота на несколько)
- `StoryboardPanel` — one-line tabs в split-screen режиме
- Demo scripts в script store — YouTube Ленин (default), Дочь Океана, Reels
- Demo Scripts selector в dev/settings

---

## Решение: направление

**Segment Lab → production → миграция.** Доделать прототип, затем заменить основной workspace.

### Следующие шаги
1. Bidirectional sync: timeline drag → скрипт перестраивается
2. Генерация изображений через API
3. Board drag-reorder
4. Persistence (Zustand + localStorage)
5. Миграция в workspace

---

## Метрики

| Метрика | Значение |
|---|---|
| Новых файлов | 8 |
| Изменённых файлов | 13 |
| Новых строк кода | ~3,500 |
| Тестов | 185 (все проходят) |
| Build | Чистый |
| Rollback commit | `898a697` |
