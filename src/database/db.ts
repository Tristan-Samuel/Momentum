import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Exercise,
  ExerciseConfiguration,
  ExerciseSession,
  OutboxEntry,
  PersonalRecord,
  ProgressionState,
  SetSession,
  SyncAccount,
  WorkoutProgram,
  WorkoutSession,
} from '@/types';

export class MomentumDB extends Dexie {
  workoutPrograms!: EntityTable<WorkoutProgram, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  exerciseConfigurations!: EntityTable<ExerciseConfiguration, 'id'>;
  progressionStates!: EntityTable<ProgressionState, 'id'>;
  workoutSessions!: EntityTable<WorkoutSession, 'id'>;
  exerciseSessions!: EntityTable<ExerciseSession, 'id'>;
  setSessions!: EntityTable<SetSession, 'id'>;
  personalRecords!: EntityTable<PersonalRecord, 'id'>;
  appSettings!: EntityTable<AppSettings, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'key'>;
  syncState!: EntityTable<SyncAccount, 'id'>;

  constructor() {
    super('momentum');
    this.version(1).stores({
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
    this.version(2)
      .stores({
        workoutPrograms: 'id, name, updatedAt, order',
        outbox: 'key, queuedAt',
        syncState: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('workoutPrograms')
          .toCollection()
          .modify((program: Partial<WorkoutProgram>) => {
            if (program.order == null) program.order = 0;
          });
        await tx
          .table('exerciseConfigurations')
          .toCollection()
          .modify((config: Partial<ExerciseConfiguration>) => {
            if (!config.measure) config.measure = 'reps';
            if (!config.progressionStep) config.progressionStep = 1;
          });
        await tx
          .table('appSettings')
          .toCollection()
          .modify((settings: Partial<AppSettings>) => {
            if (!settings.weeklyGoal) settings.weeklyGoal = 3;
          });
      });
  }
}

export const db = new MomentumDB();
