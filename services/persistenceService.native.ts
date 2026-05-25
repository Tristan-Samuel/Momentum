import * as SQLite from 'expo-sqlite';

import type { DailyEntry, DailyNoteState, PersistedSnapshot, RoutineId } from '../types/routine';
import type { PersistenceService } from '../types/services';
import { getLocalDateKey } from '../utils/date';

const DATABASE_NAME = 'momentum.db';
const PROGRAM_START_KEY = 'program_start_date';

type ProgressRow = {
  date: string;
  routine_id: RoutineId;
  exercise_id: string;
  completed: number;
  updated_at: string;
};

type NoteRow = {
  date: string;
  tags: string;
  text: string;
  updated_at: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function createEmptyEntry(date: string): DailyEntry {
  return {
    date,
    routines: {
      morning: { completedExerciseIds: [] },
      night: { completedExerciseIds: [] },
    },
    note: {
      tags: [],
      text: '',
    },
  };
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

async function ensureSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_progress (
      date TEXT NOT NULL,
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      completed INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (date, routine_id, exercise_id)
    );

    CREATE TABLE IF NOT EXISTS daily_notes (
      date TEXT PRIMARY KEY NOT NULL,
      tags TEXT NOT NULL,
      text TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

async function getOrCreateProgramStart(database: SQLite.SQLiteDatabase): Promise<string> {
  const current = await database.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [PROGRAM_START_KEY]);
  if (current?.value) {
    return current.value;
  }

  const today = getLocalDateKey();
  await database.runAsync('INSERT INTO meta (key, value) VALUES (?, ?)', [PROGRAM_START_KEY, today]);
  return today;
}

function mapRowsToEntries(progressRows: ProgressRow[], noteRows: NoteRow[]): DailyEntry[] {
  const entries = new Map<string, DailyEntry>();

  for (const row of progressRows) {
    const entry = entries.get(row.date) ?? createEmptyEntry(row.date);
    const routineProgress = entry.routines[row.routine_id];
    entry.routines[row.routine_id] = {
      completedExerciseIds: row.completed ? [...routineProgress.completedExerciseIds, row.exercise_id] : routineProgress.completedExerciseIds,
      updatedAt: row.updated_at,
    };
    entries.set(row.date, entry);
  }

  for (const row of noteRows) {
    const entry = entries.get(row.date) ?? createEmptyEntry(row.date);
    entry.note = {
      tags: row.tags ? (JSON.parse(row.tags) as DailyNoteState['tags']) : [],
      text: row.text,
      updatedAt: row.updated_at,
    };
    entries.set(row.date, entry);
  }

  return Array.from(entries.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export const persistenceService: PersistenceService = {
  async initialize(): Promise<PersistedSnapshot> {
    const database = await getDatabase();
    await ensureSchema(database);

    const [programStartDate, progressRows, noteRows] = await Promise.all([
      getOrCreateProgramStart(database),
      database.getAllAsync<ProgressRow>(
        'SELECT date, routine_id, exercise_id, completed, updated_at FROM exercise_progress ORDER BY date ASC, updated_at ASC'
      ),
      database.getAllAsync<NoteRow>('SELECT date, tags, text, updated_at FROM daily_notes ORDER BY date ASC'),
    ]);

    return {
      programStartDate,
      entries: mapRowsToEntries(progressRows, noteRows),
    };
  },

  async saveExerciseCompletion({ date, routineId, exerciseId, completed }): Promise<void> {
    const database = await getDatabase();
    await ensureSchema(database);
    await database.runAsync(
      `
        INSERT INTO exercise_progress (date, routine_id, exercise_id, completed, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date, routine_id, exercise_id)
        DO UPDATE SET
          completed = excluded.completed,
          updated_at = excluded.updated_at
      `,
      [date, routineId, exerciseId, completed ? 1 : 0, new Date().toISOString()]
    );
  },

  async saveNote(date, note): Promise<void> {
    const database = await getDatabase();
    await ensureSchema(database);
    await database.runAsync(
      `
        INSERT INTO daily_notes (date, tags, text, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(date)
        DO UPDATE SET
          tags = excluded.tags,
          text = excluded.text,
          updated_at = excluded.updated_at
      `,
      [date, JSON.stringify(note.tags), note.text, new Date().toISOString()]
    );
  },
};
