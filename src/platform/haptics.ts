/**
 * Haptics port. Web uses Vibration API. Native Capacitor is used when available.
 */

export type HapticKind = 'tick' | 'start' | 'warning' | 'complete' | 'countdown';

export interface HapticsPort {
  trigger(kind: HapticKind): Promise<void>;
}

const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 12,
  countdown: 20,
  start: [30, 40, 50],
  warning: [40, 30, 40],
  complete: [50, 40, 80],
};

export class WebHaptics implements HapticsPort {
  constructor(private enabled: boolean = true) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async trigger(kind: HapticKind): Promise<void> {
    if (!this.enabled) return;
    if (await tryNativeHaptic(kind)) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return;
    }
    navigator.vibrate(PATTERNS[kind]);
  }
}

async function tryNativeHaptic(kind: HapticKind): Promise<boolean> {
  try {
    const core = await import('@capacitor/core');
    if (!core.Capacitor.isNativePlatform()) return false;
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const style =
      kind === 'complete' || kind === 'start' ? ImpactStyle.Heavy : ImpactStyle.Medium;
    await Haptics.impact({ style });
    return true;
  } catch {
    return false;
  }
}

export const haptics = new WebHaptics();
