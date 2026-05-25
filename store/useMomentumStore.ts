import { create } from 'zustand';

import { DEFAULT_REMINDERS } from '../data/routines';
import { notificationService } from '../services/notificationService';
import { persistenceService } from '../services/persistenceService';
import type { DailyEntry, DailyNoteState, RoutineId, ScreenId } from '../types/routine';
import { getLocalDateKey } from '../utils/date';

interface MomentumState {
  activeScreen: ScreenId;
  entries: Record<string, DailyEntry>;
  initialized: boolean;
  isLoading: boolean;
  error?: string;
  programStartDate: string;
  initializeApp: () => Promise<void>;
  setActiveScreen: (screen: ScreenId) => void;
  toggleExercise: (routineId: RoutineId, exerciseId: string) => Promise<void>;
  saveNote: (note: DailyNoteState) => Promise<void>;
}

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

function normalizeEntry(entry: DailyEntry): DailyEntry {
  return {
    ...entry,
    routines: {
      morning: {
        ...entry.routines.morning,
        completedExerciseIds: Array.from(new Set(entry.routines.morning.completedExerciseIds)).sort(),
      },
      night: {
        ...entry.routines.night,
        completedExerciseIds: Array.from(new Set(entry.routines.night.completedExerciseIds)).sort(),
      },
    },
    note: {
      ...entry.note,
      tags: Array.from(new Set(entry.note.tags)),
    },
  };
}

function upsertEntry(entries: Record<string, DailyEntry>, date: string, nextEntry: DailyEntry): Record<string, DailyEntry> {
  return {
    ...entries,
    [date]: normalizeEntry(nextEntry),
  };
}

export const useMomentumStore = create<MomentumState>((set, get) => ({
  activeScreen: 'morning',
  entries: {},
  initialized: false,
  isLoading: false,
  programStartDate: getLocalDateKey(),

  initializeApp: async () => {
    if (get().initialized || get().isLoading) {
      return;
    }

    set({ isLoading: true, error: undefined });

    try {
      const snapshot = await persistenceService.initialize();
      const entries = snapshot.entries.reduce<Record<string, DailyEntry>>((accumulator, entry) => {
        accumulator[entry.date] = normalizeEntry(entry);
        return accumulator;
      }, {});

      set({
        entries,
        initialized: true,
        isLoading: false,
        programStartDate: snapshot.programStartDate,
      });

      await notificationService.initialize();
      await notificationService.scheduleDefaultReminders(DEFAULT_REMINDERS);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Momentum could not load your saved routine.',
        isLoading: false,
      });
    }
  },

  setActiveScreen: (activeScreen) => set({ activeScreen }),

  toggleExercise: async (routineId, exerciseId) => {
    const date = getLocalDateKey();
    const currentEntries = get().entries;
    const currentEntry = currentEntries[date] ?? createEmptyEntry(date);
    const currentIds = new Set(currentEntry.routines[routineId].completedExerciseIds);
    const completed = !currentIds.has(exerciseId);

    if (completed) {
      currentIds.add(exerciseId);
    } else {
      currentIds.delete(exerciseId);
    }

    const nextEntry: DailyEntry = {
      ...currentEntry,
      routines: {
        ...currentEntry.routines,
        [routineId]: {
          completedExerciseIds: Array.from(currentIds),
          updatedAt: new Date().toISOString(),
        },
      },
    };

    set({
      entries: upsertEntry(currentEntries, date, nextEntry),
    });

    try {
      await persistenceService.saveExerciseCompletion({ date, routineId, exerciseId, completed });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Momentum could not save your routine progress.',
      });
    }
  },

  saveNote: async (note) => {
    const date = getLocalDateKey();
    const currentEntries = get().entries;
    const currentEntry = currentEntries[date] ?? createEmptyEntry(date);
    const nextEntry: DailyEntry = {
      ...currentEntry,
      note: {
        ...note,
        updatedAt: new Date().toISOString(),
      },
    };

    set({
      entries: upsertEntry(currentEntries, date, nextEntry),
    });

    try {
      await persistenceService.saveNote(date, nextEntry.note);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Momentum could not save your note.',
      });
    }
  },
}));
