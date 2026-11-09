import type { Transaction } from 'dexie';
import type { MomentumDB } from '@/database/db';
import { SYNC_TABLES, type OutboxEntry, type SyncTable } from '@/types';

let suppressed = 0;
let installed = false;
const pending = new WeakMap<Transaction, Map<string, OutboxEntry>>();
const listeners = new Set<() => void>();

export function outboxKey(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function withOutboxSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  suppressed += 1;
  try {
    return await fn();
  } finally {
    suppressed -= 1;
  }
}

function entry(table: SyncTable, id: string, op: OutboxEntry['op']): OutboxEntry {
  return { key: outboxKey(table, id), table, recordId: id, op, queuedAt: new Date().toISOString() };
}

export function installOutboxHooks(db: MomentumDB): void {
  if (installed) return;
  installed = true;
  const queue = (tx: Transaction, next: OutboxEntry) => {
    if (suppressed > 0) return;
    let batch = pending.get(tx);
    if (!batch) {
      batch = new Map();
      pending.set(tx, batch);
      const flush = batch;
      tx.on('complete', () => {
        void db.outbox.bulkPut([...flush.values()]).then(() => {
          listeners.forEach((listener) => listener());
        });
      });
    }
    batch.set(next.key, next);
  };

  for (const table of SYNC_TABLES) {
    const hooks = db.table(table).hook;
    hooks('creating', function (primKey, obj: { id?: string }, tx) {
      const id = String(primKey ?? obj.id ?? '');
      if (id) queue(tx, entry(table, id, 'put'));
    });
    hooks('updating', function (_mods, primKey, _obj, tx) {
      queue(tx, entry(table, String(primKey), 'put'));
    });
    hooks('deleting', function (primKey, _obj, tx) {
      queue(tx, entry(table, String(primKey), 'delete'));
    });
  }
}

export async function queueDeletes(db: MomentumDB, table: SyncTable, ids: string[]): Promise<void> {
  if (suppressed > 0 || ids.length === 0) return;
  await db.outbox.bulkPut(ids.map((id) => entry(table, id, 'delete')));
  listeners.forEach((listener) => listener());
}
