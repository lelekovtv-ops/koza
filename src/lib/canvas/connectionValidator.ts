/**
 * Connection Validator — type-safe connection checking for canvas edges.
 *
 * Ensures only compatible port data types can be connected.
 * Passed to ReactFlow's `isValidConnection` prop.
 */

import type { Connection, Node } from "@xyflow/react"
import type { PortDataType } from "./canvasTypes"
import { getPortDef } from "./nodeRegistry"

/** Check if two port data types are compatible */
function areTypesCompatible(source: PortDataType, target: PortDataType): boolean {
  if (source === "any" || target === "any") return true
  return source === target
}

/** Validate a connection between two nodes */
export function isValidCanvasConnection(
  connection: Connection,
  nodes: Node[],
): boolean {
  const { source, target, sourceHandle, targetHandle } = connection

  // No self-connections
  if (source === target) return false

  // Need both handles to validate types
  if (!sourceHandle || !targetHandle) return false

  // Look up source and target node types
  const sourceNode = nodes.find((n) => n.id === source)
  const targetNode = nodes.find((n) => n.id === target)
  if (!sourceNode?.type || !targetNode?.type) return false

  // Get port definitions
  const sourcePort = getPortDef(sourceNode.type, sourceHandle)
  const targetPort = getPortDef(targetNode.type, targetHandle)
  if (!sourcePort || !targetPort) return false

  // Source must be output, target must be input
  if (sourcePort.direction !== "output" || targetPort.direction !== "input") return false

  // Check type compatibility
  return areTypesCompatible(sourcePort.dataType, targetPort.dataType)
}

/** Get edge color based on source port data type */
export function getEdgeColor(sourceNodeType: string, sourceHandle: string): string {
  const port = getPortDef(sourceNodeType, sourceHandle)
  if (!port) return "#6B7280"

  const colors: Record<PortDataType, string> = {
    text:   "#8B5CF6",
    image:  "#10B981",
    video:  "#EF4444",
    audio:  "#F59E0B",
    number: "#3B82F6",
    style:  "#A855F7",
    bible:  "#D97706",
    any:    "#6B7280",
  }
  return colors[port.dataType]
}
