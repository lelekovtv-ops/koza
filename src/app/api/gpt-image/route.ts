import OpenAI from "openai"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      quality: "low",
      size: "1536x1024",
      n: 1,
    })

    const imageUrl = result.data?.[0]?.url
    const b64 = result.data?.[0]?.b64_json

    if (b64) {
      return new Response(Buffer.from(b64, "base64"), {
        headers: { "Content-Type": "image/png" },
      })
    }

    if (imageUrl) {
      const imgRes = await fetch(imageUrl)
      return new Response(await imgRes.arrayBuffer(), {
        headers: { "Content-Type": "image/png" },
      })
    }

    return NextResponse.json({ error: "No image" }, { status: 500 })
  } catch (error) {
    console.error("GPT Image error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}