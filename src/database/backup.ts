import { db } from '@/database/db';
import { DEFAULT_SETTINGS } from '@/database/seed';
import { withOutboxSuppressed } from '@/sync/outbox';
import { SYNC_TABLES, type SyncTable } from '@/types';

export const BACKUP_FORMAT = 'momentum-backup';
export const BACKUP_VERSION = 1;

export type BackupTables = Record<SyncTable, Array<Record<string, unknown>>>;

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: BackupTables;
};

export class BackupError extends Error {}

export async function exportAll(): Promise<BackupEnvelope> {
  const tables = {} as BackupTables;
  for (const name of SYNC_TABLES) {
    tables[name] = (await db.table(name).toArray()) as Array<Record<string, unknown>>;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function parseBackup(json: string): BackupEnvelope {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }
  const envelope = data as Partial<BackupEnvelope> | null;
  if (!envelope || envelope.format !== BACKUP_FORMAT || typeof envelope.tables !== 'object') {
    throw new BackupError('That file is not a Momentum backup.');
  }
  if ((envelope.version ?? 0) > BACKUP_VERSION) {
    throw new BackupError('This backup is from a newer version of Momentum. Update the app first.');
  }
  return normalizeEnvelope(envelope.tables as Partial<BackupTables>, envelope.exportedAt);
}

export function normalizeEnvelope(
  input: Partial<Record<string, unknown>>,
  exportedAt = new Date().toISOString(),
): BackupEnvelope {
  const tables = {} as BackupTables;
  for (const name of SYNC_TABLES) {
    const rows = Array.isArray(input[name]) ? (input[name] as Array<Record<string, unknown>>) : [];
    tables[name] = rows
      .filter((row) => row && typeof row === 'object' && typeof row.id === 'string')
      .map((row) => normalizeRow(name, row));
  }
  if (tables.workoutPrograms.length === 0) {
    throw new BackupError('This backup has no programs in it.');
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, tables };
}

function normalizeRow(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  switch (table) {
    case 'workoutPrograms':
      return { order: 0, ...row };
    case 'exerciseConfigurations':
      return { measure: 'reps', progressionStep: row.measure === 'seconds' ? 5 : 1, ...row };
    case 'appSettings':
      return { ...DEFAULT_SETTINGS, ...row, id: 'app' };
    default:
      return row;
  }
}

export async function importAll(envelope: BackupEnvelope): Promise<void> {
  await withOutboxSuppressed(async () => {
    await db.transaction('rw', [...SYNC_TABLES.map((name) => db.table(name)), db.outbox], async () => {
      for (const name of SYNC_TABLES) {
        await db.table(name).clear();
        if (envelope.tables[name].length > 0) {
          await db.table(name).bulkPut(envelope.tables[name]);
        }
      }
      await db.outbox.clear();
    });
  });
}

export function backupSummary(envelope: BackupEnvelope): { workouts: number; programs: number } {
  return {
    workouts: envelope.tables.workoutSessions.filter((row) => row.status === 'completed').length,
    programs: envelope.tables.workoutPrograms.length,
  };
}

export function backupFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `momentum-backup-${stamp}.json`;
}
