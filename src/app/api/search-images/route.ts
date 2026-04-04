export async function POST(req: Request) {
  try {
    const { query, count = 12 } = await req.json()
    if (!query) return Response.json({ photos: [] })

    // ── Try Pexels first ──
    const pexelsKey = process.env.PEXELS_API_KEY
    if (pexelsKey) {
      const { createClient } = await import("pexels")
      const client = createClient(pexelsKey)
      const result = await client.photos.search({ query, per_page: count, size: "medium" })

      if (!("error" in result)) {
        const photos = (result.photos as any[]).map((p: any) => ({
          id: String(p.id),
          src: p.src.medium,
          alt: p.alt || query,
          photographer: p.photographer,
          width: p.width,
          height: p.height,
        }))
        return Response.json({ photos })
      }
    }

    // ── Fallback: Google Custom Search Images ──
    const googleKey = process.env.GOOGLE_API_KEY
    if (googleKey) {
      // Using Gemini's grounding or Google CSE
      // Free tier: use programmable search engine
      const cx = process.env.GOOGLE_CSE_ID || "000000000000000000000:xxxxxxxx" // placeholder
      const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(count, 10)}`

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (data.items) {
          const photos = data.items.map((item: any, i: number) => ({
            id: `gcs-${i}`,
            src: item.link,
            alt: item.title || query,
            photographer: item.displayLink || "Google",
            width: item.image?.width || 600,
            height: item.image?.height || 400,
          }))
          return Response.json({ photos })
        }
      }
    }

    // ── Fallback: Picsum (reliable, always loads) ──
    const base = Date.now()
    const photos = Array.from({ length: count }, (_, i) => ({
      id: `img-${i}`,
      src: `https://picsum.photos/seed/${base + i}/600/400`,
      alt: query,
      photographer: "Picsum",
      width: 600,
      height: 400,
    }))
    return Response.json({ photos })
  } catch (e) {
    console.error("search-images error:", e)
    return Response.json({ photos: [], error: String(e) }, { status: 500 })
  }
}
