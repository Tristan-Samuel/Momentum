import '@testing-library/jest-dom/vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB });
Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange });

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => undefined },
      connect: () => this.createGain(),
      start: () => undefined,
      stop: () => undefined,
      disconnect: () => undefined,
      onended: null,
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
      disconnect: () => undefined,
    };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

Object.defineProperty(window, 'AudioContext', { value: MockAudioContext });
Object.defineProperty(window, 'webkitAudioContext', { value: MockAudioContext });
