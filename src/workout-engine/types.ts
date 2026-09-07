import type {
  DifficultyRating,
  FormQuality,
  Side,
  TempoPhase,
} from '@/types';

export const SNAPSHOT_VERSION = 1 as const;

export type StateKind =
  | 'idle'
  | 'pre_set_countdown'
  | 'set_active'
  | 'set_complete'
  | 'resting'
  | 'exercise_complete'
  | 'exercise_transition'
  | 'workout_complete'
  | 'paused';

export type EngineSnapshotV1 = {
  version: typeof SNAPSHOT_VERSION;
  sessionId: string;
  kind: StateKind;
  pausedKind: StateKind | null;
  exerciseIndex: number;
  setIndex: number;
  actualTargets: number[][];
  prescribedTargets: number[][];
  elapsedInSegment: number;
  segmentDuration: number;
  restPlanned: number;
  wallClockAt: number;
  startedAtWall: number;
  exerciseSessionIds: string[];
  ratings: Array<{
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  }>;
  lastLoggedSetKey: string;
  status: 'in_progress' | 'completed' | 'aborted';
};

export type WorkoutView = {
  kind: StateKind;
  pausedKind: StateKind | null;
  sessionId: string;
  programName: string;
  exerciseName: string;
  exerciseIndex: number;
  exerciseCount: number;
  setIndex: number;
  setCount: number;
  prescribedTarget: number;
  actualTarget: number;
  currentRep: number;
  currentRepDisplay: number;
  targetDisplay: number;
  phase: TempoPhase | null;
  side: Side | undefined;
  tempoLabel: string;
  tempoCompact: string;
  countdown: number | null;
  restRemaining: number;
  restTotal: number;
  approaching: boolean;
  nextExerciseName: string | null;
  nextSetIndex: number;
  nextTarget: number;
  elapsedWorkoutMs: number;
  canRate: boolean;
  rating: {
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  };
  resistanceLabel: string;
  laterality: 'bilateral' | 'unilateral';
  setCompleteReps: number;
  workoutComplete: boolean;
};

export function parseSnapshot(json: string): EngineSnapshotV1 | null {
  try {
    const data = JSON.parse(json) as EngineSnapshotV1;
    if (data.version !== SNAPSHOT_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}
