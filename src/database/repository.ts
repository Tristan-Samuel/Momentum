import type {
  AppSettings,
  DifficultyRating,
  Exercise,
  ExerciseConfiguration,
  ExerciseSession,
  FormQuality,
  Measure,
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
import { weakerLegReps } from '@/progression/algorithm';
import { queueDeletes } from '@/sync/outbox';
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

export async function listPrograms(): Promise<WorkoutProgram[]> {
  await ensureSeeded();
  const rows = await db.workoutPrograms.toArray();
  return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

export async function getPrimaryProgram(): Promise<WorkoutProgram> {
  const programs = await listPrograms();
  const program = programs.find((row) => row.id === PROGRAM_ID) ?? programs[0];
  if (!program) {
    throw new Error('No workout program found');
  }
  return program;
}

export async function nextProgramInRotation(): Promise<WorkoutProgram> {
  const programs = await listPrograms();
  if (programs.length === 0) throw new Error('No workout program found');
  const last = await lastCompletedSession();
  const index = last ? programs.findIndex((row) => row.id === last.programId) : -1;
  if (index < 0) return programs[0];
  return programs[(index + 1) % programs.length];
}

export async function getPreparedWorkout(
  programId?: string,
): Promise<PreparedWorkout> {
  await ensureSeeded();
  const program = programId
    ? (await db.workoutPrograms.get(programId)) ?? (await nextProgramInRotation())
    : await nextProgramInRotation();
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

export async function listPreparedPrograms(): Promise<PreparedWorkout[]> {
  const programs = await listPrograms();
  return Promise.all(programs.map((program) => getPreparedWorkout(program.id)));
}

export async function updateProgramName(id: string, name: string): Promise<void> {
  await db.workoutPrograms.update(id, { name, updatedAt: nowIso() });
}

export async function createProgram(name: string): Promise<WorkoutProgram> {
  const programs = await listPrograms();
  const stamp = nowIso();
  const program: WorkoutProgram = {
    id: createId(),
    name: name.trim() || 'New program',
    order: programs.length,
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: 'local',
  };
  await db.workoutPrograms.add(program);
  return program;
}

export async function duplicateProgram(programId: string): Promise<WorkoutProgram | null> {
  const source = await getPreparedWorkout(programId);
  if (source.program.id !== programId) return null;
  const copy = await createProgram(`${source.program.name} copy`);
  const stamp = nowIso();
  await db.transaction(
    'rw',
    [db.exercises, db.exerciseConfigurations, db.progressionStates],
    async () => {
      for (const item of source.exercises) {
        const exercise: Exercise = {
          id: createId(),
          name: item.exercise.name,
          createdAt: stamp,
          updatedAt: stamp,
          syncStatus: 'local',
        };
        const { exercise: _exercise, progression, ...config } = item;
        void _exercise;
        const nextConfig: ExerciseConfiguration = {
          ...config,
          id: createId(),
          programId: copy.id,
          exerciseId: exercise.id,
          createdAt: stamp,
          updatedAt: stamp,
          syncStatus: 'local',
        };
        await db.exercises.add(exercise);
        await db.exerciseConfigurations.add(nextConfig);
        await db.progressionStates.add({
          ...defaultProgression(nextConfig),
          resistanceLabel: progression.resistanceLabel,
          currentTargets: progression.currentTargets.slice(),
          recommendedNextTargets: progression.currentTargets.slice(),
          createdAt: stamp,
          updatedAt: stamp,
        });
      }
    },
  );
  return copy;
}

export async function deleteProgram(programId: string): Promise<void> {
  const programs = await listPrograms();
  if (programs.length <= 1) {
    throw new Error('Keep at least one program.');
  }
  await db.transaction('rw', [db.workoutPrograms, db.exerciseConfigurations], async () => {
    await db.exerciseConfigurations.where('programId').equals(programId).delete();
    await db.workoutPrograms.delete(programId);
  });
  const remaining = programs.filter((row) => row.id !== programId);
  await reorderPrograms(remaining.map((row) => row.id));
}

export async function reorderPrograms(programIds: string[]): Promise<void> {
  const stamp = nowIso();
  await db.transaction('rw', db.workoutPrograms, async () => {
    for (const [index, id] of programIds.entries()) {
      const row = await db.workoutPrograms.get(id);
      if (row && row.order !== index) {
        await db.workoutPrograms.update(id, { order: index, updatedAt: stamp });
      }
    }
  });
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
    measure?: Measure;
    progressionStep?: number;
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
    measure: input.measure ?? 'reps',
    progressionStep: input.progressionStep ?? (input.measure === 'seconds' ? 5 : 1),
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

export async function reorderExercises(configIds: string[]): Promise<void> {
  const stamp = nowIso();
  await db.transaction('rw', db.exerciseConfigurations, async () => {
    for (const [index, id] of configIds.entries()) {
      await db.exerciseConfigurations.update(id, { order: index, updatedAt: stamp });
    }
  });
}

export async function moveExercise(configId: string, direction: -1 | 1): Promise<void> {
  const config = await db.exerciseConfigurations.get(configId);
  if (!config) return;
  const siblings = await db.exerciseConfigurations
    .where('programId')
    .equals(config.programId)
    .sortBy('order');
  const index = siblings.findIndex((row) => row.id === configId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const ids = siblings.map((row) => row.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await reorderExercises(ids);
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

function setReps(set: SetSession): number {
  if (set.skipped) return 0;
  if (set.leftReps != null || set.rightReps != null) {
    return weakerLegReps(set.leftReps, set.rightReps);
  }
  return set.completedReps;
}

export async function recomputeProgressionStats(exerciseId: string): Promise<void> {
  const progression = await getProgression(exerciseId);
  if (!progression) return;

  const history = await getExerciseHistory(exerciseId);
  const stamp = nowIso();
  let lifetimeReps = 0;
  let lifetimeSets = 0;
  let personalBestReps = 0;
  let personalBestDate: string | null = null;
  let bestSetSessionId: string | null = null;
  let bestSetResistance = progression.resistanceLabel;
  let bestWorkoutReps = 0;
  let bestWorkoutSessionId: string | null = null;
  let bestWorkoutResistance = progression.resistanceLabel;
  let bestWorkoutDate: string | null = null;

  for (const row of history) {
    const completedSets = row.sets.filter((set) => !set.skipped);
    const completedReps = completedSets.map(setReps);
    const workoutReps = completedReps.reduce((sum, value) => sum + value, 0);
    lifetimeReps += workoutReps;
    lifetimeSets += completedSets.length;
    const bestThis = Math.max(0, ...completedReps);
    const achievedAt = row.session.completedAt ?? row.session.startedAt;
    if (bestThis > personalBestReps) {
      personalBestReps = bestThis;
      personalBestDate = achievedAt;
      bestSetSessionId = row.session.id;
      bestSetResistance = row.exercise.configSnapshot.resistanceLabel;
    }
    if (workoutReps > bestWorkoutReps) {
      bestWorkoutReps = workoutReps;
      bestWorkoutSessionId = row.session.id;
      bestWorkoutResistance = row.exercise.configSnapshot.resistanceLabel;
      bestWorkoutDate = achievedAt;
    }
  }

  const latest = history.at(-1);
  const lastCompletedReps = latest ? latest.sets.filter((set) => !set.skipped).map(setReps) : [];

  await db.personalRecords.where('exerciseId').equals(exerciseId).delete();
  const records: PersonalRecord[] = [];
  if (personalBestReps > 0 && bestSetSessionId) {
    records.push({
      id: createId(),
      exerciseId,
      kind: 'best_set_reps',
      value: personalBestReps,
      resistanceLabel: bestSetResistance,
      achievedAt: personalBestDate ?? stamp,
      workoutSessionId: bestSetSessionId,
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local',
    });
  }
  if (bestWorkoutReps > 0 && bestWorkoutSessionId) {
    records.push({
      id: createId(),
      exerciseId,
      kind: 'best_workout_reps',
      value: bestWorkoutReps,
      resistanceLabel: bestWorkoutResistance,
      achievedAt: bestWorkoutDate ?? stamp,
      workoutSessionId: bestWorkoutSessionId,
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local',
    });
  }
  if (records.length > 0) {
    await db.personalRecords.bulkPut(records);
  }

  await db.progressionStates.put({
    ...progression,
    lastCompletedReps,
    lastRir: latest?.exercise.rir ?? null,
    lastDifficultyRating: latest?.exercise.difficultyRating ?? null,
    lastFormQuality: latest?.exercise.formQuality ?? null,
    personalBestReps,
    personalBestDate,
    lastWorkoutDate: latest ? (latest.session.completedAt ?? latest.session.startedAt) : null,
    lifetimeReps,
    lifetimeSets,
    updatedAt: stamp,
    syncStatus: 'local',
  });
}

export async function deleteCompletedSession(sessionId: string): Promise<void> {
  const session = await db.workoutSessions.get(sessionId);
  if (!session) return;
  if (session.status === 'in_progress') {
    throw new Error('Cannot delete an in-progress workout. Resume or discard it first.');
  }

  const exercises = await db.exerciseSessions.where('workoutSessionId').equals(sessionId).toArray();
  const exerciseIds = [...new Set(exercises.map((row) => row.exerciseId))];

  await db.transaction(
    'rw',
    [db.workoutSessions, db.exerciseSessions, db.setSessions, db.personalRecords],
    async () => {
      await db.setSessions.where('workoutSessionId').equals(sessionId).delete();
      await db.exerciseSessions.where('workoutSessionId').equals(sessionId).delete();
      await db.personalRecords.filter((row) => row.workoutSessionId === sessionId).delete();
      await db.workoutSessions.delete(sessionId);
    },
  );

  for (const exerciseId of exerciseIds) {
    await recomputeProgressionStats(exerciseId);
  }
}

export async function resetAllProgress(): Promise<void> {
  const configs = await db.exerciseConfigurations.toArray();
  const cleared = [
    ['workoutSessions', db.workoutSessions],
    ['exerciseSessions', db.exerciseSessions],
    ['setSessions', db.setSessions],
    ['personalRecords', db.personalRecords],
    ['progressionStates', db.progressionStates],
  ] as const;
  for (const [name, table] of cleared) {
    await queueDeletes(db, name, (await table.toCollection().primaryKeys()) as string[]);
  }
  await db.transaction(
    'rw',
    [
      db.workoutSessions,
      db.exerciseSessions,
      db.setSessions,
      db.personalRecords,
      db.progressionStates,
    ],
    async () => {
      await db.workoutSessions.clear();
      await db.exerciseSessions.clear();
      await db.setSessions.clear();
      await db.personalRecords.clear();
      await db.progressionStates.clear();
      if (configs.length > 0) {
        await db.progressionStates.bulkAdd(configs.map((config) => defaultProgression(config)));
      }
    },
  );
}

export async function getProgression(exerciseId: string): Promise<ProgressionState | undefined> {
  return db.progressionStates.where('exerciseId').equals(exerciseId).first();
}

export async function saveProgression(state: ProgressionState): Promise<void> {
  await db.progressionStates.put({ ...state, updatedAt: nowIso(), syncStatus: 'local' });
}

export async function updateCurrentTargets(
  exerciseId: string,
  currentTargets: number[],
): Promise<void> {
  const current = await getProgression(exerciseId);
  if (!current) return;
  const next = currentTargets.map((value) => Math.max(1, Math.round(value)));
  await db.progressionStates.put({
    ...current,
    currentTargets: next,
    recommendedNextTargets: next,
    updatedAt: nowIso(),
    syncStatus: 'local',
  });
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

function countsAsWorkout(row: WorkoutSession): boolean {
  return row.status === 'completed' || (row.status === 'aborted' && row.totalSets > 0);
}

export async function listRepVolumes(): Promise<Array<{ startedAt: string; amount: number }>> {
  const sessions = (await db.workoutSessions.toArray()).filter(countsAsWorkout);
  const ids = new Set(sessions.map((row) => row.id));
  const exercises = (await db.exerciseSessions.toArray()).filter(
    (row) => ids.has(row.workoutSessionId) && (row.configSnapshot.measure ?? 'reps') === 'reps',
  );
  const repExerciseIds = new Set(exercises.map((row) => row.id));
  const totals = new Map<string, number>();
  for (const set of await db.setSessions.toArray()) {
    if (!repExerciseIds.has(set.exerciseSessionId) || set.skipped) continue;
    totals.set(set.workoutSessionId, (totals.get(set.workoutSessionId) ?? 0) + setReps(set));
  }
  return sessions.map((row) => ({ startedAt: row.startedAt, amount: totals.get(row.id) ?? 0 }));
}

export async function listWorkoutDates(): Promise<string[]> {
  const rows = await db.workoutSessions.toArray();
  return rows.filter(countsAsWorkout).map((row) => row.startedAt);
}

export { db };
