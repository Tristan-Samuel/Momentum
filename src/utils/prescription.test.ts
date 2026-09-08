import { describe, expect, it } from 'vitest';
import type { ProgramExercise } from '@/types';
import {
  formatRepList,
  formatSetRepPreview,
  formatTodayPlan,
  targetsForExercise,
} from '@/utils/prescription';
import { restAlertKey } from '@/platform/notifications';

function exercise(partial: Partial<ProgramExercise> & Pick<ProgramExercise, 'sets' | 'minReps' | 'laterality'>): ProgramExercise {
  const stamp = '2026-01-01T00:00:00.000Z';
  return {
    id: 'config-1',
    programId: 'p1',
    exerciseId: 'ex1',
    order: 0,
    maxReps: 10,
    tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
    restAfterSetSeconds: 150,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    progressionType: 'rep-range',
    unilateralOrder: 'right-then-left',
    resistanceLabel: 'Bodyweight',
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: 'local',
    exercise: { id: 'ex1', name: 'Chin-Up', createdAt: stamp, updatedAt: stamp, syncStatus: 'local' },
    progression: {
      id: 'prog-1',
      exerciseId: 'ex1',
      resistanceLabel: 'Bodyweight',
      currentTargets: [8, 8],
      lastCompletedReps: [],
      lastRir: null,
      lastDifficultyRating: null,
      lastFormQuality: null,
      recommendedNextTargets: [8, 8],
      recommendedResistanceChange: null,
      personalBestReps: 0,
      personalBestDate: null,
      lastWorkoutDate: null,
      lifetimeReps: 0,
      lifetimeSets: 0,
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local',
    },
    ...partial,
  };
}

describe('prescription labels', () => {
  it('fills missing targets from the first set or the minimum', () => {
    expect(targetsForExercise(exercise({ sets: 2, minReps: 6, laterality: 'bilateral' }))).toEqual([
      8, 8,
    ]);
    expect(
      targetsForExercise(
        exercise({
          sets: 3,
          minReps: 6,
          laterality: 'bilateral',
          progression: {
            ...exercise({ sets: 3, minReps: 6, laterality: 'bilateral' }).progression,
            currentTargets: [9],
          },
        }),
      ),
    ).toEqual([9, 9, 9]);
  });

  it('collapses matching sets and keeps mixed sets visible', () => {
    expect(formatRepList([8, 8])).toBe('8');
    expect(formatRepList([9, 8])).toBe('9, 8');
    expect(formatSetRepPreview(exercise({ sets: 2, minReps: 6, laterality: 'bilateral' }))).toBe(
      '2 × 8',
    );
    expect(formatSetRepPreview(exercise({ sets: 2, minReps: 5, laterality: 'unilateral' }))).toBe(
      '2 × 8 per side',
    );
  });

  it('includes range and RIR in the home-card plan', () => {
    expect(formatTodayPlan(exercise({ sets: 2, minReps: 6, maxReps: 10, laterality: 'bilateral' }))).toBe(
      '2 × 8 · range 6–10 · RIR 1–2',
    );
  });
});

describe('rest alerts', () => {
  it('keys rest and transition segments so a longer rest reschedules', () => {
    expect(
      restAlertKey({ kind: 'set_active', exerciseIndex: 0, setIndex: 0, restTotal: 150 }),
    ).toBeNull();
    expect(
      restAlertKey({ kind: 'resting', exerciseIndex: 0, setIndex: 1, restTotal: 150 }),
    ).toBe('resting:0:1:150');
    expect(
      restAlertKey({ kind: 'exercise_transition', exerciseIndex: 1, setIndex: 0, restTotal: 30 }),
    ).toBe('exercise_transition:1:0:30');
  });
});
