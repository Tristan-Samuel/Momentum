import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import { BackupError, exportAll, importAll, parseBackup } from '@/database/backup';
import { createProgram, getSettings, listPrograms, updateSettings } from '@/database/repository';

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('backup', () => {
  it('round-trips every synced table and leaves the outbox empty', async () => {
    await createProgram('Day B');
    await updateSettings({ weeklyGoal: 4 });
    const json = JSON.stringify(await exportAll());

    await createProgram('Will be replaced');
    await settle();
    await importAll(parseBackup(json));
    await settle();

    expect((await listPrograms()).map((row) => row.name)).toEqual(['Minimalist Strength', 'Day B']);
    expect((await getSettings()).weeklyGoal).toBe(4);
    expect(await db.outbox.count()).toBe(0);
  });

  it('fills defaults for older backups', async () => {
    const envelope = parseBackup(
      JSON.stringify({
        format: 'momentum-backup',
        version: 1,
        tables: {
          workoutPrograms: [{ id: 'p', name: 'Old' }],
          exerciseConfigurations: [{ id: 'c', programId: 'p', exerciseId: 'e' }],
        },
      }),
    );
    expect(envelope.tables.workoutPrograms[0].order).toBe(0);
    expect(envelope.tables.exerciseConfigurations[0].measure).toBe('reps');
    expect(envelope.tables.setSessions).toEqual([]);
  });

  it('rejects files that are not Momentum backups', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(/not a Momentum backup/);
    expect(() => parseBackup('{"format":"momentum-backup","version":99,"tables":{}}')).toThrow(/newer/);
  });
});

describe('outbox hooks', () => {
  it('queues puts for writes and deletes for removals', async () => {
    const program = await createProgram('Queued');
    await settle();
    const put = await db.outbox.get(`workoutPrograms:${program.id}`);
    expect(put?.op).toBe('put');
    await db.workoutPrograms.delete(program.id);
    await settle();
    expect((await db.outbox.get(`workoutPrograms:${program.id}`))?.op).toBe('delete');
  });
});
