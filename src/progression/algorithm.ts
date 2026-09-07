import type {
  DifficultyRating,
  FormQuality,
  ResistanceRecommendation,
} from '@/types';

export type ProgressionInput = {
  sets: number;
  minReps: number;
  maxReps: number;
  targetRirMin: number;
  targetRirMax: number;
  currentTargets: number[];
  completedReps: number[];
  previousCompletedReps: number[];
  rating: DifficultyRating | null;
  rir: number | null;
  formQuality: FormQuality | null;
  targetReduced: boolean;
  resistanceLabel: string;
};

export type ProgressionResult = {
  nextTargets: number[];
  recommendation: ResistanceRecommendation;
  holdReason: string | null;
};

function resetTargets(sets: number, minReps: number, maxReps: number): number[] {
  const value = Math.min(maxReps, minReps + 1);
  return Array.from({ length: sets }, () => value);
}

function significantDrop(current: number[], previous: number[]): boolean {
  if (previous.length === 0 || current.length === 0) return false;
  for (let i = 0; i < Math.min(current.length, previous.length); i++) {
    if (previous[i] - current[i] >= 2) return true;
  }
  const currentTotal = current.reduce((sum, value) => sum + value, 0);
  const previousTotal = previous.reduce((sum, value) => sum + value, 0);
  if (previousTotal === 0) return false;
  return currentTotal <= previousTotal * 0.8;
}

export function evaluateProgression(input: ProgressionInput): ProgressionResult {
  const {
    sets,
    minReps,
    maxReps,
    targetRirMin,
    targetRirMax,
    currentTargets,
    completedReps,
    previousCompletedReps,
    rating,
    rir,
    formQuality,
    targetReduced,
    resistanceLabel,
  } = input;

  const targets = Array.from({ length: sets }, (_, i) => currentTargets[i] ?? minReps);
  const completed = Array.from({ length: sets }, (_, i) => completedReps[i] ?? 0);

  const failedMin = completed.some((reps) => reps < minReps);
  const rirTooLow =
    rir === 0 && targetRirMin >= 1 && targetRirMax >= 1;
  const tooHard = rating === 'too_hard';
  const poorForm = formQuality === 'poor';
  const dropped = significantDrop(completed, previousCompletedReps);

  if (tooHard || rirTooLow || poorForm || failedMin || targetReduced || dropped) {
    const reason = tooHard
      ? 'Rated too hard'
      : rirTooLow
        ? 'RIR was 0'
        : poorForm
          ? 'Form marked poor'
          : failedMin
            ? 'Did not reach the minimum rep range'
            : targetReduced
              ? 'Target was reduced'
              : 'Performance dropped from the previous workout';
    return {
      nextTargets: targets,
      recommendation: { type: 'hold', suggestion: `Repeat ${resistanceLabel}` },
      holdReason: reason,
    };
  }

  const allAtMax = completed.every((reps) => reps >= maxReps);
  const effortOk =
    rating === 'good' ||
    rating === 'too_easy' ||
    rating === 'hard' ||
    rating === null;
  const rirInRange = rir === null || (rir >= targetRirMin && rir <= targetRirMax + 1);

  if (allAtMax && effortOk && rirInRange) {
    return {
      nextTargets: resetTargets(sets, minReps, maxReps),
      recommendation: {
        type: 'increase',
        suggestion: 'Increase difficulty, then reset toward the bottom of the range',
      },
      holdReason: null,
    };
  }

  const nextTargets = targets.map((target, index) => {
    if (completed[index] >= target) {
      return Math.min(maxReps, target + 1);
    }
    return target;
  });

  return {
    nextTargets,
    recommendation: { type: 'hold', suggestion: `Keep ${resistanceLabel}` },
    holdReason: null,
  };
}

export function weakerLegReps(left: number | null, right: number | null): number {
  if (left == null && right == null) return 0;
  if (left == null) return right ?? 0;
  if (right == null) return left;
  return Math.min(left, right);
}
