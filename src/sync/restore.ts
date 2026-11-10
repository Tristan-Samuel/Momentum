import { db } from '@/database/db';
import { backupSummary, importAll, normalizeEnvelope } from '@/database/backup';
import { exchangeHandoff, fetchMe, fetchSnapshot, revokeToken } from '@/sync/api';
import { clearAccount, getAccount, isSignedIn, saveAccount } from '@/sync/auth';
import { exclusive, uploadEverything } from '@/sync/engine';
import { deviceLabel, type SignInResult } from '@/platform/webAuth';

/** Replaces this phone's data with what tssamuel.com has. */
export function restoreFromServer(): Promise<{ workouts: number; programs: number }> {
  return exclusive(async () => {
    const account = await getAccount();
    if (!isSignedIn(account)) throw new Error('Sign in first.');
    const snapshot = await fetchSnapshot(account.token);
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

export async function signOut(): Promise<void> {
  const account = await getAccount();
  if (account?.token) await revokeToken(account.token).catch(() => undefined);
  await clearAccount();
  await db.outbox.clear();
}
