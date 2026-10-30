import type { SimEvent } from '@nxt/sim';

/**
 * Plays the simulated brick's sounds with Web Audio. Tones are square waves like the
 * brick's speaker; sound files (which are not available here) play as a short chirp.
 */
export class SimAudio {
  private context: AudioContext | null = null;
  private playing = new Set<OscillatorNode>();
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  /** Call from a click handler: browsers only allow audio after a user gesture. */
  unlock(): void {
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return;
      }
    }
    void this.context.resume();
  }

  handle(event: SimEvent, speed: number): void {
    if (event.type === 'stopSound') return this.stop();
    if (event.type === 'tone') {
      this.tone(event.frequency, event.durationMs / speed, event.volume);
    } else if (event.type === 'soundFile') {
      this.tone(660, 90 / speed, event.volume);
      this.tone(990, 90 / speed, event.volume, 100 / speed);
    }
  }

  stop(): void {
    for (const osc of this.playing) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    this.playing.clear();
  }

  private tone(frequency: number, ms: number, volume: number, delayMs = 0): void {
    const ctx = this.context;
    if (!ctx || this.muted || ms <= 0 || frequency <= 0) return;
    const start = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = Math.min(14000, Math.max(20, frequency));
    // NXT-G volume is 0–100; keep it gentle on headphones.
    gain.gain.value = (Math.max(0, Math.min(100, volume)) / 100) * 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + ms / 1000);
    this.playing.add(osc);
    osc.onended = () => this.playing.delete(osc);
  }
}
