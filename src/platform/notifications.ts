/**
 * Best-effort rest-complete notifications. Optional, never required.
 * iOS web support is limited.
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notifyRestComplete(title: string, body: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    new Notification(title, { body, silent: false });
  } catch {
    /* ignore */
  }
}
