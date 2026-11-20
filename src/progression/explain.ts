import type { DifficultyRating, FormQuality, Measure } from '@/types';
import { formatLoad } from '@/utils/load';
import { formatRepList } from '@/utils/prescription';
import { evaluateProgression, type ProgressionInput } from '@/progression/algorithm';

export function explainProgression(
  input: ProgressionInput,
  measure?: Measure,
  where: 'workout' | 'review' = 'workout',
): string {
  const saved = input.rating != null || input.rir != null || input.formQuality != null;
  const current = evaluateProgression(input);
  const baseline = evaluateProgression({
    ...input,
    rating: null,
    rir: null,
    formQuality: null,
  });
  const next = formatRepList(current.nextTargets, measure);
  const plain = formatRepList(baseline.nextTargets, measure);
  const held = current.holdReason != null && current.recommendation.type !== 'increase';

  if (!saved) {
    if (where === 'review') {
      return `No rating saved. Next time ${plain}, from the reps you hit. Too hard, RIR 0, or poor form would have held them.`;
    }
    return `Nothing saved yet. Hitting the targets makes next time ${plain}. Too hard, RIR 0, or poor form holds ${formatRepList(input.currentTargets, measure)}.`;
  }

  if (current.recommendation.type === 'increase') {
    const nextLoad = current.recommendation.nextLoad;
    if (nextLoad) {
      return `Saved. You topped the range, so next time is ${formatLoad(nextLoad)} and the targets reset toward the bottom.`;
    }
    return 'Saved. You topped the range, so next time gets harder and the targets reset toward the bottom.';
  }

  if (current.recommendation.type === 'decrease' && current.recommendation.nextLoad) {
    return `Saved. ${current.holdReason}. Next time ${formatLoad(current.recommendation.nextLoad)} at ${next}.`;
  }

  if (held && next !== plain) {
    return `Saved. ${current.holdReason}, so next time stays ${next} instead of moving to ${plain}.`;
  }
  if (held) {
    return `Saved. ${current.holdReason}. Next time stays ${next}.`;
  }
  if (input.rating === 'hard') {
    return `Saved. Hard still moves a set you hit. Next time ${next}. Too hard would hold ${formatRepList(input.currentTargets, measure)}.`;
  }
  if (input.rating === 'too_easy') {
    return `Saved. Too easy still moves a set you hit. Next time ${next}.`;
  }
  if (input.rir != null && input.rating == null) {
    return `Saved. RIR ${input.rir} is inside the target, so the reps you hit still move. Next time ${next}.`;
  }
  return `Saved. Next time ${next}.`;
}

export function ratingWasSaved(input: {
  rating: DifficultyRating | null;
  rir: number | null;
  formQuality: FormQuality | null;
}): boolean {
  return input.rating != null || input.rir != null || input.formQuality != null;
}
