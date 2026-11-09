import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { deleteCompletedSession, getSessionDetail } from '@/database/repository';
import { formatDuration, formatDateLong } from '@/utils/time';
import { formatTempo } from '@/utils/tempo';

export function HistoryDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useLiveQuery(() => (id ? getSessionDetail(id) : Promise.resolve(null)), [id]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <Button className="mt-12 w-full" variant="danger" onClick={() => setConfirming(true)}>
        Delete workout
      </Button>
      {error ? <p className="mt-3 text-sm text-[var(--muted)]">{error}</p> : null}
      <ConfirmDialog
        open={confirming}
        eyebrow="DELETE WORKOUT"
        title="Remove this session?"
        body="It leaves History and Progress. Today’s targets stay as they are — edit them on Program if you need to."
        confirmLabel="Delete workout"
        danger
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          void deleteCompletedSession(session.id)
            .then(() => navigate('/history'))
            .catch((err: unknown) => {
              setBusy(false);
              setConfirming(false);
              setError(err instanceof Error ? err.message : 'Could not delete this workout.');
            });
        }}
      />
    </main>
  );
}
