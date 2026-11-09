import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { MomentumDB } from '@/database/db';

describe('schema v2 upgrade', () => {
  it('backfills program order, exercise measure, and weekly goal', async () => {
    const legacy = new Dexie('momentum');
    legacy.version(1).stores({
      workoutPrograms: 'id, name, updatedAt',
      exercises: 'id, name, updatedAt',
      exerciseConfigurations: 'id, programId, exerciseId, order',
      progressionStates: 'id, exerciseId',
      workoutSessions: 'id, status, startedAt, programId',
      exerciseSessions: 'id, workoutSessionId, exerciseId, order',
      setSessions: 'id, exerciseSessionId, workoutSessionId, setIndex',
      personalRecords: 'id, exerciseId, kind, achievedAt',
      appSettings: 'id',
    });
    await legacy.open();
    await legacy.table('workoutPrograms').add({ id: 'p1', name: 'Old', updatedAt: 'x' });
    await legacy.table('exerciseConfigurations').add({ id: 'c1', programId: 'p1', exerciseId: 'e1', order: 0 });
    await legacy.table('appSettings').add({ id: 'app', theme: 'system' });
    legacy.close();

    const upgraded = new MomentumDB();
    await upgraded.open();
    expect((await upgraded.workoutPrograms.get('p1'))?.order).toBe(0);
    const config = await upgraded.exerciseConfigurations.get('c1');
    expect(config?.measure).toBe('reps');
    expect(config?.progressionStep).toBe(1);
    expect((await upgraded.appSettings.get('app'))?.weeklyGoal).toBe(3);
    expect(await upgraded.outbox.count()).toBe(0);
    upgraded.close();
  });
});
