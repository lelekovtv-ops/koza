import OpenAI from "openai"
import { NextResponse } from "next/server"

const DEFAULT_IMAGE_MODEL = "gpt-image-1"

function dataUrlToFile(dataUrl: string, index: number): File {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1 || !dataUrl.startsWith("data:")) {
    throw new Error("Invalid reference image format")
  }

  const header = dataUrl.slice(5, commaIndex)
  const base64Marker = ";base64"
  if (!header.endsWith(base64Marker)) {
    throw new Error("Invalid reference image format")
  }

  const mimeType = header.slice(0, -base64Marker.length)
  const base64Payload = dataUrl.slice(commaIndex + 1)
  const buffer = Buffer.from(base64Payload, "base64")
  const extension = mimeType.split("/")[1] ?? "png"

  return new File([buffer], `reference-${index}.${extension}`, { type: mimeType })
}

function extractImageResponse(result: { data?: Array<{ url?: string; b64_json?: string }> }) {
  const imageUrl = result.data?.[0]?.url
  const b64 = result.data?.[0]?.b64_json

  return { imageUrl, b64 }
}

async function buildImageResponse(result: { data?: Array<{ url?: string; b64_json?: string }> }) {
  const { imageUrl, b64 } = extractImageResponse(result)

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

  return null
}

async function generateFromPrompt(openai: OpenAI, prompt: string) {
  return openai.images.generate({
    model: DEFAULT_IMAGE_MODEL,
    prompt,
    quality: "low",
    size: "1536x1024",
    n: 1,
  })
}

export async function POST(req: Request) {
  try {
    const { prompt, referenceImages } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const normalizedReferenceImages = Array.isArray(referenceImages)
      ? referenceImages.filter((entry): entry is string => typeof entry === "string" && entry.startsWith("data:"))
      : []

    if (normalizedReferenceImages.length > 0) {
      try {
        const referenceFiles = normalizedReferenceImages.map((imageUrl, index) => dataUrlToFile(imageUrl, index))
        const editedImage = await openai.images.edit({
          model: DEFAULT_IMAGE_MODEL,
          image: referenceFiles,
          prompt,
          input_fidelity: "high",
          quality: "medium",
          size: "1536x1024",
          n: 1,
        })

        const response = await buildImageResponse(editedImage)

        if (response) {
          return response
        }
      } catch (referenceError) {
        console.error("GPT Image reference edit failed, falling back to prompt-only generation:", referenceError)
      }
    }

    const result = await generateFromPrompt(openai, prompt)
    const response = await buildImageResponse(result)

    if (response) {
      return response
    }

    return NextResponse.json({ error: "No image" }, { status: 500 })
  } catch (error) {
    console.error("GPT Image error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}