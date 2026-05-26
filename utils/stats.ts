import { ROUTINES } from '../data/routines';
import type { DailyEntry, RoutineId } from '../types/routine';
import type { CompletionBar, HeatmapCell, StatsSummary, StreakSummary } from '../types/stats';
import { getLocalDateKey, getPastDateKeys } from './date';
import { flattenExerciseIds, getResolvedRoutineForDate } from './routine';

const COMPLETION_SCALE = 100;

function isRoutineComplete(entry: DailyEntry | undefined, routineId: RoutineId, programStartDate: string, date: string): boolean {
  if (!entry) {
    return false;
  }

  const routine = getResolvedRoutineForDate(routineId, programStartDate, date);
  const requiredExercises = flattenExerciseIds(routine);
  if (!requiredExercises.length) {
    return false;
  }

  const completedSet = new Set(entry.routines[routineId].completedExerciseIds);
  return requiredExercises.every((exerciseId) => completedSet.has(exerciseId));
}

function getDayCompletionRatio(entry: DailyEntry | undefined, programStartDate: string, date: string): number {
  const completedRoutines = (['morning', 'night'] as const).filter((routineId) =>
    isRoutineComplete(entry, routineId, programStartDate, date)
  ).length;

  return completedRoutines / 2;
}

function calculateStreak(entries: Record<string, DailyEntry>, programStartDate: string, currentDate: string): StreakSummary {
  const sortedDates = Object.keys(entries).sort();
  let current = 0;
  let best = 0;
  let running = 0;
  let previousOrdinal: number | null = null;

  for (const date of sortedDates) {
    const ratio = getDayCompletionRatio(entries[date], programStartDate, date);
    if (ratio < 1) {
      running = 0;
      previousOrdinal = null;
      continue;
    }

    const ordinal = Date.parse(`${date}T00:00:00Z`);
    if (previousOrdinal !== null && ordinal - previousOrdinal === 24 * 60 * 60 * 1000) {
      running += 1;
    } else {
      running = 1;
    }

    previousOrdinal = ordinal;
    best = Math.max(best, running);
  }

  const recentDates = getPastDateKeys(sortedDates.length || 1, currentDate).reverse();
  for (const date of recentDates) {
    if (getDayCompletionRatio(entries[date], programStartDate, date) === 1) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, best };
}

function calculateTotalPullUps(entries: Record<string, DailyEntry>, programStartDate: string): number {
  return Object.values(entries).reduce((total, entry) => {
    const routine = getResolvedRoutineForDate('morning', programStartDate, entry.date);
    const completed = new Set(entry.routines.morning.completedExerciseIds);
    const completedPullUps = routine.sections
      .flatMap((section) => section.exercises)
      .filter((exercise) => exercise.title === 'Pull-ups' && completed.has(exercise.id))
      .reduce((sum, exercise) => sum + exercise.target, 0);

    return total + completedPullUps;
  }, 0);
}

function calculateCompletedWorkouts(entries: Record<string, DailyEntry>, programStartDate: string): number {
  return Object.values(entries).reduce((total, entry) => {
    const completedRoutines = (['morning', 'night'] as const).filter((routineId) =>
      isRoutineComplete(entry, routineId, programStartDate, entry.date)
    ).length;
    return total + completedRoutines;
  }, 0);
}

function calculateWeeklyCompletion(entries: Record<string, DailyEntry>, programStartDate: string, currentDate: string): number {
  const weekDates = getPastDateKeys(7, currentDate);
  const completedSlots = weekDates.reduce((total, date) => {
    const entry = entries[date];
    const completedRoutines = (['morning', 'night'] as const).filter((routineId) =>
      isRoutineComplete(entry, routineId, programStartDate, date)
    ).length;
    return total + completedRoutines;
  }, 0);

  return Math.round((completedSlots / 14) * COMPLETION_SCALE);
}

function buildHeatmap(entries: Record<string, DailyEntry>, programStartDate: string, currentDate: string): HeatmapCell[] {
  return getPastDateKeys(28, currentDate).map((date) => ({
    date,
    ratio: getDayCompletionRatio(entries[date], programStartDate, date),
  }));
}

function buildCompletionBars(entries: Record<string, DailyEntry>, programStartDate: string, currentDate: string): CompletionBar[] {
  return getPastDateKeys(7, currentDate).map((date) => ({
    date,
    label: date.slice(5),
    ratio: getDayCompletionRatio(entries[date], programStartDate, date),
  }));
}

export function buildStatsSummary(
  entries: Record<string, DailyEntry>,
  programStartDate: string,
  currentDate: string = getLocalDateKey()
): StatsSummary {
  return {
    totalWorkoutsCompleted: calculateCompletedWorkouts(entries, programStartDate),
    totalPullUpsCompleted: calculateTotalPullUps(entries, programStartDate),
    weeklyCompletionPercentage: calculateWeeklyCompletion(entries, programStartDate, currentDate),
    streaks: calculateStreak(entries, programStartDate, currentDate),
    heatmap: buildHeatmap(entries, programStartDate, currentDate),
    completionBars: buildCompletionBars(entries, programStartDate, currentDate),
  };
}
