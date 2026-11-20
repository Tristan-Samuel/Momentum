import { describe, expect, it, vi } from 'vitest';
import { askForAppUpdate, statusIsCurrent, updateStatusMessage } from '@/platform/appUpdate';

describe('app update', () => {
  it('asks the first home server that accepts the request', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).startsWith('http://tristan-pi.local')) {
        return new Response(JSON.stringify({ ok: true, at: '2026-11-20T21:00:00+00:00' }), { status: 200 });
      }
      throw new Error('down');
    }) as unknown as typeof fetch;

    const result = await askForAppUpdate(fetchImpl);
    expect(result.base).toBe('http://tristan-pi.local:8765');
    expect(result.at).toBe('2026-11-20T21:00:00+00:00');
    expect(result.message).toMatch(/Keep the phone unlocked/);
  });

  it('says when the home server cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await askForAppUpdate(fetchImpl);
    expect(result.base).toBe('');
    expect(result.message).toMatch(/home Wi-Fi/);
  });

  it('turns a status into a sentence', () => {
    expect(updateStatusMessage({ action: 'installed', reason: 'installed', at: '' })).toMatch(/Reopen/);
    expect(updateStatusMessage({ action: 'wait', reason: 'iPhone is locked', at: '' })).toBe(
      'iPhone is locked',
    );
  });

  it('ignores a status from before this tap', () => {
    const started = '2026-11-20T21:00:00+00:00';
    expect(statusIsCurrent({ action: 'installed', reason: '', at: '2026-11-20T20:00:00+00:00' }, started)).toBe(
      false,
    );
    expect(statusIsCurrent({ action: 'installing', reason: '', at: '2026-11-20T21:00:01+00:00' }, started)).toBe(
      true,
    );
  });
});
