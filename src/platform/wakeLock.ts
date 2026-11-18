import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Keeps the screen on during a workout.
 * On iPhone this disables the idle timer. The browser Wake Lock API is a no-op in the app's WebView.
 */

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
};

type KeepAwakePlugin = {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
};

const KeepAwake = registerPlugin<KeepAwakePlugin>('KeepAwake');

export class WakeLockPort {
  private sentinel: WakeLockSentinel | null = null;
  private enabled = true;
  private nativeHeld = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      void this.release();
    }
  }

  async request(): Promise<void> {
    if (!this.enabled || typeof navigator === 'undefined') return;
    if (Capacitor.isNativePlatform()) {
      await KeepAwake.keepAwake();
      this.nativeHeld = true;
      return;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return;
    try {
      this.sentinel = await nav.wakeLock.request('screen');
    } catch {
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    if (this.nativeHeld) {
      this.nativeHeld = false;
      await KeepAwake.allowSleep().catch(() => undefined);
    }
    try {
      await this.sentinel?.release();
    } catch {
      /* ignore */
    }
    this.sentinel = null;
  }
}

export const wakeLock = new WakeLockPort();
