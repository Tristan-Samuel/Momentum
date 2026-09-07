import type {
  DifficultyRating,
  ExerciseSession,
  FormQuality,
  SetSession,
} from '@/types';

export type EngineEvent =
  | { type: 'snapshot'; json: string }
  | { type: 'exercise_session'; record: ExerciseSession }
  | { type: 'set_session'; record: SetSession }
  | {
      type: 'exercise_rated';
      exerciseSessionId: string;
      difficultyRating: DifficultyRating | null;
      rir: number | null;
      formQuality: FormQuality | null;
    }
  | {
      type: 'exercise_complete';
      exerciseSessionId: string;
    }
  | {
      type: 'workout_finished';
      sessionId: string;
      status: 'completed' | 'aborted';
      durationMs: number;
    };
