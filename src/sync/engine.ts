import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { db } from '@/database/db';
import { exportAll } from '@/database/backup';
import { onOutboxChange } from '@/sync/outbox';
import { getAccount, isSignedIn, saveAccount } from '@/sync/auth';
import { PUSH_BATCH, pushRecords, SyncHttpError, type PushRecord } from '@/sync/api';
import { SYNC_TABLES, type OutboxEntry, type SyncTable } from '@/types';

const DEBOUNCE_MS = 4000;
const RETRY_MS = 60_000;

let paused = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let started = false;

/** Serializes pushes, uploads, and restores so they never overlap. */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export function setSyncPaused(value: boolean): void {
  if (paused === value) return;
  paused = value;
  if (!value) schedulePush(500);
}

export function schedulePush(delay = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, delay);
}

export function flushNow(): Promise<void> {
  return exclusive(pushPending);
}

export async function buildRecords(entries: OutboxEntry[]): Promise<PushRecord[]> {
  const byTable = new Map<SyncTable, OutboxEntry[]>();
  for (const entry of entries) {
    byTable.set(entry.table, [...(byTable.get(entry.table) ?? []), entry]);
  }
  const records: PushRecord[] = [];
  for (const [table, group] of byTable) {
    const rows = (await db.table(table).bulkGet(group.map((entry) => entry.recordId))) as Array<
      Record<string, unknown> | undefined
    >;
    group.forEach((entry, index) => {
      const row = rows[index];
      records.push(
        row && entry.op === 'put'
          ? { table, id: entry.recordId, data: row }
          : { table, id: entry.recordId, deleted: true },
      );
    });
  }
  return records;
}

async function removeSent(entries: OutboxEntry[]): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    const current = await db.outbox.bulkGet(entries.map((entry) => entry.key));
    const done = entries.filter((entry, index) => current[index]?.queuedAt === entry.queuedAt);
    await db.outbox.bulkDelete(done.map((entry) => entry.key));
  });
}

async function recordFailure(err: unknown): Promise<void> {
  if (err instanceof SyncHttpError && err.status === 401) {
    await saveAccount({ token: null, lastError: 'Signed out of tssamuel.com. Sign in again to keep syncing.' });
    return;
  }
  await saveAccount({ lastError: err instanceof Error ? err.message : 'Sync failed.' });
  schedulePush(RETRY_MS);
}

async function pushPending(): Promise<void> {
  if (paused) return;
  const account = await getAccount();
  if (!isSignedIn(account)) {
    await db.outbox.clear();
    return;
  }
  if (!account.initialSyncDone) return;
  try {
    for (;;) {
      const entries = await db.outbox.orderBy('queuedAt').limit(PUSH_BATCH).toArray();
      if (entries.length === 0) break;
      await pushRecords(account.token, await buildRecords(entries));
      await removeSent(entries);
      await saveAccount({ lastPushAt: new Date().toISOString(), lastError: null });
      if (paused) break;
    }
  } catch (err) {
    await recordFailure(err);
  }
}

/** Replaces everything on the server with this phone's data. */
export function uploadEverything(): Promise<void> {
  return exclusive(async () => {
    const account = await getAccount();
    if (!isSignedIn(account)) throw new Error('Sign in first.');
    const startedAt = new Date().toISOString();
    const envelope = await exportAll();
    const records: PushRecord[] = SYNC_TABLES.flatMap((table) =>
      envelope.tables[table].map((row) => ({ table, id: String(row.id), data: row })),
    );
    try {
      let offset = 0;
      do {
        await pushRecords(account.token, records.slice(offset, offset + PUSH_BATCH), offset === 0);
        offset += PUSH_BATCH;
      } while (offset < records.length);
    } catch (err) {
      await recordFailure(err);
      throw err;
    }
    await db.outbox.where('queuedAt').below(startedAt).delete();
    await saveAccount({ initialSyncDone: true, lastPushAt: new Date().toISOString(), lastError: null });
  });
}

/** After a file import replaced local data, mirror it to the server. */
export async function afterLocalReplace(): Promise<void> {
  const account = await getAccount();
  if (isSignedIn(account) && account.initialSyncDone) {
    await uploadEverything().catch(() => undefined);
  }
}

export function startSyncEngine(): void {
  if (started) return;
  started = true;
  onOutboxChange(() => schedulePush());
  window.addEventListener('online', () => schedulePush(1000));
  if (Capacitor.isNativePlatform()) {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) schedulePush(500);
      else void flushNow();
    });
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedulePush(500);
      else void flushNow();
    });
  }
  schedulePush(2000);
}
