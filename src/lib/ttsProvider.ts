/**
 * TTS Provider — abstraction over multiple text-to-speech backends.
 *
 * Providers:
 * - "web-speech"  — browser-native SpeechSynthesis (free, instant, decent quality)
 * - "elevenlabs"  — ElevenLabs API (high quality, paid, async)
 *
 * Each provider implements the same interface, returning an audio Blob.
 * The caller can then create a URL and attach it to a VoiceClip.
 */

// ─── Types ───────────────────────────────────────────────────

export type TtsProviderType = "web-speech" | "elevenlabs"

export interface TtsRequest {
  text: string
  lang: string
  voiceId?: string
  speed?: number
  pitch?: number
  stability?: number
  emotion?: string
}

export interface TtsResult {
  audioBlob: Blob
  durationMs: number
  provider: TtsProviderType
}

export interface TtsProvider {
  type: TtsProviderType
  generate(request: TtsRequest): Promise<TtsResult>
  getVoices(): Promise<{ id: string; name: string; lang: string }[]>
}

// ─── Web Speech Provider ─────────────────────────────────────

function createWebSpeechProvider(): TtsProvider {
  return {
    type: "web-speech",

    async generate(request: TtsRequest): Promise<TtsResult> {
      // Web Speech doesn't produce an audio Blob natively.
      // We use OfflineAudioContext trick or fallback to real-time estimation.
      return new Promise((resolve, reject) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          reject(new Error("Web Speech API not available"))
          return
        }

        const utterance = new SpeechSynthesisUtterance(request.text)
        utterance.lang = request.lang || "ru-RU"
        utterance.rate = request.speed ?? 1.0
        utterance.pitch = request.pitch ?? 1.0

        if (request.voiceId) {
          const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === request.voiceId)
          if (voice) utterance.voice = voice
        }

        const startTime = performance.now()

        utterance.onend = () => {
          const durationMs = Math.round(performance.now() - startTime)
          // Web Speech doesn't give us a blob — return empty blob with measured duration
          resolve({
            audioBlob: new Blob([], { type: "audio/wav" }),
            durationMs,
            provider: "web-speech",
          })
        }

        utterance.onerror = (e) => {
          if (e.error === "canceled" || e.error === "interrupted") {
            resolve({ audioBlob: new Blob([]), durationMs: 0, provider: "web-speech" })
            return
          }
          reject(new Error(`Web Speech error: ${e.error}`))
        }

        window.speechSynthesis.speak(utterance)
      })
    },

    async getVoices() {
      if (typeof window === "undefined" || !window.speechSynthesis) return []
      const voices = window.speechSynthesis.getVoices()
      return voices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
    },
  }
}

// ─── ElevenLabs Provider ─────────────────────────────────────

function createElevenLabsProvider(): TtsProvider {
  return {
    type: "elevenlabs",

    async generate(request: TtsRequest): Promise<TtsResult> {
      const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
      if (!apiKey) throw new Error("ElevenLabs API key not set (NEXT_PUBLIC_ELEVENLABS_API_KEY)")

      const voiceId = request.voiceId || "21m00Tcm4TlvDq8ikWAM" // default: Rachel

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: request.text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: request.stability ?? 0.5,
              similarity_boost: 0.75,
              style: 0.5,
              use_speaker_boost: true,
            },
          }),
        },
      )

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`)
      }

      const audioBlob = await response.blob()

      // Estimate duration from blob size (MP3 ~128kbps)
      const estimatedDurationMs = Math.round((audioBlob.size * 8) / 128)

      return {
        audioBlob,
        durationMs: estimatedDurationMs,
        provider: "elevenlabs",
      }
    },

    async getVoices() {
      const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
      if (!apiKey) return []

      try {
        const response = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": apiKey },
        })
        if (!response.ok) return []

        const data = await response.json()
        return (data.voices ?? []).map((v: { voice_id: string; name: string; labels?: { language?: string } }) => ({
          id: v.voice_id,
          name: v.name,
          lang: v.labels?.language ?? "en",
        }))
      } catch {
        return []
      }
    },
  }
}

// ─── Factory ─────────────────────────────────────────────────

const providers = new Map<TtsProviderType, TtsProvider>()

export function getTtsProvider(type: TtsProviderType): TtsProvider {
  if (!providers.has(type)) {
    switch (type) {
      case "web-speech":
        providers.set(type, createWebSpeechProvider())
        break
      case "elevenlabs":
        providers.set(type, createElevenLabsProvider())
        break
    }
  }
  return providers.get(type)!
}

/** Shortcut: generate speech with auto-detected provider. */
export async function generateSpeech(
  request: TtsRequest,
  preferredProvider: TtsProviderType = "web-speech",
): Promise<TtsResult> {
  const provider = getTtsProvider(preferredProvider)
  return provider.generate(request)
}
