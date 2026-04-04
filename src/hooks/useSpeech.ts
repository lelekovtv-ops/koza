import { useCallback, useEffect, useRef, useState } from "react"

// ─── Types ───────────────────────────────────────────────────

export interface SpeechSegment {
  id: string
  text: string
  characterName?: string
  /** BCP-47 lang tag, e.g. "ru-RU", "en-US" */
  lang?: string
  rate?: number  // 0.5–2.0
  pitch?: number // 0–2
  voiceURI?: string // specific voice from getVoices()
}

export interface SpeechState {
  speaking: boolean
  currentSegmentId: string | null
  currentWord: string
  /** Char offset within current segment text */
  charIndex: number
  paused: boolean
  voicesLoaded: boolean
}

// ─── Available voices ────────────────────────────────────────

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return []
  return window.speechSynthesis.getVoices()
}

export function getRussianVoices(): SpeechSynthesisVoice[] {
  return getAvailableVoices().filter((v) => v.lang.startsWith("ru"))
}

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  return getAvailableVoices().filter((v) => v.lang.startsWith("en"))
}

// ─── Hook ────────────────────────────────────────────────────

interface UseSpeechOptions {
  /** Called when a segment finishes */
  onSegmentEnd?: (segmentId: string) => void
  /** Called when all segments finish */
  onEnd?: () => void
  /** Called on each boundary event (word) */
  onBoundary?: (segmentId: string, charIndex: number) => void
  /** Default language if not specified per segment */
  defaultLang?: string
  /** Default rate */
  defaultRate?: number
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { onSegmentEnd, onEnd, onBoundary, defaultLang = "ru-RU", defaultRate = 1.0 } = options

  const [state, setState] = useState<SpeechState>({
    speaking: false,
    currentSegmentId: null,
    currentWord: "",
    charIndex: 0,
    paused: false,
    voicesLoaded: false,
  })

  const queueRef = useRef<SpeechSegment[]>([])
  const currentIndexRef = useRef(0)
  const stoppedRef = useRef(false)
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  // Load voices (async on some browsers)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return

    const update = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) {
        setState((s) => ({ ...s, voicesLoaded: true }))
      }
    }

    update()
    window.speechSynthesis.addEventListener("voiceschanged", update)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update)
  }, [])

  const speakSegment = useCallback((segment: SpeechSegment) => {
    const synth = window.speechSynthesis
    if (!synth) return

    const utterance = new SpeechSynthesisUtterance(segment.text)
    utterance.lang = segment.lang ?? defaultLang
    utterance.rate = segment.rate ?? defaultRate
    utterance.pitch = segment.pitch ?? 1

    // Find voice by URI or language
    if (segment.voiceURI) {
      const voice = getAvailableVoices().find((v) => v.voiceURI === segment.voiceURI)
      if (voice) utterance.voice = voice
    } else {
      // Pick first voice matching language
      const lang = utterance.lang
      const voice = getAvailableVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)))
      if (voice) utterance.voice = voice
    }

    utterance.onstart = () => {
      setState((s) => ({
        ...s,
        speaking: true,
        currentSegmentId: segment.id,
        charIndex: 0,
        currentWord: "",
        paused: false,
      }))
    }

    utterance.onboundary = (e) => {
      if (e.name === "word") {
        const word = segment.text.slice(e.charIndex, e.charIndex + e.charLength)
        setState((s) => ({ ...s, charIndex: e.charIndex, currentWord: word }))
        callbacksRef.current.onBoundary?.(segment.id, e.charIndex)
      }
    }

    utterance.onend = () => {
      callbacksRef.current.onSegmentEnd?.(segment.id)

      if (stoppedRef.current) return

      // Next segment
      currentIndexRef.current += 1
      if (currentIndexRef.current < queueRef.current.length) {
        speakSegment(queueRef.current[currentIndexRef.current])
      } else {
        // All done
        setState((s) => ({
          ...s,
          speaking: false,
          currentSegmentId: null,
          currentWord: "",
          charIndex: 0,
          paused: false,
        }))
        callbacksRef.current.onEnd?.()
      }
    }

    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return
      console.warn("[Speech] Error:", e.error)
      // Try next segment on error
      utterance.onend?.(new Event("end") as SpeechSynthesisEvent)
    }

    synth.speak(utterance)
  }, [defaultLang, defaultRate])

  const speak = useCallback((segments: SpeechSegment[]) => {
    const synth = window.speechSynthesis
    if (!synth || segments.length === 0) return

    synth.cancel()
    stoppedRef.current = false
    queueRef.current = segments
    currentIndexRef.current = 0

    speakSegment(segments[0])
  }, [speakSegment])

  const stop = useCallback(() => {
    stoppedRef.current = true
    window.speechSynthesis?.cancel()
    setState((s) => ({
      ...s,
      speaking: false,
      currentSegmentId: null,
      currentWord: "",
      charIndex: 0,
      paused: false,
    }))
  }, [])

  const pause = useCallback(() => {
    window.speechSynthesis?.pause()
    setState((s) => ({ ...s, paused: true }))
  }, [])

  const resume = useCallback(() => {
    window.speechSynthesis?.resume()
    setState((s) => ({ ...s, paused: false }))
  }, [])

  const togglePause = useCallback(() => {
    if (state.paused) resume()
    else pause()
  }, [state.paused, pause, resume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      window.speechSynthesis?.cancel()
    }
  }, [])

  return {
    ...state,
    speak,
    stop,
    pause,
    resume,
    togglePause,
    getVoices: getAvailableVoices,
    getRussianVoices,
    getEnglishVoices,
  }
}
