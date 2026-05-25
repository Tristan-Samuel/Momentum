import type { DailyEntry, DailyNoteState, PersistedSnapshot, RoutineId } from '../types/routine';
import type { PersistenceService } from '../types/services';
import { getLocalDateKey } from '../utils/date';

const STORAGE_KEY = 'momentum-web-storage';

type StoredSnapshot = PersistedSnapshot;

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

function readSnapshot(): StoredSnapshot {
  if (typeof localStorage === 'undefined') {
    return {
      programStartDate: getLocalDateKey(),
      entries: [],
    };
  }

  const current = localStorage.getItem(STORAGE_KEY);
  if (!current) {
    return {
      programStartDate: getLocalDateKey(),
      entries: [],
    };
  }

  return JSON.parse(current) as StoredSnapshot;
}

function writeSnapshot(snapshot: StoredSnapshot): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function upsertEntry(entries: DailyEntry[], nextEntry: DailyEntry): DailyEntry[] {
  const filtered = entries.filter((entry) => entry.date !== nextEntry.date);
  return [...filtered, nextEntry].sort((left, right) => left.date.localeCompare(right.date));
}

export const persistenceService: PersistenceService = {
  async initialize(): Promise<PersistedSnapshot> {
    return readSnapshot();
  },

  async saveExerciseCompletion({ date, routineId, exerciseId, completed }): Promise<void> {
    const snapshot = readSnapshot();
    const currentEntry = snapshot.entries.find((entry) => entry.date === date) ?? createEmptyEntry(date);
    const ids = new Set(currentEntry.routines[routineId].completedExerciseIds);

    if (completed) {
      ids.add(exerciseId);
    } else {
      ids.delete(exerciseId);
    }

    writeSnapshot({
      ...snapshot,
      entries: upsertEntry(snapshot.entries, {
        ...currentEntry,
        routines: {
          ...currentEntry.routines,
          [routineId]: {
            completedExerciseIds: Array.from(ids),
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    });
  },

  async saveNote(date, note): Promise<void> {
    const snapshot = readSnapshot();
    const currentEntry = snapshot.entries.find((entry) => entry.date === date) ?? createEmptyEntry(date);

    writeSnapshot({
      ...snapshot,
      entries: upsertEntry(snapshot.entries, {
        ...currentEntry,
        note: {
          ...note,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  },
};
