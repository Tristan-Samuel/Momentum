import type {
  CueMode,
  Laterality,
  LoadKind,
  LoadPer,
  LoadUnit,
  Measure,
  StartPosition,
  Tempo,
} from '@/types';
import { convertLoad, convertLoadStep, defaultLoadStep, labelForLoad } from '@/utils/load';

const TEMPO: Tempo = { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 };

export type LibraryEquipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';

export type LibraryGroup = 'Squat' | 'Hinge' | 'Push' | 'Pull' | 'Arms' | 'Legs' | 'Core';

export type LibraryExercise = {
  id: string;
  name: string;
  group: LibraryGroup;
  equipment: LibraryEquipment;
  cueMode: CueMode;
  loadKind: LoadKind;
  loadPer: LoadPer;
  laterality: Laterality;
  measure: Measure;
  sets: number;
  minReps: number;
  maxReps: number;
  tempo: Tempo;
  startPosition: StartPosition;
  restAfterSetSeconds: number;
  transitionAfterExerciseSeconds: number;
  targetRirMin: number;
  targetRirMax: number;
  loadStepLb: number;
  startingLoadLb: number | null;
  progressionStep: number;
};

type Draft = Pick<
  LibraryExercise,
  | 'id'
  | 'name'
  | 'group'
  | 'equipment'
  | 'sets'
  | 'minReps'
  | 'maxReps'
  | 'restAfterSetSeconds'
  | 'startPosition'
> &
  Partial<LibraryExercise>;

function exercise(draft: Draft): LibraryExercise {
  const bodyweight = draft.equipment === 'bodyweight' || draft.loadKind === 'bodyweight';
  const compound =
    draft.equipment === 'barbell' || draft.equipment === 'machine' || draft.equipment === 'cable';
  const accessory = draft.equipment === 'dumbbell' || draft.group === 'Arms' || draft.group === 'Core';
  return {
    cueMode: bodyweight || accessory || !compound ? 'tempo' : 'open',
    loadKind: bodyweight ? 'bodyweight' : 'external',
    loadPer: draft.equipment === 'dumbbell' && draft.laterality !== 'unilateral' ? 'side' : 'total',
    laterality: 'bilateral',
    measure: 'reps',
    tempo: TEMPO,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    loadStepLb: 5,
    startingLoadLb: bodyweight ? null : draft.equipment === 'barbell' ? 45 : 20,
    progressionStep: draft.measure === 'seconds' ? 5 : 1,
    ...draft,
  };
}

export const LIBRARY_GROUPS: LibraryGroup[] = ['Squat', 'Hinge', 'Push', 'Pull', 'Arms', 'Legs', 'Core'];

export const LIBRARY_EXERCISES: LibraryExercise[] = [
  exercise({ id: 'back-squat', name: 'Back Squat', group: 'Squat', equipment: 'barbell', sets: 3, minReps: 5, maxReps: 8, restAfterSetSeconds: 180, startPosition: 'top' }),
  exercise({ id: 'front-squat', name: 'Front Squat', group: 'Squat', equipment: 'barbell', sets: 3, minReps: 5, maxReps: 8, restAfterSetSeconds: 180, startPosition: 'top' }),
  exercise({ id: 'goblet-squat', name: 'Goblet Squat', group: 'Squat', equipment: 'dumbbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'top', loadPer: 'total', startingLoadLb: 25 }),
  exercise({ id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', group: 'Squat', equipment: 'dumbbell', sets: 3, minReps: 6, maxReps: 10, restAfterSetSeconds: 90, startPosition: 'top', laterality: 'unilateral', loadPer: 'side', startingLoadLb: 15 }),
  exercise({ id: 'leg-press', name: 'Leg Press', group: 'Squat', equipment: 'machine', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 150, startPosition: 'top', startingLoadLb: 90, loadStepLb: 10 }),
  exercise({ id: 'walking-lunge', name: 'Walking Lunge', group: 'Squat', equipment: 'dumbbell', sets: 2, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'top', loadPer: 'side', startingLoadLb: 15 }),
  exercise({ id: 'deadlift', name: 'Deadlift', group: 'Hinge', equipment: 'barbell', sets: 3, minReps: 3, maxReps: 5, restAfterSetSeconds: 180, startPosition: 'bottom' }),
  exercise({ id: 'romanian-deadlift', name: 'Romanian Deadlift', group: 'Hinge', equipment: 'barbell', sets: 3, minReps: 6, maxReps: 10, restAfterSetSeconds: 150, startPosition: 'top' }),
  exercise({ id: 'hip-thrust', name: 'Hip Thrust', group: 'Hinge', equipment: 'barbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 120, startPosition: 'bottom' }),
  exercise({ id: 'bench-press', name: 'Bench Press', group: 'Push', equipment: 'barbell', sets: 3, minReps: 5, maxReps: 8, restAfterSetSeconds: 180, startPosition: 'top' }),
  exercise({ id: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', group: 'Push', equipment: 'dumbbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'top', loadPer: 'side', startingLoadLb: 20 }),
  exercise({ id: 'overhead-press', name: 'Overhead Press', group: 'Push', equipment: 'barbell', sets: 3, minReps: 5, maxReps: 8, restAfterSetSeconds: 150, startPosition: 'bottom' }),
  exercise({ id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', group: 'Push', equipment: 'dumbbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'bottom', loadPer: 'side', startingLoadLb: 15 }),
  exercise({ id: 'dip', name: 'Dip', group: 'Push', equipment: 'bodyweight', sets: 3, minReps: 6, maxReps: 12, restAfterSetSeconds: 120, startPosition: 'top' }),
  exercise({ id: 'lateral-raise', name: 'Lateral Raise', group: 'Push', equipment: 'dumbbell', sets: 3, minReps: 10, maxReps: 15, restAfterSetSeconds: 60, startPosition: 'bottom', loadPer: 'side', startingLoadLb: 10 }),
  exercise({ id: 'pull-up', name: 'Pull-Up', group: 'Pull', equipment: 'bodyweight', sets: 3, minReps: 5, maxReps: 10, restAfterSetSeconds: 150, startPosition: 'bottom' }),
  exercise({ id: 'chin-up', name: 'Chin-Up', group: 'Pull', equipment: 'bodyweight', sets: 3, minReps: 5, maxReps: 10, restAfterSetSeconds: 150, startPosition: 'bottom' }),
  exercise({ id: 'lat-pulldown', name: 'Lat Pulldown', group: 'Pull', equipment: 'machine', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'top', startingLoadLb: 40 }),
  exercise({ id: 'barbell-row', name: 'Barbell Row', group: 'Pull', equipment: 'barbell', sets: 3, minReps: 6, maxReps: 10, restAfterSetSeconds: 150, startPosition: 'bottom' }),
  exercise({ id: 'one-arm-dumbbell-row', name: 'One-Arm Dumbbell Row', group: 'Pull', equipment: 'dumbbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 60, startPosition: 'bottom', laterality: 'unilateral', loadPer: 'side', startingLoadLb: 20 }),
  exercise({ id: 'seated-cable-row', name: 'Seated Cable Row', group: 'Pull', equipment: 'cable', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'bottom', startingLoadLb: 40 }),
  exercise({ id: 'face-pull', name: 'Face Pull', group: 'Pull', equipment: 'cable', sets: 3, minReps: 12, maxReps: 15, restAfterSetSeconds: 60, startPosition: 'bottom', cueMode: 'tempo', startingLoadLb: 20 }),
  exercise({ id: 'barbell-curl', name: 'Barbell Curl', group: 'Arms', equipment: 'barbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'bottom', cueMode: 'tempo', startingLoadLb: 45 }),
  exercise({ id: 'dumbbell-curl', name: 'Dumbbell Curl', group: 'Arms', equipment: 'dumbbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 60, startPosition: 'bottom', loadPer: 'side', startingLoadLb: 15 }),
  exercise({ id: 'hammer-curl', name: 'Hammer Curl', group: 'Arms', equipment: 'dumbbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 60, startPosition: 'bottom', loadPer: 'side', startingLoadLb: 15 }),
  exercise({ id: 'triceps-pushdown', name: 'Triceps Pushdown', group: 'Arms', equipment: 'cable', sets: 3, minReps: 10, maxReps: 15, restAfterSetSeconds: 60, startPosition: 'top', cueMode: 'tempo', startingLoadLb: 25 }),
  exercise({ id: 'skull-crusher', name: 'Skull Crusher', group: 'Arms', equipment: 'barbell', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 90, startPosition: 'top', cueMode: 'tempo', startingLoadLb: 45 }),
  exercise({ id: 'leg-curl', name: 'Leg Curl', group: 'Legs', equipment: 'machine', sets: 3, minReps: 8, maxReps: 12, restAfterSetSeconds: 60, startPosition: 'bottom', cueMode: 'tempo', startingLoadLb: 30 }),
  exercise({ id: 'standing-calf-raise', name: 'Standing Calf Raise', group: 'Legs', equipment: 'machine', sets: 3, minReps: 8, maxReps: 15, restAfterSetSeconds: 60, startPosition: 'bottom', cueMode: 'tempo', startingLoadLb: 45 }),
  exercise({ id: 'plank', name: 'Plank', group: 'Core', equipment: 'bodyweight', sets: 3, minReps: 20, maxReps: 60, restAfterSetSeconds: 60, startPosition: 'top', measure: 'seconds', progressionStep: 5 }),
  exercise({ id: 'hanging-leg-raise', name: 'Hanging Leg Raise', group: 'Core', equipment: 'bodyweight', sets: 3, minReps: 6, maxReps: 12, restAfterSetSeconds: 60, startPosition: 'bottom' }),
];

export function libraryExerciseById(id: string): LibraryExercise | undefined {
  return LIBRARY_EXERCISES.find((entry) => entry.id === id);
}

export function libraryExerciseInput(entry: LibraryExercise, unit: LoadUnit) {
  const load =
    entry.loadKind === 'bodyweight' || entry.startingLoadLb == null
      ? null
      : convertLoad(entry.startingLoadLb, 'lb', unit);
  const spec = {
    cueMode: entry.cueMode,
    loadKind: entry.loadKind,
    load,
    loadUnit: unit,
    loadStep: entry.loadKind === 'bodyweight' ? defaultLoadStep(unit) : convertLoadStep(entry.loadStepLb, unit),
    loadPer: entry.loadPer,
  };
  return {
    name: entry.name,
    sets: entry.sets,
    minReps: entry.minReps,
    maxReps: entry.maxReps,
    tempo: entry.tempo,
    startPosition: entry.startPosition,
    restAfterSetSeconds: entry.restAfterSetSeconds,
    transitionAfterExerciseSeconds: entry.transitionAfterExerciseSeconds,
    targetRirMin: entry.targetRirMin,
    targetRirMax: entry.targetRirMax,
    laterality: entry.laterality,
    unilateralOrder: 'right-then-left' as const,
    measure: entry.measure,
    progressionStep: entry.progressionStep,
    resistanceLabel: labelForLoad(spec),
    ...spec,
  };
}
