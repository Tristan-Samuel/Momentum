import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { ReminderConfig } from '../types/routine';
import type { NotificationService } from '../types/services';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let isInitialized = false;

export const notificationService: NotificationService = {
  async initialize(): Promise<void> {
    if (isInitialized) {
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      await Notifications.requestPermissionsAsync();
    }

    isInitialized = true;
  },

  async scheduleDefaultReminders(reminders: ReminderConfig[]): Promise<void> {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const reminder of reminders) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: reminder.hour,
          minute: reminder.minute,
        },
      });
    }
  },
};
