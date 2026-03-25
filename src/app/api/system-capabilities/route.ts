import { NextResponse } from "next/server"

function hasConfiguredKey(value: string | undefined, prefix: string, placeholder?: string) {
  const normalized = value?.trim()

  if (!normalized || !normalized.startsWith(prefix)) {
    return false
  }

  if (placeholder && normalized === placeholder) {
    return false
  }

  return true
}

export async function GET() {
  return NextResponse.json({
    anthropicConfigured: hasConfiguredKey(process.env.ANTHROPIC_API_KEY, "sk-ant-"),
    openaiConfigured: hasConfiguredKey(process.env.OPENAI_API_KEY, "sk-", "sk-your-openai-key-here"),
    googleConfigured: Boolean(process.env.GOOGLE_API_KEY?.trim()),
  })
}