# Screenplay Editor: Formatting + Keyboard Spec

Документ фиксирует текущие правила редактора сценария в коде.

## 1) Параметры форматирования

### 1.1 Страница и масштаб
- Размер страницы: `816 x 1056 px` (US Letter, `8.5" x 11"` при `96dpi`).
- Масштаб overlay: `1.3` через CSS `transform: scale(...)`.
- Основные константы: `src/components/editor/screenplay/screenplayLayoutConstants.ts`.

### 1.2 Поля страницы
- Top: `96px` (`1"`).
- Right: `96px` (`1"`).
- Bottom: `96px` (`1"`).
- Left: `144px` (`1.5"`, под переплет).

### 1.3 Типографика
- Базовый размер шрифта: `16px` (эквивалент `12pt` в web-метриках).
- Базовый line-height: `16px` (12pt single-spaced, 6 строк на дюйм — стандарт Final Draft).
- Шрифт: `Courier Prime` (fallback: `Courier New`, `monospace`).

### 1.4 Правила подсчета страниц
- Логический стандарт для статистики: `54` строки на страницу (Final Draft: 864px / 16px).
- Геометрически видимая емкость текстовой области: `54` строки.
- Для page count используется оценка переносов:
  - Считается доступная ширина текста (`contentWidthPx`).
  - Базовая емкость строки: `floor(contentWidthPx / (fontSize * 0.6))`.
  - Для типов с отступами уменьшается доступная емкость.
  - Количество страниц: `ceil(estimatedLines / 55)`.

### 1.5 Отступы и выравнивание блоков
- `action`: без дополнительного отступа, выравнивание влево.
- `scene_heading`: без отступа, `uppercase`, `bold`.
- `character`: отступ слева `24ch`, `uppercase`, `bold`.
- `dialogue`: отступ слева `11ch`, справа `11ch`.
- `parenthetical`: отступ слева `18ch`, `italic`.
- `transition`: выравнивание вправо.
- `shot`: без отступа, `uppercase`, `bold`.

### 1.6 Вертикальные интервалы между блоками
- Перед `scene_heading`: `24px`.
- Перед `character`: `24px`.
- Перед `transition`: `24px`.
- Перед `action`, если предыдущий блок тоже `action`: `16px`.
- Во всех остальных случаях: `0px`.

### 1.7 Дополнительные UI-правила редактора
- `spellCheck` отключен (`false`) в обоих режимах (`embedded` и `standalone`).
- Placeholder стилизован курсивом.

## 2) Условия работы клавиатуры

Ниже описан текущий приоритет обработки клавиш и конкретные действия.

### 2.1 Общий приоритет в `onKeyDown`
1. `Shift+Enter`: запускает grammar assist для предыдущего блока (если есть), при этом обычный screenplay-flow Enter не блокируется.
2. Если открыт autocomplete: сначала обрабатываются его клавиши (`ArrowUp/ArrowDown/Tab/Enter/Escape`).
3. Автокапс (`scene_heading`, `character`, `transition`).
4. Вставка `(` в пустом `dialogue` в начале строки.
5. `Tab`-поведение блоков (включая ghost slug).
6. `Cmd/Ctrl`-шорткаты.
7. `Escape` закрывает служебные UI-состояния.

### 2.2 Поведение `Tab`
Порядок внутри `Tab` важен.

1. Если открыт autocomplete и есть варианты:
   - `Tab` применяет выбранный вариант.
   - Если применение не удалось, autocomplete закрывается и выполняется обычная `Tab`-логика блока.

2. Если есть `slugGhost` (подсказка `INT./EXT.`) в `action` и курсор стоит в конце текущего блока:
   - Текст блока заменяется на полный slug (`INT.`/`EXT.`/`I/E.` и т.д.) + пробел.
   - Тип блока меняется на `scene_heading`.

3. Блочная логика `Tab`:
   - `action` + пусто -> `character`.
   - `character` + пусто -> `action`.
   - `character` + не пусто -> вставить следующий блок `parenthetical` с текстом `(` и поставить курсор после `(`.
   - `scene_heading` без сепаратора времени -> вставить ` — `.
   - Иначе -> цикл типа блока через `cycleBlockType`.
   - `Shift+Tab` запускает обратное направление цикла (через `cycleBlockType(..., true)`).

### 2.3 Поведение `Enter` (screenplay flow)
Реализовано в `withScreenplay.insertBreak`:

- `scene_heading` -> новый блок `action`.
- `action` -> новый блок `action`.
- `character`:
  - если пустой -> новый блок `action`;
  - если не пустой -> новый блок `dialogue`.
- `dialogue`:
  - если пустой -> текущий блок конвертируется в `action` (без создания нового);
  - если не пустой -> новый блок `character`.
- `parenthetical` -> новый блок `dialogue`.
- `transition` -> новый блок `action`.
- `shot` -> новый блок `action`.

Важно:
- Когда открыт autocomplete, `Enter` не применяет подсказку. Он только закрывает список подсказок и оставляет обычное screenplay Enter-поведение.

### 2.4 Поведение `ArrowUp/ArrowDown` при autocomplete
- Если открыт autocomplete:
  - `ArrowDown` -> следующий элемент по кругу.
  - `ArrowUp` -> предыдущий элемент по кругу.

### 2.5 Поведение `Escape`
- Закрывает floating toolbar выделения.
- Сбрасывает `slugGhost`.
- Если открыт autocomplete, тоже закрывает его.

### 2.6 Автокапс
- В блоках `scene_heading`, `character`, `transition` буквенный ввод автоматически преобразуется в верхний регистр.
- Работает для латиницы и кириллицы (без модификаторов `Cmd/Ctrl/Alt`).

### 2.7 Ввод `(` в диалоге
- Если текущий блок `dialogue`, текст пустой и курсор в позиции `0`:
  - по нажатию `(` блок конвертируется в `parenthetical`;
  - вставляется символ `(`.

### 2.8 Cmd/Ctrl шорткаты
- `Cmd/Ctrl+Z` -> undo.
- `Cmd/Ctrl+Y` или `Cmd/Ctrl+Shift+Z` -> redo.
- `Cmd/Ctrl+B` -> bold.
- `Cmd/Ctrl+I` -> italic.
- `Cmd/Ctrl+U` -> underline.
- `Cmd/Ctrl+Shift+I` -> вставить `scene_heading` с префиксом `INT. `.
- `Cmd/Ctrl+Shift+E` -> вставить `scene_heading` с префиксом `EXT. `.
- `Cmd/Ctrl+Shift+C` -> вставить `character`.
- `Cmd/Ctrl+Shift+T` -> вставить `transition` с текстом `CUT TO:`.

### 2.9 Поведение `Backspace`
Реализовано в `withScreenplay.deleteBackward`:

- В начале `scene_heading` с префиксом (`INT./EXT./ИНТ./ЭКСТ.` и др.):
  - префикс удаляется,
  - блок конвертируется в `action`,
  - курсор ставится в начало.

- В начале непервого блока:
  - если блок пустой -> блок удаляется, курсор ставится в конец предыдущего;
  - если блок не пустой -> блок объединяется с предыдущим (`mergeNodes`).

### 2.10 Вставка текста (paste)
- При вставке plain text выполняется нормализация:
  - `\r\n` -> `\n`;
  - удаляются zero-width символы (`U+200B`, `U+FEFF`);
  - серии из `3+` переносов сжимаются до `2`.
- После этого текст проходит через `deserializeFromText` и вставляется как screenplay-фрагмент.

## 3) Источники в коде
- `src/components/editor/screenplay/screenplayLayoutConstants.ts`
- `src/components/editor/screenplay/screenplayRenderers.tsx`
- `src/components/editor/SlateScreenplayEditor.tsx`
- `src/components/editor/screenplay/withScreenplay.ts`
- `src/components/editor/screenplay/screenplayTabBehavior.ts`
- `src/components/editor/screenplay/screenplayKeyboardBehavior.ts`
- `src/components/editor/screenplay/screenplayAutocomplete.ts`