import type { StartPosition, Tempo, TempoPhase } from '@/types';

export const TEMPO_PHASES: TempoPhase[] = [
  'eccentric',
  'bottomPause',
  'concentric',
  'topPause',
];

const LIFT_FIRST: TempoPhase[] = [
  'concentric',
  'topPause',
  'eccentric',
  'bottomPause',
];

export function startPositionOf(value: StartPosition | undefined | null): StartPosition {
  return value === 'bottom' ? 'bottom' : 'top';
}

export function phaseOrder(start: StartPosition = 'top'): TempoPhase[] {
  return start === 'bottom' ? LIFT_FIRST : TEMPO_PHASES;
}

/** Pull-ups and chin-ups start in the hang, so the first movement is the lift. */
export function inferStartPosition(name: string): StartPosition {
  return /\b(pull-?ups?|chin-?ups?)\b/i.test(name) ? 'bottom' : 'top';
}

export function tempoSeconds(tempo: Tempo): number {
  return (
    tempo.eccentric + tempo.bottomPause + tempo.concentric + tempo.topPause
  );
}

export function formatTempo(tempo: Tempo): string {
  return `${tempo.eccentric}-${tempo.bottomPause}-${tempo.concentric}-${tempo.topPause}`;
}

export function formatTempoDisplay(tempo: Tempo): string {
  return `${tempo.eccentric} ↓ / ${tempo.bottomPause} / ${tempo.concentric} ↑ / ${tempo.topPause}`;
}

export type ActivePhase = {
  name: TempoPhase;
  duration: number;
  offset: number;
};

export function activePhases(tempo: Tempo, start: StartPosition = 'top'): ActivePhase[] {
  let offset = 0;
  const phases: ActivePhase[] = [];
  for (const name of phaseOrder(start)) {
    const duration = tempo[name];
    if (duration > 0) {
      phases.push({ name, duration, offset });
      offset += duration;
    }
  }
  return phases;
}

export function phaseAt(
  tempo: Tempo,
  secondsIntoRep: number,
  start: StartPosition = 'top',
): {
  phase: TempoPhase | null;
  phaseElapsed: number;
  phaseRemaining: number;
  phaseDuration: number;
} {
  const phases = activePhases(tempo, start);
  if (phases.length === 0) {
    return { phase: null, phaseElapsed: 0, phaseRemaining: 0, phaseDuration: 0 };
  }
  const total = tempoSeconds(tempo);
  const t = ((secondsIntoRep % total) + total) % total;
  for (const phase of phases) {
    if (t < phase.offset + phase.duration) {
      const phaseElapsed = t - phase.offset;
      return {
        phase: phase.name,
        phaseElapsed,
        phaseRemaining: phase.duration - phaseElapsed,
        phaseDuration: phase.duration,
      };
    }
  }
  const last = phases[phases.length - 1];
  return {
    phase: last.name,
    phaseElapsed: last.duration,
    phaseRemaining: 0,
    phaseDuration: last.duration,
  };
}
