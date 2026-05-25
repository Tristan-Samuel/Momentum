import { ROUTINES } from '../data/routines';
import type { ExerciseUnit, ResolvedExercise, ResolvedRoutine, RoutineDefinition, RoutineId } from '../types/routine';
import { getProgressionWeek } from './date';

function formatTarget(value: number, unit: ExerciseUnit): string {
  return unit === 'seconds' ? `${value} sec` : `×${value}`;
}

export function resolveRoutineTargets(routine: RoutineDefinition, progressionWeek: number): ResolvedRoutine {
  return {
    ...routine,
    sections: routine.sections.map((section) => ({
      ...section,
      exercises: section.exercises.map<ResolvedExercise>((exercise) => {
        const target = exercise.baseTarget + exercise.incrementPerWeek * progressionWeek;
        return {
          ...exercise,
          target,
          targetLabel: formatTarget(target, exercise.unit),
        };
      }),
    })),
  };
}

export function getResolvedRoutineForDate(
  routineId: RoutineId,
  programStartDate: string,
  date: string
): ResolvedRoutine {
  return resolveRoutineTargets(ROUTINES[routineId], getProgressionWeek(programStartDate, date));
}

export function flattenExerciseIds(routine: ResolvedRoutine): string[] {
  return routine.sections.flatMap((section) => section.exercises.map((exercise) => exercise.id));
}

export function getRoutineCompletionRatio(completedExerciseIds: string[], routine: ResolvedRoutine): number {
  const totalExercises = flattenExerciseIds(routine).length;
  if (!totalExercises) {
    return 0;
  }

  return completedExerciseIds.length / totalExercises;
}
