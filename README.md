# Momentum

A local-first personal workout coach. Open the app, press Start, and let it run the session: countdown, tempo metronome, rest, transitions, and the next recommended targets.

This is not a social fitness app. It is a training instrument for one person, on one device.

## Stack

- React, TypeScript, Vite, Tailwind CSS
- Dexie.js / IndexedDB (no account, no backend, no sync)
- Web Audio API for workout cues
- Capacitor-ready platform adapters for later iOS/macOS packaging

## Develop

```bash
npm install
npm run dev
npm test
npm run build
```

The app works fully offline after the first load. No network request is required to start a workout, log sets, or compute progression.

## Default program

**Minimalist Strength**

1. L-Sit Chin-Up — 2×6–10, tempo 3-0-1-0, rest 150s
2. Pull-Up — 1×6–12, tempo 3-0-1-0, rest 150s
3. Weighted / Difficult Push-Up — 2×6–12, tempo 3-0-1-0, rest 120s
4. Pistol Squat — 2×5–8 per leg, tempo 3-1-1-0, rest 150s (right then left)

## Browser limits

V1 cannot guarantee metronome playback when the screen is locked or the app is backgrounded. iOS Safari suspends `AudioContext` and throttles timers.

During a set, keep the phone face-up. Wake Lock is used when the browser supports it. Rest timers catch up from wall-clock time if you return after the tab was hidden. Native background audio is isolated behind `src/platform/background.ts` for a later Capacitor implementation.

## Capacitor

`capacitor.config.ts` is prepared for iOS/macOS packaging. Native haptics and local notifications can replace the web adapters in `src/platform/` without changing the workout engine.
