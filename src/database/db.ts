import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Exercise,
  ExerciseConfiguration,
  ExerciseSession,
  PersonalRecord,
  ProgressionState,
  SetSession,
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
  }
}

export const db = new MomentumDB();
