import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { db } from '@/database/db';
import { beginSignIn, SignInCancelled } from '@/platform/webAuth';
import { fetchMe, SYNC_URL, type RemoteAccount } from '@/sync/api';
import { isSignedIn, useSyncAccount } from '@/sync/auth';
import { flushNow, uploadEverything } from '@/sync/engine';
import { completeSignIn, localWorkoutCount, restoreFromServer, signOut } from '@/sync/restore';

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type Confirm = 'restore' | 'replace-server' | 'sign-out' | null;

export function AccountSection() {
  const account = useSyncAccount();
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [remote, setRemote] = useState<RemoteAccount | null>(null);
  const [localWorkouts, setLocalWorkouts] = useState(0);
  const choosing = isSignedIn(account) && !account.initialSyncDone;

  useEffect(() => {
    if (!choosing || !account?.token) return;
    let live = true;
    void fetchMe(account.token)
      .then((me) => live && setRemote(me))
      .catch(() => undefined);
    void localWorkoutCount().then((count) => live && setLocalWorkouts(count));
    return () => {
      live = false;
    };
  }, [choosing, account?.token]);

  if (account === undefined) return null;

  const run = async (label: string, task: () => Promise<string | null | void>) => {
    setBusy(label);
    setStatus(null);
    try {
      const message = await task();
      if (message) setStatus(message);
    } catch (err) {
      if (!(err instanceof SignInCancelled)) {
        setStatus(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setBusy(null);
    }
  };

  const host = SYNC_URL.replace(/^https?:\/\//, '');

  return (
    <section className="mt-8">
      <SectionLabel>Account and sync</SectionLabel>
      <Card className="mt-3">
        {!isSignedIn(account) ? (
          <>
            <div className="flex items-start gap-3">
              <Icon name="cloud-off" size={22} className="mt-0.5 shrink-0 text-[var(--muted)]" />
              <div>
                <p className="font-medium">Back up to tssamuel.com</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  Sign in with your tssamuel.com account. Every change uploads automatically, and a new
                  phone can restore everything in one tap.
                </p>
              </div>
            </div>
            {account?.lastError ? <p className="mt-3 text-sm text-[var(--warn)]">{account.lastError}</p> : null}
            <Button
              variant="accent"
              className="mt-4 w-full"
              disabled={busy !== null}
              onClick={() =>
                void run('sign-in', async () => {
                  const outcome = await completeSignIn(await beginSignIn());
                  return outcome === 'uploaded' ? 'Signed in. Everything is backed up.' : null;
                })
              }
            >
              {busy === 'sign-in' ? 'Signing in…' : 'Sign in'}
            </Button>
          </>
        ) : choosing ? (
          <>
            <div className="flex items-start gap-3">
              <Icon name="cloud" size={22} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="font-medium">{account.email}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  {host} already has Momentum data for this account
                  {remote?.lastSyncAt ? `, last synced ${relativeTime(remote.lastSyncAt)}` : ''}. Pick
                  which copy to keep. Sync starts after you choose.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Button
                variant={localWorkouts === 0 ? 'accent' : 'ghost'}
                disabled={busy !== null}
                onClick={() => setConfirm('restore')}
              >
                Restore to this phone
              </Button>
              <Button
                variant={localWorkouts === 0 ? 'ghost' : 'accent'}
                disabled={busy !== null}
                onClick={() => setConfirm('replace-server')}
              >
                Keep this phone&apos;s data ({localWorkouts} workout{localWorkouts === 1 ? '' : 's'})
              </Button>
              <button
                type="button"
                className="py-2 text-sm text-[var(--muted)]"
                onClick={() => setConfirm('sign-out')}
              >
                Cancel and sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Icon name="cloud" size={22} className="mt-0.5 shrink-0 text-[var(--ok)]" />
              <div className="min-w-0">
                <p className="truncate font-medium">{account.email}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {pending > 0
                    ? `${pending} change${pending === 1 ? '' : 's'} waiting to upload`
                    : `Synced ${relativeTime(account.lastPushAt)}`}
                </p>
              </div>
            </div>
            {account.lastError ? <p className="mt-3 text-sm text-[var(--warn)]">{account.lastError}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2"
                disabled={busy !== null}
                onClick={() =>
                  void run('upload', async () => {
                    await flushNow();
                    return 'Up to date.';
                  })
                }
              >
                <Icon name="upload" size={18} /> {busy === 'upload' ? 'Uploading…' : 'Upload now'}
              </Button>
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2"
                disabled={busy !== null}
                onClick={() => setConfirm('restore')}
              >
                <Icon name="download" size={18} /> Restore
              </Button>
            </div>
            <a
              href={`${SYNC_URL}/me`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-between rounded-2xl border border-[var(--line)] px-4 py-3 text-sm"
            >
              <span>View on {host}</span>
              <Icon name="chevron-right" size={16} className="text-[var(--muted)]" />
            </a>
            <button
              type="button"
              className="mt-3 w-full py-2 text-sm text-[var(--muted)]"
              onClick={() => setConfirm('sign-out')}
            >
              Sign out
            </button>
          </>
        )}
        {status ? <p className="mt-3 text-sm text-[var(--muted)]">{status}</p> : null}
      </Card>

      <ConfirmDialog
        open={confirm === 'restore'}
        eyebrow="RESTORE"
        title="Replace this phone's data?"
        body={`Programs, workouts, and records on this phone are replaced with the copy on ${host}.`}
        confirmLabel="Restore"
        danger
        busy={busy === 'restore'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run('restore', async () => {
            const summary = await restoreFromServer();
            return `Restored ${summary.workouts} workout${summary.workouts === 1 ? '' : 's'} and ${summary.programs} program${summary.programs === 1 ? '' : 's'}.`;
          }).finally(() => setConfirm(null))
        }
      />
      <ConfirmDialog
        open={confirm === 'replace-server'}
        eyebrow="UPLOAD"
        title={`Replace the copy on ${host}?`}
        body="The server copy is overwritten with this phone's programs, workouts, and records."
        confirmLabel="Upload this phone"
        danger
        busy={busy === 'upload-all'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run('upload-all', async () => {
            await uploadEverything();
            return 'Uploaded. Sync is on.';
          }).finally(() => setConfirm(null))
        }
      />
      <ConfirmDialog
        open={confirm === 'sign-out'}
        eyebrow="SIGN OUT"
        title="Stop syncing?"
        body="Your data stays on this phone. Changes stop uploading until you sign in again."
        confirmLabel="Sign out"
        busy={busy === 'sign-out'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void run('sign-out', async () => {
            await signOut();
            setRemote(null);
          }).finally(() => setConfirm(null))
        }
      />
    </section>
  );
}
