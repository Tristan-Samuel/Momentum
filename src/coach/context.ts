import * as repo from '@/database/repository';

export async function buildCoachContext(programId?: string | null, focusId?: string | null) {
  const prepared = await repo.getPreparedWorkout(programId ?? undefined);
  const sessions = (await repo.listSessions()).slice(0, 5);
  const recent = [];
  for (const session of sessions) {
    const detail = await repo.getSessionDetail(session.id);
    if (!detail) continue;
    recent.push({
      startedAt: session.startedAt,
      program: session.programNameSnapshot,
      status: session.status,
      exercises: detail.exercises.map(({ exercise, sets }) => ({
        name: exercise.nameSnapshot,
        reps: sets.map((set) => (set.skipped ? 0 : set.completedReps)),
        rating: exercise.difficultyRating,
        rir: exercise.rir,
        form: exercise.formQuality,
      })),
    });
  }
  return {
    program: {
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
    },
    focusExerciseConfigId: focusId ?? null,
    recent,
  };
}
