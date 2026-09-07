import { describe, expect, it } from 'vitest';
import { evaluateProgression, weakerLegReps } from '@/progression/algorithm';

const base = {
  sets: 2,
  minReps: 6,
  maxReps: 10,
  targetRirMin: 1,
  targetRirMax: 2,
  previousCompletedReps: [],
  rating: 'good' as const,
  rir: 2,
  formQuality: 'good' as const,
  targetReduced: false,
  resistanceLabel: 'Bodyweight',
};

describe('double progression', () => {
  it('increments reps after completing the target', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [8, 7],
      completedReps: [8, 7],
    });
    expect(result.nextTargets).toEqual([9, 8]);
    expect(result.recommendation.type).toBe('hold');
  });

  it('caps at the top of the range', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [9, 8],
      completedReps: [9, 8],
    });
    expect(result.nextTargets).toEqual([10, 9]);
  });

  it('fills the second set before recommending a difficulty increase', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [10, 9],
      completedReps: [10, 9],
    });
    expect(result.nextTargets).toEqual([10, 10]);
    expect(result.recommendation.type).toBe('hold');
  });

  it('recommends a difficulty increase at the top of the range', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [10, 10],
      completedReps: [10, 10],
      rir: 2,
    });
    expect(result.recommendation.type).toBe('increase');
    expect(result.nextTargets).toEqual([7, 7]);
  });

  it('holds after too hard', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [8, 7],
      completedReps: [8, 7],
      rating: 'too_hard',
    });
    expect(result.nextTargets).toEqual([8, 7]);
    expect(result.holdReason).toMatch(/too hard/i);
  });

  it('holds when RIR is 0', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [8, 8],
      completedReps: [8, 8],
      rir: 0,
    });
    expect(result.nextTargets).toEqual([8, 8]);
  });

  it('holds when form is poor', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [8, 8],
      completedReps: [8, 8],
      formQuality: 'poor',
    });
    expect(result.recommendation.type).toBe('hold');
  });

  it('holds when a set misses the minimum', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [8, 8],
      completedReps: [8, 5],
    });
    expect(result.nextTargets).toEqual([8, 8]);
  });

  it('holds when the user reduced the target', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [10, 10],
      completedReps: [8, 8],
      targetReduced: true,
    });
    expect(result.recommendation.type).toBe('hold');
  });

  it('holds after a significant drop', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [8, 8],
      completedReps: [6, 6],
      previousCompletedReps: [9, 9],
    });
    expect(result.holdReason).toMatch(/dropped/i);
  });

  it('repeats a missed target without incrementing that set', () => {
    const result = evaluateProgression({
      ...base,
      currentTargets: [9, 8],
      completedReps: [9, 7],
    });
    expect(result.nextTargets).toEqual([10, 8]);
  });

  it('uses the weaker leg', () => {
    expect(weakerLegReps(7, 6)).toBe(6);
  });
});
