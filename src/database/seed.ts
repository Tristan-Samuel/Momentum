import type {
  AppSettings,
  Exercise,
  ExerciseConfiguration,
  ProgressionState,
  WorkoutProgram,
} from '@/types';
import { midpointTarget } from '@/utils/id';

export const PROGRAM_ID = 'program-minimalist-strength';
export const SETTINGS_ID = 'app' as const;

const STAMP = '2026-01-01T00:00:00.000Z';

function targets(sets: number, minReps: number, maxReps: number): number[] {
  const value = midpointTarget(minReps, maxReps);
  return Array.from({ length: sets }, () => value);
}

export const DEFAULT_PROGRAM: WorkoutProgram = {
  id: PROGRAM_ID,
  name: 'Minimalist Strength',
  createdAt: STAMP,
  updatedAt: STAMP,
  syncStatus: 'local',
};

export const DEFAULT_EXERCISES: Exercise[] = [
  {
    id: 'exercise-l-sit-chin-up',
    name: 'L-Sit Chin-Up',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
  {
    id: 'exercise-pull-up',
    name: 'Pull-Up',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
  {
    id: 'exercise-push-up',
    name: 'Weighted / Difficult Push-Up',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
  {
    id: 'exercise-pistol-squat',
    name: 'Pistol Squat',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
];

export const DEFAULT_CONFIGS: ExerciseConfiguration[] = [
  {
    id: 'config-l-sit-chin-up',
    programId: PROGRAM_ID,
    exerciseId: 'exercise-l-sit-chin-up',
    order: 0,
    sets: 2,
    minReps: 6,
    maxReps: 10,
    tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
    restAfterSetSeconds: 150,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    progressionType: 'rep-range',
    laterality: 'bilateral',
    unilateralOrder: 'right-then-left',
    resistanceLabel: 'Bodyweight',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
  {
    id: 'config-pull-up',
    programId: PROGRAM_ID,
    exerciseId: 'exercise-pull-up',
    order: 1,
    sets: 1,
    minReps: 6,
    maxReps: 12,
    tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
    restAfterSetSeconds: 150,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    progressionType: 'rep-range',
    laterality: 'bilateral',
    unilateralOrder: 'right-then-left',
    resistanceLabel: 'Bodyweight',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
  {
    id: 'config-push-up',
    programId: PROGRAM_ID,
    exerciseId: 'exercise-push-up',
    order: 2,
    sets: 2,
    minReps: 6,
    maxReps: 12,
    tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
    restAfterSetSeconds: 120,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    progressionType: 'rep-range',
    laterality: 'bilateral',
    unilateralOrder: 'right-then-left',
    resistanceLabel: 'Bodyweight',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
  {
    id: 'config-pistol-squat',
    programId: PROGRAM_ID,
    exerciseId: 'exercise-pistol-squat',
    order: 3,
    sets: 2,
    minReps: 5,
    maxReps: 8,
    tempo: { eccentric: 3, bottomPause: 1, concentric: 1, topPause: 0 },
    restAfterSetSeconds: 150,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    progressionType: 'rep-range',
    laterality: 'unilateral',
    unilateralOrder: 'right-then-left',
    resistanceLabel: 'Bodyweight',
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  },
];

export function defaultProgression(config: ExerciseConfiguration): ProgressionState {
  const currentTargets = targets(config.sets, config.minReps, config.maxReps);
  return {
    id: `progression-${config.exerciseId}`,
    exerciseId: config.exerciseId,
    resistanceLabel: config.resistanceLabel,
    currentTargets,
    lastCompletedReps: [],
    lastRir: null,
    lastDifficultyRating: null,
    lastFormQuality: null,
    recommendedNextTargets: currentTargets,
    recommendedResistanceChange: null,
    personalBestReps: 0,
    personalBestDate: null,
    lastWorkoutDate: null,
    lifetimeReps: 0,
    lifetimeSets: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    syncStatus: 'local',
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  theme: 'system',
  soundProfile: 'standard',
  volume: 0.8,
  soundsEnabled: true,
  hapticsEnabled: true,
  notificationsEnabled: false,
  reducedMotion: false,
  largeText: false,
  highContrast: false,
  keepAwake: true,
  defaultTransitionSeconds: 30,
  defaultUnilateralOrder: 'right-then-left',
  createdAt: STAMP,
  updatedAt: STAMP,
  syncStatus: 'local',
};
