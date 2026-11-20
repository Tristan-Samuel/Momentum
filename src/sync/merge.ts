import { db } from '@/database/db';
import { withOutboxSuppressed, outboxKey } from '@/sync/outbox';
import type { ChangeRecord } from '@/sync/api';
import { SYNC_TABLES, type SyncTable } from '@/types';

function isSyncTable(value: string): value is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(value);
}

/** Applies remote rows. A pending local edit wins. The same or an older updatedAt is left alone. */
export async function applyRemoteRecords(records: ChangeRecord[]): Promise<void> {
  const pending = new Set((await db.outbox.toArray()).map((entry) => entry.key));
  await withOutboxSuppressed(() =>
    db.transaction(
      'rw',
      SYNC_TABLES.map((name) => db.table(name)),
      async () => {
        for (const record of records) {
          if (!isSyncTable(record.table)) continue;
          if (pending.has(outboxKey(record.table, record.id))) continue;
          const table = db.table(record.table);
          if ('deleted' in record && record.deleted) {
            await table.delete(record.id);
            continue;
          }
          if (!('data' in record) || record.data?.id !== record.id) continue;
          const local = (await table.get(record.id)) as { updatedAt?: unknown } | undefined;
          const remoteAt = typeof record.data.updatedAt === 'string' ? record.data.updatedAt : '';
          const localAt = typeof local?.updatedAt === 'string' ? local.updatedAt : '';
          if (local && (!remoteAt || remoteAt <= localAt)) continue;
          await table.put(record.data);
        }
      },
    ),
  );
}
