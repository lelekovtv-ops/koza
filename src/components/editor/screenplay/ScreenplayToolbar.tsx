import React from "react"
import {
  FileText,
  Zap,
  User,
  MessageCircle,
  Minimize,
  ChevronRight,
  Bold,
  Italic,
  Underline,
  RotateCcw,
  RotateCw,
  Wand2,
  Keyboard,
  Camera,
} from "lucide-react"
import type { ScreenplayElementType } from "@/lib/screenplayTypes"
import type { ScreenplayColors } from "./screenplayUiTypes"

interface ScreenplayToolbarProps {
  colors: ScreenplayColors
  focusMode: boolean
  toolbarCollapsed: boolean
  setToolbarCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  insertNewBlock: (type: ScreenplayElementType, text?: string) => void
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleTypewriter: () => void
  typewriterSound: boolean
}

function ToolbarBtn({
  onClick,
  title,
  children,
  disabled,
  active,
  colors,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
  colors: ScreenplayColors
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-md p-2 transition"
      style={{
        backgroundColor: "transparent",
        border: "none",
        color: active ? colors.accent : colors.text,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.buttonHover)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      onMouseDown={(e) => (e.currentTarget.style.backgroundColor = colors.buttonActive)}
      onMouseUp={(e) => (e.currentTarget.style.backgroundColor = colors.buttonHover)}
    >
      {children}
    </button>
  )
}

export function ScreenplayToolbar({
  colors,
  focusMode,
  toolbarCollapsed,
  setToolbarCollapsed,
  insertNewBlock,
  onBold,
  onItalic,
  onUnderline,
  onUndo,
  onRedo,
  onToggleTypewriter,
  typewriterSound,
}: ScreenplayToolbarProps) {
  if (focusMode) return null

  return (
    <div
      className="absolute left-1 top-1 z-10 flex flex-col items-start gap-2 rounded-2xl p-2"
      style={{
        backgroundColor: colors.toolbarBg,
        border: `1px solid ${colors.border}`,
        borderBottom: "none",
        boxShadow: colors.shadow,
      }}
    >
      <button
        onClick={() => setToolbarCollapsed((v) => !v)}
        title={toolbarCollapsed ? "Expand screenplay tools" : "Collapse screenplay tools"}
        className="rounded-md px-2 py-1.5 text-sm transition"
        style={{
          backgroundColor: colors.surfaceElevatedBg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          lineHeight: 1,
        }}
      >
        ≡
      </button>

      {!toolbarCollapsed && (
        <>
          <ToolbarBtn onClick={() => insertNewBlock("scene_heading", "INT. ")} title="Scene Heading INT." colors={colors}><FileText size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("scene_heading", "EXT. ")} title="Scene Heading EXT." colors={colors}><FileText size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("action")} title="Action" colors={colors}><Zap size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("character")} title="Character" colors={colors}><User size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("dialogue")} title="Dialogue" colors={colors}><MessageCircle size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("parenthetical", "()") } title="Parenthetical" colors={colors}><Minimize size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("transition", "CUT TO:")} title="Transition" colors={colors}><ChevronRight size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertNewBlock("shot")} title="Shot" colors={colors}><Camera size={15} /></ToolbarBtn>

          <div className="h-4 w-px" style={{ backgroundColor: colors.border }} />

          <ToolbarBtn onClick={onBold} title="Bold" colors={colors}><Bold size={14} /></ToolbarBtn>
          <ToolbarBtn onClick={onItalic} title="Italic" colors={colors}><Italic size={14} /></ToolbarBtn>
          <ToolbarBtn onClick={onUnderline} title="Underline" colors={colors}><Underline size={14} /></ToolbarBtn>

          <div style={{ width: 1, height: 16, backgroundColor: colors.border, margin: "0 4px" }} />

          <ToolbarBtn onClick={onUndo} title="Undo" colors={colors}><RotateCcw size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={onRedo} title="Redo" colors={colors}><RotateCw size={15} /></ToolbarBtn>

          <div style={{ width: 1, height: 16, backgroundColor: colors.border, margin: "0 4px" }} />

          <ToolbarBtn onClick={() => {}} title="AI Format" colors={colors}><Wand2 size={15} /></ToolbarBtn>
          <ToolbarBtn onClick={onToggleTypewriter} title="Typewriter sound" active={typewriterSound} colors={colors}><Keyboard size={15} /></ToolbarBtn>
        </>
      )}
    </div>
  )
}
