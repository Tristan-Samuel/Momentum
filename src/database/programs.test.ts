import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import { libraryExerciseById, libraryExerciseInput } from '@/library/catalog';
import { LIBRARY_PROGRAMS, exercisesForProgram, libraryProgramIdsExist } from '@/library/programs';
import {
  addExerciseToProgram,
  createProgram,
  createRoutine,
  createWorkoutSession,
  deleteProgram,
  duplicateProgram,
  finalizeWorkoutSession,
  getPreparedWorkout,
  listPrograms,
  listRoutines,
  listWorkoutDates,
  moveExercise,
  nextProgramInRotation,
  reorderPrograms,
} from '@/database/repository';

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function completeSession(programId: string): Promise<void> {
  const prepared = await getPreparedWorkout(programId);
  const session = await createWorkoutSession(prepared);
  await finalizeWorkoutSession({ sessionId: session.id, status: 'completed', durationMs: 1000 });
}

describe('programs', () => {
  it('adds the full-body library with an open barbell squat', async () => {
    expect(libraryProgramIdsExist()).toBe(true);
    const template = LIBRARY_PROGRAMS.find((item) => item.id === 'full-body');
    expect(template).toBeTruthy();
    const program = await createProgram(template?.name ?? 'Full Body');
    for (const entry of exercisesForProgram(template!)) {
      await addExerciseToProgram(program.id, libraryExerciseInput(entry, 'lb'));
    }
    const prepared = await getPreparedWorkout(program.id);
    expect(prepared.exercises.map((item) => item.exercise.name)).toEqual([
      'Back Squat',
      'Bench Press',
      'Barbell Row',
      'Romanian Deadlift',
    ]);
    const squat = prepared.exercises[0];
    expect(squat.cueMode).toBe('open');
    expect(squat.load).toBe(45);
    expect(squat.resistanceLabel).toBe('45 lb');
    expect(libraryExerciseById('bench-press')?.cueMode).toBe('open');
    expect(libraryExerciseInput(libraryExerciseById('dumbbell-curl')!, 'kg').load).toBe(7.5);
    expect(libraryExerciseInput(libraryExerciseById('dumbbell-curl')!, 'kg').cueMode).toBe('tempo');
  });

  it('rotates to the program after the last completed one', async () => {
    const first = (await listPrograms())[0];
    const second = await createProgram('Day B');
    expect((await nextProgramInRotation()).id).toBe(first.id);
    await completeSession(first.id);
    expect((await nextProgramInRotation()).id).toBe(second.id);
    await completeSession(second.id);
    expect((await nextProgramInRotation()).id).toBe(first.id);
    expect(await listWorkoutDates()).toHaveLength(2);
  });

  it('duplicates exercises with fresh ids and the same targets', async () => {
    const source = await getPreparedWorkout();
    const copy = await duplicateProgram(source.program.id);
    expect(copy).not.toBeNull();
    const prepared = await getPreparedWorkout(copy!.id);
    expect(prepared.exercises.map((row) => row.exercise.name)).toEqual(
      source.exercises.map((row) => row.exercise.name),
    );
    expect(prepared.exercises[0].exerciseId).not.toBe(source.exercises[0].exerciseId);
    expect(prepared.exercises[0].progression.currentTargets).toEqual(
      source.exercises[0].progression.currentTargets,
    );
  });

  it('keeps at least one program and reorders the rest after a delete', async () => {
    const [only] = await listPrograms();
    await expect(deleteProgram(only.id)).rejects.toThrow(/at least one/);
    const b = await createProgram('B');
    const c = await createProgram('C');
    await reorderPrograms([c.id, only.id, b.id]);
    expect((await listPrograms()).map((row) => row.name)).toEqual(['C', only.name, 'B']);
    await deleteProgram(only.id);
    const remaining = await listPrograms();
    expect(remaining.map((row) => row.order)).toEqual([0, 1]);
    expect(await db.exerciseConfigurations.where('programId').equals(only.id).count()).toBe(0);
  });

  it('removes a deleted program from routine schedules', async () => {
    const [kept] = await listPrograms();
    const extra = await createProgram('Day B');
    await createRoutine('Morning', {
      programIds: [kept.id, extra.id],
      shift: [extra.id, null, kept.id],
      weekdays: [extra.id, kept.id, null, null, null, null, null],
    });
    await deleteProgram(extra.id);
    const morning = (await listRoutines()).find((row) => row.name === 'Morning');
    expect(morning?.programIds).toEqual([kept.id]);
    expect(morning?.shift).toEqual([null, kept.id]);
    expect(morning?.weekdays[0]).toBeNull();
    expect(morning?.weekdays[1]).toBe(kept.id);
  });

  it('moves an exercise within its program', async () => {
    const before = await getPreparedWorkout();
    await moveExercise(before.exercises[1].id, -1);
    const after = await getPreparedWorkout(before.program.id);
    expect(after.exercises[0].id).toBe(before.exercises[1].id);
    expect(after.exercises[1].id).toBe(before.exercises[0].id);
  });
});
