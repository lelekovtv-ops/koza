/**
 * Applies incoming operations from other users to local zustand stores.
 * Does NOT re-emit operations (prevents infinite loops).
 */

import type { Operation, ServerMessage, ProjectSnapshot, LockInfo, PresenceInfo } from "./types"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { useCollaborationStore } from "@/store/collaboration"
import type { Block } from "@/lib/screenplayFormat"

/**
 * Apply a remote operation to local stores.
 * Called when we receive an "op" message from server (from another user).
 */
export function applyRemoteOp(op: Operation) {
  switch (op.type) {
    case "block.create": {
      const store = useScriptStore.getState()
      const blocks = [...store.blocks]
      const afterIdx = op.afterId ? blocks.findIndex((b) => b.id === op.afterId) : -1
      const newBlock: Block = {
        id: op.blockId,
        type: op.blockType as Block["type"],
        text: op.text ?? "",
      }
      if (afterIdx >= 0) {
        blocks.splice(afterIdx + 1, 0, newBlock)
      } else {
        blocks.push(newBlock)
      }
      useScriptStore.getState().setBlocks(blocks, "remote")
      break
    }

    case "block.update": {
      useScriptStore.getState().updateBlock(op.blockId, op.text, "remote")
      break
    }

    case "block.delete": {
      useScriptStore.getState().deleteBlock(op.blockId, "remote")
      break
    }

    case "block.changeType": {
      useScriptStore.getState().changeType(op.blockId, op.blockType as Block["type"], "remote")
      break
    }

    case "block.reorder": {
      const store = useScriptStore.getState()
      const blocks = [...store.blocks]
      const idx = blocks.findIndex((b) => b.id === op.blockId)
      if (idx >= 0) {
        const [moved] = blocks.splice(idx, 1)
        blocks.splice(op.newOrder, 0, moved)
        useScriptStore.getState().setBlocks(blocks, "remote")
      }
      break
    }

    case "block.updateMeta": {
      useScriptStore.getState().updateBlockProduction(op.blockId, op.meta, "remote")
      break
    }

    case "shot.create": {
      const data = op.data as Record<string, unknown>
      useTimelineStore.getState().addShot({
        id: op.shotId,
        sceneId: op.sceneId,
        parentBlockId: (op.parentBlockId as string) ?? null,
        order: (data.order as number) ?? 0,
        duration: (data.duration as number) ?? 3000,
        shotSize: (data.shotSize as string) ?? "",
        cameraMotion: (data.cameraMotion as string) ?? "",
        caption: (data.caption as string) ?? "",
        label: (data.label as string) ?? "",
        directorNote: (data.directorNote as string) ?? "",
        cameraNote: (data.cameraNote as string) ?? "",
        imagePrompt: (data.imagePrompt as string) ?? "",
        videoPrompt: (data.videoPrompt as string) ?? "",
        thumbnailUrl: (data.thumbnailUrl as string) ?? "",
        originalUrl: (data.originalUrl as string) ?? "",
      })
      break
    }

    case "shot.update": {
      useTimelineStore.getState().updateShot(op.shotId, op.patch)
      break
    }

    case "shot.delete": {
      useTimelineStore.getState().removeShot(op.shotId)
      break
    }

    case "shot.reorder": {
      // Handled via full reorder from server
      break
    }

    case "settings.set": {
      // Settings are store-specific, dispatch to the right store
      useCollaborationStore.getState().applyRemoteSettings(op.key, op.data)
      break
    }
  }
}

/**
 * Apply full project snapshot on initial join.
 */
export function applySnapshot(snapshot: ProjectSnapshot) {
  // Apply blocks
  const blocks: Block[] = snapshot.blocks.map((b) => ({
    id: b.id,
    type: b.type as Block["type"],
    text: b.text,
    durationMs: b.durationMs ?? undefined,
    durationSource: b.durationSource as Block["durationSource"],
  }))
  useScriptStore.getState().setBlocks(blocks, "remote")

  // Shots are applied to timeline store
  // (timeline store expects TimelineShot[] — adapter needed at integration time)
}

/**
 * Handle all server messages and route to appropriate handlers.
 */
export function handleServerMessage(msg: ServerMessage) {
  const collab = useCollaborationStore.getState()

  switch (msg.type) {
    case "snapshot":
      applySnapshot(msg.data)
      collab.setLocks(msg.locks)
      collab.setPresence(msg.presence)
      collab.setLastOpId(msg.data.lastOpId)
      break

    case "op":
      applyRemoteOp(msg.op)
      collab.setLastOpId(msg.opId)
      break

    case "lock:acquired":
      collab.addLock({ sceneId: msg.sceneId, userId: msg.userId, userName: msg.userName, expiresAt: "" })
      break

    case "lock:released":
      collab.removeLock(msg.sceneId)
      break

    case "lock:denied":
      collab.setLockDenied(msg.sceneId, msg.userName)
      break

    case "presence:update":
      collab.setPresence(msg.users)
      break

    case "user:joined":
      collab.addUser(msg.userId, msg.name)
      break

    case "user:left":
      collab.removeUser(msg.userId)
      break
  }
}
