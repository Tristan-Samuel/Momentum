import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import * as repo from '@/database/repository';
import { applyProgressionTargets } from '@/database/repository';
import { formatDuration } from '@/utils/time';

export function ReviewScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useLiveQuery(() => (id ? repo.getSessionDetail(id) : Promise.resolve(null)), [id]);
  const prepared = useLiveQuery(() => repo.getPreparedWorkout(), []);

  if (!detail || !prepared) {
    return <p className="p-6 text-[var(--muted)]">Loading…</p>;
  }

  const { session, exercises } = detail;
  const totalReps = exercises.reduce(
    (sum, item) => sum + item.sets.filter((set) => !set.skipped).reduce((s, set) => s + set.completedReps, 0),
    0,
  );
  const prs = exercises.flatMap(({ exercise }) => {
    const state = prepared.exercises.find((item) => item.exerciseId === exercise.exerciseId)?.progression;
    if (!state?.personalBestDate) return [];
    if (state.personalBestDate >= session.startedAt) {
      return [`${exercise.nameSnapshot}: ${state.personalBestReps} reps`];
    }
    return [];
  });

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">WORKOUT COMPLETE</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {formatDuration(session.durationMs)}
      </h1>
      <p className="mt-2 text-[var(--muted)]">{session.programNameSnapshot}</p>

      <section className="mt-10 space-y-8">
        {exercises.map(({ exercise, sets }) => {
          const progression = prepared.exercises.find((item) => item.exerciseId === exercise.exerciseId)?.progression;
          return (
            <div key={exercise.id}>
              <h2 className="text-2xl font-semibold">{exercise.nameSnapshot}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {exercise.configSnapshot.resistanceLabel}
              </p>
              <ul className="mt-3 space-y-1 text-xl tabular-nums">
                {sets.map((set) => (
                  <li key={set.id}>
                    {set.skipped ? 'Skipped' : `${set.completedReps} / ${set.actualTarget}`}
                  </li>
                ))}
              </ul>
              {progression?.recommendedResistanceChange?.type === 'increase' ? (
                <div className="mt-4 rounded-2xl border border-[var(--line)] p-4">
                  <p className="text-sm tracking-[0.16em] text-[var(--muted)]">PROGRESSION</p>
                  <p className="mt-2">
                    You topped the range. Make the movement harder (more weight, a tougher
                    variation), then the next targets reset toward the bottom of the range.
                  </p>
                  <p className="mt-1 text-[var(--muted)]">
                    After you apply: {progression.recommendedNextTargets.join(', ')} reps
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() =>
                      void applyProgressionTargets({
                        exerciseId: exercise.exerciseId,
                        currentTargets: progression.recommendedNextTargets,
                        resistanceLabel: nextResistance(progression.resistanceLabel),
                      })
                    }
                  >
                    Apply {nextResistance(progression.resistanceLabel)}
                  </Button>
                </div>
              ) : progression ? (
                <p className="mt-3 text-[var(--muted)]">
                  Next session: {progression.currentTargets.join(', ')} reps. Hit a set&apos;s
                  target and the app adds 1 next time, up to {exercise.configSnapshot.maxReps}.
                </p>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="mt-10 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs tracking-[0.18em] text-[var(--muted)]">TOTAL SETS</p>
          <p className="mt-2 text-3xl">{session.totalSets}</p>
        </div>
        <div>
          <p className="text-xs tracking-[0.18em] text-[var(--muted)]">TOTAL REPS</p>
          <p className="mt-2 text-3xl">{totalReps}</p>
        </div>
      </section>

      <section className="mt-8">
        <p className="text-xs tracking-[0.18em] text-[var(--muted)]">PERSONAL RECORDS</p>
        {prs.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {prs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[var(--muted)]">None this session</p>
        )}
      </section>

      <Button className="mt-12 w-full" onClick={() => navigate('/', { replace: true })}>
        Done
      </Button>
    </main>
  );
}

function nextResistance(current: string): string {
  const match = current.match(/([+-]?)(\d+(?:\.\d+)?)\s*(lb|lbs|kg)?/i);
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const value = Number(match[2]) * sign + 5;
    const unit = match[3] ? ` ${match[3]}` : ' lb';
    return `${value > 0 ? '+' : ''}${value}${unit}`;
  }
  if (/bodyweight/i.test(current)) return '+5 lb';
  return `${current} +`;
}
