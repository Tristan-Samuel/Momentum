/**
 * Rest-complete alerts. Native Capacitor uses local notifications.
 * The web Notification API is a fallback and is limited on iOS Safari.
 */

import {
  cancelNativeRestNotification,
  isNativeNotificationsAvailable,
  requestNativeNotificationPermission,
  scheduleNativeRestNotification,
  scheduleNativeTestNotification,
} from '@/platform/nativeNotifications';

export async function requestNotificationPermission(): Promise<boolean> {
  const native = await requestNativeNotificationPermission();
  if (native != null) return native;
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

export async function scheduleRestCompleteAlert(input: {
  enabled: boolean;
  title: string;
  body: string;
  inSeconds: number;
}): Promise<void> {
  if (!input.enabled || input.inSeconds < 1) {
    await cancelRestCompleteAlert();
    return;
  }
  if (await isNativeNotificationsAvailable()) {
    await scheduleNativeRestNotification(
      input.title,
      input.body,
      new Date(Date.now() + input.inSeconds * 1000),
    );
    return;
  }
}

export async function cancelRestCompleteAlert(): Promise<void> {
  await cancelNativeRestNotification();
}

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  if (await isNativeNotificationsAvailable()) {
    const ok = await scheduleNativeTestNotification();
    return ok
      ? { ok: true, message: 'Test alert in 2 seconds. Lock the phone or leave the app to see it.' }
      : {
          ok: false,
          message: 'Notifications are blocked. Enable them in iOS Settings → Momentum.',
        };
  }
  const granted = await requestNotificationPermission();
  if (!granted) {
    return {
      ok: false,
      message: 'This browser blocked notifications. Use the native iPhone app for rest alerts.',
    };
  }
  try {
    new Notification('Momentum', {
      body: 'Notifications are working in this browser.',
      silent: false,
    });
    return { ok: true, message: 'Test notification sent.' };
  } catch {
    return { ok: false, message: 'Could not show a web notification.' };
  }
}

export function restAlertKey(input: {
  kind: string;
  exerciseIndex: number;
  setIndex: number;
  restTotal: number;
}): string | null {
  if (input.kind !== 'resting' && input.kind !== 'exercise_transition') return null;
  return `${input.kind}:${input.exerciseIndex}:${input.setIndex}:${Math.round(input.restTotal)}`;
}
