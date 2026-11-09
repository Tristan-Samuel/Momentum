import type { ExerciseSession, SetSession, WorkoutSession } from '@/types';
import { weakerLegReps } from '@/progression/algorithm';
import { dayKey, startOfWeek } from '@/utils/streak';

export type ExerciseHistoryRow = {
  session: WorkoutSession;
  exercise: ExerciseSession;
  sets: SetSession[];
};

export function workingAmount(set: SetSession): number {
  if (set.skipped) return 0;
  if (set.leftReps != null || set.rightReps != null) {
    return weakerLegReps(set.leftReps, set.rightReps);
  }
  return set.completedReps;
}

export function completedAmounts(sets: SetSession[]): number[] {
  return sets.filter((set) => !set.skipped).map(workingAmount);
}

export type WeekBar = { label: string; value: number; weekStart: string; highlight: boolean };

export function weeklyVolume(
  rows: Array<{ startedAt: string; amount: number }>,
  weeks = 12,
  now = new Date(),
): WeekBar[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const date = new Date(row.startedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(startOfWeek(date));
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }
  const current = startOfWeek(now);
  const bars: WeekBar[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = new Date(current);
    week.setDate(week.getDate() - i * 7);
    const key = dayKey(week);
    bars.push({
      label: week.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: totals.get(key) ?? 0,
      weekStart: key,
      highlight: i === 0,
    });
  }
  return bars;
}

export type PrEvent = {
  sessionId: string;
  date: string;
  value: number;
  previous: number;
  resistanceLabel: string;
};

export function prTimeline(history: ExerciseHistoryRow[]): PrEvent[] {
  const ordered = history
    .slice()
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
  const events: PrEvent[] = [];
  let best = 0;
  for (const row of ordered) {
    const top = Math.max(0, ...completedAmounts(row.sets));
    if (top > best) {
      events.push({
        sessionId: row.session.id,
        date: row.session.startedAt,
        value: top,
        previous: best,
        resistanceLabel: row.exercise.configSnapshot.resistanceLabel,
      });
      best = top;
    }
  }
  return events.reverse();
}

export type SetComparison = {
  deltas: Array<number | null>;
  totalDelta: number | null;
  previousTotal: number | null;
  sameResistance: boolean;
};

export function compareSets(
  current: number[],
  previous: number[] | null,
  options: { sameResistance?: boolean } = {},
): SetComparison {
  if (!previous || previous.length === 0) {
    return { deltas: current.map(() => null), totalDelta: null, previousTotal: null, sameResistance: true };
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    deltas: current.map((value, index) => (previous[index] == null ? null : value - previous[index])),
    totalDelta: sum(current) - sum(previous),
    previousTotal: sum(previous),
    sameResistance: options.sameResistance ?? true,
  };
}

export function previousRowBefore(
  history: ExerciseHistoryRow[],
  sessionId: string,
): ExerciseHistoryRow | null {
  const ordered = history
    .slice()
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
  const index = ordered.findIndex((row) => row.session.id === sessionId);
  if (index <= 0) return null;
  return ordered[index - 1];
}

export function formatDelta(delta: number | null, unit = ''): string {
  if (delta == null) return '';
  if (delta === 0) return `±0${unit}`;
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}${unit}`;
}

export function parseResistanceWeight(label: string): number | null {
  const match = label.match(/([+-]?\d+(?:\.\d+)?)\s*(lb|lbs|kg)?/i);
  if (!match) return null;
  if (/bodyweight/i.test(label) && !match) return 0;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  return value;
}

export function isWeightedLabel(label: string): boolean {
  return parseResistanceWeight(label) !== null && !/^bodyweight$/i.test(label.trim());
}

export function linearTrend(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
