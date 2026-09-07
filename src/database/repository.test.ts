import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import {
  createWorkoutSession,
  ensureSeeded,
  getPreparedWorkout,
  getSettings,
  saveEngineSnapshot,
  getIncompleteSession,
  discardWorkoutSession,
} from '@/database/repository';

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

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
});
