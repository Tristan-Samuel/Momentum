import type { ProgramExercise } from '@/types';
import { tempoSeconds } from '@/utils/tempo';

const COUNTDOWN_SECONDS = 3;
const SET_COMPLETE_SECONDS = 2;
const EXERCISE_COMPLETE_SECONDS = 2.5;

export function estimateWorkoutSeconds(exercises: ProgramExercise[]): number {
  let total = 0;
  exercises.forEach((item, index) => {
    const perRep = tempoSeconds(item.tempo);
    const lateralityMul = item.laterality === 'unilateral' ? 2 : 1;
    const targets = item.progression.currentTargets;
    for (let set = 0; set < item.sets; set++) {
      const reps = targets[set] ?? targets[0] ?? item.minReps;
      total += COUNTDOWN_SECONDS + SET_COMPLETE_SECONDS;
      total += reps * perRep * lateralityMul;
      if (set < item.sets - 1) {
        total += item.restAfterSetSeconds;
      }
    }
    total += EXERCISE_COMPLETE_SECONDS;
    if (index < exercises.length - 1) {
      total += item.transitionAfterExerciseSeconds;
    }
  });
  return total;
}

export function estimateWorkoutMinutes(exercises: ProgramExercise[]): number {
  return Math.max(1, Math.round(estimateWorkoutSeconds(exercises) / 60));
}

export function totalPrescribedSets(exercises: { sets: number }[]): number {
  return exercises.reduce((sum, item) => sum + item.sets, 0);
}
