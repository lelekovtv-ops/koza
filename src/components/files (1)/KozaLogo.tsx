interface KozaLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "terminal";
  showTagline?: boolean;
  className?: string;
}

const SIZES = {
  sm: { width: 100, height: 28, scale: 0.5 },
  md: { width: 160, height: 45, scale: 0.8 },
  lg: { width: 200, height: 56, scale: 1 },
};

export function KozaLogo({
  size = "md",
  variant = "default",
  showTagline = false,
  className = "",
}: KozaLogoProps) {
  const { width, height } = SIZES[size];

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 200 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={
          variant === "terminal"
            ? {
                filter:
                  "drop-shadow(0 0 3px currentColor) drop-shadow(0 0 8px currentColor)",
              }
            : undefined
        }
      >
        {/* K */}
        <line x1="8"  y1="4"  x2="8"  y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="15" y1="4"  x2="15" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="15" y1="28" x2="40" y2="4"  stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="18" y1="31" x2="43" y2="7"  stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="15" y1="28" x2="40" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="18" y1="25" x2="43" y2="49" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>

        {/* O */}
        <line x1="54" y1="4"  x2="54" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="61" y1="4"  x2="61" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="84" y1="4"  x2="84" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="91" y1="4"  x2="91" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="54" y1="4"  x2="91" y2="4"  stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="54" y1="11" x2="91" y2="11" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="54" y1="45" x2="91" y2="45" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="54" y1="52" x2="91" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>

        {/* Z */}
        <line x1="103" y1="4"  x2="138" y2="4"  stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="103" y1="11" x2="138" y2="11" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="136" y1="7"  x2="106" y2="49" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="143" y1="7"  x2="113" y2="49" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="103" y1="45" x2="138" y2="45" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="103" y1="52" x2="138" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>

        {/* A */}
        <line x1="168" y1="4"  x2="150" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="175" y1="4"  x2="157" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="168" y1="4"  x2="186" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="161" y1="4"  x2="179" y2="52" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="155" y1="33" x2="181" y2="33" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
        <line x1="154" y1="40" x2="180" y2="40" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/>
      </svg>

      {showTagline && (
        <span
          style={{ fontFamily: "'Courier New', monospace" }}
          className="text-[9px] tracking-widest uppercase text-muted-foreground"
        >
          AI Production Studio
        </span>
      )}
    </div>
  );
}
