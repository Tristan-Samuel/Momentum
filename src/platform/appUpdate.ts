export const UPDATE_HOSTS = ['http://tristan-pi.local:8765', 'http://Tristan-Pi.local:8765'];

export type UpdateStatus = {
  action: string;
  reason: string;
  at: string;
};

const UNREACHABLE = 'The home server did not answer. Connect to the home Wi-Fi and try again.';

export async function askForAppUpdate(
  fetchImpl: typeof fetch = fetch,
): Promise<{ base: string; at: string; message: string }> {
  let last = UNREACHABLE;
  for (const base of UPDATE_HOSTS) {
    try {
      const response = await fetchImpl(`${base}/update`, {
        method: 'POST',
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) {
        last = 'The home server refused the update.';
        continue;
      }
      const body = (await response.json()) as { at?: unknown };
      return {
        base,
        at: typeof body.at === 'string' ? body.at : '',
        message: 'Installing. Keep the phone unlocked. Momentum closes when the new version is ready.',
      };
    } catch {
      continue;
    }
  }
  return { base: '', at: '', message: last };
}

export async function readUpdateStatus(
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateStatus | null> {
  const response = await fetchImpl(`${base}/status`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) return null;
  const body = (await response.json()) as Partial<UpdateStatus> | null;
  if (!body || typeof body.action !== 'string') return null;
  return {
    action: body.action,
    reason: typeof body.reason === 'string' ? body.reason : '',
    at: typeof body.at === 'string' ? body.at : '',
  };
}

export function updateStatusMessage(status: UpdateStatus): string {
  if (status.action === 'installed') return 'Installed. Reopen Momentum if it closed.';
  if (status.action === 'installing') {
    return 'Installing. Keep the phone unlocked. Momentum closes when the new version is ready.';
  }
  if (status.action === 'failed') return status.reason || 'The install failed.';
  return status.reason;
}

export function statusIsCurrent(status: UpdateStatus, startedAt: string): boolean {
  if (!startedAt) return true;
  return status.at >= startedAt;
}
