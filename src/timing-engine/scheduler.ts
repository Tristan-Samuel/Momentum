import type { CueKind, ScheduledCue } from '@/timing-engine/cues';
import type { Clock } from '@/timing-engine/clock';

export type CueHandler = (cue: ScheduledCue) => void;

/**
 * Schedules cue callbacks using the audio/clock timeline.
 * Audio playback is pre-scheduled separately on AudioContext.
 * This scheduler only fires JS callbacks; it is not the tempo source of truth.
 * Visual state should be derived from elapsed clock time.
 */
export class CueScheduler {
  private handles: Array<ReturnType<typeof setTimeout>> = [];

  constructor(private readonly clock: Clock) {}

  schedule(cues: ScheduledCue[], handler: CueHandler): void {
    this.cancel();
    const now = this.clock.now();
    for (const cue of cues) {
      const delayMs = Math.max(0, (cue.at - now) * 1000);
      const handle = setTimeout(() => handler(cue), delayMs);
      this.handles.push(handle);
    }
  }

  cancel(): void {
    for (const handle of this.handles) {
      clearTimeout(handle);
    }
    this.handles = [];
  }
}

export const VISUAL_CUE_PRIORITY: CueKind[] = [
  'set_complete',
  'start',
  'warning',
  'countdown',
  'rest_countdown',
  'phase_beep',
  'tick',
];
