/**
 * Native notification adapter. Web Notifications stay in notifications.ts.
 * On Capacitor, this can schedule a local notification when rest ends.
 */

export async function scheduleNativeRestNotification(
  title: string,
  body: string,
  at: Date,
): Promise<void> {
  try {
    const core = await import('@capacitor/core');
    if (!core.Capacitor.isNativePlatform()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 100000,
          title,
          body,
          schedule: { at },
        },
      ],
    });
  } catch {
    /* native plugin unavailable */
  }
}
