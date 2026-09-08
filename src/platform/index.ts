export { WebHaptics, haptics, type HapticsPort, type HapticKind } from '@/platform/haptics';
export { WakeLockPort, wakeLock } from '@/platform/wakeLock';
export {
  requestNotificationPermission,
  notifyRestComplete,
  scheduleRestCompleteAlert,
  cancelRestCompleteAlert,
  sendTestNotification,
  restAlertKey,
} from '@/platform/notifications';
export { scheduleNativeRestNotification } from '@/platform/nativeNotifications';
export {
  backgroundPolicy,
  shouldPauseForBackground,
  shouldCatchUpOnResume,
} from '@/platform/background';
