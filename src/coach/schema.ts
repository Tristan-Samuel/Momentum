import type {
  Laterality,
  Measure,
  StartPosition,
  Tempo,
  UnilateralOrder,
} from '@/types';
import { inferStartPosition, startPositionOf } from '@/utils/tempo';

export type CoachTask = 'create_program' | 'edit_exercise' | 'analyze';

export type CoachExerciseDraft = {
  name: string;
  sets: number;
  minReps: number;
  maxReps: number;
  measure: Measure;
  tempo: Tempo;
  startPosition: StartPosition;
  restAfterSetSeconds: number;
  transitionAfterExerciseSeconds: number;
  targetRirMin: number;
  targetRirMax: number;
  laterality: Laterality;
  unilateralOrder: UnilateralOrder;
  resistanceLabel: string;
  progressionStep: number;
};

export type CoachEdit = {
  exerciseConfigId: string;
  name?: string;
  sets?: number;
  minReps?: number;
  maxReps?: number;
  measure?: Measure;
  tempo?: Tempo;
  startPosition?: StartPosition;
  restAfterSetSeconds?: number;
  transitionAfterExerciseSeconds?: number;
  targetRirMin?: number;
  targetRirMax?: number;
  laterality?: Laterality;
  unilateralOrder?: UnilateralOrder;
  resistanceLabel?: string;
  progressionStep?: number;
  targets?: number[];
};

export type CoachRecommendation = {
  exerciseConfigId: string | null;
  note: string;
  targets?: number[];
  resistanceLabel?: string;
};

export type CoachReply = {
  summary: string;
  program: { name: string; exercises: CoachExerciseDraft[] } | null;
  edit: CoachEdit | null;
  recommendations: CoachRecommendation[];
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function text(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.slice(0, max) || fallback;
}

function tempoOf(value: unknown): Tempo {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    eccentric: clamp(row.eccentric, 0, 10, 3),
    bottomPause: clamp(row.bottomPause, 0, 10, 0),
    concentric: clamp(row.concentric, 0, 10, 1),
    topPause: clamp(row.topPause, 0, 10, 0),
  };
}

function exerciseOf(value: unknown): CoachExerciseDraft | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name, 80);
  if (!name) return null;
  const measure: Measure = row.measure === 'seconds' ? 'seconds' : 'reps';
  const hold = measure === 'seconds';
  let minReps = clamp(row.minReps, 1, hold ? 600 : 100, hold ? 20 : 6);
  let maxReps = clamp(row.maxReps, 1, hold ? 600 : 100, hold ? 45 : 12);
  if (minReps > maxReps) [minReps, maxReps] = [maxReps, minReps];
  let targetRirMin = clamp(row.targetRirMin, 0, 5, 1);
  let targetRirMax = clamp(row.targetRirMax, 0, 5, 2);
  if (targetRirMin > targetRirMax) [targetRirMin, targetRirMax] = [targetRirMax, targetRirMin];
  const laterality: Laterality = row.laterality === 'unilateral' ? 'unilateral' : 'bilateral';
  const order = row.unilateralOrder;
  const unilateralOrder: UnilateralOrder =
    order === 'left-then-right' || order === 'alternating' ? order : 'right-then-left';
  return {
    name,
    sets: clamp(row.sets, 1, 10, 2),
    minReps,
    maxReps,
    measure,
    tempo: tempoOf(row.tempo),
    startPosition: startPositionOf(
      row.startPosition === 'bottom' || row.startPosition === 'top'
        ? row.startPosition
        : inferStartPosition(name),
    ),
    restAfterSetSeconds: clamp(row.restAfterSetSeconds, 0, 900, hold ? 60 : 120),
    transitionAfterExerciseSeconds: clamp(row.transitionAfterExerciseSeconds, 0, 600, 30),
    targetRirMin,
    targetRirMax,
    laterality,
    unilateralOrder: laterality === 'bilateral' ? 'right-then-left' : unilateralOrder,
    resistanceLabel: text(row.resistanceLabel, 40, 'Bodyweight'),
    progressionStep: clamp(row.progressionStep, 1, hold ? 30 : 5, hold ? 5 : 1),
  };
}

function targetsOf(value: unknown, measure: Measure | undefined): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const max = measure === 'seconds' ? 600 : 100;
  const targets = value
    .slice(0, 10)
    .map((item) => clamp(item, 1, max, 1))
    .filter((item) => item > 0);
  return targets.length > 0 ? targets : undefined;
}

function editOf(value: unknown): CoachEdit | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const exerciseConfigId = text(row.exerciseConfigId, 128);
  if (!exerciseConfigId) return null;
  const measure: Measure | undefined =
    row.measure === 'seconds' || row.measure === 'reps' ? row.measure : undefined;
  const edit: CoachEdit = { exerciseConfigId };
  const name = text(row.name, 80);
  if (name) edit.name = name;
  if (row.sets != null) edit.sets = clamp(row.sets, 1, 10, 2);
  if (row.minReps != null) edit.minReps = clamp(row.minReps, 1, 600, 6);
  if (row.maxReps != null) edit.maxReps = clamp(row.maxReps, 1, 600, 12);
  if (measure) edit.measure = measure;
  if (row.tempo && typeof row.tempo === 'object') edit.tempo = tempoOf(row.tempo);
  if (row.startPosition === 'top' || row.startPosition === 'bottom') edit.startPosition = row.startPosition;
  if (row.restAfterSetSeconds != null) edit.restAfterSetSeconds = clamp(row.restAfterSetSeconds, 0, 900, 120);
  if (row.transitionAfterExerciseSeconds != null) {
    edit.transitionAfterExerciseSeconds = clamp(row.transitionAfterExerciseSeconds, 0, 600, 30);
  }
  if (row.targetRirMin != null) edit.targetRirMin = clamp(row.targetRirMin, 0, 5, 1);
  if (row.targetRirMax != null) edit.targetRirMax = clamp(row.targetRirMax, 0, 5, 2);
  if (row.laterality === 'bilateral' || row.laterality === 'unilateral') edit.laterality = row.laterality;
  if (
    row.unilateralOrder === 'right-then-left' ||
    row.unilateralOrder === 'left-then-right' ||
    row.unilateralOrder === 'alternating'
  ) {
    edit.unilateralOrder = row.unilateralOrder;
  }
  const resistance = text(row.resistanceLabel, 40);
  if (resistance) edit.resistanceLabel = resistance;
  if (row.progressionStep != null) edit.progressionStep = clamp(row.progressionStep, 1, 30, 1);
  const targets = targetsOf(row.targets, measure);
  if (targets) edit.targets = targets;
  const keys = Object.keys(edit).filter((key) => key !== 'exerciseConfigId');
  return keys.length > 0 ? edit : null;
}

export function parseCoachReply(value: unknown): CoachReply {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const summary = text(row.summary, 600, 'No summary came back.');
  const programRow = row.program && typeof row.program === 'object' ? (row.program as Record<string, unknown>) : null;
  const exercises = Array.isArray(programRow?.exercises)
    ? programRow.exercises.map(exerciseOf).filter((item): item is CoachExerciseDraft => item != null).slice(0, 12)
    : [];
  const program =
    programRow && exercises.length > 0
      ? { name: text(programRow.name, 80, 'New program'), exercises }
      : null;
  const recommendations: CoachRecommendation[] = [];
  if (Array.isArray(row.recommendations)) {
    for (const item of row.recommendations.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const note = text(rec.note, 280);
      if (!note) continue;
      const id = text(rec.exerciseConfigId, 128);
      const recommendation: CoachRecommendation = {
        exerciseConfigId: id || null,
        note,
      };
      const targets = targetsOf(rec.targets, undefined);
      if (targets) recommendation.targets = targets;
      const resistance = text(rec.resistanceLabel, 40);
      if (resistance) recommendation.resistanceLabel = resistance;
      recommendations.push(recommendation);
    }
  }
  return {
    summary,
    program,
    edit: editOf(row.edit),
    recommendations,
  };
}

export function describeExercise(item: CoachExerciseDraft): string {
  const unit = item.measure === 'seconds' ? 's' : '';
  const first = item.startPosition === 'bottom' ? 'lift first' : 'lower first';
  const move = item.measure === 'seconds' ? 'hold' : first;
  return `${item.sets} × ${item.minReps}–${item.maxReps}${unit} · ${move} · rest ${item.restAfterSetSeconds}s · transition ${item.transitionAfterExerciseSeconds}s`;
}

export function describeEdit(edit: CoachEdit): string[] {
  const lines: string[] = [];
  if (edit.name) lines.push(`Name ${edit.name}`);
  if (edit.sets) lines.push(`${edit.sets} sets`);
  if (edit.minReps != null || edit.maxReps != null) {
    lines.push(`Range ${edit.minReps ?? '…'}–${edit.maxReps ?? '…'}`);
  }
  if (edit.measure) lines.push(edit.measure === 'seconds' ? 'Timed hold' : 'Reps with tempo');
  if (edit.startPosition) lines.push(edit.startPosition === 'bottom' ? 'Lift first' : 'Lower first');
  if (edit.tempo) {
    const tempo = edit.tempo;
    lines.push(`Tempo ${tempo.eccentric}-${tempo.bottomPause}-${tempo.concentric}-${tempo.topPause}`);
  }
  if (edit.restAfterSetSeconds != null) lines.push(`Rest ${edit.restAfterSetSeconds}s`);
  if (edit.transitionAfterExerciseSeconds != null) lines.push(`Transition ${edit.transitionAfterExerciseSeconds}s`);
  if (edit.resistanceLabel) lines.push(edit.resistanceLabel);
  if (edit.targets) lines.push(`Targets ${edit.targets.join(', ')}`);
  if (edit.laterality) lines.push(edit.laterality === 'unilateral' ? 'One side at a time' : 'Both sides');
  return lines;
}
