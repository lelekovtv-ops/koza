// ─────────────────────────────────────────────────────────────
// PATCH: заменить в ScriptWriterOverlay.tsx
// ─────────────────────────────────────────────────────────────
//
// 1. Добавить импорт вверху файла (после существующих импортов):
//
import ScreenplayBlockEditor from "@/components/editor/ScreenplayBlockEditor"
import { useScriptStore } from "@/store/script"
//
// (useScriptStore уже импортирован — убедись что не дублируется)
//
// ─────────────────────────────────────────────────────────────
//
// 2. Достать blocks и setBlocks из store (рядом с существующими):
//
//   const blocks  = useScriptStore((state) => state.blocks)
//   const setBlocks = useScriptStore((state) => state.setBlocks)
//
// ─────────────────────────────────────────────────────────────
//
// 3. ЗАМЕНИТЬ блок второй страницы (textarea для "new"):
//
// БЫЛО (примерно строки с showSecondPage):
//
//   {phase === "open" && type === "new" && showSecondPage && (
//     <div ref={secondPageRef} ...>
//       <textarea
//         ref={textareaRef}
//         value={scenario}
//         onChange={(event) => setScenario(event.target.value)}
//         className="h-full min-h-[1056px] w-full resize-none ..."
//         ...
//       />
//     </div>
//   )}
//
// СТАЛО:
//
//   {phase === "open" && type === "new" && showSecondPage && (
//     <div
//       ref={secondPageRef}
//       className="relative rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)] transition-opacity duration-300 overflow-hidden"
//       style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, opacity: secondPageVisible ? 1 : 0 }}
//     >
//       <ScreenplayBlockEditor
//         blocks={blocks}
//         onChange={setBlocks}
//         className="h-full"
//       />
//     </div>
//   )}
//
// ─────────────────────────────────────────────────────────────
//
// 4. ЗАМЕНИТЬ блок upload textarea:
//
// БЫЛО:
//   <textarea
//     ref={textareaRef}
//     value={scenario}
//     onChange={(event) => setScenario(event.target.value)}
//     className="h-full min-h-[1056px] w-full resize-none ..."
//   />
//
// СТАЛО:
//   <ScreenplayBlockEditor
//     blocks={blocks}
//     onChange={setBlocks}
//     className="h-full min-h-[1056px]"
//   />
//
// ─────────────────────────────────────────────────────────────
// Всё остальное в ScriptWriterOverlay — анимация, титульная страница,
// автосейв, закрытие — остаётся без изменений.
// ─────────────────────────────────────────────────────────────
