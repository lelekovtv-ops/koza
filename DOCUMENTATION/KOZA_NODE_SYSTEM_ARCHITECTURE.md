# KOZA NODE SYSTEM — Film Pipeline Engine
## Архитектура нодовой системы v1.0

> Этот документ — спецификация единой нодовой системы KOZA.
> Нодовая доска — НЕ копия данных. Это ИСТОЧНИК ПРАВДЫ.
> Всё остальное (storyboard, timeline, inspector) — это VIEW поверх графа нод.

---

## ФИЛОСОФИЯ

KOZA — не генератор картинок с нодами. KOZA — движок кинопроизводства.

Каждый шот в фильме проходит путь от слова до экрана.
Нодовая система визуализирует КАЖДЫЙ шаг этого пути.
Пользователь видит весь pipeline, может вмешаться в любой точке,
изменить любой параметр — и всё downstream пересчитывается.

Принцип: **Upstream change → Downstream rebuild**.
Как в ComfyUI — но для кино, не для диффузии.

---

## ТИПЫ НОД (12 типов)

### Уровень 1 — Источники данных

```
┌─────────────────────────────────────────────────────┐
│  SOURCE NODES — откуда берутся данные                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [SCRIPT]        Сценарий. Единственный корень.     │
│  [BIBLE]         Библия проекта. Персонажи+локации. │
│  [STYLE]         Стиль проекта. Noir/Sketch/Custom. │
│  [SETTINGS]      Настройки помощников (Дженкинс).   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 1. ScriptNode (уже существует как ScriptDocNode)
- **Тип:** `script`
- **Входы:** нет (корень графа)
- **Выходы:** `scenes` (Scene[]), `fullText` (string)
- **Data:** ссылка на scriptStore, отображает title/author/draft
- **Поведение:** Двойной клик → открывает редактор сценария
- **Реактивность:** Когда текст меняется → парсер пересчитывает scenes → downstream обновляется

#### 2. BibleNode
- **Тип:** `bible`
- **Входы:** `scenes` от ScriptNode (для авто-парсинга персонажей)
- **Выходы:** `characters` (CharacterEntry[]), `locations` (LocationEntry[])
- **Data:** кол-во персонажей, кол-во локаций, миниатюры (4 первых портрета)
- **Поведение:** Клик → открывает /bible. Раскрытие (expand) → показывает список inline.
- **Размер:** 220×120px

#### 3. StyleNode
- **Тип:** `style`
- **Входы:** нет
- **Выходы:** `stylePrompt` (string), `stylePreset` (string)
- **Data:** текущий выбранный стиль (Film Noir / Sketch / Custom), projectStyle string
- **UI:** Внутри ноды — маленький dropdown с пресетами. Или текстовое поле для custom.
- **Поведение:** Изменение стиля → ВСЕ downstream ноды (PromptBuilder, ImageGen) пересчитываются.
- **Размер:** 180×80px

#### 4. SettingsNode
- **Тип:** `settings`
- **Входы:** нет
- **Выходы:** `jenkinsConfig` (model, temperature, rules), `imageModel` (string)
- **Data:** 
  - Модель для breakdown (claude-sonnet/gpt-4o)
  - Модель для генерации картинок (GPT Image / NB1 / NB2 / NB Pro)
  - Температура breakdown
  - Custom system prompt для Дженкинса
  - Кастомные операторские правила (дополнение к DEAKINS_RULES)
- **UI:** При expand — форма с настройками. Save → обновляет boardStore.
- **Поведение:** Шаблоны: "Deakins Classic", "Kubrick Symmetry", "Handheld Realism"
- **Размер:** 200×100px

---

### Уровень 2 — Обработка сценария

```
┌─────────────────────────────────────────────────────┐
│  PROCESSING NODES — разбор и раскадровка            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [SCENE]         Одна сцена из сценария.            │
│  [BREAKDOWN]     Раскадровщик (Дженкинс).           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 5. SceneNode
- **Тип:** `scene`
- **Входы:** `script` от ScriptNode
- **Выходы:** `sceneText` (string), `sceneId` (string)
- **Data:** scene.index, scene.title, scene.color, blockIds.length, shotCount
- **UI:** Цветная полоска слева (scene.color), номер, заголовок, badges
- **Поведение:** 
  - Клик → selectScene + scroll к сцене в сценарии
  - АВТОМАТИЧЕСКИ создаётся для каждой сцены при парсинге
  - Пользователь НЕ создаёт вручную — они появляются из ScriptNode
- **Размер:** 240×70px

#### 6. BreakdownNode
- **Тип:** `breakdown`
- **Входы:** `sceneText` от SceneNode, `characters`+`locations` от BibleNode, `style` от StyleNode, `config` от SettingsNode
- **Выходы:** `shots` (JenkinsShot[])
- **Data:** sceneId, статус (idle/running/done/error), shotCount, lastRunTime
- **UI:**
  - Статус индикатор (серый/жёлтый pulse/зелёный/красный)
  - Кнопка "▶ Run" → запускает breakdownScene()
  - Badge с кол-вом шотов
  - При expand: preview списка шотов, timing
- **Поведение:**
  - Run собирает ВСЕ входы (sceneText + bible + style + settings) → breakdownScene()
  - Результат → создаёт ShotNode'ы downstream
  - Re-run → удаляет старые шоты, создаёт новые (с предупреждением)
- **Важно:** НЕ запускается автоматически. Только по кнопке. Это дорогая операция.
- **Размер:** 200×90px

---

### Уровень 3 — Шот и его слои

```
┌─────────────────────────────────────────────────────┐
│  SHOT NODES — единица кинопроизводства              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [SHOT]          Шот. 5 слоёв описания.             │
│  [PROMPT]        Промпт-билдер. Собирает финальный. │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 7. ShotNode
- **Тип:** `shot`
- **Входы:** `jenkinsData` от BreakdownNode
- **Выходы:** `shotData` (TimelineShot) к PromptNode и к PreviewNode
- **Data:** ВСЕ поля TimelineShot
- **UI:**
  - Compact (по умолчанию): thumbnail 64×36 + label + shotSize + duration badge
  - Expanded (двойной клик): все 5 слоёв inline-editable:
    1. caption (литературный, язык сценария)
    2. directorNote (режиссёрский)
    3. cameraNote (операторский)
    4. imagePrompt (промпт картинки EN)
    5. videoPrompt (промпт видео EN)
  - Duration badge — кликабельный, изменение обновляет ВЕЗДЕ
- **Поведение:**
  - Клик → selectShot → подсветка в timeline + storyboard + сценарии
  - Редактирование любого поля → updateShot() → обновление downstream
  - Duration change → timeline пересчитывает позиции, storyboard обновляет badge
- **КРИТИЧНО:** ShotNode.data.duration = ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для длительности
  Timeline читает отсюда. Storyboard читает отсюда. PreviewNode читает отсюда.
  Изменение в любом view → обновляет ShotNode → обновляет все view.
- **Размер:** compact 160×60px, expanded 280×400px

#### 8. PromptNode
- **Тип:** `prompt`
- **Входы:** `shotData` от ShotNode, `characters`+`locations` от BibleNode, `style` от StyleNode
- **Выходы:** `imagePrompt` (string), `videoPrompt` (string)
- **Data:** скомпилированный финальный промпт (то что реально уходит в API)
- **UI:** 
  - Compact: первые 80 символов промпта + "[EN]" badge
  - Expanded: полный промпт (read-only, computed), с подсветкой откуда какая часть:
    - 🟡 из shotData (жёлтый)
    - 🟢 из Bible (зелёный)  
    - 🔵 из Style (синий)
  - Кнопка "Copy" → копирует в clipboard
- **Поведение:**
  - АВТОМАТИЧЕСКИ пересчитывается при изменении любого входа
  - Вызывает buildImagePrompt() и buildVideoPrompt()
  - Если пользователь вручную отредактировал imagePrompt в ShotNode → PromptNode показывает его, не пересчитывает
- **Размер:** compact 160×50px, expanded 300×200px

---

### Уровень 4 — Генерация

```
┌─────────────────────────────────────────────────────┐
│  GENERATION NODES — создание визуалов               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [IMAGE_GEN]     Генератор картинки.                │
│  [VIDEO_GEN]     Генератор видео (будущее).         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 9. ImageGenNode
- **Тип:** `imageGen`
- **Входы:** `imagePrompt` от PromptNode, `referenceImages` от BibleNode, `model` от SettingsNode
- **Выходы:** `image` (blob URL)
- **Data:** model (gpt-image/nb1/nb2/nb-pro), status, thumbnailUrl, timing
- **UI:**
  - Compact: thumbnail результата 80×45 + model badge + status
  - Expanded: 
    - Большое превью результата
    - Selector модели (4 кнопки)
    - Кнопка "▶ Generate"
    - Timing последней генерации
    - History (последние 3 варианта — можно откатиться)
  - Во время генерации: spinner + "Generating via NB2..."
- **Поведение:**
  - Generate → fetch(/api/gpt-image или /api/nano-banana)
  - Результат → saveBlob → updateShot(thumbnailUrl) → Library
  - Если входной промпт изменился → badge "Prompt changed" (жёлтый)
  - НЕ авто-генерирует. Только по кнопке.
- **Размер:** compact 140×80px, expanded 320×280px

#### 10. VideoGenNode (будущее)
- **Тип:** `videoGen`
- **Входы:** `videoPrompt` от PromptNode, `image` от ImageGenNode (как first frame)
- **Выходы:** `video` (blob URL)
- **Data:** model (kling/luma/runway), status, duration, videoUrl
- **UI:** Аналогично ImageGenNode но для видео
- **Поведение:** PLACEHOLDER. Пока показывает "Coming soon" + videoPrompt
- **Размер:** compact 140×80px

---

### Уровень 5 — Просмотр и экспорт

```
┌─────────────────────────────────────────────────────┐
│  OUTPUT NODES — просмотр и конфигурация             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [PREVIEW]       Нода просмотра. Финальный кадр.    │
│  [EXPORT]        Нода экспорта (будущее).           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 11. PreviewNode
- **Тип:** `preview`
- **Входы:** `image` от ImageGenNode (или `video` от VideoGenNode)
- **Выходы:** `finalFrame` к timeline/storyboard (через store sync)
- **Data:** 
  - thumbnailUrl или videoUrl
  - duration (ФИНАЛЬНАЯ — может отличаться от shot.duration)
  - format (16:9, 4:3, 1:1, 2.39:1)
  - fps (24, 25, 30)
- **UI:**
  - Превью изображения/видео в выбранном формате
  - Duration slider/input — ФИНАЛЬНАЯ длительность для timeline
  - Format selector (aspect ratio)
  - Badge: показывает source (Image/Video/Placeholder)
  - Если duration здесь отличается от ShotNode.duration:
    → PreviewNode.duration = приоритет для timeline
    → Показать link "Sync to shot" для обратной синхронизации
- **КРИТИЧНО:** PreviewNode конфигурирует КАК показывается кадр в финальном продукте.
  ShotNode.duration = сколько длится действие по раскадровке.
  PreviewNode.duration = сколько секунд на экране в timeline.
  Они могут отличаться: действие 5 секунд, но в монтаже 3 секунды.
- **Размер:** 200×150px

#### 12. ExportNode (будущее)
- **Тип:** `export`
- **Входы:** все PreviewNode'ы
- **Выходы:** PDF, MP4 animatic, shot list
- **Placeholder на первое время**

---

## LAYOUT — РАСПОЛОЖЕНИЕ НА CANVAS

Ноды расположены слева направо, как production pipeline:

```
COLUMN 0        COLUMN 1      COLUMN 2       COLUMN 3      COLUMN 4       COLUMN 5       COLUMN 6
(Sources)       (Scenes)      (Breakdown)    (Shots)       (Prompts)      (Generation)   (Preview)
x=0             x=400         x=700          x=1000        x=1300         x=1600         x=1900

[SCRIPT]───────→[Scene 1]────→[Breakdown 1]──→[Shot 1A]───→[Prompt 1A]──→[ImageGen 1A]─→[Preview 1A]
    │                                        →[Shot 1B]───→[Prompt 1B]──→[ImageGen 1B]─→[Preview 1B]
    │           [Scene 2]────→[Breakdown 2]──→[Shot 2A]───→[Prompt 2A]──→[ImageGen 2A]─→[Preview 2A]
    │                                        →[Shot 2B]
    │                                        →[Shot 2C]
    │
[BIBLE]─ ─ ─ ─ ─ ─ ─ ─ ─ ─→(к Breakdown, Prompt, ImageGen) ─ ─ пунктир
[STYLE]─ ─ ─ ─ ─ ─ ─ ─ ─ ─→(к Breakdown, Prompt) ─ ─ ─ ─ ─ ─ пунктир
[SETTINGS]─ ─ ─ ─ ─ ─ ─ ─ →(к Breakdown, ImageGen) ─ ─ ─ ─ ─ пунктир
```

Вертикально шоты одной сцены группируются. 
Между сценами — визуальный отступ (gap 40px).

---

## EDGES — ТИПЫ СВЯЗЕЙ

| Тип связи | Стиль | Цвет | Animated |
|-----------|-------|------|----------|
| Data flow (script→scene→breakdown→shot) | Solid, 1.5px | scene.color | true |
| Bible context | Dashed, 1px | #D4A853 (gold) | false |
| Style context | Dotted, 1px | #7C4A6F (purple) | false |
| Settings | Dotted, 1px | #4A6F7C (teal) | false |
| Generation result | Solid, 2px | #4A7C6F (green) | true when generating |
| Duration sync | Invisible (через store) | — | — |

---

## РЕАКТИВНОСТЬ — КТО ОБНОВЛЯЕТ КОГО

```
Script изменился
  → parseScenes() → SceneNode'ы обновляются
  → parseBible() → BibleNode обновляется
  → НО BreakdownNode НЕ перезапускается автоматически (дорого)
  → Badge на BreakdownNode: "⚠ Source changed. Re-run?"

Bible изменилась (пользователь добавил описание)
  → PromptNode пересчитывает промпт (дёшево, мгновенно)
  → ImageGenNode показывает "⚠ Prompt changed" (не перегенерирует)

Style изменился
  → PromptNode пересчитывает промпт
  → BreakdownNode показывает "⚠ Style changed. Re-run?"

ShotNode.duration изменилось (пользователь подвинул)
  → timeline store обновляется → timeline view пересчитывает позиции
  → storyboard обновляет badge
  → PreviewNode обновляет duration (если не было manual override)

PreviewNode.duration изменилось (пользователь подвинул в preview)
  → timeline store обновляется (preview duration = приоритет для playback)
  → ShotNode НЕ обновляется (раскадровочная длительность остаётся)
  → В timeline показывается preview duration
```

---

## STORE АРХИТЕКТУРА

Нодовая система НЕ создаёт отдельный store.
Она ЧИТАЕТ из существующих stores:

- `useScriptStore` → ScriptNode
- `useScenesStore` → SceneNode'ы
- `useBibleStore` → BibleNode
- `useTimelineStore` → ShotNode'ы, duration
- `useBoardStore` → StyleNode, SettingsNode, imageModel

ReactFlow nodes/edges — это VIEW, построенный из stores через `buildProjectGraph()`.

Когда пользователь меняет что-то в ноде → вызывается action в соответствующем store
→ store обновляется → React re-render → ноды обновляются.

---

## ШАБЛОНЫ (TEMPLATES)

Пользователь может сохранить конфигурацию SettingsNode как шаблон:

```typescript
interface PipelineTemplate {
  id: string
  name: string                    // "Deakins Noir Setup"
  jenkinsModel: string            // "claude-sonnet-4-20250514"
  imageModel: string              // "nano-banana-2"
  stylePreset: string             // "Film noir, high contrast..."
  customRules: string             // дополнительные правила оператора
  breakdownTemperature: number    // 0.7
}
```

Шаблоны хранятся в boardStore.pipelineTemplates[].
Выбор шаблона → обновляет SettingsNode + StyleNode одновременно.

---

## ФАЗЫ РЕАЛИЗАЦИИ

### Phase 1 — Скелет (MVP)
- Зарегистрировать 6 типов нод: script, bible, scene, breakdown, shot, preview
- buildProjectGraph() строит граф из текущих stores
- Кнопка "Pipeline" на доске показывает граф
- Ноды кликабельные (навигация к сценарию/timeline/storyboard)
- Edges цветные по сценам

### Phase 2 — Интерактивность
- ShotNode expand с 5 слоями
- Duration editable в ShotNode и PreviewNode
- BreakdownNode с кнопкой Run
- ImageGenNode с кнопкой Generate

### Phase 3 — Prompt Pipeline
- PromptNode показывает скомпилированный промпт
- Подсветка источников (shot/bible/style)
- StyleNode с dropdown
- SettingsNode с формой

### Phase 4 — Templates & Advanced
- Сохранение/загрузка шаблонов
- History вариантов в ImageGenNode
- VideoGenNode (placeholder → интеграция Kling/Luma)
- ExportNode

---

## ВИЗУАЛЬНЫЙ СТИЛЬ НОД

Все ноды следуют стилю KOZA:

```css
/* Базовая нода */
background: rgba(26, 24, 22, 0.95);
border: 0.5px solid rgba(255, 255, 255, 0.08);
border-radius: 12px;
backdrop-filter: blur(12px);
color: #E5E0DB;
font-family: system-ui;

/* Handle (вход/выход) */
width: 10px;
height: 10px;
border-radius: 50%;
border: 1.5px solid;

/* Handle цвета по типу данных */
--handle-text: #E5E0DB;      /* текст/сценарий */
--handle-bible: #D4A853;      /* библия (золотой) */
--handle-style: #7C4A6F;      /* стиль (purple) */
--handle-image: #4A7C6F;      /* изображение (teal) */
--handle-video: #6F7C4A;      /* видео (green) */
--handle-config: #4A6F7C;     /* настройки (cyan) */

/* Состояния */
--status-idle: rgba(255,255,255,0.1);
--status-running: #D4A853;     /* золотой pulse */
--status-done: #4A7C6F;        /* зелёный */
--status-error: #7C4A4A;       /* красный */
--status-stale: #7C6F4A;       /* жёлтый (промпт изменился) */
```

---

## ЧТО ЭТО ДАЁТ ПОЛЬЗОВАТЕЛЮ

1. **Видит весь pipeline** — от буквы в сценарии до финального кадра
2. **Понимает откуда что берётся** — промпт = shot + bible + style (видно по связям)
3. **Может вмешаться в любой точке** — отредактировать промпт, поменять модель, изменить стиль
4. **Изменение в одном месте → обновление везде** — duration, style, bible
5. **Может сохранить настройки как шаблон** — для следующего проекта
6. **Видит статус каждого шага** — где нужно перегенерировать, где устарело
7. **Не теряет контекст** — всё на одном canvas, не 5 разных вкладок

---

*KOZA Node System Architecture v1.0*
*"This is not an AI that generates images. This is a cinematic pipeline where every frame has purpose."*
