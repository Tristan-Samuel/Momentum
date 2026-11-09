import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { LineChart } from '@/components/LineChart';
import { BarChart } from '@/components/ui/BarChart';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { getExerciseHistory, listPreparedPrograms, listRepVolumes } from '@/database/repository';
import { formatAmount, measureNoun, unitSuffix } from '@/utils/prescription';
import {
  completedAmounts,
  compareSets,
  formatDelta,
  isWeightedLabel,
  linearTrend,
  parseResistanceWeight,
  prTimeline,
  weeklyVolume,
} from '@/utils/stats';
import { formatDate } from '@/utils/time';

export function ProgressScreen() {
  const programs = useLiveQuery(() => listPreparedPrograms(), []);
  const volumes = useLiveQuery(() => listRepVolumes(), []);
  const [exerciseId, setExerciseId] = useState<string>('');
  const allExercises = useMemo(
    () => (programs ?? []).flatMap((program) => program.exercises),
    [programs],
  );
  const selectedId = exerciseId || allExercises[0]?.exerciseId || '';
  const item = allExercises.find((row) => row.exerciseId === selectedId);
  const history = useLiveQuery(
    () => (selectedId ? getExerciseHistory(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  const measure = item?.measure ?? 'reps';
  const unit = unitSuffix(measure);
  const weekly = useMemo(() => weeklyVolume(volumes ?? [], 12), [volumes]);
  const thisWeek = weekly.at(-1)?.value ?? 0;
  const lastWeek = weekly.at(-2)?.value ?? 0;

  const points = useMemo(
    () =>
      (history ?? []).map((row, index) => ({
        x: index,
        y: completedAmounts(row.sets).reduce((sum, value) => sum + value, 0),
        label: formatDate(row.session.startedAt),
      })),
    [history],
  );
  const weightPoints = useMemo(
    () =>
      (history ?? [])
        .map((row, index) => {
          const weight = parseResistanceWeight(row.exercise.configSnapshot.resistanceLabel);
          return weight == null ? null : { x: index, y: weight };
        })
        .filter((row): row is { x: number; y: number } => row != null),
    [history],
  );
  const timeline = useMemo(() => prTimeline(history ?? []), [history]);
  const latest = history?.at(-1);
  const prior = history && history.length > 1 ? history.at(-2) : undefined;
  const comparison = latest
    ? compareSets(completedAmounts(latest.sets), prior ? completedAmounts(prior.sets) : null)
    : null;
  const trend = linearTrend(points.map((p) => p.y));
  const weighted = item ? isWeightedLabel(item.progression.resistanceLabel) : false;

  if (!programs) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">PROGRESS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Trends</h1>

      <Card tone="plain" className="mt-6">
        <SectionLabel action={<span className="text-xs text-[var(--muted)]">Reps per week</span>}>
          Weekly volume
        </SectionLabel>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {thisWeek}
          <span className="ml-2 text-base font-normal text-[var(--muted)]">
            this week{lastWeek > 0 ? ` · ${formatDelta(thisWeek - lastWeek)} vs last` : ''}
          </span>
        </p>
        <div className="mt-4">
          <BarChart bars={weekly} ariaLabel="Total reps per week for the last 12 weeks" />
        </div>
      </Card>

      {allExercises.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="program" title="No exercises yet" body="Add exercises on the Program tab." />
        </div>
      ) : (
        <label className="mt-8 block text-sm text-[var(--muted)]">
          Exercise
          <select
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-lg text-[var(--fg)]"
            value={selectedId}
            onChange={(event) => setExerciseId(event.target.value)}
          >
            {programs.map((program) => (
              <optgroup key={program.program.id} label={program.program.name}>
                {program.exercises.map((row) => (
                  <option key={row.exerciseId} value={row.exerciseId}>
                    {row.exercise.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {item ? (
        <section className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Workouts" value={String(history?.length ?? 0)} />
          <Stat
            label={measure === 'seconds' ? 'Longest hold' : 'Best set'}
            value={item.progression.personalBestReps ? formatAmount(item.progression.personalBestReps, measure) : '—'}
          />
          <Stat label="Level" value={item.progression.resistanceLabel} />
          <Stat
            label={measure === 'seconds' ? 'Lifetime seconds' : 'Lifetime reps'}
            value={String(item.progression.lifetimeReps)}
          />
        </section>
      ) : null}

      {latest && comparison ? (
        <Card tone="plain" className="mt-4">
          <SectionLabel>Last session vs the one before</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {completedAmounts(latest.sets).map((value, index) => {
              const delta = comparison.deltas[index];
              return (
                <span key={index} className="rounded-2xl border border-[var(--line)] px-3 py-2 tabular-nums">
                  <span className="text-xs text-[var(--muted)]">Set {index + 1} </span>
                  <span className="text-lg">
                    {value}
                    {unit}
                  </span>
                  {delta != null && delta !== 0 ? (
                    <span className={`ml-1.5 text-xs ${delta > 0 ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>
                      {formatDelta(delta, unit)}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatDate(latest.session.startedAt)}
            {comparison.totalDelta != null
              ? ` · ${formatDelta(comparison.totalDelta, unit)} total vs ${formatDate(prior!.session.startedAt)}`
              : ' · first logged session'}
          </p>
        </Card>
      ) : null}

      <section className="mt-8">
        <SectionLabel>{measure === 'seconds' ? 'Seconds held per workout' : 'Reps per workout'}</SectionLabel>
        <div className="mt-4">
          <LineChart points={points} ariaLabel={`${measureNoun(measure)} over time`} />
        </div>
        {trend != null ? (
          <p className="mt-3 text-[var(--muted)]">
            Trend: {trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'steady'}
          </p>
        ) : null}
      </section>

      {weighted ? (
        <section className="mt-8">
          <SectionLabel>Weight over time</SectionLabel>
          <div className="mt-4">
            <LineChart points={weightPoints} ariaLabel="Weight over time" />
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <SectionLabel>Personal record timeline</SectionLabel>
        {timeline.length > 0 ? (
          <ol className="mt-4 border-l-2 border-[var(--line)] pl-5">
            {timeline.map((event, index) => (
              <li key={event.sessionId} className="relative pb-5 last:pb-0">
                <span
                  className={`absolute -left-[27px] top-1 flex h-3 w-3 rounded-full ${
                    index === 0 ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'
                  }`}
                />
                <Link to={`/history/${event.sessionId}`} className="block">
                  <span className="flex items-center gap-2 text-lg">
                    {index === 0 ? <Icon name="trophy" size={16} className="text-[var(--accent)]" /> : null}
                    {formatAmount(event.value, measure)} best set
                    {event.previous > 0 ? (
                      <span className="text-sm text-[var(--ok)]">{formatDelta(event.value - event.previous, unit)}</span>
                    ) : null}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {formatDate(event.date)} · {event.resistanceLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[var(--muted)]">No records yet.</p>
        )}
      </section>

      {!weighted && history && history.length > 0 ? (
        <section className="mt-8">
          <SectionLabel>Difficulty over time</SectionLabel>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {history
              .slice()
              .reverse()
              .map((row) => (
                <li key={row.exercise.id} className="flex justify-between py-2">
                  <span>{formatDate(row.session.startedAt)}</span>
                  <span className="text-[var(--muted)]">{row.exercise.configSnapshot.resistanceLabel}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="text-xs tracking-[0.16em] text-[var(--muted)]">{label.toUpperCase()}</p>
      <p className="mt-2 truncate text-xl">{value}</p>
    </div>
  );
}
