type ClipState = {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private clips = new Map<string, ClipState>();

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  async loadClip(clipId: string, url: string): Promise<void> {
    const ctx = this.getContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    this.clips.set(clipId, { buffer, source: null, gain: ctx.createGain() });
  }

  play(clipId: string, offset = 0): void {
    const clip = this.clips.get(clipId);
    if (!clip) return;
    const ctx = this.getContext();

    // Stop previous source if still playing
    if (clip.source) {
      try { clip.source.stop(); } catch { /* already stopped */ }
    }

    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(clip.gain);
    clip.gain.connect(ctx.destination);
    source.onended = () => {
      if (clip.source === source) clip.source = null;
    };
    source.start(0, offset);
    clip.source = source;
  }

  stop(clipId: string): void {
    const clip = this.clips.get(clipId);
    if (!clip?.source) return;
    try { clip.source.stop(); } catch { /* already stopped */ }
    clip.source = null;
  }

  setVolume(clipId: string, volume: number): void {
    const clip = this.clips.get(clipId);
    if (!clip) return;
    clip.gain.gain.value = volume;
  }

  getWaveformData(clipId: string, points = 200): Float32Array {
    const clip = this.clips.get(clipId);
    if (!clip) return new Float32Array(0);

    const raw = clip.buffer.getChannelData(0);
    const step = Math.floor(raw.length / points);
    if (step < 1) return raw.slice(0, points);

    const result = new Float32Array(points);
    for (let i = 0; i < points; i++) {
      const start = i * step;
      let max = 0;
      for (let j = start; j < start + step && j < raw.length; j++) {
        const abs = Math.abs(raw[j]);
        if (abs > max) max = abs;
      }
      result[i] = max;
    }
    return result;
  }

  dispose(): void {
    for (const [, clip] of this.clips) {
      if (clip.source) {
        try { clip.source.stop(); } catch { /* ignore */ }
      }
    }
    this.clips.clear();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const audioEngine = new AudioEngine();
