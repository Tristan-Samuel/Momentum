import { describe, expect, it } from 'vitest';
import { explainProgression } from '@/progression/explain';
import type { ProgressionInput } from '@/progression/algorithm';

function input(patch: Partial<ProgressionInput> = {}): ProgressionInput {
  return {
    sets: 2,
    minReps: 6,
    maxReps: 10,
    targetRirMin: 1,
    targetRirMax: 2,
    currentTargets: [8, 8],
    completedReps: [8, 8],
    previousCompletedReps: [],
    rating: null,
    rir: null,
    formQuality: null,
    targetReduced: false,
    resistanceLabel: 'Bodyweight',
    step: 1,
    ...patch,
  };
}

describe('explainProgression', () => {
  it('tells you the buttons change the next session', () => {
    expect(explainProgression(input())).toMatch(/Nothing saved yet/);
    expect(explainProgression(input())).toMatch(/next time 9/);
    expect(explainProgression(input({ rating: 'too_hard' }))).toMatch(/stays 8 instead of moving to 9/);
    expect(explainProgression(input({ rating: 'good' }))).toMatch(/Next time 9/);
    expect(explainProgression(input({ rating: 'hard' }))).toMatch(/Hard still moves/);
    expect(explainProgression(input({ rir: 0 }))).toMatch(/RIR was 0/);
    expect(explainProgression(input({ formQuality: 'poor' }))).toMatch(/Form marked poor/);
  });

  it('uses a past-tense line on review when nothing was saved', () => {
    expect(explainProgression(input(), 'reps', 'review')).toMatch(/No rating saved/);
  });
});