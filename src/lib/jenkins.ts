import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"

export interface JenkinsShot {
  label: string
  type: "image"
  duration: number
  notes: string
}

const JENKINS_SYSTEM_PROMPT = [
  "You are Jenkins, an experienced cinematographer and shot planner.",
  "Given a scene description, break it down into individual shots.",
  "Return ONLY a valid JSON array with objects containing: label (e.g. 'WIDE — Establishing'), type ('image'),",
  "duration (ms, typically 2000-6000), notes (camera direction).",
  "Be specific and practical. 3-6 shots per scene.",
  "No markdown, no code fences, just raw JSON.",
].join(" ")

export async function breakdownScene(
  sceneText: string,
  modelId: string = DEFAULT_TEXT_MODEL_ID,
): Promise<{ shots: JenkinsShot[] }> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: sceneText }],
      modelId,
      system: JENKINS_SYSTEM_PROMPT,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Jenkins breakdown failed: ${errorText}`)
  }

  // The endpoint streams text — collect full response
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let fullText = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    fullText += decoder.decode(value, { stream: true })
  }

  // Strip possible markdown fences
  const cleaned = fullText.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim()

  const parsed: unknown = JSON.parse(cleaned)

  if (!Array.isArray(parsed)) {
    throw new Error("Jenkins returned non-array response")
  }

  const shots: JenkinsShot[] = parsed.map((item: Record<string, unknown>, i: number) => ({
    label: typeof item.label === "string" ? item.label : `Shot ${i + 1}`,
    type: "image" as const,
    duration: typeof item.duration === "number" ? item.duration : 3000,
    notes: typeof item.notes === "string" ? item.notes : "",
  }))

  return { shots }
}
