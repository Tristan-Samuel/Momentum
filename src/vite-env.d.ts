/// <reference types="vite/client" />

interface WakeLockSentinel {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLock {
  request: (type: 'screen') => Promise<WakeLockSentinel>;
}

interface Navigator {
  wakeLock?: WakeLock;
  vibrate?: (pattern: number | number[]) => boolean;
}

interface Window {
  webkitAudioContext: typeof AudioContext;
}
