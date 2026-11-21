import type { BackupEnvelope } from '@/database/backup';
import type { SyncTable } from '@/types';

export const SYNC_URL = (import.meta.env.VITE_SYNC_URL || 'https://momentum.tssamuel.com').replace(/\/$/, '');
export const PUSH_BATCH = 500;
const REQUEST_TIMEOUT_MS = 30_000;

export type PushRecord =
  | { table: SyncTable; id: string; data: Record<string, unknown> }
  | { table: SyncTable; id: string; deleted: true; updatedAt?: string };

export type ChangeRecord =
  | { table: SyncTable; id: string; data: Record<string, unknown> }
  | { table: SyncTable; id: string; deleted: true };

export type ChangePage = {
  records: ChangeRecord[];
  cursor: string;
  epoch: number;
};

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

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function request<T>(
  path: string,
  {
    method = 'GET',
    token,
    body,
    credentials,
    signal,
  }: { method?: string; token?: string; body?: unknown; credentials?: RequestCredentials; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SYNC_URL}${path}`, {
      method,
      credentials,
      signal: requestSignal(signal),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new SyncHttpError(0, 'tssamuel.com took too long to answer.');
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SyncHttpError(0, 'Cancelled.');
    }
    throw new SyncHttpError(0, 'Offline or tssamuel.com is unreachable.');
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    const fallback =
      path === '/api/coach'
        ? 'Gemini could not answer. Try again in a moment.'
        : `Sync failed (${response.status}).`;
    throw new SyncHttpError(response.status, payload.error || fallback);
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
): Promise<{ accepted: number; serverTime: string; epoch?: number }> {
  return request('/api/sync/push', { method: 'POST', token, body: reset ? { reset, records } : { records } });
}

export function fetchChanges(token: string, since: string | null): Promise<ChangePage> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request(`/api/sync/changes${query}`, { token });
}

export function fetchWebToken(): Promise<{ token: string; user: { email: string; name: string; isAdmin: boolean } }> {
  return request('/api/web/token', { method: 'POST', body: {}, credentials: 'include' });
}

export function fetchSnapshot(token: string, signal?: AbortSignal): Promise<BackupEnvelope> {
  return request('/api/sync/snapshot', { token, signal });
}

export function revokeToken(token: string): Promise<unknown> {
  return request('/api/logout', { method: 'POST', token });
}

export function askCoach(
  token: string,
  body: { task: string; note: string; context: unknown },
): Promise<unknown> {
  return request('/api/coach', { method: 'POST', token, body });
}
