/**
 * Background execution port.
 *
 * V1 web cannot keep a metronome running while the screen is locked or the
 * app is backgrounded. iOS Safari suspends AudioContext and throttles timers.
 *
 * Native Capacitor implementations should replace this adapter later
 * (silent audio session, background modes, local notifications).
 */

export type BackgroundPolicy = {
  pauseMetronomeOnHide: true;
  catchUpRestOnResume: true;
  guaranteedBackgroundAudio: false;
};

export const backgroundPolicy: BackgroundPolicy = {
  pauseMetronomeOnHide: true,
  catchUpRestOnResume: true,
  guaranteedBackgroundAudio: false,
};

export function shouldPauseForBackground(
  kind: 'pre_set_countdown' | 'set_active' | 'resting' | 'exercise_transition' | string,
): boolean {
  return kind === 'pre_set_countdown' || kind === 'set_active';
}

export function shouldCatchUpOnResume(
  kind: 'pre_set_countdown' | 'set_active' | 'resting' | 'exercise_transition' | string,
): boolean {
  return kind === 'resting' || kind === 'exercise_transition';
}
