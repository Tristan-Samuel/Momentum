import type { PersonalRecord, ProgressionState, SetSession } from '@/types';
import * as repo from '@/database/repository';
import { evaluateProgression, weakerLegReps } from '@/progression/algorithm';
import { createId, nowIso } from '@/utils/id';

function setReps(set: SetSession): number {
  if (set.skipped) return 0;
  if (set.leftReps != null || set.rightReps != null) {
    return weakerLegReps(set.leftReps, set.rightReps);
  }
  return set.completedReps;
}

export async function applyCompletedSessionProgression(sessionId: string): Promise<void> {
  const detail = await repo.getSessionDetail(sessionId);
  if (!detail) return;
  if (detail.session.status === 'discarded') return;

  const stamp = nowIso();
  const newRecords: PersonalRecord[] = [];

  for (const { exercise, sets } of detail.exercises) {
    const completedSets = sets.filter((set) => !set.skipped);
    if (completedSets.length === 0) continue;

    const completedReps = completedSets.map(setReps);
    const targetReduced = completedSets.some((set) => set.targetReduced);
    const progression = await repo.getProgression(exercise.exerciseId);
    if (!progression) continue;

    const result = evaluateProgression({
      sets: exercise.configSnapshot.sets,
      minReps: exercise.configSnapshot.minReps,
      maxReps: exercise.configSnapshot.maxReps,
      targetRirMin: exercise.configSnapshot.targetRirMin,
      targetRirMax: exercise.configSnapshot.targetRirMax,
      currentTargets: exercise.targetRepsPerSet,
      completedReps,
      previousCompletedReps: progression.lastCompletedReps,
      rating: exercise.difficultyRating,
      rir: exercise.rir,
      formQuality: exercise.formQuality,
      targetReduced,
      resistanceLabel: progression.resistanceLabel,
    });

    const bestThisWorkout = Math.max(0, ...completedReps);
    const personalBestReps = Math.max(progression.personalBestReps, bestThisWorkout);
    const workoutReps = completedReps.reduce((sum, value) => sum + value, 0);

    if (bestThisWorkout > progression.personalBestReps && bestThisWorkout > 0) {
      newRecords.push({
        id: createId(),
        exerciseId: exercise.exerciseId,
        kind: 'best_set_reps',
        value: bestThisWorkout,
        resistanceLabel: exercise.configSnapshot.resistanceLabel,
        achievedAt: stamp,
        workoutSessionId: sessionId,
        createdAt: stamp,
        updatedAt: stamp,
        syncStatus: 'local',
      });
    }
    if (workoutReps > 0) {
      const existing = await repo.getPersonalRecords(exercise.exerciseId);
      const bestWorkout = existing
        .filter((row) => row.kind === 'best_workout_reps')
        .reduce((max, row) => Math.max(max, row.value), 0);
      if (workoutReps > bestWorkout) {
        newRecords.push({
          id: createId(),
          exerciseId: exercise.exerciseId,
          kind: 'best_workout_reps',
          value: workoutReps,
          resistanceLabel: exercise.configSnapshot.resistanceLabel,
          achievedAt: stamp,
          workoutSessionId: sessionId,
          createdAt: stamp,
          updatedAt: stamp,
          syncStatus: 'local',
        });
      }
    }

    const next: ProgressionState = {
      ...progression,
      lastCompletedReps: completedReps,
      lastRir: exercise.rir,
      lastDifficultyRating: exercise.difficultyRating,
      lastFormQuality: exercise.formQuality,
      recommendedNextTargets: result.nextTargets,
      recommendedResistanceChange: result.recommendation,
      currentTargets:
        result.recommendation.type === 'increase'
          ? progression.currentTargets
          : result.nextTargets,
      personalBestReps,
      personalBestDate:
        bestThisWorkout >= personalBestReps && bestThisWorkout > 0
          ? stamp
          : progression.personalBestDate,
      lastWorkoutDate: stamp,
      lifetimeReps: progression.lifetimeReps + workoutReps,
      lifetimeSets: progression.lifetimeSets + completedSets.length,
      updatedAt: stamp,
      syncStatus: 'local',
    };
    await repo.saveProgression(next);
  }

  await repo.recordPersonalRecords(newRecords);
}
