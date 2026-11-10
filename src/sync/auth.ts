import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database/db';
import type { SyncAccount } from '@/types';

export async function getAccount(): Promise<SyncAccount | undefined> {
  return db.syncState.get('account');
}

export async function saveAccount(patch: Partial<Omit<SyncAccount, 'id'>>): Promise<void> {
  const current = await getAccount();
  await db.syncState.put({
    id: 'account',
    token: null,
    email: '',
    name: '',
    lastPushAt: null,
    lastError: null,
    initialSyncDone: false,
    ...current,
    ...patch,
  });
}

export async function clearAccount(): Promise<void> {
  await db.syncState.delete('account');
}

export function isSignedIn(account: SyncAccount | undefined | null): account is SyncAccount & { token: string } {
  return Boolean(account?.token);
}

/** `undefined` while loading, `null` when there is no account. */
export function useSyncAccount(): SyncAccount | null | undefined {
  return useLiveQuery(async () => (await getAccount()) ?? null, []);
}
