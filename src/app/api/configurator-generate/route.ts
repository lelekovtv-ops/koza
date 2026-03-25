import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { NextResponse } from "next/server"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import {
  CONFIGURATOR_AGENT_RULES,
  CONFIGURATOR_AGENT_RULE_SUMMARY,
  convertConfiguratorAgentPlanToGraph,
  parseConfiguratorAgentPlan,
  validateConfiguratorAgentPlan,
} from "@/lib/configurator/agent"

function hasConfiguredKey(value: string | undefined, prefix: string, placeholder?: string): boolean {
  const normalized = value?.trim()

  if (!normalized || !normalized.startsWith(prefix)) {
    return false
  }

  if (placeholder && normalized === placeholder) {
    return false
  }

  return true
}

function resolveTextModel(): { id: string; model: ReturnType<typeof anthropic> | ReturnType<typeof openai> | ReturnType<typeof google> } {
  if (hasConfiguredKey(process.env.ANTHROPIC_API_KEY, "sk-ant-")) {
    return {
      id: DEFAULT_TEXT_MODEL_ID,
      model: anthropic(DEFAULT_TEXT_MODEL_ID),
    }
  }

  if (hasConfiguredKey(process.env.OPENAI_API_KEY, "sk-", "sk-your-openai-key-here")) {
    return {
      id: "gpt-4o",
      model: openai("gpt-4o"),
    }
  }

  if (hasConfiguredKey(process.env.GOOGLE_API_KEY, "AIza")) {
    return {
      id: "gemini-1.5-pro",
      model: google("gemini-1.5-pro"),
    }
  }

  throw new Error("No text model provider is configured for configurator generation.")
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json()

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const { id: modelId, model } = resolveTextModel()
    const { text } = await generateText({
      model,
      temperature: 0.2,
      system: [
        "You generate validated KOZA configurator plans.",
        "Return JSON only.",
        "Return one object with keys: name, description, nodes, edges.",
        "Each node must have: id, kind, title.",
        "Prompt nodes may include binding, promptText, detailHints.",
        "AI nodes must include roleLabel, mode, instruction.",
        "Generator nodes may include system.",
        "Edges must contain source, target, and optional label.",
        "Do not include positions, styling, React code, comments, or markdown.",
        CONFIGURATOR_AGENT_RULES,
      ].join("\n"),
      prompt: [
        "Build a KOZA configurator graph from this request.",
        "Prefer reusable building blocks and explicit Bible bindings.",
        "If the request is ambiguous, choose a compact but runnable graph.",
        "User request:",
        prompt.trim(),
      ].join("\n\n"),
    })

    const parsedPlan = parseConfiguratorAgentPlan(text)
    const { plan, warnings } = validateConfiguratorAgentPlan(parsedPlan)
    const graph = convertConfiguratorAgentPlanToGraph(plan)

    return NextResponse.json({
      modelId,
      plan,
      nodes: graph.nodes,
      edges: graph.edges,
      warnings,
      rules: CONFIGURATOR_AGENT_RULE_SUMMARY,
    })
  } catch (error) {
    console.error("configurator-generate error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}