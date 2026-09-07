import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listSessions } from '@/database/repository';
import { formatClock, formatDate } from '@/utils/time';

export function HistoryScreen() {
  const sessions = useLiveQuery(() => listSessions(), []);
  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">HISTORY</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Workouts</h1>
      <ul className="mt-8 divide-y divide-[var(--line)]">
        {(sessions ?? []).map((session) => (
          <li key={session.id}>
            <Link to={`/history/${session.id}`} className="flex items-baseline justify-between py-5">
              <span className="text-2xl">{formatDate(session.startedAt).toUpperCase()}</span>
              <span className="text-[var(--muted)]">
                {formatClock(session.durationMs / 1000)} · {session.totalSets} sets
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {sessions?.length === 0 ? (
        <p className="mt-8 text-[var(--muted)]">No workouts yet.</p>
      ) : null}
    </main>
  );
}
