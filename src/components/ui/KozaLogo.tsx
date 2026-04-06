interface KozaLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "terminal";
  showTagline?: boolean;
  className?: string;
}

const SIZES = {
  sm:  { fontSize: 18, tagSize: 8 },
  md:  { fontSize: 32, tagSize: 10 },
  lg:  { fontSize: 48, tagSize: 12 },
};

export function KozaLogo({
  size = "md",
  variant = "default",
  showTagline = false,
  className = "",
}: KozaLogoProps) {
  const { fontSize, tagSize } = SIZES[size];

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <span
        style={{
          fontFamily: "'Libre Baskerville', Georgia, serif",
          fontStyle: "italic",
          fontSize,
          fontWeight: 400,
          letterSpacing: "0.15em",
          lineHeight: 1,
          ...(variant === "terminal"
            ? { textShadow: "0 0 3px currentColor, 0 0 8px currentColor" }
            : {}),
        }}
      >
        PIECE
      </span>

      {showTagline && (
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            letterSpacing: "0.12em",
            fontSize: tagSize,
            lineHeight: 1.08,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
          className="text-neutral-500 select-none"
        >
          Creative Production Platform
        </span>
      )}
    </div>
  );
}
