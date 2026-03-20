import React from "react"
import { X } from "lucide-react"
import type { ScreenplayColors } from "./screenplayUiTypes"

interface FloatingToolbarState {
  visible: boolean
  selectedText: string
}

interface ScreenplayFloatingAiToolbarProps {
  floatingToolbar: FloatingToolbarState
  colors: ScreenplayColors
  applyAIAction: (action: string) => void
  setFloatingToolbar: React.Dispatch<React.SetStateAction<FloatingToolbarState>>
}

export function ScreenplayFloatingAiToolbar({
  floatingToolbar,
  colors,
  applyAIAction,
  setFloatingToolbar,
}: ScreenplayFloatingAiToolbarProps) {
  if (!floatingToolbar.visible || !floatingToolbar.selectedText) return null

  return (
    <div
      className="fixed flex gap-1 rounded-xl"
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
        backgroundColor: colors.surfaceElevatedBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        boxShadow: colors.shadow,
        padding: "8px",
      }}
    >
      {[
        { action: "rewrite", label: "Rewrite" },
        { action: "expand", label: "Expand" },
        { action: "shorten", label: "Shorten" },
        { action: "fix_grammar", label: "Grammar" },
      ].map((item) => (
        <button
          key={item.action}
          className="rounded-md transition"
          style={{ padding: "6px 10px", fontSize: 11, color: colors.text, backgroundColor: "transparent", border: "none" }}
          onClick={() => applyAIAction(item.action)}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.buttonHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {item.label}
        </button>
      ))}
      <div style={{ width: 1, height: 16, backgroundColor: colors.border }} />
      <button
        className="rounded-md transition"
        style={{ padding: "6px 10px", fontSize: 11, color: colors.text, backgroundColor: "transparent", border: "none" }}
        onClick={() => setFloatingToolbar({ visible: false, selectedText: "" })}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.buttonHover)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <X size={12} />
      </button>
    </div>
  )
}
