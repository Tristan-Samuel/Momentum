import type { SoundProfile } from '@/types';
import type { CueKind } from '@/timing-engine/cues';

export type ToneSpec = {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
};

export function toneFor(kind: CueKind, profile: SoundProfile): ToneSpec | null {
  if (profile === 'silent') return null;
  const loud = profile === 'loud' ? 1.35 : profile === 'minimal' ? 0.7 : 1;
  switch (kind) {
    case 'tick':
      if (profile === 'minimal') return null;
      return { frequency: 660, duration: 0.04, type: 'sine', gain: 0.08 * loud };
    case 'phase_beep':
      return { frequency: 880, duration: 0.09, type: 'sine', gain: 0.18 * loud };
    case 'start':
      return { frequency: 523.25, duration: 0.22, type: 'triangle', gain: 0.28 * loud };
    case 'set_complete':
      return { frequency: 392, duration: 0.32, type: 'triangle', gain: 0.3 * loud };
    case 'warning':
      return { frequency: 740, duration: 0.16, type: 'sine', gain: 0.22 * loud };
    case 'countdown':
    case 'rest_countdown':
      if (profile === 'minimal') return null;
      return { frequency: 494, duration: 0.07, type: 'sine', gain: 0.12 * loud };
    default:
      return null;
  }
}

export const TEST_CUES: CueKind[] = ['start', 'tick', 'warning', 'set_complete'];
