import { LIBRARY_EXERCISES, libraryExerciseById, type LibraryExercise } from '@/library/catalog';

export type LibraryProgram = {
  id: string;
  name: string;
  summary: string;
  exerciseIds: string[];
};

export const LIBRARY_PROGRAMS: LibraryProgram[] = [
  {
    id: 'full-body',
    name: 'Full Body',
    summary: 'Squat, bench, row, and a hinge.',
    exerciseIds: ['back-squat', 'bench-press', 'barbell-row', 'romanian-deadlift'],
  },
  {
    id: 'push',
    name: 'Push',
    summary: 'Presses, a raise, and triceps.',
    exerciseIds: ['bench-press', 'overhead-press', 'incline-dumbbell-press', 'lateral-raise', 'triceps-pushdown'],
  },
  {
    id: 'pull',
    name: 'Pull',
    summary: 'A vertical pull, a row, and curls.',
    exerciseIds: ['pull-up', 'barbell-row', 'face-pull', 'barbell-curl', 'hammer-curl'],
  },
  {
    id: 'legs',
    name: 'Legs',
    summary: 'Squat, hinge, single-leg, and calves.',
    exerciseIds: ['back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'standing-calf-raise'],
  },
];

export function exercisesForProgram(program: LibraryProgram): LibraryExercise[] {
  return program.exerciseIds.map((id) => {
    const entry = libraryExerciseById(id);
    if (!entry) throw new Error(`Missing library exercise ${id}`);
    return entry;
  });
}

export function libraryProgramIdsExist(): boolean {
  return LIBRARY_PROGRAMS.every((program) =>
    program.exerciseIds.every((id) => LIBRARY_EXERCISES.some((entry) => entry.id === id)),
  );
}
