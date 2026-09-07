import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSessionDetail } from '@/database/repository';
import { formatDuration, formatDateLong } from '@/utils/time';
import { formatTempo } from '@/utils/tempo';

export function HistoryDetailScreen() {
  const { id } = useParams();
  const detail = useLiveQuery(() => (id ? getSessionDetail(id) : Promise.resolve(null)), [id]);
  if (!detail) return <p className="text-[var(--muted)]">Loading…</p>;
  const { session, exercises } = detail;
  return (
    <main>
      <Link to="/history" className="text-sm text-[var(--muted)]">
        Back
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        {formatDateLong(session.startedAt)}
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        {formatDuration(session.durationMs)} · {session.totalSets} sets · {session.totalReps} reps
      </p>
      <section className="mt-10 space-y-8">
        {exercises.map(({ exercise, sets }) => (
          <div key={exercise.id}>
            <h2 className="text-2xl font-semibold">{exercise.nameSnapshot}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {exercise.configSnapshot.resistanceLabel} · {formatTempo(exercise.configSnapshot.tempo)}
            </p>
            {exercise.difficultyRating ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Felt {exercise.difficultyRating.replace('_', ' ')}
                {exercise.rir != null ? ` · RIR ${exercise.rir}` : ''}
              </p>
            ) : null}
            <ul className="mt-3 space-y-1 text-xl tabular-nums">
              {sets.map((set) => (
                <li key={set.id}>
                  {set.skipped
                    ? 'Skipped'
                    : `${set.completedReps} / ${set.actualTarget}`}
                  {set.leftReps != null ? (
                    <span className="ml-2 text-base text-[var(--muted)]">
                      L{set.leftReps} R{set.rightReps}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
