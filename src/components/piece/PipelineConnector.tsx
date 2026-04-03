"use client"

/** Draws a curved line between two panels (pipeline connection) */
export function PipelineConnector({
  from,
  to,
  visible,
}: {
  from: { right: number; centerY: number }
  to: { left: number; centerY: number }
  visible: boolean
}) {
  if (!visible) return null

  const x1 = from.right
  const y1 = from.centerY
  const x2 = to.left
  const y2 = to.centerY
  const cx = (x1 + x2) / 2

  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[90]"
      style={{
        opacity: visible ? 0.3 : 0,
        transition: "opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <defs>
        <linearGradient id="pipe-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D4A853" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#D4A853" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#D4A853" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path
        d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke="url(#pipe-grad)"
        strokeWidth="1.5"
        strokeDasharray="6,4"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-20"
          dur="2s"
          repeatCount="indefinite"
        />
      </path>
      {/* Dot at start */}
      <circle cx={x1} cy={y1} r="3" fill="#D4A853" fillOpacity="0.4" />
      {/* Dot at end */}
      <circle cx={x2} cy={y2} r="3" fill="#D4A853" fillOpacity="0.4" />
    </svg>
  )
}
