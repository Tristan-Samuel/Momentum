import { Capacitor } from '@capacitor/core';
import { SYNC_URL } from '@/sync/api';

/** The production site, where the Flask session can mint a device token. Local dev keeps the phone sign-in. */
export function isHostedApp(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof window === 'undefined') return false;
  return window.location.origin === SYNC_URL;
}
