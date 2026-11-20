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
import { installOutboxHooks } from '@/sync/outbox';
import { resolveLoad } from '@/utils/load';
import { inferStartPosition } from '@/utils/tempo';

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
    this.version(3).upgrade(async (tx) => {
      const exercises = await tx.table('exercises').toArray();
      const names = new Map(exercises.map((row: Exercise) => [row.id, row.name]));
      await tx
        .table('exerciseConfigurations')
        .toCollection()
        .modify((config: Partial<ExerciseConfiguration>) => {
          if (!config.startPosition) {
            config.startPosition = inferStartPosition(names.get(config.exerciseId ?? '') ?? '');
          }
        });
    });
    this.version(4).upgrade(async (tx) => {
      await tx
        .table('exerciseConfigurations')
        .toCollection()
        .modify((config: Partial<ExerciseConfiguration> & { resistanceLabel?: string }) => {
          const load = resolveLoad(config);
          if (!config.cueMode) config.cueMode = load.cueMode;
          if (!config.loadKind) config.loadKind = load.loadKind;
          if (config.load === undefined) config.load = load.load;
          if (!config.loadUnit) config.loadUnit = load.loadUnit;
          if (!config.loadStep) config.loadStep = load.loadStep;
          if (!config.loadPer) config.loadPer = load.loadPer;
        });
      await tx
        .table('progressionStates')
        .toCollection()
        .modify((row: Partial<ProgressionState> & { resistanceLabel?: string }) => {
          const load = resolveLoad(row);
          if (!row.cueMode) row.cueMode = load.cueMode;
          if (!row.loadKind) row.loadKind = load.loadKind;
          if (row.load === undefined) row.load = load.load;
          if (!row.loadUnit) row.loadUnit = load.loadUnit;
          if (!row.loadStep) row.loadStep = load.loadStep;
          if (!row.loadPer) row.loadPer = load.loadPer;
        });
      await tx
        .table('appSettings')
        .toCollection()
        .modify((settings: Partial<AppSettings>) => {
          if (!settings.weightUnit) settings.weightUnit = 'lb';
        });
    });
  }
}

export const db = new MomentumDB();
installOutboxHooks(db);
