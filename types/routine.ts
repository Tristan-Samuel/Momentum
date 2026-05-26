export type ScreenId = 'morning' | 'night' | 'notes' | 'stats';
export type RoutineId = 'morning' | 'night';
export type ExerciseUnit = 'reps' | 'seconds';
export type NoteTag = 'difficult' | 'easy' | 'tired';

export interface ExerciseDefinition {
  id: string;
  title: string;
  baseTarget: number;
  incrementPerWeek: number;
  unit: ExerciseUnit;
}

export interface RoutineSectionDefinition {
  id: string;
  title: string;
  exercises: ExerciseDefinition[];
}

export interface RoutineDefinition {
  id: RoutineId;
  title: string;
  description: string;
  sections: RoutineSectionDefinition[];
}

export interface ResolvedExercise extends ExerciseDefinition {
  target: number;
  targetLabel: string;
}

export interface ResolvedRoutineSection extends Omit<RoutineSectionDefinition, 'exercises'> {
  exercises: ResolvedExercise[];
}

export interface ResolvedRoutine extends Omit<RoutineDefinition, 'sections'> {
  sections: ResolvedRoutineSection[];
}

export interface RoutineProgressState {
  completedExerciseIds: string[];
  updatedAt?: string;
}

export interface DailyNoteState {
  tags: NoteTag[];
  text: string;
  updatedAt?: string;
}

export interface DailyEntry {
  date: string;
  routines: Record<RoutineId, RoutineProgressState>;
  note: DailyNoteState;
}

export interface PersistedSnapshot {
  programStartDate: string;
  entries: DailyEntry[];
}

export interface ReminderConfig {
  id: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
}
