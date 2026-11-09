import type { Measure, ProgramExercise } from '@/types';

export function targetsForExercise(item: Pick<ProgramExercise, 'sets' | 'minReps' | 'progression'>): number[] {
  const targets = item.progression.currentTargets.slice(0, item.sets);
  while (targets.length < item.sets) {
    targets.push(targets[0] ?? item.minReps);
  }
  return targets;
}

export function unitSuffix(measure: Measure | undefined): string {
  return measure === 'seconds' ? 's' : '';
}

export function measureNoun(measure: Measure | undefined): string {
  return measure === 'seconds' ? 'sec' : 'reps';
}

export function formatAmount(value: number, measure: Measure | undefined): string {
  return `${value}${unitSuffix(measure)}`;
}

export function formatRepList(targets: number[], measure?: Measure): string {
  if (targets.length === 0) return '—';
  const unit = unitSuffix(measure);
  if (targets.every((value) => value === targets[0])) {
    return `${targets[0]}${unit}`;
  }
  return targets.map((value) => `${value}${unit}`).join(', ');
}

export function formatSetRepPreview(item: ProgramExercise): string {
  const targets = targetsForExercise(item);
  const perSide = item.laterality === 'unilateral' ? ' per side' : '';
  const unit = unitSuffix(item.measure);
  if (targets.every((value) => value === targets[0])) {
    return `${item.sets} × ${targets[0]}${unit}${perSide}`;
  }
  return targets.map((reps, index) => `Set ${index + 1}: ${reps}${unit}${perSide}`).join(' · ');
}

export function formatRepRange(minReps: number, maxReps: number, measure?: Measure): string {
  return `${minReps}–${maxReps}${unitSuffix(measure)}`;
}

export function formatRirRange(min: number, max: number): string {
  return `${min}–${max}`;
}

export function formatTodayPlan(item: ProgramExercise): string {
  const range = formatRepRange(item.minReps, item.maxReps, item.measure);
  const rir = formatRirRange(item.targetRirMin, item.targetRirMax);
  return `${formatSetRepPreview(item)} · range ${range} · RIR ${rir}`;
}
