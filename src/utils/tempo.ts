import type { Tempo, TempoPhase } from '@/types';

export const TEMPO_PHASES: TempoPhase[] = [
  'eccentric',
  'bottomPause',
  'concentric',
  'topPause',
];

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

export function activePhases(tempo: Tempo): ActivePhase[] {
  let offset = 0;
  const phases: ActivePhase[] = [];
  for (const name of TEMPO_PHASES) {
    const duration = tempo[name];
    if (duration > 0) {
      phases.push({ name, duration, offset });
      offset += duration;
    }
  }
  return phases;
}

export function phaseAt(tempo: Tempo, secondsIntoRep: number): {
  phase: TempoPhase | null;
  phaseElapsed: number;
  phaseRemaining: number;
} {
  const phases = activePhases(tempo);
  if (phases.length === 0) {
    return { phase: null, phaseElapsed: 0, phaseRemaining: 0 };
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
      };
    }
  }
  const last = phases[phases.length - 1];
  return { phase: last.name, phaseElapsed: last.duration, phaseRemaining: 0 };
}
