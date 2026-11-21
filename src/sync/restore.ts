import { db } from '@/database/db';
import { backupSummary, importAll, normalizeEnvelope } from '@/database/backup';
import { exchangeHandoff, fetchMe, fetchSnapshot, fetchWebToken, revokeToken, SyncHttpError } from '@/sync/api';
import { clearAccount, getAccount, isSignedIn, saveAccount } from '@/sync/auth';
import { exclusive, uploadEverything } from '@/sync/engine';
import { deviceLabel, type SignInResult } from '@/platform/webAuth';

/** Replaces this phone's data with what tssamuel.com has. */
export function restoreFromServer(signal?: AbortSignal): Promise<{ workouts: number; programs: number }> {
  return exclusive(async () => {
    const account = await getAccount();
    if (!isSignedIn(account)) throw new Error('Sign in first.');
    const snapshot = await fetchSnapshot(account.token, signal);
    const envelope = normalizeEnvelope(snapshot.tables, snapshot.exportedAt);
    await importAll(envelope);
    await saveAccount({ initialSyncDone: true, lastPushAt: new Date().toISOString(), lastError: null });
    return backupSummary(envelope);
  });
}

export async function localWorkoutCount(): Promise<number> {
  return db.workoutSessions.where('status').anyOf('completed', 'aborted').count();
}

/**
 * Stores the device token, then uploads straight away if the server is empty.
 * Returns 'choose' when the server already has data, so the user picks a side.
 */
export async function completeSignIn(result: SignInResult): Promise<'uploaded' | 'choose'> {
  const { token, user } = await exchangeHandoff({ ...result, device: deviceLabel() });
  await db.outbox.clear();
  await saveAccount({
    token,
    email: user.email,
    name: user.name,
    initialSyncDone: false,
    lastPushAt: null,
    lastError: null,
  });
  const me = await fetchMe(token);
  if (me.hasData) return 'choose';
  await uploadEverything();
  return 'uploaded';
}

/**
 * Website sign-in. A browser that only has the first-run seed restores the account.
 * A browser that already has workouts stops and asks which copy to keep.
 */
export async function completeWebSignIn(): Promise<'uploaded' | 'choose' | 'restored' | 'signed-out'> {
  const existing = await getAccount();
  if (isSignedIn(existing)) return existing.initialSyncDone ? 'uploaded' : 'choose';
  let issued: Awaited<ReturnType<typeof fetchWebToken>>;
  try {
    issued = await fetchWebToken();
  } catch (err) {
    if (err instanceof SyncHttpError && err.status === 401) return 'signed-out';
    throw err;
  }
  await db.outbox.clear();
  await saveAccount({
    token: issued.token,
    email: issued.user.email,
    name: issued.user.name,
    initialSyncDone: false,
    lastPushAt: null,
    lastPullAt: null,
    lastEpoch: null,
    lastError: null,
  });
  const me = await fetchMe(issued.token);
  if (!me.hasData) {
    await uploadEverything();
    return 'uploaded';
  }
  if ((await localWorkoutCount()) === 0) {
    await restoreFromServer();
    return 'restored';
  }
  return 'choose';
}

export async function signOut(): Promise<void> {
  const account = await getAccount();
  if (account?.token) await revokeToken(account.token).catch(() => undefined);
  await clearAccount();
  await db.outbox.clear();
}
