const REST_NOTIFICATION_ID = 71001;
const TEST_NOTIFICATION_ID = 71002;

type LocalNotificationsPlugin = {
  checkPermissions: () => Promise<{ display: string }>;
  requestPermissions: () => Promise<{ display: string }>;
  schedule: (input: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      schedule?: { at: Date };
      sound?: string;
    }>;
  }) => Promise<unknown>;
  cancel: (input: { notifications: Array<{ id: number }> }) => Promise<void>;
};

async function getPlugin(): Promise<LocalNotificationsPlugin | null> {
  try {
    const core = await import('@capacitor/core');
    if (!core.Capacitor.isNativePlatform()) return null;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch {
    return null;
  }
}

export async function isNativeNotificationsAvailable(): Promise<boolean> {
  return (await getPlugin()) != null;
}

export async function requestNativeNotificationPermission(): Promise<boolean | null> {
  const plugin = await getPlugin();
  if (!plugin) return null;
  const current = await plugin.checkPermissions();
  if (current.display === 'granted') return true;
  const result = await plugin.requestPermissions();
  return result.display === 'granted';
}

export async function scheduleNativeRestNotification(
  title: string,
  body: string,
  at: Date,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
  if (at.getTime() <= Date.now() + 250) return;
  await plugin.schedule({
    notifications: [
      {
        id: REST_NOTIFICATION_ID,
        title,
        body,
        schedule: { at },
        sound: 'beep.wav',
      },
    ],
  });
}

export async function cancelNativeRestNotification(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
}

export async function scheduleNativeTestNotification(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  const allowed = await requestNativeNotificationPermission();
  if (!allowed) return false;
  await plugin.schedule({
    notifications: [
      {
        id: TEST_NOTIFICATION_ID,
        title: 'Momentum',
        body: 'Notifications are working. Rest alerts will use this same chime.',
        schedule: { at: new Date(Date.now() + 2000) },
        sound: 'beep.wav',
      },
    ],
  });
  return true;
}
