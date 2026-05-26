import type { ReminderConfig } from '../types/routine';
import type { NotificationService } from '../types/services';

export const notificationService: NotificationService = {
  async initialize(): Promise<void> {},
  async scheduleDefaultReminders(_reminders: ReminderConfig[]): Promise<void> {},
};
