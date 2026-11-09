import type { Measure, SetSession } from '@/types';
import { compareSets, completedAmounts, formatDelta, workingAmount } from '@/utils/stats';
import { unitSuffix } from '@/utils/prescription';

type Props = {
  sets: SetSession[];
  measure: Measure | undefined;
  previous: number[] | null;
  sameResistance: boolean;
};

export function SetResults({ sets, measure, previous, sameResistance }: Props) {
  const unit = unitSuffix(measure);
  const comparison = compareSets(completedAmounts(sets), sameResistance ? previous : null);
  let completedIndex = -1;
  return (
    <div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {sets.map((set) => {
          if (!set.skipped) completedIndex += 1;
          const delta = set.skipped ? null : comparison.deltas[completedIndex];
          const hit = !set.skipped && workingAmount(set) >= set.actualTarget;
          return (
            <li
              key={set.id}
              className={`rounded-2xl border px-3 py-2 tabular-nums ${
                set.skipped
                  ? 'border-dashed border-[var(--line)] text-[var(--muted)]'
                  : hit
                    ? 'border-[var(--ok)]/50'
                    : 'border-[var(--line)]'
              }`}
            >
              <span className="text-xl">
                {set.skipped ? 'Skipped' : `${workingAmount(set)}${unit}`}
              </span>
              {!set.skipped ? (
                <span className="ml-1 text-sm text-[var(--muted)]">
                  / {set.actualTarget}
                  {unit}
                </span>
              ) : null}
              {set.leftReps != null ? (
                <span className="ml-2 text-xs text-[var(--muted)]">
                  L{set.leftReps} R{set.rightReps}
                </span>
              ) : null}
              {delta != null && delta !== 0 ? (
                <span
                  className={`ml-2 text-xs font-medium ${delta > 0 ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}
                >
                  {formatDelta(delta, unit)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {comparison.totalDelta != null ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {comparison.totalDelta === 0
            ? 'Same total as last time.'
            : `${formatDelta(comparison.totalDelta, unit)} vs last session (${comparison.previousTotal}${unit} total).`}
        </p>
      ) : !sameResistance && previous ? (
        <p className="mt-2 text-sm text-[var(--muted)]">New resistance — no comparison yet.</p>
      ) : null}
    </div>
  );
}
