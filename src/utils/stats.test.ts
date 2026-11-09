import { describe, expect, it } from 'vitest';
import type { SetSession } from '@/types';
import {
  compareSets,
  formatDelta,
  previousRowBefore,
  prTimeline,
  weeklyVolume,
  type ExerciseHistoryRow,
} from '@/utils/stats';

function row(sessionId: string, startedAt: string, reps: number[], label = 'Bodyweight'): ExerciseHistoryRow {
  const sets = reps.map(
    (completedReps, setIndex) =>
      ({ id: `${sessionId}-${setIndex}`, setIndex, completedReps, skipped: false, leftReps: null, rightReps: null }) as SetSession,
  );
  return {
    session: { id: sessionId, startedAt } as ExerciseHistoryRow['session'],
    exercise: { configSnapshot: { resistanceLabel: label } } as ExerciseHistoryRow['exercise'],
    sets,
  };
}

describe('weeklyVolume', () => {
  it('buckets amounts into Monday weeks ending this week', () => {
    const now = new Date(2026, 10, 11, 12);
    const bars = weeklyVolume(
      [
        { startedAt: new Date(2026, 10, 10).toISOString(), amount: 20 },
        { startedAt: new Date(2026, 10, 9).toISOString(), amount: 5 },
        { startedAt: new Date(2026, 10, 4).toISOString(), amount: 12 },
      ],
      3,
      now,
    );
    expect(bars.map((bar) => bar.value)).toEqual([0, 12, 25]);
    expect(bars[2].highlight).toBe(true);
  });
});

describe('prTimeline', () => {
  it('lists each new best set, newest first', () => {
    const events = prTimeline([
      row('a', '2026-11-01', [8, 7]),
      row('b', '2026-11-03', [8, 8]),
      row('c', '2026-11-05', [9, 8], '+5 lb'),
    ]);
    expect(events.map((event) => [event.sessionId, event.value, event.previous])).toEqual([
      ['c', 9, 8],
      ['a', 8, 0],
    ]);
    expect(events[0].resistanceLabel).toBe('+5 lb');
  });
});

describe('compareSets', () => {
  it('returns per-set and total deltas against the previous session', () => {
    expect(compareSets([9, 8], [8, 8])).toEqual({
      deltas: [1, 0],
      totalDelta: 1,
      previousTotal: 16,
      sameResistance: true,
    });
    expect(compareSets([9], null).totalDelta).toBeNull();
    expect(formatDelta(2)).toBe('+2');
    expect(formatDelta(-3, 's')).toBe('−3s');
  });

  it('finds the row before a session', () => {
    const history = [row('b', '2026-11-03', [8]), row('a', '2026-11-01', [7])];
    expect(previousRowBefore(history, 'b')?.session.id).toBe('a');
    expect(previousRowBefore(history, 'a')).toBeNull();
  });
});
