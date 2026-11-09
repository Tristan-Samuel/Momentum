import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { SetResults } from '@/components/SetResults';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { applyProgressionTargets } from '@/database/repository';
import { useSessionDetail, useSessionInsights } from '@/hooks/useSessionInsights';
import { formatRepList, unitSuffix } from '@/utils/prescription';
import { workingAmount } from '@/utils/stats';
import { formatDuration } from '@/utils/time';

export function ReviewScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useSessionDetail(id);
  const insights = useSessionInsights(detail);

  if (!detail || !insights) {
    return <p className="p-6 text-[var(--muted)]">Loading…</p>;
  }

  const { session, exercises } = detail;
  const totalReps = exercises.reduce(
    (sum, item) =>
      (item.exercise.configSnapshot.measure ?? 'reps') === 'reps'
        ? sum + item.sets.reduce((s, set) => s + workingAmount(set), 0)
        : sum,
    0,
  );
  const prs = exercises.filter(({ exercise }) => insights.get(exercise.id)?.isPr);
  const aborted = session.status === 'aborted';

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="animate-fade-up">
        <p className={`text-xs tracking-[0.25em] ${aborted ? 'text-[var(--warn)]' : 'text-[var(--ok)]'}`}>
          {aborted ? 'WORKOUT ENDED EARLY' : 'WORKOUT COMPLETE'}
        </p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight">
          {formatDuration(session.durationMs)}
        </h1>
        <p className="mt-2 text-[var(--muted)]">{session.programNameSnapshot}</p>
      </div>

      <section className="mt-8 grid grid-cols-3 gap-3">
        <Stat label="Sets" value={String(session.totalSets)} />
        <Stat label="Reps" value={String(totalReps)} />
        <Stat label="PRs" value={String(prs.length)} accent={prs.length > 0} />
      </section>

      {prs.length > 0 ? (
        <Card tone="accent" className="mt-4 flex items-center gap-4">
          <Icon name="trophy" size={28} className="shrink-0 text-[var(--accent)]" />
          <div>
            <p className="font-medium">New personal record{prs.length > 1 ? 's' : ''}</p>
            <p className="text-sm text-[var(--muted)]">
              {prs
                .map(({ exercise }) => {
                  const unit = unitSuffix(exercise.configSnapshot.measure);
                  return `${exercise.nameSnapshot} ${insights.get(exercise.id)?.bestThisSession}${unit}`;
                })
                .join(' · ')}
            </p>
          </div>
        </Card>
      ) : null}

      <section className="mt-8 space-y-4">
        {exercises.map(({ exercise, sets }) => {
          const insight = insights.get(exercise.id);
          const progression = insight?.progression;
          const measure = exercise.configSnapshot.measure;
          return (
            <Card key={exercise.id} tone="plain">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-2xl font-semibold">{exercise.nameSnapshot}</h2>
                <span className="text-sm text-[var(--muted)]">
                  {exercise.configSnapshot.resistanceLabel}
                </span>
              </div>
              <SetResults
                sets={sets}
                measure={measure}
                previous={insight?.previous ?? null}
                sameResistance={insight?.sameResistance ?? true}
              />
              {progression?.recommendedResistanceChange?.type === 'increase' ? (
                <div className="mt-4 rounded-2xl bg-[var(--accent-soft)] p-4">
                  <SectionLabel>Level up</SectionLabel>
                  <p className="mt-2">
                    You topped the range. Make the movement harder (more weight, a tougher
                    variation), then the targets reset toward the bottom of the range.
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    After you apply: {formatRepList(progression.recommendedNextTargets, measure)}
                  </p>
                  <Button
                    variant="accent"
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
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Next session: {formatRepList(progression.currentTargets, measure)}. Hit a set&apos;s
                  target and it goes up by {exercise.configSnapshot.progressionStep ?? 1}
                  {unitSuffix(measure)} next time, up to {exercise.configSnapshot.maxReps}
                  {unitSuffix(measure)}.
                </p>
              ) : null}
            </Card>
          );
        })}
      </section>

      <Button className="mt-10 w-full" onClick={() => navigate('/', { replace: true })}>
        Done
      </Button>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="text-xs tracking-[0.18em] text-[var(--muted)]">{label.toUpperCase()}</p>
      <p className={`mt-2 text-3xl tabular-nums ${accent ? 'text-[var(--accent)]' : ''}`}>{value}</p>
    </div>
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
