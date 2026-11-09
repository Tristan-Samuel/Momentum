import { useLiveQuery } from 'dexie-react-hooks';
import * as repo from '@/database/repository';
import type { ProgressionState } from '@/types';
import { completedAmounts, previousRowBefore, prTimeline } from '@/utils/stats';

export type ExerciseInsight = {
  progression: ProgressionState | undefined;
  previous: number[] | null;
  sameResistance: boolean;
  isPr: boolean;
  bestThisSession: number;
};

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof repo.getSessionDetail>>>;

export function useSessionDetail(sessionId: string | undefined) {
  return useLiveQuery(
    () => (sessionId ? repo.getSessionDetail(sessionId) : Promise.resolve(null)),
    [sessionId],
  );
}

export function useSessionInsights(detail: SessionDetail | null | undefined) {
  return useLiveQuery(async () => {
    const insights = new Map<string, ExerciseInsight>();
    if (!detail) return insights;
    for (const { exercise, sets } of detail.exercises) {
      const progression = await repo.getProgression(exercise.exerciseId);
      const history = await repo.getExerciseHistory(exercise.exerciseId);
      const prev = previousRowBefore(history, detail.session.id);
      const pr = prTimeline(history).find((event) => event.sessionId === detail.session.id);
      insights.set(exercise.id, {
        progression,
        previous: prev ? completedAmounts(prev.sets) : null,
        sameResistance: prev
          ? prev.exercise.configSnapshot.resistanceLabel === exercise.configSnapshot.resistanceLabel
          : true,
        isPr: Boolean(pr && pr.previous > 0),
        bestThisSession: Math.max(0, ...completedAmounts(sets)),
      });
    }
    return insights;
  }, [detail]);
}
