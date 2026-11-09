import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { listSessions } from '@/database/repository';
import type { WorkoutSession } from '@/types';
import { formatClock } from '@/utils/time';

function groupByMonth(sessions: WorkoutSession[]): Array<{ label: string; rows: WorkoutSession[] }> {
  const groups = new Map<string, { label: string; rows: WorkoutSession[] }>();
  for (const session of sessions) {
    const date = new Date(session.startedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        rows: [],
      });
    }
    groups.get(key)!.rows.push(session);
  }
  return [...groups.values()];
}

export function HistoryScreen() {
  const sessions = useLiveQuery(() => listSessions(), []);
  const groups = groupByMonth(sessions ?? []);
  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">HISTORY</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Workouts</h1>
      {sessions && sessions.length > 0 ? (
        <p className="mt-2 text-[var(--muted)]">
          {sessions.length} logged · {sessions.reduce((sum, row) => sum + row.totalReps, 0)} reps total
        </p>
      ) : null}
      {groups.map((group) => (
        <section key={group.label} className="mt-8">
          <SectionLabel
            action={<span className="text-xs text-[var(--muted)]">{group.rows.length} workouts</span>}
          >
            {group.label}
          </SectionLabel>
          <ul className="mt-3 overflow-hidden rounded-3xl border border-[var(--line)]">
            {group.rows.map((session, index) => {
              const date = new Date(session.startedAt);
              return (
                <li key={session.id} className={index > 0 ? 'border-t border-[var(--line)]' : ''}>
                  <Link to={`/history/${session.id}`} className="flex items-center gap-4 px-4 py-4">
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-[var(--line)]/50 py-1.5">
                      <span className="text-[10px] tracking-[0.15em] text-[var(--muted)]">
                        {date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                      </span>
                      <span className="text-xl font-semibold tabular-nums">{date.getDate()}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg">{session.programNameSnapshot}</span>
                      <span className="block text-sm text-[var(--muted)]">
                        {formatClock(session.durationMs / 1000)} · {session.totalSets} sets ·{' '}
                        {session.totalReps} reps
                        {session.status === 'aborted' ? ' · ended early' : ''}
                      </span>
                    </span>
                    <Icon name="chevron-right" className="shrink-0 text-[var(--muted)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {sessions?.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="history"
            title="No workouts yet"
            body="Finish your first session and it will show up here with every set you logged."
          />
        </div>
      ) : null}
    </main>
  );
}
