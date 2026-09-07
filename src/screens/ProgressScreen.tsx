import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LineChart } from '@/components/LineChart';
import { getExerciseHistory, getPersonalRecords, getPreparedWorkout } from '@/database/repository';
import { isWeightedLabel, linearTrend, parseResistanceWeight } from '@/utils/stats';
import { formatDate } from '@/utils/time';

export function ProgressScreen() {
  const prepared = useLiveQuery(() => getPreparedWorkout(), []);
  const [exerciseId, setExerciseId] = useState<string>('');
  const selectedId = exerciseId || prepared?.exercises[0]?.exerciseId || '';
  const history = useLiveQuery(
    () => (selectedId ? getExerciseHistory(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const records = useLiveQuery(
    () => (selectedId ? getPersonalRecords(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const item = prepared?.exercises.find((row) => row.exerciseId === selectedId);

  const points = useMemo(() => {
    return (history ?? []).map((row, index) => ({
      x: index,
      y: row.sets.filter((set) => !set.skipped).reduce((sum, set) => sum + set.completedReps, 0),
      label: formatDate(row.session.startedAt),
    }));
  }, [history]);

  const weightPoints = useMemo(() => {
    return (history ?? [])
      .map((row, index) => {
        const weight = parseResistanceWeight(row.exercise.configSnapshot.resistanceLabel);
        return weight == null ? null : { x: index, y: weight };
      })
      .filter((row): row is { x: number; y: number } => row != null);
  }, [history]);

  const trend = linearTrend(points.map((p) => p.y));
  const weighted = item ? isWeightedLabel(item.progression.resistanceLabel) : false;

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">PROGRESS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Trends</h1>
      <label className="mt-6 block text-sm text-[var(--muted)]">
        Exercise
        <select
          className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-lg text-[var(--fg)]"
          value={selectedId}
          onChange={(event) => setExerciseId(event.target.value)}
        >
          {(prepared?.exercises ?? []).map((row) => (
            <option key={row.exerciseId} value={row.exerciseId}>
              {row.exercise.name}
            </option>
          ))}
        </select>
      </label>

      {item ? (
        <section className="mt-8 grid grid-cols-2 gap-4">
          <Stat label="Workouts" value={String(history?.length ?? 0)} />
          <Stat label="Best set" value={String(item.progression.personalBestReps || '—')} />
          <Stat label="Level" value={item.progression.resistanceLabel} />
          <Stat label="Lifetime reps" value={String(item.progression.lifetimeReps)} />
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-sm tracking-[0.18em] text-[var(--muted)]">REPS OVER TIME</h2>
        <div className="mt-4">
          <LineChart points={points} ariaLabel="Reps over time" />
        </div>
        {trend != null ? (
          <p className="mt-3 text-[var(--muted)]">
            Trend: {trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'steady'}
          </p>
        ) : null}
      </section>

      {weighted ? (
        <section className="mt-10">
          <h2 className="text-sm tracking-[0.18em] text-[var(--muted)]">WEIGHT OVER TIME</h2>
          <div className="mt-4">
            <LineChart points={weightPoints} ariaLabel="Weight over time" />
          </div>
        </section>
      ) : (
        <section className="mt-10">
          <h2 className="text-sm tracking-[0.18em] text-[var(--muted)]">DIFFICULTY OVER TIME</h2>
          <ul className="mt-3 space-y-2">
            {(history ?? []).map((row) => (
              <li key={row.exercise.id} className="flex justify-between">
                <span>{formatDate(row.session.startedAt)}</span>
                <span>{row.exercise.configSnapshot.resistanceLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm tracking-[0.18em] text-[var(--muted)]">PERSONAL RECORDS</h2>
        <ul className="mt-3 space-y-2">
          {(records ?? []).map((record) => (
            <li key={record.id}>
              {record.kind === 'best_set_reps' ? 'Best set' : 'Best workout'}: {record.value} @{' '}
              {record.resistanceLabel}
            </li>
          ))}
        </ul>
        {(records ?? []).length === 0 ? (
          <p className="mt-3 text-[var(--muted)]">No records yet.</p>
        ) : null}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="text-xs tracking-[0.16em] text-[var(--muted)]">{label.toUpperCase()}</p>
      <p className="mt-2 text-xl">{value}</p>
    </div>
  );
}
