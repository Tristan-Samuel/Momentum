import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/ui/Card';
import { CalendarHeatmap } from '@/components/ui/CalendarHeatmap';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { usePreparedWorkout } from '@/hooks/usePreparedWorkout';
import { useSettings } from '@/hooks/useSettings';
import { defaultRoutine } from '@/database/seed';
import {
  lastCompletedSession,
  listPrograms,
  listRoutines,
  listScheduleSessions,
  listWorkoutDates,
  nextProgramInRotation,
} from '@/database/repository';
import { resolveDay, type ResolvedRoutine } from '@/schedule/resolve';
import { estimateWorkoutMinutes, totalPrescribedSets } from '@/utils/duration';
import { formatRepRange, formatSetRepPreview } from '@/utils/prescription';
import { buildHeatmap, weeklyStreak } from '@/utils/streak';
import { formatClock, formatDate, greetingForNow } from '@/utils/time';
import { audioEngine } from '@/audio-engine/engine';
import type { WorkoutProgram } from '@/types';

export function DashboardScreen() {
  const programs = useLiveQuery(() => listPrograms(), []);
  const routines = useLiveQuery(() => listRoutines(), []);
  const sessions = useLiveQuery(() => listScheduleSessions(), []);
  const upNext = useLiveQuery(() => nextProgramInRotation(), []);
  const last = useLiveQuery(() => lastCompletedSession(), []);
  const dates = useLiveQuery(() => listWorkoutDates(), []);
  const settings = useSettings();

  if (!programs || !routines || !sessions || !upNext) {
    return <p className="pt-16 text-[var(--muted)]">Loading…</p>;
  }

  const plans = resolveDay({
    routines,
    programs: programs.map((program) => ({ id: program.id, name: program.name, order: program.order ?? 0 })),
    sessions,
    now: new Date(),
  });
  const shown =
    plans.length > 0
      ? plans
      : [
          {
            routine: { ...defaultRoutine(), id: 'fallback', name: upNext.name },
            status: 'due' as const,
            programId: upNext.id,
            detail: 'Next in the rotation',
          },
        ];
  const goal = settings?.weeklyGoal ?? 3;
  const streak = weeklyStreak(dates ?? [], goal);
  const heatmap = buildHeatmap(dates ?? [], 12);

  return (
    <main>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.25em] text-[var(--muted)]">
            {greetingForNow().toUpperCase()}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Next workout</h1>
        </div>
        <div className="mt-1 flex gap-2">
          <Link
            to="/schedule"
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
          >
            Schedule
          </Link>
          <Link
            to="/coach"
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
          >
            Coach
          </Link>
          <Link
            to="/guide"
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
          >
            How it works
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {shown.map((plan) => (
          <RoutineCard key={plan.routine.id} plan={plan} programs={programs} />
        ))}
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <Card tone="plain" className="p-4">
          <SectionLabel>This week</SectionLabel>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {streak.thisWeek}
            <span className="text-lg font-normal text-[var(--muted)]"> / {goal}</span>
          </p>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            {Array.from({ length: goal }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < streak.thisWeek ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'
                }`}
              />
            ))}
          </div>
        </Card>
        <Card tone="plain" className="p-4">
          <SectionLabel>Week streak</SectionLabel>
          <p className="mt-2 flex items-center gap-2 text-3xl font-semibold tabular-nums">
            <Icon
              name="flame"
              size={24}
              className={streak.streak > 0 ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}
            />
            {streak.streak}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Best {streak.bestStreak} · goal {goal}/week
          </p>
        </Card>
      </section>

      <Card tone="plain" className="mt-3">
        <SectionLabel
          action={<span className="text-xs text-[var(--muted)]">Last 12 weeks</span>}
        >
          Consistency
        </SectionLabel>
        <div className="mt-4">
          <CalendarHeatmap weeks={heatmap} ariaLabel="Workouts per day over the last 12 weeks" />
        </div>
      </Card>

      <section className="mt-8">
        <SectionLabel>Last workout</SectionLabel>
        {last ? (
          <Link
            to={`/history/${last.id}`}
            className="mt-3 flex items-center justify-between rounded-3xl border border-[var(--line)] p-5"
          >
            <span>
              <span className="block text-2xl">{formatDate(last.startedAt)}</span>
              <span className="mt-1 block text-[var(--muted)]">
                {last.programNameSnapshot} · {last.totalSets} sets · {last.totalReps} reps ·{' '}
                {formatClock(last.durationMs / 1000)}
              </span>
            </span>
            <Icon name="chevron-right" className="text-[var(--muted)]" />
          </Link>
        ) : (
          <p className="mt-3 text-lg text-[var(--muted)]">None yet. Your first one starts above.</p>
        )}
      </section>
    </main>
  );
}

function RoutineCard({ plan, programs }: { plan: ResolvedRoutine; programs: WorkoutProgram[] }) {
  const [override, setOverride] = useState<string | null>(null);
  const programId = override ?? plan.programId;
  const prepared = usePreparedWorkout(programId);
  const navigate = useNavigate();
  if (!programId) {
    return (
      <Card className="p-6">
        <p className="text-[var(--muted)]">
          This routine has no program yet.{' '}
          <Link to="/configure" className="text-[var(--accent)] underline">
            Add one
          </Link>
        </p>
      </Card>
    );
  }
  if (!prepared || prepared.program.id !== programId) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }
  const minutes = estimateWorkoutMinutes(prepared.exercises);
  const sets = totalPrescribedSets(prepared.exercises);
  const startLabel = plan.status === 'rest' ? 'Train anyway' : plan.status === 'done' ? 'Train extra' : 'Start workout';

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <SectionLabel>{plan.routine.name}</SectionLabel>
        <Link to="/schedule" className="text-sm text-[var(--accent)]">
          Edit
        </Link>
      </div>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{prepared.program.name}</h2>
      <p className="mt-1 text-[var(--muted)]">{plan.detail}</p>
      {programs.length > 1 ? (
        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Program">
          {programs.map((program) => {
            const active = program.id === prepared.program.id;
            return (
              <button
                key={program.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setOverride(program.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                    : 'border-[var(--line)] text-[var(--muted)]'
                }`}
              >
                {program.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Chip>{prepared.exercises.length} exercises</Chip>
        <Chip>{sets} sets</Chip>
        <Chip>~{minutes} min</Chip>
      </div>
      <ol className="mt-6 divide-y divide-[var(--line)]">
        {prepared.exercises.map((item, index) => (
          <li key={item.id} className="flex items-start gap-4 py-3.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--line)]/60 text-sm tabular-nums text-[var(--muted)]">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-lg font-medium leading-tight">
                {item.exercise.name}
                {item.measure === 'seconds' ? <Icon name="timer" size={16} className="text-[var(--accent)]" /> : null}
              </p>
              <p className="mt-1 text-[var(--muted)]">
                {formatSetRepPreview(item)}
                <span className="mx-1.5">·</span>
                range {formatRepRange(item.minReps, item.maxReps, item.measure)}
              </p>
            </div>
            <span className="shrink-0 pt-1 text-sm text-[var(--muted)]">{item.progression.resistanceLabel}</span>
          </li>
        ))}
      </ol>
      {prepared.exercises.length === 0 ? (
        <p className="mt-4 text-[var(--muted)]">
          This program has no exercises yet.{' '}
          <Link to="/configure" className="text-[var(--accent)] underline">
            Add some
          </Link>
        </p>
      ) : null}
      <Button
        variant="accent"
        className="mt-6 flex w-full items-center justify-center gap-3 py-5 text-xl tracking-[0.06em]"
        disabled={prepared.exercises.length === 0}
        onClick={() => {
          void audioEngine.unlock();
          navigate(`/workout?program=${encodeURIComponent(prepared.program.id)}`);
        }}
      >
        <Icon name="play" size={20} />
        {startLabel}
      </Button>
    </Card>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--line)]/60 px-3 py-1 text-[var(--fg)]">{children}</span>
  );
}
