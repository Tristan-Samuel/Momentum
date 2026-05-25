import type { DailyEntry, DailyNoteState, PersistedSnapshot, ReminderConfig, RoutineId } from './routine';

export interface PersistenceService {
  initialize(): Promise<PersistedSnapshot>;
  saveExerciseCompletion(input: {
    date: string;
    routineId: RoutineId;
    exerciseId: string;
    completed: boolean;
  }): Promise<void>;
  saveNote(date: string, note: DailyNoteState): Promise<void>;
}

export interface NotificationService {
  initialize(): Promise<void>;
  scheduleDefaultReminders(reminders: ReminderConfig[]): Promise<void>;
}

export interface HealthIntegrationService {
  syncDailyMetrics(entry: DailyEntry): Promise<void>;
}

export interface WidgetSyncService {
  refreshTimeline(entries: DailyEntry[]): Promise<void>;
}

export interface DeviceActivityService {
  requestShieldForMissedHabits(date: string): Promise<void>;
}

export interface CloudSyncService {
  pushSnapshot(snapshot: PersistedSnapshot): Promise<void>;
}

export interface RecommendationService {
  getDailyCoaching(entry: DailyEntry): Promise<string[]>;
}
