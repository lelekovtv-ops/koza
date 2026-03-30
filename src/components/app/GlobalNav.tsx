"use client"

import { Suspense, Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { id: "media", href: "/library", label: "MEDIA" },
  { id: "script", href: "/", label: "SCRIPTWRITER" },
  { id: "workspace", href: "/workspace", label: "STORYBOARD" },
  { id: "timeline", href: "/timeline", label: "TIMELINE" },
  { id: "export", href: "/export", label: "EXPORT" },
]

function isActive(pathname: string, item: typeof NAV_ITEMS[number]): boolean {
  if (item.id === "script") return pathname === "/"
  return pathname.startsWith(item.href) && item.href !== "/"
}

function Groove() {
  return (
    <div className="flex h-[32px] items-center">
      <div
        className="h-full w-[1px]"
        style={{
          background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.5) 70%, transparent 100%)",
          boxShadow: "1px 0 0 rgba(255,255,255,0.04)",
        }}
      />
    </div>
  )
}

function GlobalNavInner() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[200] flex h-[56px] select-none items-center border-b border-white/[0.05]"
      style={{
        background: "linear-gradient(180deg, #181614 0%, #141210 40%, #111010 100%)",
        backdropFilter: "blur(20px) saturate(1.4)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center pl-6 pr-5">
        <span
          className="text-[10px] font-bold tracking-[0.45em] text-white/15 transition-colors duration-300 hover:text-white/35"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          KOZA
        </span>
      </Link>

      <Groove />

      {/* Center nav items */}
      <div className="flex flex-1 items-stretch justify-center">
        {NAV_ITEMS.map((item, i) => {
          const active = isActive(pathname, item)

          return (
            <Fragment key={item.id}>
              {i > 0 && <Groove />}
              <Link
                href={item.href}
                className={`group relative flex items-center px-7 transition-all duration-300 ease-out ${
                  active
                    ? "text-white/90"
                    : "text-white/[0.16] hover:text-white/40"
                }`}
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                <span
                  className={`text-[13px] transition-all duration-300 ${
                    active
                      ? "font-semibold tracking-[0.14em]"
                      : "font-medium tracking-[0.12em]"
                  }`}
                >
                  {item.label}
                </span>

                {/* Active — gold glow */}
                {active && (
                  <>
                    <span className="absolute bottom-0 left-5 right-5 h-[2px] rounded-t-full bg-[#D4A853]" />
                    <span className="absolute bottom-0 left-5 right-5 h-[2px] rounded-t-full bg-[#D4A853]/50 blur-[6px]" />
                  </>
                )}
              </Link>
            </Fragment>
          )
        })}
      </div>

      <Groove />

      {/* Right spacer to balance logo */}
      <div className="w-[80px]" />
    </nav>
  )
}

export function GlobalNav() {
  return (
    <Suspense fallback={<nav className="fixed top-0 left-0 right-0 z-[200] h-[56px] border-b border-white/[0.05] bg-[#111010]" />}>
      <GlobalNavInner />
    </Suspense>
  )
}
