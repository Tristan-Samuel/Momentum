import type { SoundProfile } from '@/types';
import type { CueKind, ScheduledCue } from '@/timing-engine/cues';
import { toneFor } from '@/audio-engine/profiles';

type Stopper = () => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stoppers: Stopper[] = [];
  private profile: SoundProfile = 'standard';
  private volume = 0.8;
  private enabled = true;

  configure(input: { profile: SoundProfile; volume: number; enabled: boolean }): void {
    this.profile = input.profile;
    this.volume = input.volume;
    this.enabled = input.enabled;
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  context(): AudioContext {
    return this.ensureContext();
  }

  schedule(cues: ScheduledCue[], clockNow: number): void {
    if (!this.enabled || this.profile === 'silent') return;
    const ctx = this.ensureContext();
    const audioNow = ctx.currentTime;
    for (const cue of cues) {
      const at = audioNow + Math.max(0, cue.at - clockNow);
      this.playAt(at, cue.kind);
    }
  }

  async playNow(kind: CueKind): Promise<void> {
    await this.unlock();
    const ctx = this.ensureContext();
    this.playAt(ctx.currentTime + 0.02, kind);
  }

  cancel(): void {
    for (const stop of this.stoppers) {
      stop();
    }
    this.stoppers = [];
  }

  private playAt(at: number, kind: CueKind): void {
    if (!this.enabled) return;
    const spec = toneFor(kind, this.profile);
    if (!spec) return;
    const ctx = this.ensureContext();
    if (at < ctx.currentTime - 0.02) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.frequency, at);
    const peak = spec.gain * this.volume;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + spec.duration + 0.02);

    const stop = () => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    };
    this.stoppers.push(stop);
    osc.onended = () => {
      this.stoppers = this.stoppers.filter((item) => item !== stop);
    };

    if (kind === 'set_complete') {
      this.playChord(ctx, at, peak);
    }
    if (kind === 'start') {
      this.playStartTail(ctx, at, peak);
    }
  }

  private playChord(ctx: AudioContext, at: number, peak: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, at + 0.08);
    gain.gain.setValueAtTime(0.0001, at + 0.08);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.7), at + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at + 0.08);
    osc.stop(at + 0.44);
    const stop = () => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    };
    this.stoppers.push(stop);
  }

  private playStartTail(ctx: AudioContext, at: number, peak: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, at + 0.12);
    gain.gain.setValueAtTime(0.0001, at + 0.12);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.55), at + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at + 0.12);
    osc.stop(at + 0.32);
    const stop = () => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    };
    this.stoppers.push(stop);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }
}

export const audioEngine = new AudioEngine();
