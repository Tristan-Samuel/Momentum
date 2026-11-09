import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import {
  createProgram,
  createWorkoutSession,
  deleteProgram,
  duplicateProgram,
  finalizeWorkoutSession,
  getPreparedWorkout,
  listPrograms,
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

  it('moves an exercise within its program', async () => {
    const before = await getPreparedWorkout();
    await moveExercise(before.exercises[1].id, -1);
    const after = await getPreparedWorkout(before.program.id);
    expect(after.exercises[0].id).toBe(before.exercises[1].id);
    expect(after.exercises[1].id).toBe(before.exercises[0].id);
  });
});
