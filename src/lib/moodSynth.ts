/**
 * MoodSynth v2 — cinematic soundtrack generator.
 * Pure Web Audio API. Plays chord progressions, arpeggios, bass, and pads.
 * Each mood = chord progression + tempo + instrument mix.
 * Crossfades between moods. Feels like musicians watching the scene.
 */

export type Mood = "calm" | "tense" | "dramatic" | "mysterious" | "joyful" | "sad" | "action" | "silent"

// ─── Music theory ────────────────────────────────────────────

// Note frequencies (A3=220 reference)
const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
}

type Chord = number[] // array of frequencies

interface MoodScore {
  bpm: number
  chords: Chord[]            // chord progression (loops)
  bassNotes: number[]        // bass line (one per chord)
  padType: OscillatorType    // pad sound
  padGain: number
  arpeggiate: boolean        // arpeggiate chords vs block chords
  arpSpeed: number           // notes per beat (if arpeggiate)
  bassType: OscillatorType
  bassGain: number
  highGain: number           // high melodic layer
  filterFreq: number
  swingFeel: number          // 0=straight, 0.3=swing
  reverbMix: number
  masterGain: number
}

const SCORES: Record<Mood, MoodScore> = {
  calm: {
    bpm: 60,
    chords: [
      [NOTE.C4, NOTE.E4, NOTE.G4],         // Cmaj
      [NOTE.A3, NOTE.C4, NOTE.E4],          // Am
      [NOTE.F3, NOTE.A3, NOTE.C4],          // Fmaj
      [NOTE.G3, NOTE.B3, NOTE.D4],          // Gmaj
    ],
    bassNotes: [NOTE.C2, NOTE.A2, NOTE.F2, NOTE.G2],
    padType: "sine", padGain: 0.06,
    arpeggiate: true, arpSpeed: 2,
    bassType: "sine", bassGain: 0.08,
    highGain: 0.03,
    filterFreq: 800, swingFeel: 0, reverbMix: 0.5, masterGain: 0.35,
  },
  sad: {
    bpm: 52,
    chords: [
      [NOTE.A3, NOTE.C4, NOTE.E4],          // Am
      [NOTE.F3, NOTE.A3, NOTE.C4],          // Fmaj
      [NOTE.C4, NOTE.E4, NOTE.G4],          // Cmaj
      [NOTE.E3, NOTE.G3, NOTE.B3],          // Em
    ],
    bassNotes: [NOTE.A2, NOTE.F2, NOTE.C2, NOTE.E2],
    padType: "sine", padGain: 0.12,
    arpeggiate: true, arpSpeed: 1.5,
    bassType: "sine", bassGain: 0.15,
    highGain: 0.07,
    filterFreq: 600, swingFeel: 0, reverbMix: 0.6, masterGain: 0.30,
  },
  mysterious: {
    bpm: 48,
    chords: [
      [NOTE.D3, NOTE.F3, NOTE.A3],          // Dm
      [NOTE.Bb3, NOTE.D4, NOTE.F4],         // Bb
      [NOTE.A3, NOTE.C4, NOTE.E4],          // Am
      [NOTE.E3, NOTE.Ab3, NOTE.B3],         // Edim-ish
    ],
    bassNotes: [NOTE.D2, NOTE.Bb3 / 2, NOTE.A2, NOTE.E2],
    padType: "triangle", padGain: 0.10,
    arpeggiate: true, arpSpeed: 1,
    bassType: "sine", bassGain: 0.18,
    highGain: 0.04,
    filterFreq: 500, swingFeel: 0.2, reverbMix: 0.7, masterGain: 0.28,
  },
  tense: {
    bpm: 80,
    chords: [
      [NOTE.E3, NOTE.G3, NOTE.B3],          // Em
      [NOTE.C4, NOTE.Eb4, NOTE.G4],         // Cm
      [NOTE.D3, NOTE.F3, NOTE.A3],          // Dm
      [NOTE.E3, NOTE.Ab3, NOTE.B3],         // Edim
    ],
    bassNotes: [NOTE.E2, NOTE.C2, NOTE.D2, NOTE.E2],
    padType: "sawtooth", padGain: 0.06,
    arpeggiate: false, arpSpeed: 4,
    bassType: "sawtooth", bassGain: 0.12,
    highGain: 0.04,
    filterFreq: 900, swingFeel: 0, reverbMix: 0.3, masterGain: 0.28,
  },
  dramatic: {
    bpm: 100,
    chords: [
      [NOTE.D3, NOTE.F3, NOTE.A3],          // Dm
      [NOTE.A3, NOTE.C4, NOTE.E4],          // Am
      [NOTE.Bb3, NOTE.D4, NOTE.F4],         // Bb
      [NOTE.C4, NOTE.E4, NOTE.G4],          // C
    ],
    bassNotes: [NOTE.D2, NOTE.A2, NOTE.Bb3 / 2, NOTE.C2],
    padType: "sawtooth", padGain: 0.10,
    arpeggiate: false, arpSpeed: 2,
    bassType: "square", bassGain: 0.14,
    highGain: 0.06,
    filterFreq: 1400, swingFeel: 0, reverbMix: 0.25, masterGain: 0.35,
  },
  joyful: {
    bpm: 110,
    chords: [
      [NOTE.C4, NOTE.E4, NOTE.G4],          // C
      [NOTE.G3, NOTE.B3, NOTE.D4],          // G
      [NOTE.A3, NOTE.C4, NOTE.E4],          // Am
      [NOTE.F3, NOTE.A3, NOTE.C4],          // F
    ],
    bassNotes: [NOTE.C2, NOTE.G2, NOTE.A2, NOTE.F2],
    padType: "triangle", padGain: 0.08,
    arpeggiate: true, arpSpeed: 4,
    bassType: "triangle", bassGain: 0.12,
    highGain: 0.07,
    filterFreq: 2000, swingFeel: 0.15, reverbMix: 0.3, masterGain: 0.32,
  },
  action: {
    bpm: 130,
    chords: [
      [NOTE.E3, NOTE.G3, NOTE.B3],          // Em
      [NOTE.D3, NOTE.F3, NOTE.A3],          // Dm
      [NOTE.C4, NOTE.E4, NOTE.G4],          // C
      [NOTE.B3, NOTE.D4, NOTE.F4],          // Bdim
    ],
    bassNotes: [NOTE.E2, NOTE.D2, NOTE.C2, NOTE.B2],
    padType: "square", padGain: 0.07,
    arpeggiate: false, arpSpeed: 2,
    bassType: "sawtooth", bassGain: 0.15,
    highGain: 0.04,
    filterFreq: 1800, swingFeel: 0, reverbMix: 0.15, masterGain: 0.30,
  },
  silent: {
    bpm: 60, chords: [], bassNotes: [],
    padType: "sine", padGain: 0, arpeggiate: false, arpSpeed: 1,
    bassType: "sine", bassGain: 0, highGain: 0,
    filterFreq: 200, swingFeel: 0, reverbMix: 0, masterGain: 0,
  },
}

// ─── Mood detection ──────────────────────────────────────────

const MOOD_KEYWORDS: Record<Mood, RegExp> = {
  calm: /спокойн|тихо|нежн|мягк|утр|рассвет|кораллы|подводн|calm|quiet|gentle|soft|peaceful|dawn/i,
  tense: /напряж|тревог|опасн|крад|следит|подозр|запрещ|tense|anxious|danger|suspicious|forbid/i,
  dramatic: /гнев|ярост|крич|удар|взрыв|молни|шторм|ты не понимаешь|dramatic|anger|fury|storm/i,
  mysterious: /тайн|загадк|тёмн|тень|пещер|ведьм|колдов|щупальц|контракт|mysterious|dark|shadow|cave/i,
  joyful: /радост|смеёт|счастл|праздн|весел|танц|красот|необыкновенн|joyful|happy|laugh|beauty/i,
  sad: /слёз|грус|печал|одинок|прощ|расста|мечтает|sad|tears|grief|lonely|farewell/i,
  action: /бежит|погон|сраж|прыг|взлет|стрел|вспышк|подписывает|хватает|action|chase|fight|flash/i,
  silent: /тишин|молчан|пауза|silence|pause/i,
}

export function detectMoodFromText(text: string): Mood {
  let best: Mood = "calm"
  let bestScore = 0
  for (const [mood, re] of Object.entries(MOOD_KEYWORDS) as [Mood, RegExp][]) {
    if (mood === "silent") continue
    const matches = text.match(new RegExp(re.source, "gi"))
    const score = matches?.length ?? 0
    if (score > bestScore) { bestScore = score; best = mood }
  }
  return best
}

// ─── Synth engine ────────────────────────────────────────────

export class MoodSynth {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private delay: DelayNode | null = null
  private delayFb: GainNode | null = null
  private currentScore: MoodScore | null = null
  private currentMood: Mood = "silent"
  private _playing = false
  private loopTimer: ReturnType<typeof setTimeout> | null = null
  private activeNodes: (OscillatorNode | GainNode)[] = []
  private chordIndex = 0

  get playing() { return this._playing }
  get mood() { return this.currentMood }

  private ensureCtx() {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === "suspended") this.ctx.resume()
    return this.ctx
  }

  start(mood: Mood = "calm") {
    if (this._playing) this.stop()
    const score = SCORES[mood]
    if (!score || score.chords.length === 0) { this.currentMood = mood; return }

    const ctx = this.ensureCtx()
    this.currentScore = score
    this.currentMood = mood
    this.chordIndex = 0

    // Master chain: filter → delay(reverb) → master → destination
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    this.delay = ctx.createDelay(0.6)
    this.delay.delayTime.value = 0.35
    this.delayFb = ctx.createGain()
    this.delayFb.gain.value = score.reverbMix * 0.45
    this.delay.connect(this.delayFb)
    this.delayFb.connect(this.delay)
    this.delay.connect(this.master)

    this.filter = ctx.createBiquadFilter()
    this.filter.type = "lowpass"
    this.filter.frequency.value = score.filterFreq
    this.filter.Q.value = 1.5
    this.filter.connect(this.master)
    this.filter.connect(this.delay)

    // Fade in
    this.master.gain.setValueAtTime(0, ctx.currentTime)
    this.master.gain.linearRampToValueAtTime(score.masterGain, ctx.currentTime + 2)

    this._playing = true
    this.playNextBeat()
  }

  private playNextBeat() {
    if (!this._playing || !this.ctx || !this.filter || !this.currentScore) return
    const score = this.currentScore
    const ctx = this.ctx
    const now = ctx.currentTime

    const beatDur = 60 / score.bpm // seconds per beat
    const chord = score.chords[this.chordIndex % score.chords.length]
    const bass = score.bassNotes[this.chordIndex % score.bassNotes.length]

    // ── Bass note ──
    this.playNote(bass, score.bassType, score.bassGain, now, beatDur * 3.5, true)

    // ── Chord / Arpeggio ──
    if (score.arpeggiate && chord.length > 0) {
      const noteGap = beatDur / score.arpSpeed
      chord.forEach((freq, i) => {
        const swing = i % 2 === 1 ? score.swingFeel * noteGap : 0
        this.playNote(freq, score.padType, score.padGain, now + i * noteGap + swing, noteGap * 1.8, false)
        // Octave above, quieter
        if (score.highGain > 0) {
          this.playNote(freq * 2, "sine", score.highGain, now + i * noteGap + swing + noteGap * 0.5, noteGap * 1.2, false)
        }
      })
    } else {
      // Block chord
      chord.forEach((freq) => {
        this.playNote(freq, score.padType, score.padGain, now, beatDur * 3.5, false)
      })
      if (score.highGain > 0 && chord[0]) {
        this.playNote(chord[0] * 2, "sine", score.highGain, now + beatDur, beatDur * 2, false)
      }
    }

    // Advance chord every 4 beats
    this.chordIndex++

    // Schedule next chord (4 beats)
    const nextMs = beatDur * 4 * 1000
    this.loopTimer = setTimeout(() => this.playNextBeat(), nextMs)
  }

  private playNote(freq: number, type: OscillatorType, gain: number, startTime: number, duration: number, isBass: boolean) {
    if (!this.ctx || !this.filter) return
    const ctx = this.ctx

    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq

    const env = ctx.createGain()
    const attack = isBass ? 0.1 : 0.03
    const release = Math.min(duration * 0.4, 0.8)
    env.gain.setValueAtTime(0, startTime)
    env.gain.linearRampToValueAtTime(gain, startTime + attack)
    env.gain.setValueAtTime(gain, startTime + duration - release)
    env.gain.linearRampToValueAtTime(0, startTime + duration)

    osc.connect(env)
    env.connect(this.filter)

    osc.start(startTime)
    osc.stop(startTime + duration + 0.05)

    this.activeNodes.push(osc, env)

    // Cleanup after note ends
    osc.onended = () => {
      try { osc.disconnect() } catch {}
      try { env.disconnect() } catch {}
      this.activeNodes = this.activeNodes.filter((n) => n !== osc && n !== env)
    }
  }

  setMood(mood: Mood) {
    if (mood === this.currentMood) return
    if (!this._playing) { this.start(mood); return }

    // Crossfade: fade out → switch → fade in
    const ctx = this.ctx
    if (!ctx || !this.master) return

    this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5)
    setTimeout(() => {
      this.cleanup()
      this.start(mood)
    }, 1600)
  }

  stop() {
    if (!this.ctx || !this.master) { this.cleanup(); return }
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1)
    setTimeout(() => this.cleanup(), 1100)
    this._playing = false
  }

  private cleanup() {
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null }
    for (const n of this.activeNodes) {
      try { if (n instanceof OscillatorNode) n.stop() } catch {}
      try { n.disconnect() } catch {}
    }
    this.activeNodes = []
    try { this.filter?.disconnect() } catch {}
    try { this.master?.disconnect() } catch {}
    try { this.delay?.disconnect() } catch {}
    try { this.delayFb?.disconnect() } catch {}
    this.filter = null; this.master = null; this.delay = null; this.delayFb = null
    this._playing = false
  }

  destroy() {
    this.cleanup()
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null }
  }
}
