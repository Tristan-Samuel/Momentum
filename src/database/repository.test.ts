import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import {
  createWorkoutSession,
  deleteCompletedSession,
  discardWorkoutSession,
  ensureSeeded,
  finalizeWorkoutSession,
  getIncompleteSession,
  getPersonalRecords,
  getPreparedWorkout,
  getSession,
  getSettings,
  listSessions,
  resetAllProgress,
  saveEngineSnapshot,
  saveSetSession,
  updateCurrentTargets,
  updateProgramName,
  upsertExerciseSession,
} from '@/database/repository';
import { applyCompletedSessionProgression } from '@/progression/apply';
import type { ProgramExercise, SetSession } from '@/types';
import { createId, nowIso } from '@/utils/id';

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function seedCompletedChinUp(completedReps: number[]): Promise<{
  sessionId: string;
  exerciseId: string;
  item: ProgramExercise;
}> {
  const prepared = await getPreparedWorkout();
  const item = prepared.exercises[0];
  const session = await createWorkoutSession(prepared);
  const exercise = await upsertExerciseSession({
    workoutSessionId: session.id,
    item,
    targetRepsPerSet: item.progression.currentTargets,
  });
  const stamp = nowIso();
  for (let index = 0; index < completedReps.length; index += 1) {
    const target = item.progression.currentTargets[index] ?? item.minReps;
    const row: SetSession = {
      id: createId(),
      workoutSessionId: session.id,
      exerciseSessionId: exercise.id,
      setIndex: index,
      prescribedTarget: target,
      actualTarget: target,
      completedReps: completedReps[index],
      leftReps: null,
      rightReps: null,
      skipped: false,
      targetReduced: false,
      tempoSnapshot: item.tempo,
      restSecondsPlanned: item.restAfterSetSeconds,
      restSecondsActual: null,
      startedAt: stamp,
      completedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local',
    };
    await saveSetSession(row);
  }
  await finalizeWorkoutSession({
    sessionId: session.id,
    status: 'completed',
    durationMs: 60_000,
  });
  await applyCompletedSessionProgression(session.id);
  return { sessionId: session.id, exerciseId: item.exerciseId, item };
}

describe('repository', () => {
  it('seeds the default program', async () => {
    const prepared = await getPreparedWorkout();
    expect(prepared.program.name).toBe('Minimalist Strength');
    expect(prepared.exercises.map((item) => item.exercise.name)).toEqual([
      'L-Sit Chin-Up',
      'Pull-Up',
      'Weighted / Difficult Push-Up',
      'Pistol Squat',
    ]);
    expect(prepared.exercises[0].progression.currentTargets).toEqual([8, 8]);
    expect(prepared.exercises[1].progression.currentTargets).toEqual([9]);
    expect(prepared.exercises[3].laterality).toBe('unilateral');
    expect(prepared.exercises[3].tempo).toEqual({
      eccentric: 3,
      bottomPause: 1,
      concentric: 1,
      topPause: 0,
    });
  });

  it('lets the user set today’s targets', async () => {
    const prepared = await getPreparedWorkout();
    const chinUp = prepared.exercises[0];
    await updateCurrentTargets(chinUp.exerciseId, [7, 9]);
    const next = await getPreparedWorkout();
    expect(next.exercises[0].progression.currentTargets).toEqual([7, 9]);
  });

  it('keeps settings locally', async () => {
    await ensureSeeded();
    const settings = await getSettings();
    expect(settings.soundProfile).toBe('standard');
    expect(settings.id).toBe('app');
  });

  it('recovers an in-progress snapshot', async () => {
    const prepared = await getPreparedWorkout();
    const session = await createWorkoutSession(prepared);
    await saveEngineSnapshot(session.id, JSON.stringify({ sessionId: session.id, kind: 'resting' }));
    const incomplete = await getIncompleteSession();
    expect(incomplete?.id).toBe(session.id);
    await discardWorkoutSession(session.id);
    expect(await getIncompleteSession()).toBeUndefined();
  });

  it('deletes a completed session and rebuilds remaining stats without changing targets', async () => {
    const first = await seedCompletedChinUp([8, 8]);
    await updateCurrentTargets(first.exerciseId, [9, 9]);
    const second = await seedCompletedChinUp([10, 10]);
    await updateCurrentTargets(second.exerciseId, [7, 9]);

    const afterBoth = await getPreparedWorkout();
    expect(afterBoth.exercises[0].progression.lifetimeReps).toBe(36);
    expect(afterBoth.exercises[0].progression.personalBestReps).toBe(10);

    await deleteCompletedSession(second.sessionId);

    expect(await getSession(second.sessionId)).toBeUndefined();
    expect(await db.exerciseSessions.where('workoutSessionId').equals(second.sessionId).count()).toBe(
      0,
    );
    expect(await db.setSessions.where('workoutSessionId').equals(second.sessionId).count()).toBe(0);
    expect((await listSessions()).map((row) => row.id)).toEqual([first.sessionId]);

    const remaining = await getPreparedWorkout();
    const chinUp = remaining.exercises[0].progression;
    expect(chinUp.currentTargets).toEqual([7, 9]);
    expect(chinUp.lifetimeReps).toBe(16);
    expect(chinUp.lifetimeSets).toBe(2);
    expect(chinUp.personalBestReps).toBe(8);
    expect(chinUp.lastCompletedReps).toEqual([8, 8]);

    const records = await getPersonalRecords(first.exerciseId);
    expect(records.find((row) => row.kind === 'best_set_reps')?.value).toBe(8);
    expect(records.find((row) => row.kind === 'best_workout_reps')?.value).toBe(16);
    expect(records.every((row) => row.workoutSessionId === first.sessionId)).toBe(true);
  });

  it('refuses to delete an in-progress workout', async () => {
    const prepared = await getPreparedWorkout();
    const session = await createWorkoutSession(prepared);
    await expect(deleteCompletedSession(session.id)).rejects.toThrow(/in-progress/);
    expect(await getIncompleteSession()).toEqual(expect.objectContaining({ id: session.id }));
  });

  it('resets all progress while keeping the program and settings', async () => {
    const first = await seedCompletedChinUp([8, 8]);
    await updateCurrentTargets(first.exerciseId, [10, 10]);
    await updateProgramName((await getPreparedWorkout()).program.id, 'Custom Strength');
    await seedCompletedChinUp([10, 10]);

    await resetAllProgress();

    expect(await listSessions()).toEqual([]);
    expect(await db.exerciseSessions.count()).toBe(0);
    expect(await db.setSessions.count()).toBe(0);
    expect(await db.personalRecords.count()).toBe(0);

    const prepared = await getPreparedWorkout();
    expect(prepared.program.name).toBe('Custom Strength');
    expect(prepared.exercises[0].progression.currentTargets).toEqual([8, 8]);
    expect(prepared.exercises[0].progression.lifetimeReps).toBe(0);
    expect(prepared.exercises[0].progression.personalBestReps).toBe(0);
    expect(prepared.exercises[0].progression.resistanceLabel).toBe('Bodyweight');
    expect(prepared.exercises[1].progression.currentTargets).toEqual([9]);

    const settings = await getSettings();
    expect(settings.soundProfile).toBe('standard');
  });
});
