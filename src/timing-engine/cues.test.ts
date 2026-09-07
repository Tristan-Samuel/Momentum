import { describe, expect, it } from 'vitest';
import {
  buildCountdownCues,
  buildRepPlan,
  buildRestCues,
  buildSetCues,
  progressAt,
} from '@/timing-engine/cues';

describe('rep plan', () => {
  it('builds bilateral reps', () => {
    const plan = buildRepPlan({
      laterality: 'bilateral',
      unilateralOrder: 'right-then-left',
      target: 8,
    });
    expect(plan).toHaveLength(8);
    expect(plan[0].side).toBeUndefined();
  });

  it('runs pistol squats right then left', () => {
    const plan = buildRepPlan({
      laterality: 'unilateral',
      unilateralOrder: 'right-then-left',
      target: 6,
    });
    expect(plan).toHaveLength(12);
    expect(plan[0].side).toBe('right');
    expect(plan[5].side).toBe('right');
    expect(plan[6].side).toBe('left');
    expect(plan[11].repOnSide).toBe(6);
  });

  it('alternates legs', () => {
    const plan = buildRepPlan({
      laterality: 'unilateral',
      unilateralOrder: 'alternating',
      target: 2,
    });
    expect(plan.map((slot) => slot.side)).toEqual(['right', 'left', 'right', 'left']);
  });
});

describe('set cues', () => {
  const tempo = { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 };

  it('ticks each eccentric second then phase-beeps', () => {
    const plan = buildRepPlan({
      laterality: 'bilateral',
      unilateralOrder: 'right-then-left',
      target: 1,
    });
    const { cues, duration } = buildSetCues(tempo, plan, 0);
    expect(duration).toBe(4);
    const kinds = cues.map((cue) => cue.kind);
    expect(kinds.filter((kind) => kind === 'tick')).toHaveLength(3);
    expect(kinds).toContain('phase_beep');
    expect(kinds.at(-1)).toBe('set_complete');
  });

  it('accounts for a bottom pause', () => {
    const plan = buildRepPlan({
      laterality: 'bilateral',
      unilateralOrder: 'right-then-left',
      target: 1,
    });
    const { duration } = buildSetCues(
      { eccentric: 3, bottomPause: 1, concentric: 1, topPause: 0 },
      plan,
      0,
    );
    expect(duration).toBe(5);
  });

  it('counts reps from elapsed time', () => {
    const plan = buildRepPlan({
      laterality: 'bilateral',
      unilateralOrder: 'right-then-left',
      target: 8,
    });
    expect(progressAt(0, tempo, plan).slot?.repOnSide).toBe(1);
    expect(progressAt(4, tempo, plan).slot?.repOnSide).toBe(2);
    expect(progressAt(31.9, tempo, plan).complete).toBe(false);
    expect(progressAt(32, tempo, plan).complete).toBe(true);
  });
});

describe('rest and countdown cues', () => {
  it('counts 3-2-1 then start', () => {
    const { cues, duration } = buildCountdownCues(0);
    expect(duration).toBe(3);
    expect(cues.map((cue) => cue.kind)).toEqual(['countdown', 'countdown', 'countdown', 'start']);
  });

  it('warns in the final 5 seconds of rest', () => {
    const cues = buildRestCues(0, 150);
    expect(cues.some((cue) => cue.kind === 'warning' && cue.at === 145)).toBe(true);
    expect(cues.at(-1)).toMatchObject({ kind: 'start', at: 150 });
  });
});
