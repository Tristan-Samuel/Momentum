import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SetResults } from '@/components/SetResults';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { deleteCompletedSession } from '@/database/repository';
import { useSessionDetail, useSessionInsights } from '@/hooks/useSessionInsights';
import { formatDuration, formatDateLong } from '@/utils/time';
import { formatTempo } from '@/utils/tempo';

export function HistoryDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useSessionDetail(id);
  const insights = useSessionInsights(detail);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!detail || !insights) return <p className="text-[var(--muted)]">Loading…</p>;
  const { session, exercises } = detail;

  return (
    <main>
      <Link to="/history" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]">
        <Icon name="chevron-left" size={16} />
        History
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        {formatDateLong(session.startedAt)}
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        {session.programNameSnapshot} · {formatDuration(session.durationMs)} · {session.totalSets}{' '}
        sets · {session.totalReps} reps
        {session.status === 'aborted' ? ' · ended early' : ''}
      </p>
      <section className="mt-8 space-y-4">
        {exercises.map(({ exercise, sets }) => {
          const insight = insights.get(exercise.id);
          const measure = exercise.configSnapshot.measure;
          return (
            <Card key={exercise.id} tone="plain">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-2xl font-semibold">
                  {exercise.nameSnapshot}
                  {insight?.isPr ? (
                    <Icon name="trophy" size={18} className="text-[var(--accent)]" />
                  ) : null}
                </h2>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {exercise.configSnapshot.resistanceLabel}
                {measure !== 'seconds' ? ` · tempo ${formatTempo(exercise.configSnapshot.tempo)}` : ' · timed hold'}
                {exercise.difficultyRating
                  ? ` · felt ${exercise.difficultyRating.replace('_', ' ')}`
                  : ''}
                {exercise.rir != null ? ` · RIR ${exercise.rir}` : ''}
                {exercise.formQuality === 'poor' ? ' · form off' : ''}
              </p>
              <SetResults
                sets={sets}
                measure={measure}
                previous={insight?.previous ?? null}
                sameResistance={insight?.sameResistance ?? true}
              />
            </Card>
          );
        })}
      </section>
      <Button className="mt-10 w-full" variant="ghost" onClick={() => setConfirming(true)}>
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
