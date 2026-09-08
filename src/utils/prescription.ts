import type { ProgramExercise } from '@/types';

export function targetsForExercise(item: Pick<ProgramExercise, 'sets' | 'minReps' | 'progression'>): number[] {
  const targets = item.progression.currentTargets.slice(0, item.sets);
  while (targets.length < item.sets) {
    targets.push(targets[0] ?? item.minReps);
  }
  return targets;
}

export function formatRepList(targets: number[]): string {
  if (targets.length === 0) return '—';
  if (targets.every((value) => value === targets[0])) {
    return String(targets[0]);
  }
  return targets.join(', ');
}

export function formatSetRepPreview(item: ProgramExercise): string {
  const targets = targetsForExercise(item);
  const perSide = item.laterality === 'unilateral' ? ' per side' : '';
  if (targets.every((value) => value === targets[0])) {
    return `${item.sets} × ${targets[0]}${perSide}`;
  }
  return targets.map((reps, index) => `Set ${index + 1}: ${reps}${perSide}`).join(' · ');
}

export function formatRepRange(minReps: number, maxReps: number): string {
  return `${minReps}–${maxReps}`;
}

export function formatRirRange(min: number, max: number): string {
  return `${min}–${max}`;
}

export function formatTodayPlan(item: ProgramExercise): string {
  const range = formatRepRange(item.minReps, item.maxReps);
  const rir = formatRirRange(item.targetRirMin, item.targetRirMax);
  return `${formatSetRepPreview(item)} · range ${range} · RIR ${rir}`;
}
