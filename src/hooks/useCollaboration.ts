/**
 * useCollaboration — connects WS client to NextAuth session and project.
 * Mount at layout level. Handles connect/disconnect lifecycle.
 */

import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { getWSClient } from "@/lib/ws/client"
import { handleServerMessage } from "@/lib/ws/opApplier"
import { useCollaborationStore } from "@/store/collaboration"
import { useProjectsStore } from "@/store/projects"

export function useCollaboration() {
  const { data: session, status } = useSession()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const setConnectionState = useCollaborationStore((s) => s.setConnectionState)
  const unsubRef = useRef<(() => void) | null>(null)

  // Connect when authenticated
  useEffect(() => {
    if (status !== "authenticated" || !session) return

    const client = getWSClient()

    // Subscribe to messages
    if (!unsubRef.current) {
      unsubRef.current = client.onMessage((msg) => {
        handleServerMessage(msg)

        // Track connection state
        if (msg.type === "auth:ok") {
          setConnectionState(true, true)
          client.flushQueue()
        }
        if (msg.type === "auth:error") {
          setConnectionState(true, false)
        }
      })
    }

    // Get JWT token for WS auth
    // NextAuth stores the token in the session — we pass it to WS
    const token = (session as { accessToken?: string })?.accessToken || ""
    if (token) {
      client.connect(token)
    }

    return () => {
      // Don't disconnect on every re-render — only on unmount
    }
  }, [status, session, setConnectionState])

  // Join/leave project
  useEffect(() => {
    if (status !== "authenticated") return

    const client = getWSClient()
    if (activeProjectId) {
      client.joinProject(activeProjectId)
    } else {
      client.leaveProject()
    }
  }, [activeProjectId, status])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
      getWSClient().disconnect()
      setConnectionState(false, false)
    }
  }, [setConnectionState])
}
