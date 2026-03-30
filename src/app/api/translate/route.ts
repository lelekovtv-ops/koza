import { NextRequest, NextResponse } from "next/server"
import translate from "google-translate-api-x"

export async function POST(req: NextRequest) {
  const { text, from, to } = await req.json() as { text: string; from?: string; to?: string }

  if (!text?.trim()) {
    return NextResponse.json({ translated: "" })
  }

  try {
    const result = await translate(text, {
      from: from || "auto",
      to: to || "en",
    })

    return NextResponse.json({
      translated: result.text,
      detectedLang: result.from?.language?.iso || null,
    })
  } catch (err) {
    console.error("[translate] Error:", err)
    return NextResponse.json({ error: "Translation failed" }, { status: 500 })
  }
}
