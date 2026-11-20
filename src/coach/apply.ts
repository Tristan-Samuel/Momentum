import * as repo from '@/database/repository';
import type { CoachEdit, CoachExerciseDraft, CoachRecommendation } from '@/coach/schema';
import type { ExerciseConfiguration } from '@/types';

export async function applyCreatedProgram(name: string, exercises: CoachExerciseDraft[]): Promise<string> {
  const program = await repo.createProgram(name);
  for (const item of exercises) {
    await repo.addExerciseToProgram(program.id, item);
  }
  return program.id;
}

export async function applyExerciseEdit(edit: CoachEdit): Promise<void> {
  const config = await repo.db.exerciseConfigurations.get(edit.exerciseConfigId);
  if (!config) throw new Error('That exercise is not in this program.');
  if (edit.name) await repo.updateExerciseName(config.exerciseId, edit.name);
  const patch: Partial<ExerciseConfiguration> = {};
  if (edit.sets != null) patch.sets = edit.sets;
  if (edit.minReps != null) patch.minReps = edit.minReps;
  if (edit.maxReps != null) patch.maxReps = edit.maxReps;
  if (edit.measure) patch.measure = edit.measure;
  if (edit.tempo) patch.tempo = edit.tempo;
  if (edit.startPosition) patch.startPosition = edit.startPosition;
  if (edit.restAfterSetSeconds != null) patch.restAfterSetSeconds = edit.restAfterSetSeconds;
  if (edit.transitionAfterExerciseSeconds != null) {
    patch.transitionAfterExerciseSeconds = edit.transitionAfterExerciseSeconds;
  }
  if (edit.targetRirMin != null) patch.targetRirMin = edit.targetRirMin;
  if (edit.targetRirMax != null) patch.targetRirMax = edit.targetRirMax;
  if (edit.laterality) patch.laterality = edit.laterality;
  if (edit.unilateralOrder) patch.unilateralOrder = edit.unilateralOrder;
  if (edit.resistanceLabel) patch.resistanceLabel = edit.resistanceLabel;
  if (edit.progressionStep != null) patch.progressionStep = edit.progressionStep;
  if (edit.cueMode) patch.cueMode = edit.cueMode;
  if (edit.loadKind) patch.loadKind = edit.loadKind;
  if (edit.load !== undefined) patch.load = edit.load;
  if (edit.loadUnit) patch.loadUnit = edit.loadUnit;
  if (edit.loadStep != null) patch.loadStep = edit.loadStep;
  if (edit.loadPer) patch.loadPer = edit.loadPer;
  if (Object.keys(patch).length > 0) {
    await repo.updateExerciseConfiguration(config.id, patch);
  }
  if (edit.targets) {
    const sets = edit.sets ?? config.sets;
    const targets = edit.targets.slice(0, sets);
    while (targets.length < sets) targets.push(targets[targets.length - 1] ?? edit.minReps ?? config.minReps);
    await repo.updateCurrentTargets(config.exerciseId, targets);
  }
}

export async function applyRecommendation(item: CoachRecommendation): Promise<void> {
  if (!item.exerciseConfigId) throw new Error('This note is not tied to an exercise.');
  const config = await repo.db.exerciseConfigurations.get(item.exerciseConfigId);
  if (!config) throw new Error('That exercise is not in this program.');
  if (item.resistanceLabel) {
    await repo.updateExerciseConfiguration(config.id, { resistanceLabel: item.resistanceLabel });
  }
  if (item.targets) {
    const targets = item.targets.slice(0, config.sets);
    while (targets.length < config.sets) targets.push(targets[targets.length - 1] ?? config.minReps);
    await repo.updateCurrentTargets(config.exerciseId, targets);
  }
}
