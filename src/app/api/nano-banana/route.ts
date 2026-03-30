import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"

type CandidatePart = {
  inlineData?: {
    mimeType?: string
    data?: string
  }
  text?: string
}

type ReferencePart = {
  inlineData: {
    mimeType: string
    data: string
  }
}

function parseDataUrl(dataUrl: string): ReferencePart | null {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1 || !dataUrl.startsWith("data:")) return null

  const header = dataUrl.slice(5, commaIndex)
  const base64Marker = ";base64"
  if (!header.endsWith(base64Marker)) return null

  const mimeType = header.slice(0, -base64Marker.length)
  const data = dataUrl.slice(commaIndex + 1)

  return {
    inlineData: { mimeType, data },
  }
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function POST(req: Request) {
  try {
    const { prompt, model, referenceImages } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey })

    // All use gemini-2.5-flash-image (the only stable image model right now)
    // NB2 and Pro variants use different quality settings
    const modelId = "gemini-2.5-flash-image"

    const maxReferenceCount = modelId === "gemini-2.5-flash-image" ? 3 : 5

    const imageReferenceParts = Array.isArray(referenceImages)
      ? referenceImages
        .filter((entry): entry is string => typeof entry === "string" && entry.startsWith("data:"))
        .slice(0, maxReferenceCount)
        .map(parseDataUrl)
        .filter((entry): entry is ReferencePart => Boolean(entry))
      : []

    const contents = [
      prompt,
      ...imageReferenceParts,
    ]

    const maxAttempts = 3
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents,
          config: {
            responseModalities: ["image"],
            imageConfig: {
              aspectRatio: "16:9",
            },
          },
        })

        const parts = response.candidates?.[0]?.content?.parts as CandidatePart[] | undefined
        const imagePart = parts?.find((part) => part.inlineData?.mimeType?.startsWith("image/"))

        if (imagePart?.inlineData?.data) {
          const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64")

          return new Response(imageBuffer, {
            headers: {
              "Content-Type": imagePart.inlineData.mimeType || "image/png",
              "Cache-Control": "public, max-age=31536000",
            },
          })
        }

        const textPart = parts?.find((part) => part.text)
        return NextResponse.json(
          {
            error: "No image generated",
            details: textPart?.text || `Model ${modelId} returned no image parts`,
          },
          { status: 500 }
        )
      } catch (error) {
        lastError = error
        const isRetryable = error instanceof Error && /503|UNAVAILABLE|overloaded|high demand/i.test(error.message)
        if (isRetryable && attempt < maxAttempts - 1) {
          const delay = (attempt + 1) * 3000
          console.warn(`Nano Banana retry ${attempt + 1}/${maxAttempts} after ${delay}ms: ${getErrorMessage(error)}`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
        break
      }
    }

    console.error("Nano Banana error:", lastError)
    return NextResponse.json(
      { error: "Image generation failed", details: getErrorMessage(lastError) },
      { status: 500 }
    )
  } catch (error) {
    console.error("Nano Banana error:", error)
    return NextResponse.json(
      { error: "Image generation failed", details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}