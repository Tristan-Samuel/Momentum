import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import { usePreparedWorkout } from '@/hooks/usePreparedWorkout';
import { completedWorkoutCount, lastCompletedSession } from '@/database/repository';
import { estimateWorkoutMinutes, totalPrescribedSets } from '@/utils/duration';
import { formatTodayPlan } from '@/utils/prescription';
import { formatDate, greetingForNow } from '@/utils/time';
import { audioEngine } from '@/audio-engine/engine';

export function DashboardScreen() {
  const prepared = usePreparedWorkout();
  const last = useLiveQuery(() => lastCompletedSession(), []);
  const streak = useLiveQuery(() => completedWorkoutCount(), []);
  const navigate = useNavigate();

  if (!prepared) {
    return <p className="pt-16 text-[var(--muted)]">Loading…</p>;
  }

  const minutes = estimateWorkoutMinutes(prepared.exercises);
  const sets = totalPrescribedSets(prepared.exercises);

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">{greetingForNow().toUpperCase()}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Next workout</h1>
      <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-xs tracking-[0.22em] text-[var(--muted)]">PROGRAM</p>
        <h2 className="mt-3 text-3xl font-semibold">{prepared.program.name}</h2>
        <p className="mt-3 text-lg text-[var(--muted)]">
          {prepared.exercises.length} exercises
          <span className="mx-2">·</span>
          {sets} sets
          <span className="mx-2">·</span>
          ~{minutes} min
        </p>
        <ul className="mt-6 space-y-4">
          {prepared.exercises.map((item) => (
            <li key={item.id}>
              <p className="text-lg font-medium">{item.exercise.name}</p>
              <p className="mt-1 text-[var(--muted)]">{formatTodayPlan(item)}</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">{item.progression.resistanceLabel}</p>
            </li>
          ))}
        </ul>
        <Button
          className="mt-8 w-full py-5 text-xl tracking-[0.08em]"
          onClick={() => {
            void audioEngine.unlock();
            navigate('/workout');
          }}
        >
          Start workout
        </Button>
      </section>

      <section className="mt-10">
        <p className="text-xs tracking-[0.22em] text-[var(--muted)]">LAST WORKOUT</p>
        {last ? (
          <Link to={`/history/${last.id}`} className="mt-3 block text-2xl">
            {formatDate(last.startedAt)}
            <span className="ml-3 text-lg text-[var(--muted)]">
              {last.totalSets} sets · {last.totalReps} reps
            </span>
          </Link>
        ) : (
          <p className="mt-3 text-lg text-[var(--muted)]">None yet</p>
        )}
      </section>

      <section className="mt-8">
        <p className="text-xs tracking-[0.22em] text-[var(--muted)]">CURRENT STREAK</p>
        <p className="mt-3 text-2xl">{streak ?? 0} workouts</p>
      </section>
    </main>
  );
}
