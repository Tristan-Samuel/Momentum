import type {
  AppSettings,
  DifficultyRating,
  Exercise,
  ExerciseConfiguration,
  ExerciseSession,
  FormQuality,
  PersonalRecord,
  PreparedWorkout,
  ProgramExercise,
  ProgressionState,
  SetSession,
  WorkoutProgram,
  WorkoutSession,
} from '@/types';
import { db } from '@/database/db';
import {
  DEFAULT_CONFIGS,
  DEFAULT_EXERCISES,
  DEFAULT_PROGRAM,
  DEFAULT_SETTINGS,
  defaultProgression,
  PROGRAM_ID,
} from '@/database/seed';
import { createId, midpointTarget, nowIso } from '@/utils/id';

export async function ensureSeeded(): Promise<void> {
  const programCount = await db.workoutPrograms.count();
  if (programCount === 0) {
    await db.transaction(
      'rw',
      [
        db.workoutPrograms,
        db.exercises,
        db.exerciseConfigurations,
        db.progressionStates,
        db.appSettings,
      ],
      async () => {
        await db.workoutPrograms.add(DEFAULT_PROGRAM);
        await db.exercises.bulkAdd(DEFAULT_EXERCISES);
        await db.exerciseConfigurations.bulkAdd(DEFAULT_CONFIGS);
        await db.progressionStates.bulkAdd(
          DEFAULT_CONFIGS.map((config) => defaultProgression(config)),
        );
        await db.appSettings.put(DEFAULT_SETTINGS);
      },
    );
    return;
  }
  const settings = await db.appSettings.get('app');
  if (!settings) {
    await db.appSettings.put(DEFAULT_SETTINGS);
  }
}

export async function getSettings(): Promise<AppSettings> {
  await ensureSeeded();
  const settings = await db.appSettings.get('app');
  return settings ?? DEFAULT_SETTINGS;
}

export async function updateSettings(
  patch: Partial<Omit<AppSettings, 'id' | 'createdAt'>>,
): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    id: 'app',
    updatedAt: nowIso(),
    syncStatus: 'local',
  };
  await db.appSettings.put(next);
  return next;
}

export async function getPrimaryProgram(): Promise<WorkoutProgram> {
  await ensureSeeded();
  const program =
    (await db.workoutPrograms.get(PROGRAM_ID)) ??
    (await db.workoutPrograms.orderBy('createdAt').first());
  if (!program) {
    throw new Error('No workout program found');
  }
  return program;
}

export async function getPreparedWorkout(
  programId?: string,
): Promise<PreparedWorkout> {
  await ensureSeeded();
  const program = programId
    ? await db.workoutPrograms.get(programId)
    : await getPrimaryProgram();
  if (!program) {
    throw new Error('Program not found');
  }
  const configs = await db.exerciseConfigurations
    .where('programId')
    .equals(program.id)
    .sortBy('order');
  const exercises: ProgramExercise[] = [];
  for (const config of configs) {
    const exercise = await db.exercises.get(config.exerciseId);
    const progression = await db.progressionStates
      .where('exerciseId')
      .equals(config.exerciseId)
      .first();
    if (!exercise) continue;
    exercises.push({
      ...config,
      exercise,
      progression: progression ?? defaultProgression(config),
    });
  }
  return { program, exercises };
}

export async function updateProgramName(id: string, name: string): Promise<void> {
  await db.workoutPrograms.update(id, { name, updatedAt: nowIso() });
}

export async function updateExerciseName(id: string, name: string): Promise<void> {
  await db.exercises.update(id, { name, updatedAt: nowIso() });
}

export async function updateExerciseConfiguration(
  id: string,
  patch: Partial<ExerciseConfiguration>,
): Promise<void> {
  const current = await db.exerciseConfigurations.get(id);
  if (!current) return;
  const next = { ...current, ...patch, id, updatedAt: nowIso(), syncStatus: 'local' as const };
  await db.exerciseConfigurations.put(next);
  if (patch.sets || patch.minReps || patch.maxReps || patch.resistanceLabel) {
    const progression = await db.progressionStates
      .where('exerciseId')
      .equals(current.exerciseId)
      .first();
    if (progression) {
      const sets = next.sets;
      const minReps = next.minReps;
      const maxReps = next.maxReps;
      const fill = midpointTarget(minReps, maxReps);
      const currentTargets = Array.from({ length: sets }, (_, i) => {
        const existing = progression.currentTargets[i];
        if (existing == null) return fill;
        return Math.min(maxReps, Math.max(minReps, existing));
      });
      await db.progressionStates.put({
        ...progression,
        resistanceLabel: next.resistanceLabel,
        currentTargets,
        recommendedNextTargets:
          progression.recommendedNextTargets.length === sets
            ? progression.recommendedNextTargets.map((value) =>
                Math.min(maxReps, Math.max(minReps, value)),
              )
            : currentTargets,
        updatedAt: nowIso(),
      });
    }
  }
}

export async function addExerciseToProgram(
  programId: string,
  input: {
    name: string;
    sets: number;
    minReps: number;
    maxReps: number;
    tempo: ExerciseConfiguration['tempo'];
    restAfterSetSeconds: number;
    transitionAfterExerciseSeconds: number;
    targetRirMin: number;
    targetRirMax: number;
    laterality: ExerciseConfiguration['laterality'];
    unilateralOrder: ExerciseConfiguration['unilateralOrder'];
    resistanceLabel: string;
  },
): Promise<void> {
  const stamp = nowIso();
  const configs = await db.exerciseConfigurations.where('programId').equals(programId).toArray();
  const order = configs.length;
  const exercise: Exercise = {
    id: createId(),
    name: input.name,
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: 'local',
  };
  const config: ExerciseConfiguration = {
    id: createId(),
    programId,
    exerciseId: exercise.id,
    order,
    sets: input.sets,
    minReps: input.minReps,
    maxReps: input.maxReps,
    tempo: input.tempo,
    restAfterSetSeconds: input.restAfterSetSeconds,
    transitionAfterExerciseSeconds: input.transitionAfterExerciseSeconds,
    targetRirMin: input.targetRirMin,
    targetRirMax: input.targetRirMax,
    progressionType: 'rep-range',
    laterality: input.laterality,
    unilateralOrder: input.unilateralOrder,
    resistanceLabel: input.resistanceLabel,
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: 'local',
  };
  await db.transaction(
    'rw',
    [db.exercises, db.exerciseConfigurations, db.progressionStates],
    async () => {
      await db.exercises.add(exercise);
      await db.exerciseConfigurations.add(config);
      await db.progressionStates.add(defaultProgression(config));
    },
  );
}

export async function removeExerciseFromProgram(configId: string): Promise<void> {
  const config = await db.exerciseConfigurations.get(configId);
  if (!config) return;
  await db.exerciseConfigurations.delete(configId);
  const remaining = await db.exerciseConfigurations
    .where('programId')
    .equals(config.programId)
    .sortBy('order');
  await Promise.all(
    remaining.map((item, index) =>
      db.exerciseConfigurations.update(item.id, { order: index, updatedAt: nowIso() }),
    ),
  );
}

export async function reorderExercises(programId: string, configIds: string[]): Promise<void> {
  await Promise.all(
    configIds.map((id, index) =>
      db.exerciseConfigurations.update(id, { order: index, updatedAt: nowIso() }),
    ),
  );
  void programId;
}

export async function createWorkoutSession(prepared: PreparedWorkout): Promise<WorkoutSession> {
  const stamp = nowIso();
  const session: WorkoutSession = {
    id: createId(),
    programId: prepared.program.id,
    programNameSnapshot: prepared.program.name,
    status: 'in_progress',
    startedAt: stamp,
    completedAt: null,
    durationMs: 0,
    engineSnapshot: null,
    engineSnapshotAt: null,
    totalSets: 0,
    totalReps: 0,
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: 'local',
  };
  await db.workoutSessions.add(session);
  return session;
}

export async function saveEngineSnapshot(
  sessionId: string,
  snapshotJson: string,
): Promise<void> {
  const stamp = nowIso();
  await db.workoutSessions.update(sessionId, {
    engineSnapshot: snapshotJson,
    engineSnapshotAt: stamp,
    updatedAt: stamp,
  });
}

export async function getIncompleteSession(): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.where('status').equals('in_progress').first();
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.get(id);
}

export async function listSessions(): Promise<WorkoutSession[]> {
  const rows = await db.workoutSessions.orderBy('startedAt').reverse().toArray();
  return rows.filter((row) => row.status === 'completed' || row.status === 'aborted');
}

export async function getSessionDetail(sessionId: string): Promise<{
  session: WorkoutSession;
  exercises: Array<{ exercise: ExerciseSession; sets: SetSession[] }>;
} | null> {
  const session = await db.workoutSessions.get(sessionId);
  if (!session) return null;
  const exercises = await db.exerciseSessions
    .where('workoutSessionId')
    .equals(sessionId)
    .sortBy('order');
  const result = [];
  for (const exercise of exercises) {
    const sets = await db.setSessions
      .where('exerciseSessionId')
      .equals(exercise.id)
      .sortBy('setIndex');
    result.push({ exercise, sets });
  }
  return { session, exercises: result };
}

export async function upsertExerciseSession(input: {
  id?: string;
  workoutSessionId: string;
  item: ProgramExercise;
  targetRepsPerSet: number[];
}): Promise<ExerciseSession> {
  const existing = input.id
    ? await db.exerciseSessions.get(input.id)
    : await db.exerciseSessions
        .where('workoutSessionId')
        .equals(input.workoutSessionId)
        .and((row) => row.exerciseId === input.item.exerciseId)
        .first();
  const stamp = nowIso();
  const row: ExerciseSession = {
    id: existing?.id ?? createId(),
    workoutSessionId: input.workoutSessionId,
    exerciseId: input.item.exerciseId,
    order: input.item.order,
    nameSnapshot: input.item.exercise.name,
    configSnapshot: {
      name: input.item.exercise.name,
      sets: input.item.sets,
      minReps: input.item.minReps,
      maxReps: input.item.maxReps,
      tempo: input.item.tempo,
      restAfterSetSeconds: input.item.restAfterSetSeconds,
      transitionAfterExerciseSeconds: input.item.transitionAfterExerciseSeconds,
      targetRirMin: input.item.targetRirMin,
      targetRirMax: input.item.targetRirMax,
      progressionType: input.item.progressionType,
      laterality: input.item.laterality,
      unilateralOrder: input.item.unilateralOrder,
      resistanceLabel: input.item.progression.resistanceLabel,
    },
    targetRepsPerSet: input.targetRepsPerSet,
    difficultyRating: existing?.difficultyRating ?? null,
    rir: existing?.rir ?? null,
    formQuality: existing?.formQuality ?? null,
    completedAt: existing?.completedAt ?? null,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    syncStatus: 'local',
  };
  await db.exerciseSessions.put(row);
  return row;
}

export async function saveSetSession(row: SetSession): Promise<void> {
  await db.setSessions.put({ ...row, updatedAt: nowIso(), syncStatus: 'local' });
}

export async function rateExerciseSession(
  exerciseSessionId: string,
  input: {
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  },
): Promise<void> {
  await db.exerciseSessions.update(exerciseSessionId, {
    ...input,
    updatedAt: nowIso(),
  });
}

export async function completeExerciseSession(exerciseSessionId: string): Promise<void> {
  await db.exerciseSessions.update(exerciseSessionId, {
    completedAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export async function finalizeWorkoutSession(input: {
  sessionId: string;
  status: Exclude<WorkoutSession['status'], 'in_progress'>;
  durationMs: number;
}): Promise<void> {
  const sets = await db.setSessions.where('workoutSessionId').equals(input.sessionId).toArray();
  const completed = sets.filter((set) => !set.skipped);
  await db.workoutSessions.update(input.sessionId, {
    status: input.status,
    completedAt: nowIso(),
    durationMs: input.durationMs,
    totalSets: completed.length,
    totalReps: completed.reduce((sum, set) => sum + set.completedReps, 0),
    engineSnapshot: null,
    updatedAt: nowIso(),
  });
}

export async function discardWorkoutSession(sessionId: string): Promise<void> {
  await db.workoutSessions.update(sessionId, {
    status: 'discarded',
    completedAt: nowIso(),
    engineSnapshot: null,
    updatedAt: nowIso(),
  });
}

export async function getProgression(exerciseId: string): Promise<ProgressionState | undefined> {
  return db.progressionStates.where('exerciseId').equals(exerciseId).first();
}

export async function saveProgression(state: ProgressionState): Promise<void> {
  await db.progressionStates.put({ ...state, updatedAt: nowIso(), syncStatus: 'local' });
}

export async function applyProgressionTargets(input: {
  exerciseId: string;
  currentTargets: number[];
  resistanceLabel: string;
}): Promise<void> {
  const current = await getProgression(input.exerciseId);
  if (!current) return;
  await db.progressionStates.put({
    ...current,
    currentTargets: input.currentTargets,
    recommendedNextTargets: input.currentTargets,
    resistanceLabel: input.resistanceLabel,
    recommendedResistanceChange: null,
    updatedAt: nowIso(),
  });
  const configs = await db.exerciseConfigurations
    .where('exerciseId')
    .equals(input.exerciseId)
    .toArray();
  await Promise.all(
    configs.map((config) =>
      db.exerciseConfigurations.update(config.id, {
        resistanceLabel: input.resistanceLabel,
        updatedAt: nowIso(),
      }),
    ),
  );
}

export async function recordPersonalRecords(records: PersonalRecord[]): Promise<void> {
  if (records.length === 0) return;
  await db.personalRecords.bulkPut(records);
}

export async function getPersonalRecords(exerciseId: string): Promise<PersonalRecord[]> {
  return db.personalRecords.where('exerciseId').equals(exerciseId).toArray();
}

export async function getExerciseHistory(exerciseId: string): Promise<
  Array<{
    session: WorkoutSession;
    exercise: ExerciseSession;
    sets: SetSession[];
  }>
> {
  const exerciseSessions = await db.exerciseSessions
    .where('exerciseId')
    .equals(exerciseId)
    .toArray();
  const results = [];
  for (const exercise of exerciseSessions) {
    const session = await db.workoutSessions.get(exercise.workoutSessionId);
    if (!session || (session.status !== 'completed' && session.status !== 'aborted')) {
      continue;
    }
    const sets = await db.setSessions
      .where('exerciseSessionId')
      .equals(exercise.id)
      .sortBy('setIndex');
    results.push({ session, exercise, sets });
  }
  results.sort(
    (a, b) => new Date(a.session.startedAt).getTime() - new Date(b.session.startedAt).getTime(),
  );
  return results;
}

export async function lastCompletedSession(): Promise<WorkoutSession | undefined> {
  const rows = await db.workoutSessions.orderBy('startedAt').reverse().toArray();
  return rows.find((row) => row.status === 'completed' || row.status === 'aborted');
}

export async function completedWorkoutCount(): Promise<number> {
  const rows = await db.workoutSessions.toArray();
  return rows.filter((row) => row.status === 'completed').length;
}

export { db };
