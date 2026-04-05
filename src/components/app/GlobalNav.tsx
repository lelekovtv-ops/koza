"use client"

import { Suspense, Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useThemeStore } from "@/store/theme"

const NAV_ITEMS = [
  { id: "media", href: "/library", label: "MEDIA" },
  { id: "board", href: "/board", label: "DESKTOP" },
  { id: "script", href: "/", label: "SCRIPTWRITER" },
  { id: "workspace", href: "/workspace", label: "BREAKDOWN STUDIO" },
  { id: "export", href: "/export", label: "EXPORT" },
]

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.id === "script") return pathname === "/" || pathname === "/projects"
  return pathname.startsWith(item.href) && item.href !== "/"
}

function Divider() {
  return (
    <div className="flex h-[28px] items-center mx-1">
      <div
        className="h-full w-px"
        style={{
          background: `linear-gradient(to bottom, transparent 0%, var(--nav-divider-mid) 40%, var(--nav-divider-mid) 60%, transparent 100%)`,
        }}
      />
    </div>
  )
}

/* ── Theme-specific styles lookup ── */
const THEME_STYLES = {
  cinematic: {
    btnBg: "rgba(255,255,255,0.04)",
    btnBorder: "rgba(255,255,255,0.06)",
    btnShadow: "none",
    logoDim: "rgba(255,255,255,0.20)",
    logoBright: "rgba(255,255,255,0.40)",
    logoShadow: "none",
    navDim: "rgba(255,255,255,0.30)",
    navBright: "rgba(255,255,255,0.55)",
    navHoverShadow: "none",
    activeColor: "#D4A853",
    activeShadow: "none",
    activeGlow: "linear-gradient(180deg, transparent 0%, rgba(212,168,83,0.04) 40%, rgba(212,168,83,0.08) 80%, rgba(212,168,83,0.12) 100%)",
    navShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 4px 12px rgba(0,0,0,0.5)",
    navBorder: "1px solid rgba(255,255,255,0.05)",
    bottomLine: false,
    title: "Switch theme",
  },
  synthwave: {
    btnBg: "rgba(0,240,255,0.08)",
    btnBorder: "rgba(0,240,255,0.2)",
    btnShadow: "0 0 12px rgba(0,240,255,0.15), inset 0 1px 0 rgba(0,240,255,0.1)",
    logoDim: "rgba(0,240,255,0.35)",
    logoBright: "rgba(0,240,255,0.7)",
    logoShadow: "0 0 8px rgba(0,240,255,0.3), 0 0 20px rgba(0,240,255,0.1)",
    navDim: "rgba(0,240,255,0.40)",
    navBright: "rgba(0,240,255,0.75)",
    navHoverShadow: "0 0 6px rgba(0,240,255,0.3)",
    activeColor: "#00f0ff",
    activeShadow: "0 0 8px rgba(0,240,255,0.5), 0 0 25px rgba(0,240,255,0.2)",
    activeGlow: "linear-gradient(180deg, transparent 0%, rgba(255,45,149,0.04) 30%, rgba(255,45,149,0.08) 70%, rgba(0,240,255,0.06) 100%)",
    navShadow: "0 1px 0 rgba(0,240,255,0.06) inset, 0 4px 20px rgba(255,45,149,0.12), 0 1px 0 rgba(255,45,149,0.25)",
    navBorder: "1px solid rgba(0,240,255,0.12)",
    bottomLine: true,
    title: "Switch theme",
  },
  architect: {
    btnBg: "rgba(255,255,255,0.03)",
    btnBorder: "rgba(255,255,255,0.18)",
    btnShadow: "none",
    logoDim: "rgba(255,255,255,0.30)",
    logoBright: "rgba(255,255,255,0.65)",
    logoShadow: "none",
    navDim: "rgba(255,255,255,0.30)",
    navBright: "rgba(255,255,255,0.70)",
    navHoverShadow: "none",
    activeColor: "#ffffff",
    activeShadow: "none",
    activeGlow: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.04) 80%, rgba(255,255,255,0.06) 100%)",
    navShadow: "0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 16px rgba(0,0,0,0.8)",
    navBorder: "1px solid rgba(255,255,255,0.12)",
    bottomLine: true,
    title: "Switch theme",
  },
} as const

function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggleTheme)
  const s = THEME_STYLES[theme]

  return (
    <button
      onClick={toggle}
      className="relative flex items-center justify-center w-8 h-8 transition-all duration-300"
      style={{
        background: s.btnBg,
        border: `1px solid ${s.btnBorder}`,
        boxShadow: s.btnShadow,
        borderRadius: theme === "architect" ? "1px" : "6px",
      }}
      title={s.title}
    >
      {theme === "synthwave" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M1 10C3 6 5 12 7 8C9 4 11 11 15 7" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 3px rgba(0,240,255,0.6))" }} />
          <circle cx="8" cy="12" r="1" fill="#ff2d95" style={{ filter: "drop-shadow(0 0 3px rgba(255,45,149,0.8))" }} />
        </svg>
      ) : theme === "architect" ? (
        /* Architect icon — wireframe cube */
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="3" width="10" height="10" stroke="rgba(255,255,255,0.50)" strokeWidth="1" fill="none" />
          <line x1="3" y1="3" x2="6" y2="1" stroke="rgba(255,255,255,0.30)" strokeWidth="0.7" />
          <line x1="13" y1="3" x2="15" y2="1" stroke="rgba(255,255,255,0.30)" strokeWidth="0.7" />
          <line x1="6" y1="1" x2="15" y2="1" stroke="rgba(255,255,255,0.30)" strokeWidth="0.7" />
          <line x1="15" y1="1" x2="15" y2="10" stroke="rgba(255,255,255,0.30)" strokeWidth="0.7" />
          <line x1="13" y1="13" x2="15" y2="10" stroke="rgba(255,255,255,0.30)" strokeWidth="0.7" />
          <line x1="8" y1="8" x2="8" y2="8" stroke="rgba(255,255,255,0.20)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <rect x="4" y="5" width="8" height="6" rx="0.5" fill="rgba(212,168,83,0.15)" stroke="rgba(212,168,83,0.3)" strokeWidth="0.5" />
          <circle cx="3.5" cy="5" r="0.7" fill="rgba(255,255,255,0.25)" />
          <circle cx="3.5" cy="8" r="0.7" fill="rgba(255,255,255,0.25)" />
          <circle cx="3.5" cy="11" r="0.7" fill="rgba(255,255,255,0.25)" />
          <circle cx="12.5" cy="5" r="0.7" fill="rgba(255,255,255,0.25)" />
          <circle cx="12.5" cy="8" r="0.7" fill="rgba(255,255,255,0.25)" />
          <circle cx="12.5" cy="11" r="0.7" fill="rgba(255,255,255,0.25)" />
        </svg>
      )}
    </button>
  )
}

function GlobalNavInner() {
  const pathname = usePathname()
  const theme = useThemeStore((s) => s.theme)
  const s = THEME_STYLES[theme]

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[200] flex h-[56px] select-none items-center"
      style={{
        background: `linear-gradient(180deg, var(--bg-nav-from) 0%, var(--bg-nav-via) 40%, var(--bg-nav-to) 100%)`,
        backdropFilter: "blur(20px) saturate(1.4)",
        boxShadow: s.navShadow,
        borderBottom: s.navBorder,
      }}
    >
      {/* Logo */}
      <Link href="/projects" className="flex items-center pl-6 pr-5">
        <span
          className="text-[10px] font-bold tracking-[0.45em] transition-colors duration-300"
          style={{
            fontFamily: theme === "architect" ? "var(--font-geist-mono)" : "'Outfit', sans-serif",
            color: s.logoDim,
            textShadow: s.logoShadow,
            letterSpacing: theme === "architect" ? "0.55em" : "0.45em",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = s.logoBright }}
          onMouseLeave={(e) => { e.currentTarget.style.color = s.logoDim }}
        >
          PIECE
        </span>
      </Link>

      <Divider />

      {/* Center nav items */}
      <div className="flex flex-1 items-stretch justify-center">
        {NAV_ITEMS.map((item, i) => {
          const active = isActive(pathname, item)

          return (
            <Fragment key={item.id}>
              {i > 0 && <Divider />}
              <Link
                href={item.href}
                className="group relative flex items-center px-6 transition-all duration-300 ease-out"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                {/* Background glow for active tab */}
                {active && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: s.activeGlow }}
                  />
                )}

                {/* Bottom line for active (synthwave + architect) */}
                {active && s.bottomLine && (
                  <div
                    className="absolute bottom-0 left-2 right-2 pointer-events-none"
                    style={theme === "architect" ? {
                      height: "1px",
                      background: "rgba(255,255,255,0.45)",
                    } : {
                      height: "2px",
                      background: "linear-gradient(90deg, transparent, #ff2d95, #00f0ff, transparent)",
                      boxShadow: "0 0 8px rgba(255,45,149,0.5), 0 0 20px rgba(0,240,255,0.3)",
                    }}
                  />
                )}

                <span
                  className={`relative text-[12px] transition-all duration-300 ${
                    active ? "font-semibold" : "font-medium"
                  }`}
                  style={{
                    letterSpacing: theme === "architect" ? "0.22em" : "0.18em",
                    fontFamily: theme === "architect" ? "var(--font-geist-mono)" : "'Outfit', sans-serif",
                    fontSize: theme === "architect" ? "10px" : "12px",
                    color: active ? s.activeColor : s.navDim,
                    textShadow: active ? s.activeShadow : "none",
                    textTransform: "uppercase",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = s.navBright
                      if (s.navHoverShadow !== "none") e.currentTarget.style.textShadow = s.navHoverShadow
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = s.navDim
                      if (s.navHoverShadow !== "none") e.currentTarget.style.textShadow = "none"
                    }
                  }}
                >
                  {item.label}
                </span>
              </Link>
            </Fragment>
          )
        })}
      </div>

      <Divider />

      {/* Theme toggle + spacer */}
      <div className="flex items-center justify-center w-[80px]">
        <ThemeToggle />
      </div>
    </nav>
  )
}

export function GlobalNav() {
  return (
    <Suspense
      fallback={
        <nav className="fixed top-0 left-0 right-0 z-[200] h-[56px] border-b border-white/[0.05] bg-[#111010]" />
      }
    >
      <GlobalNavInner />
    </Suspense>
  )
}
