import { BaseEditor } from "slate"
import { ReactEditor } from "slate-react"
import { HistoryEditor } from "slate-history"

// Типы блоков сценария (Fountain-совместимые) — aligned with v2 BlockType
export type ScreenplayElementType =
  | "scene_heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "shot"

// Элемент сценария — блок с типом и уникальным ID
export type ScreenplayElement = {
  type: ScreenplayElementType
  id: string
  sceneId?: string
  children: CustomText[]
}

// Текстовый узел с опциональным форматированием
export type CustomText = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

// Кастомный тип редактора
export type ScreenplayEditor = BaseEditor & ReactEditor & HistoryEditor

// Декларация типов для Slate
declare module "slate" {
  interface CustomTypes {
    Editor: ScreenplayEditor
    Element: ScreenplayElement
    Text: CustomText
  }
}

// Генератор уникальных ID для блоков
export function generateBlockId(): string {
  return "blk-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6)
}

// Создать пустой элемент
export function createScreenplayElement(
  type: ScreenplayElementType,
  text: string = ""
): ScreenplayElement {
  return {
    type,
    id: generateBlockId(),
    children: [{ text }],
  }
}
