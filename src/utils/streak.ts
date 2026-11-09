import type { HeatmapDay } from '@/components/ui/CalendarHeatmap';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export type WeekStreak = {
  thisWeek: number;
  goal: number;
  streak: number;
  bestStreak: number;
};

export function weeklyStreak(sessionDates: string[], goal: number, now = new Date()): WeekStreak {
  const safeGoal = Math.max(1, Math.round(goal));
  const counts = new Map<string, number>();
  let earliest: Date | null = null;
  for (const iso of sessionDates) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(startOfWeek(date));
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!earliest || date < earliest) earliest = date;
  }
  const current = startOfWeek(now);
  const thisWeek = counts.get(dayKey(current)) ?? 0;

  let streak = thisWeek >= safeGoal ? 1 : 0;
  let cursor = addDays(current, -7);
  while ((counts.get(dayKey(cursor)) ?? 0) >= safeGoal) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }

  let bestStreak = 0;
  if (earliest) {
    let run = 0;
    for (let week = startOfWeek(earliest); week <= current; week = addDays(week, 7)) {
      if ((counts.get(dayKey(week)) ?? 0) >= safeGoal) {
        run += 1;
        bestStreak = Math.max(bestStreak, run);
      } else if (dayKey(week) !== dayKey(current)) {
        run = 0;
      }
    }
  }

  return { thisWeek, goal: safeGoal, streak, bestStreak: Math.max(bestStreak, streak) };
}

export function buildHeatmap(sessionDates: string[], weeks = 12, now = new Date()): HeatmapDay[][] {
  const counts = new Map<string, number>();
  for (const iso of sessionDates) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = addDays(startOfWeek(now), -7 * (weeks - 1));
  const columns: HeatmapDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const key = dayKey(date);
      column.push({
        date: key,
        count: counts.get(key) ?? 0,
        future: date.getTime() > today.getTime() + DAY_MS / 2,
      });
    }
    columns.push(column);
  }
  return columns;
}
