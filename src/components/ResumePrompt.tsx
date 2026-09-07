import { useLocation, useNavigate } from 'react-router-dom';
import { useIncompleteSession } from '@/hooks/useIncompleteSession';
import { discardWorkoutSession } from '@/database/repository';

export function ResumePrompt() {
  const session = useIncompleteSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (!session) return null;
  if (location.pathname.startsWith('/workout')) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="resume-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-3xl bg-[var(--panel)] p-6 text-[var(--fg)] shadow-2xl">
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">INCOMPLETE WORKOUT</p>
        <h2 id="resume-title" className="mt-3 text-3xl font-semibold tracking-tight">
          Resume workout?
        </h2>
        <p className="mt-3 text-[var(--muted)]">
          A session was still in progress. Resume where you left off, or discard it.
        </p>
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            className="rounded-2xl bg-[var(--fg)] px-4 py-4 text-lg text-[var(--bg)]"
            onClick={() => navigate(`/workout?resume=${session.id}`)}
          >
            Resume workout
          </button>
          <button
            type="button"
            className="rounded-2xl border border-[var(--line)] px-4 py-4 text-lg"
            onClick={() => void discardWorkoutSession(session.id)}
          >
            Discard workout
          </button>
        </div>
      </div>
    </div>
  );
}
