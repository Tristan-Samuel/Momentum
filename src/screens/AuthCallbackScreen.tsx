import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { takeWebCallback } from '@/platform/webAuth';
import { completeSignIn } from '@/sync/restore';

export function AuthCallbackScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void (async () => {
      try {
        await completeSignIn(takeWebCallback(window.location.href));
        navigate('/settings', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      }
    })();
  }, [navigate]);

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">ACCOUNT</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {error ? 'Sign-in failed' : 'Signing in…'}
      </h1>
      {error ? (
        <>
          <p className="mt-3 text-[var(--muted)]">{error}</p>
          <Link to="/settings" className="mt-6 inline-block text-[var(--accent)]">
            Back to Settings
          </Link>
        </>
      ) : null}
    </main>
  );
}
