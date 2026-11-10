import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import { createProgram, listPrograms } from '@/database/repository';
import { exportAll } from '@/database/backup';
import { pkceChallenge, readCallback } from '@/platform/webAuth';
import { sha256 } from '@/sync/sha256';
import { getAccount, saveAccount } from '@/sync/auth';
import { buildRecords, flushNow, uploadEverything } from '@/sync/engine';
import { completeSignIn, restoreFromServer, signOut } from '@/sync/restore';
import { outboxKey } from '@/sync/outbox';

type Call = { url: string; method: string; body: unknown; auth: string | null };

let calls: Call[] = [];
let responder: (call: Call) => { status?: number; body: unknown } = () => ({ body: {} });

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call = {
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        auth: headers.Authorization ?? null,
      };
      calls.push(call);
      const { status = 200, body } = responder(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  responder = () => ({ body: {} });
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function signedIn(initialSyncDone = true): Promise<void> {
  await saveAccount({ token: 'tok', email: 'me@example.com', initialSyncDone });
}

describe('pkce', () => {
  it('matches the RFC 7636 example', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('has a pure fallback that agrees with WebCrypto', async () => {
    for (const text of ['', 'abc', 'x'.repeat(55), 'y'.repeat(64), 'z'.repeat(200)]) {
      const bytes = new TextEncoder().encode(text);
      const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      expect(Array.from(sha256(bytes))).toEqual(Array.from(expected));
    }
  });

  it('refuses callbacks with the wrong state', () => {
    expect(readCallback('com.momentum.workout://auth/callback?code=c&state=s', 's')).toBe('c');
    expect(() => readCallback('com.momentum.workout://auth/callback?code=c&state=x', 's')).toThrow();
    expect(() => readCallback('com.momentum.workout://auth/callback?state=s', 's')).toThrow();
  });
});

describe('push engine', () => {
  it('turns outbox entries into puts and deletes', async () => {
    const program = await createProgram('Day B');
    const records = await buildRecords([
      { key: outboxKey('workoutPrograms', program.id), table: 'workoutPrograms', recordId: program.id, op: 'put', queuedAt: 'a' },
      { key: outboxKey('exercises', 'gone'), table: 'exercises', recordId: 'gone', op: 'put', queuedAt: 'a' },
      { key: outboxKey('exercises', 'x'), table: 'exercises', recordId: 'x', op: 'delete', queuedAt: 'a' },
    ]);
    expect(records[0]).toMatchObject({ table: 'workoutPrograms', id: program.id, data: { name: 'Day B' } });
    expect(records.slice(1)).toEqual([
      { table: 'exercises', id: 'gone', deleted: true },
      { table: 'exercises', id: 'x', deleted: true },
    ]);
  });

  it('pushes queued changes with the device token and empties the outbox', async () => {
    await signedIn();
    await createProgram('Day B');
    await settle();
    expect(await db.outbox.count()).toBeGreaterThan(0);

    responder = () => ({ body: { accepted: 1, serverTime: 'now' } });
    await flushNow();

    const push = calls.find((call) => call.url.endsWith('/api/sync/push'));
    expect(push?.auth).toBe('Bearer tok');
    expect((push?.body as { records: unknown[] }).records.length).toBeGreaterThan(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await getAccount())?.lastPushAt).not.toBeNull();
  });

  it('keeps the outbox and records the error when offline', async () => {
    await signedIn();
    await createProgram('Day B');
    await settle();
    responder = () => ({ status: 503, body: { error: 'Down' } });
    await flushNow();
    expect(await db.outbox.count()).toBeGreaterThan(0);
    expect((await getAccount())?.lastError).toBe('Down');
  });

  it('drops the token when the server says it was revoked', async () => {
    await signedIn();
    await createProgram('Day B');
    await settle();
    responder = () => ({ status: 401, body: { error: 'Signed out.' } });
    await flushNow();
    expect((await getAccount())?.token).toBeNull();
  });

  it('does not push before the first sync is settled, and clears the outbox when signed out', async () => {
    await signedIn(false);
    await createProgram('Day B');
    await settle();
    await flushNow();
    expect(calls).toHaveLength(0);
    expect(await db.outbox.count()).toBeGreaterThan(0);

    await db.syncState.clear();
    await flushNow();
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('full upload and restore', () => {
  it('uploads everything with reset on the first batch', async () => {
    await signedIn(false);
    await createProgram('Day B');
    await settle();
    responder = () => ({ body: { accepted: 1, serverTime: 'now' } });
    await uploadEverything();
    const pushes = calls.filter((call) => call.url.endsWith('/api/sync/push'));
    expect((pushes[0].body as { reset?: boolean }).reset).toBe(true);
    const tables = new Set((pushes[0].body as { records: Array<{ table: string }> }).records.map((r) => r.table));
    expect(tables.has('workoutPrograms')).toBe(true);
    expect(tables.has('appSettings')).toBe(true);
    expect(await db.outbox.count()).toBe(0);
    expect((await getAccount())?.initialSyncDone).toBe(true);
  });

  it('restores the server copy without queueing it back up', async () => {
    await createProgram('Server program');
    const snapshot = await exportAll();
    await Promise.all(db.tables.map((table) => table.clear()));
    await signedIn(false);
    await createProgram('Local only');
    await settle();

    responder = (call) => (call.url.endsWith('/api/sync/snapshot') ? { body: snapshot } : { body: {} });
    const summary = await restoreFromServer();
    await settle();

    expect(summary.programs).toBe(2);
    expect((await listPrograms()).map((row) => row.name)).toEqual(['Minimalist Strength', 'Server program']);
    expect(await db.outbox.count()).toBe(0);
    expect((await getAccount())?.initialSyncDone).toBe(true);
  });

  it('signs in and uploads straight away when the server is empty', async () => {
    responder = (call) => {
      if (call.url.endsWith('/api/app/token')) {
        return { body: { token: 'fresh', user: { email: 'me@example.com', name: 'Me', isAdmin: false } } };
      }
      if (call.url.endsWith('/api/me')) return { body: { hasData: false } };
      return { body: { accepted: 1 } };
    };
    const outcome = await completeSignIn({ code: 'c', verifier: 'v', redirectUri: 'r' });
    expect(outcome).toBe('uploaded');
    expect(calls[0].body).toMatchObject({ code: 'c', code_verifier: 'v', redirect_uri: 'r' });
    expect((await getAccount())?.token).toBe('fresh');
    expect((await getAccount())?.initialSyncDone).toBe(true);
  });

  it('asks the user to choose when the server already has data', async () => {
    responder = (call) =>
      call.url.endsWith('/api/app/token')
        ? { body: { token: 'fresh', user: { email: 'me@example.com', name: '', isAdmin: false } } }
        : { body: { hasData: true } };
    expect(await completeSignIn({ code: 'c', verifier: 'v', redirectUri: 'r' })).toBe('choose');
    expect((await getAccount())?.initialSyncDone).toBe(false);
    expect(calls.some((call) => call.url.endsWith('/api/sync/push'))).toBe(false);
  });

  it('signs out by revoking the token and forgetting the account', async () => {
    await signedIn();
    await signOut();
    expect(calls[0].url.endsWith('/api/logout')).toBe(true);
    expect(await getAccount()).toBeUndefined();
  });
});
