import { describe, expect, it } from 'vitest';
import { buildHeatmap, startOfWeek, weeklyStreak } from '@/utils/streak';

const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe('startOfWeek', () => {
  it('returns the Monday of the week', () => {
    const monday = startOfWeek(new Date(2026, 10, 15));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(9);
  });
});

describe('weeklyStreak', () => {
  const now = new Date(2026, 10, 11, 18);

  it('counts consecutive weeks that met the goal and ignores the unfinished current week', () => {
    const dates = [
      local(2026, 10, 26), local(2026, 10, 28),
      local(2026, 11, 2), local(2026, 11, 4),
      local(2026, 11, 10),
    ];
    const result = weeklyStreak(dates, 2, now);
    expect(result.thisWeek).toBe(1);
    expect(result.streak).toBe(2);
  });

  it('includes the current week once it meets the goal', () => {
    const dates = [local(2026, 11, 2), local(2026, 11, 4), local(2026, 11, 9), local(2026, 11, 10)];
    expect(weeklyStreak(dates, 2, now).streak).toBe(2);
  });

  it('breaks on a missed week and remembers the best run', () => {
    const dates = [
      local(2026, 10, 5), local(2026, 10, 12), local(2026, 10, 19),
      local(2026, 11, 2),
    ];
    const result = weeklyStreak(dates, 1, now);
    expect(result.streak).toBe(1);
    expect(result.bestStreak).toBe(3);
  });

  it('is zero with no workouts', () => {
    expect(weeklyStreak([], 3, now)).toEqual({ thisWeek: 0, goal: 3, streak: 0, bestStreak: 0 });
  });
});

describe('buildHeatmap', () => {
  it('builds Monday-first week columns ending this week and flags future days', () => {
    const now = new Date(2026, 10, 11, 9);
    const weeks = buildHeatmap([local(2026, 11, 10), local(2026, 11, 10, 18)], 4, now);
    expect(weeks).toHaveLength(4);
    const last = weeks[3];
    expect(last[0].date).toBe('2026-11-09');
    expect(last[1].count).toBe(2);
    expect(last[2].future).toBe(false);
    expect(last[3].future).toBe(true);
  });
});
