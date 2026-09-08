import type { SoundProfile } from '@/types';
import type { CueKind, ScheduledCue } from '@/timing-engine/cues';
import { toneFor } from '@/audio-engine/profiles';

type Stopper = () => void;

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

function contextSuspended(ctx: AudioContext): boolean {
  const state = ctx.state as string;
  return state === 'suspended' || state === 'interrupted';
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stoppers: Stopper[] = [];
  private profile: SoundProfile = 'standard';
  private volume = 0.8;
  private enabled = true;
  private keepAlive: OscillatorNode | null = null;
  private htmlUnlock: HTMLAudioElement | null = null;
  private listenersInstalled = false;

  configure(input: { profile: SoundProfile; volume: number; enabled: boolean }): void {
    this.profile = input.profile;
    this.volume = input.volume;
    this.enabled = input.enabled;
  }

  installUnlockListeners(): void {
    if (this.listenersInstalled || typeof window === 'undefined') return;
    this.listenersInstalled = true;
    const unlock = () => {
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  async unlock(): Promise<void> {
    this.unlockHtmlAudio();
    const ctx = this.ensureContext();
    this.ensureKeepAlive(ctx);
    if (contextSuspended(ctx)) {
      try {
        await ctx.resume();
      } catch {
        /* iOS can reject resume outside a gesture */
      }
    }
  }

  context(): AudioContext {
    return this.ensureContext();
  }

  schedule(cues: ScheduledCue[], clockNow: number): void {
    if (!this.enabled || this.profile === 'silent') return;
    const ctx = this.ensureContext();
    this.ensureKeepAlive(ctx);
    if (contextSuspended(ctx)) {
      void ctx.resume();
    }
    const audioNow = ctx.currentTime;
    for (const cue of cues) {
      const at = audioNow + Math.max(0, cue.at - clockNow);
      this.playAt(at, cue.kind);
    }
  }

  async playNow(kind: CueKind): Promise<boolean> {
    const ctx = this.ensureContext();
    this.unlockHtmlAudio();
    this.ensureKeepAlive(ctx);
    try {
      this.playAt(ctx.currentTime + 0.02, kind);
    } catch {
      return false;
    }
    if (contextSuspended(ctx)) {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return this.enabled && toneFor(kind, this.profile) != null;
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
    const start = Math.max(at, ctx.currentTime);
    if (start < ctx.currentTime - 0.02) return;

    try {
      this.playTone(ctx, start, spec.frequency, spec.duration, spec.type, spec.gain * this.volume);
      if (kind === 'set_complete') {
        this.playTone(ctx, start + 0.08, 523.25, 0.34, 'triangle', spec.gain * this.volume * 0.7);
      }
      if (kind === 'start') {
        this.playTone(ctx, start + 0.12, 784, 0.18, 'sine', spec.gain * this.volume * 0.55);
      }
    } catch {
      /* WebKit can reject schedule/ramp calls */
    }
  }

  private playTone(
    ctx: AudioContext,
    at: number,
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), at + 0.012);
    gain.gain.linearRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
    this.track(osc, gain);
  }

  private track(osc: OscillatorNode, gain: GainNode): void {
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
  }

  private unlockHtmlAudio(): void {
    if (typeof Audio === 'undefined') return;
    if (!this.htmlUnlock) {
      this.htmlUnlock = new Audio(SILENT_WAV);
      this.htmlUnlock.setAttribute('playsinline', 'true');
      this.htmlUnlock.loop = true;
      this.htmlUnlock.volume = 0.01;
    }
    void this.htmlUnlock.play().catch(() => {
      /* wait for a later gesture */
    });
  }

  private ensureKeepAlive(ctx: AudioContext): void {
    if (this.keepAlive) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(20, ctx.currentTime);
      gain.gain.setValueAtTime(0.00001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.keepAlive = osc;
    } catch {
      this.keepAlive = null;
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }
}

export const audioEngine = new AudioEngine();
