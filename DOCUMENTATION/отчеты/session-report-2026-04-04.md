# Session Report — 2026-04-04

## /piece — Command-First Production Interface (продолжение)

### Ключевые результаты

**Библиотека сессий (Session Library)**
- Центральный оверлей с карточками сессий в ряд
- Staggered анимация появления (blur→clear, spring curve)
- Дыхание карточек (floating) после раскладки
- Удаление голосом: "удали последние три" → LLM парсит команду → карточки выделяются красным → подтверждение "да/нет"
- Остальные карточки уходят в глубину (scale 0.85, blur 4px, opacity 0.2) при выделении
- Delete анимация: карточки сжимаются и падают вниз с blur (как в корзину)
- Rename, контекст сессий передаётся в LLM (имена, позиции, количество)

**LLM Intent Classification (Haiku)**
- `/api/classify-intent` — Claude Haiku классификатор команд
- Понимает опечатки: "сессисиисию" → open_sessions
- Промпт с контекстом: позиции сессий, имена, пустые/непустые
- Session commands: delete_by_positions, delete_last_N, delete_empty, open_by_position

**Трёхуровневый роутер команд (ГЛАВНАЯ АРХИТЕКТУРНАЯ РАБОТА)**
- `src/lib/router/fuzzyMatch.ts` — Левенштейн + двуязычный словарь (~80 слов)
  - Мгновенное распознавание: "сесии"→sessions, "тамлайн"→timeline, "скрпт"→script
  - maxDistance по длине: 3-4 символа=1, 5-6=2, 7+=3
  - Паттерны: verb+noun, noun+verb, standalone, 3-word с fillers
- `src/lib/router/commandRouter.ts` — главный роутер
  - Tier 1: Slash + Fuzzy (0ms)
  - Tier 2: Keywords → категория UI/EDIT/GEN/SEARCH/CHAT (0ms)
  - Tier 3: LLM fallback только для неясных 1-4 слов (~200ms)
  - RouteCategory: UI_COMMAND | SCRIPT_EDIT | GENERATION | PHOTO_SEARCH | CREATIVE_CHAT
- `src/lib/router/workers.ts` — 3 воркера:
  - GenerationWorker (промпт из скрипта + стиль)
  - ScriptEditWorker (Sonnet, streaming, block-aware)
  - ChatWorker (Sonnet, streaming, auto-detect script)
- `src/lib/scriptUtils.ts` — общие утилиты (parseScriptBlocks, replaceBlock, findRelevantBlock)
- `handleChat` (180 строк) → `handleSubmit` (40 строк) — тонкий диспатчер

**Управление жестами (MediaPipe Hands)**
- `src/hooks/useHandTracking.ts` — WebGPU hand tracking 30fps
  - EMA smoothing + dead zone (0.004) — убирает тремор
  - Adaptive smoothing: мелкие движения сглаживаются больше
  - Жесты: point, pinch, open_palm, fist, two_fingers
- Жесты на скрипт-панели:
  - 🖐 Ладонь + вверх/вниз → зум текста (80%-140%)
  - ✊ Кулак → сброс зума
  - ✌️ Два пальца → скролл (вертикаль) / переключение панелей (горизонталь)
- Кнопка жестов в CommandBar (всегда видна)

**Тест жестов (Gesture Test)**
- `src/components/piece/GestureTestOverlay.tsx`
- Карусель из 12 фото (кино-тематика)
- 🤏 Pinch + drag → листание (с инерцией как iPhone)
- 🖐 Ладонь + вверх/вниз → плавный зум (50%-250%)
- ✊ Кулак → сброс зума
- Карусель: strip layout, perspective, соседние фото уменьшаются/блюрятся

**Поиск фото в 3D (Minority Report style)**
- `src/components/piece/PhotoSearch3D.tsx` — 3D оверлей
- `src/app/api/search-images/route.ts` — Pexels API / Picsum fallback
- 12 фото разлетаются в 3D пространстве (perspective 1200px)
- Каждое фото: уникальный угол, поворот, глубина
- Hover → увеличение + золотое свечение
- Клик → фото выходит на передний план, остальные в blur
- Голограммный overlay (gradient)
- Поиск по запросу: "найди фото готэм", "референс киберпанк"

**Исправления и улучшения**
- Hydration fix: `mounted` guard на displayLines и lastUserText
- Type errors fix: 3 ошибки от ChatGPT (segment-lab)
- SYSTEM_PROMPT: ограничение до 3-4 строк на экране ("film title card")
- displayLines лимит: MAX_DISPLAY_LINES = 6
- Генерация с кастомным стилем: "сгенерируй в стиле комикс"
- Навигация по панелям: ← → стрелки + два пальца горизонтально
- CommandBar: увеличенные кнопки mic/gesture (9x9, тёмные, с border)

### Файлы созданные (15)

```
src/lib/router/fuzzyMatch.ts          # Левенштейн + словарь
src/lib/router/commandRouter.ts       # 3-tier роутер
src/lib/router/workers.ts             # 3 воркера
src/lib/scriptUtils.ts                # Общие утилиты скрипта
src/components/piece/SessionDrawer.tsx # Библиотека сессий (переписан)
src/components/piece/HandCursor.tsx    # Курсор руки
src/components/piece/GestureTestOverlay.tsx # Тест жестов + карусель
src/components/piece/PhotoSearch3D.tsx # 3D поиск фото
src/hooks/useHandTracking.ts          # MediaPipe hand tracking
src/app/api/classify-intent/route.ts  # LLM классификатор
src/app/api/search-images/route.ts    # Поиск фото API
```

### Файлы изменённые (4)

```
src/app/piece/page.tsx                # Рефакторинг: роутер + воркеры + жесты
src/components/piece/CommandBar.tsx    # Упрощён: onSubmit вместо 10 callbacks
src/lib/intentParser.ts               # Новые intents + session commands
src/app/dev/segment-lab/              # Type error fixes (3 файла)
```

### Архитектурные решения

1. **Трёхуровневый роутер** — 80% команд не доходят до LLM. Fuzzy match мгновенный.
2. **Workers** — монолитный handleChat (180 строк) разбит на 3 воркера по 50-80 строк каждый
3. **CommandBar упрощён** — не знает про intent parsing, только передаёт текст наверх
4. **Hand tracking** — EMA + dead zone + adaptive smoothing убирает тремор рук
5. **Gesture test** — pinch-drag с инерцией (velocity-based) для карусели

### Открытые вопросы
- Pexels API ключ нужен для тематического поиска фото
- Turbopack SST panic при перезапусках (баг Next.js 16.1.7)
- Pipeline connectors между панелями (создан, не подключён)
- TTS / Video gen / Assembly workers

### Ветка
`feat/rundown-vertical-timeline`

### Тесты
Не запускались в этой сессии (фокус на архитектуре и UI)
