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

function settle<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = window.setTimeout(() => resolve(undefined), ms);
    }),
  ]).finally(() => window.clearTimeout(timer));
}

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
      await settle(KeepAwake.keepAwake(), 800);
      this.nativeHeld = true;
      return;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return;
    try {
      const pending = nav.wakeLock.request('screen');
      const sentinel = await settle(pending, 800);
      if (sentinel) {
        this.sentinel = sentinel;
        return;
      }
      void pending
        .then((later) => {
          if (!this.enabled || this.sentinel) {
            void later.release();
            return;
          }
          this.sentinel = later;
        })
        .catch(() => undefined);
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
