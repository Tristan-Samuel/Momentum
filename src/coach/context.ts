import { exportAll } from '@/database/backup';
import * as repo from '@/database/repository';
import { buildAiPrompt } from '@/export/prompt';

/** Every program, the schedule, and the same brief the AI export writes. */
export async function buildCoachContext(focusProgramId?: string | null, focusExerciseConfigId?: string | null) {
  const [envelope, preparedPrograms] = await Promise.all([exportAll(), repo.listPreparedPrograms()]);
  return {
    brief: buildAiPrompt(envelope),
    focusProgramId: focusProgramId ?? null,
    focusExerciseConfigId: focusExerciseConfigId ?? null,
    programs: preparedPrograms.map((prepared) => ({
      id: prepared.program.id,
      name: prepared.program.name,
      exercises: prepared.exercises.map((item) => ({
        exerciseConfigId: item.id,
        name: item.exercise.name,
        sets: item.sets,
        minReps: item.minReps,
        maxReps: item.maxReps,
        measure: item.measure,
        tempo: item.tempo,
        startPosition: item.startPosition ?? 'top',
        restAfterSetSeconds: item.restAfterSetSeconds,
        transitionAfterExerciseSeconds: item.transitionAfterExerciseSeconds,
        targetRirMin: item.targetRirMin,
        targetRirMax: item.targetRirMax,
        laterality: item.laterality,
        unilateralOrder: item.unilateralOrder,
        resistanceLabel: item.resistanceLabel,
        progressionStep: item.progressionStep,
        cueMode: item.cueMode ?? 'tempo',
        loadKind: item.loadKind ?? 'bodyweight',
        load: item.load ?? null,
        loadUnit: item.loadUnit ?? 'lb',
        loadStep: item.loadStep ?? 5,
        loadPer: item.loadPer ?? 'total',
        targets: item.progression.currentTargets,
        lastRating: item.progression.lastDifficultyRating,
        lastRir: item.progression.lastRir,
      })),
    })),
  };
}
