import { useMemo } from 'react';

import { getLocalDateKey, getProgressionWeek } from '../utils/date';
import { getResolvedRoutineForDate, getRoutineCompletionRatio } from '../utils/routine';
import { useMomentumStore } from '../store/useMomentumStore';
import type { RoutineId } from '../types/routine';

export function useRoutineScreenModel(routineId: RoutineId) {
  const date = getLocalDateKey();
  const programStartDate = useMomentumStore((state) => state.programStartDate);
  const entry = useMomentumStore((state) => state.entries[date]);

  return useMemo(() => {
    const routine = getResolvedRoutineForDate(routineId, programStartDate, date);
    const completedExerciseIds = entry?.routines[routineId].completedExerciseIds ?? [];
    const progressRatio = getRoutineCompletionRatio(completedExerciseIds, routine);

    return {
      currentDate: date,
      progressionWeek: getProgressionWeek(programStartDate, date) + 1,
      routine,
      completedExerciseIds,
      progressRatio,
    };
  }, [date, entry, programStartDate, routineId]);
}
