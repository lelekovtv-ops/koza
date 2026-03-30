"use client"

import { Package } from "lucide-react"

export default function ExportPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <Package size={48} strokeWidth={1} className="mx-auto mb-4 text-[#D4A853]/20" />
        <h1 className="text-[13px] uppercase tracking-[0.3em] text-white/40">Export</h1>
        <p className="mt-2 text-[11px] text-white/15">PDF, call sheets, sharing coming soon</p>
      </div>
    </div>
  )
}
