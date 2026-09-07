export type SyncStatus = 'local';

export type Tempo = {
  eccentric: number;
  bottomPause: number;
  concentric: number;
  topPause: number;
};

export type TempoPhase = 'eccentric' | 'bottomPause' | 'concentric' | 'topPause';

export type Laterality = 'bilateral' | 'unilateral';
export type UnilateralOrder = 'right-then-left' | 'left-then-right' | 'alternating';
export type ProgressionType = 'rep-range';
export type DifficultyRating = 'too_easy' | 'good' | 'hard' | 'too_hard';
export type FormQuality = 'good' | 'poor';
export type SoundProfile = 'minimal' | 'standard' | 'loud' | 'silent';
export type ThemePreference = 'system' | 'dark' | 'light';
export type SessionStatus = 'in_progress' | 'completed' | 'aborted' | 'discarded';
export type Side = 'right' | 'left';
export type PersonalRecordKind = 'best_set_reps' | 'best_workout_reps';

export type WorkoutProgram = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type Exercise = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type ExerciseConfiguration = {
  id: string;
  programId: string;
  exerciseId: string;
  order: number;
  sets: number;
  minReps: number;
  maxReps: number;
  tempo: Tempo;
  restAfterSetSeconds: number;
  transitionAfterExerciseSeconds: number;
  targetRirMin: number;
  targetRirMax: number;
  progressionType: ProgressionType;
  laterality: Laterality;
  unilateralOrder: UnilateralOrder;
  resistanceLabel: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type ProgressionState = {
  id: string;
  exerciseId: string;
  resistanceLabel: string;
  currentTargets: number[];
  lastCompletedReps: number[];
  lastRir: number | null;
  lastDifficultyRating: DifficultyRating | null;
  lastFormQuality: FormQuality | null;
  recommendedNextTargets: number[];
  recommendedResistanceChange: ResistanceRecommendation | null;
  personalBestReps: number;
  personalBestDate: string | null;
  lastWorkoutDate: string | null;
  lifetimeReps: number;
  lifetimeSets: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type ResistanceRecommendation = {
  type: 'increase' | 'hold' | 'decrease';
  suggestion: string;
};

export type WorkoutSession = {
  id: string;
  programId: string;
  programNameSnapshot: string;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  engineSnapshot: string | null;
  engineSnapshotAt: string | null;
  totalSets: number;
  totalReps: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type ExerciseConfigSnapshot = {
  name: string;
  sets: number;
  minReps: number;
  maxReps: number;
  tempo: Tempo;
  restAfterSetSeconds: number;
  transitionAfterExerciseSeconds: number;
  targetRirMin: number;
  targetRirMax: number;
  progressionType: ProgressionType;
  laterality: Laterality;
  unilateralOrder: UnilateralOrder;
  resistanceLabel: string;
};

export type ExerciseSession = {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  order: number;
  nameSnapshot: string;
  configSnapshot: ExerciseConfigSnapshot;
  targetRepsPerSet: number[];
  difficultyRating: DifficultyRating | null;
  rir: number | null;
  formQuality: FormQuality | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type SetSession = {
  id: string;
  workoutSessionId: string;
  exerciseSessionId: string;
  setIndex: number;
  prescribedTarget: number;
  actualTarget: number;
  completedReps: number;
  leftReps: number | null;
  rightReps: number | null;
  skipped: boolean;
  targetReduced: boolean;
  tempoSnapshot: Tempo;
  restSecondsPlanned: number | null;
  restSecondsActual: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type PersonalRecord = {
  id: string;
  exerciseId: string;
  kind: PersonalRecordKind;
  value: number;
  resistanceLabel: string;
  achievedAt: string;
  workoutSessionId: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type AppSettings = {
  id: 'app';
  theme: ThemePreference;
  soundProfile: SoundProfile;
  volume: number;
  soundsEnabled: boolean;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
  keepAwake: boolean;
  defaultTransitionSeconds: number;
  defaultUnilateralOrder: UnilateralOrder;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type ProgramExercise = ExerciseConfiguration & {
  exercise: Exercise;
  progression: ProgressionState;
};

export type PreparedWorkout = {
  program: WorkoutProgram;
  exercises: ProgramExercise[];
};
