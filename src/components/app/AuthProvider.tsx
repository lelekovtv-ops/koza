"use client"

import { SessionProvider } from "next-auth/react"
import type { ReactNode } from "react"
import { useCollaboration } from "@/hooks/useCollaboration"

function CollaborationBridge() {
  useCollaboration()
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <CollaborationBridge />
      {children}
    </SessionProvider>
  )
}
