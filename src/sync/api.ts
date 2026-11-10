import type { BackupEnvelope } from '@/database/backup';
import type { SyncTable } from '@/types';

export const SYNC_URL = (import.meta.env.VITE_SYNC_URL || 'https://momentum.tssamuel.com').replace(/\/$/, '');
export const PUSH_BATCH = 500;

export type PushRecord =
  | { table: SyncTable; id: string; data: Record<string, unknown> }
  | { table: SyncTable; id: string; deleted: true };

export type RemoteAccount = {
  email: string;
  name: string;
  isAdmin: boolean;
  lastSyncAt: string | null;
  hasData: boolean;
};

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  { method = 'GET', token, body }: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SYNC_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncHttpError(0, 'Offline or tssamuel.com is unreachable.');
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new SyncHttpError(response.status, payload.error || `Sync failed (${response.status}).`);
  }
  return payload as T;
}

export function exchangeHandoff(input: {
  code: string;
  verifier: string;
  redirectUri: string;
  device: string;
}): Promise<{ token: string; user: { email: string; name: string; isAdmin: boolean } }> {
  return request('/api/app/token', {
    method: 'POST',
    body: {
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
      device: input.device,
    },
  });
}

export function fetchMe(token: string): Promise<RemoteAccount> {
  return request('/api/me', { token });
}

export function pushRecords(
  token: string,
  records: PushRecord[],
  reset = false,
): Promise<{ accepted: number; serverTime: string }> {
  return request('/api/sync/push', { method: 'POST', token, body: reset ? { reset, records } : { records } });
}

export function fetchSnapshot(token: string): Promise<BackupEnvelope> {
  return request('/api/sync/snapshot', { token });
}

export function revokeToken(token: string): Promise<unknown> {
  return request('/api/logout', { method: 'POST', token });
}
