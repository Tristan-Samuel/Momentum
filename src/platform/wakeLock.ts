/**
 * Screen wake lock. iOS Safari support is inconsistent; this is the V1
 * "phone face-up" strategy, not lock-screen coaching.
 */

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
};

export class WakeLockPort {
  private sentinel: WakeLockSentinel | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      void this.release();
    }
  }

  async request(): Promise<void> {
    if (!this.enabled || typeof navigator === 'undefined') return;
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
    try {
      await this.sentinel?.release();
    } catch {
      /* ignore */
    }
    this.sentinel = null;
  }
}

export const wakeLock = new WakeLockPort();
