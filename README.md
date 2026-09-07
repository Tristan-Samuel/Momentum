# Momentum

A local-first personal workout coach. Open the app, press **Start**, and it runs the session for you: countdown, tempo metronome, rest, transitions, and the next recommended targets.

This is not a social fitness app. It is a training instrument for one person, on one device. There is no account, no backend, and no sync. After the first load, a workout can start with the network off.

---

## Table of contents

1. [What it does](#what-it-does)
2. [How a workout runs](#how-a-workout-runs)
3. [Default program](#default-program)
4. [Stack](#stack)
5. [Repository map](#repository-map)
6. [Prerequisites](#prerequisites)
7. [Develop on a computer](#develop-on-a-computer)
8. [Tests](#tests)
9. [Bring it to iPhone](#bring-it-to-iphone)
   - [Choose a path](#choose-a-path)
   - [Path A — Safari Home Screen (no Mac, no App Store)](#path-a--safari-home-screen-no-mac-no-app-store)
   - [Path B — Native app with Xcode (recommended)](#path-b--native-app-with-xcode-recommended)
   - [Path C — a-Shell on the iPhone](#path-c--a-shell-on-the-iphone)
10. [First workout on the phone](#first-workout-on-the-phone)
11. [Rebuild after you change the code](#rebuild-after-you-change-the-code)
12. [Progression rules](#progression-rules)
13. [Settings](#settings)
14. [Browser and iOS limits](#browser-and-ios-limits)
15. [Privacy](#privacy)
16. [Scripts](#scripts)

---

## What it does

Momentum coaches one prescribed session at a time. You do not count reps against a silent timer. The app counts, cues tempo, rests you, and then tells you what to do next.

| Screen | What it is for |
| --- | --- |
| **Home** | Next workout summary, last session, streak, **Start workout** |
| **Workout** | Full-screen coaching: countdown, live reps, tempo phase, rest ring |
| **Review** | Session summary, next-session targets, optional resistance increase |
| **History** | Past workouts and per-session detail |
| **Progress** | Per-exercise trends, personal records, lifetime totals |
| **Program** | Edit the program: names, sets, rep ranges, tempo, rest, laterality |
| **Settings** | Theme, sound profile, volume, haptics, keep-awake, accessibility |

Data lives in IndexedDB on that device (Dexie). Clearing Safari/WebView storage wipes history.

---

## How a workout runs

1. Home shows the seeded **Minimalist Strength** program (or whatever you configured).
2. **Start workout** unlocks audio, requests a screen wake lock when the browser allows it, and begins the first set.
3. Each set is: **3-second countdown → metronome-paced reps → set complete**.
4. Between sets you rest. Between exercises you get a shorter transition. Rest timers use wall-clock time, so they catch up if you glance away and come back.
5. After each exercise you can rate difficulty, RIR, and form. That rating feeds the next session’s targets.
6. If you leave mid-session, Home offers **Resume** or **Discard**.
7. When the last set finishes, Review shows totals and the next recommended targets.

During a set, keep the phone face-up and the screen on. Browser workout mode cannot keep the metronome alive if iOS suspends the tab. See [Browser and iOS limits](#browser-and-ios-limits).

Workout controls (pause, skip, ± rep, override target, extend rest, end) sit behind the **Controls** sheet so the main stage stays uncluttered.

---

## Default program

**Minimalist Strength** — four movements, double progression (add a rep until the top of the range, then increase difficulty and reset toward the bottom).

| Order | Exercise | Prescription | Tempo | Rest |
| --- | --- | --- | --- | --- |
| 1 | L-Sit Chin-Up | 2×6–10 | 3-0-1-0 | 150s |
| 2 | Pull-Up | 1×6–12 | 3-0-1-0 | 150s |
| 3 | Weighted / Difficult Push-Up | 2×6–12 | 3-0-1-0 | 120s |
| 4 | Pistol Squat | 2×5–8 per leg, right then left | 3-1-1-0 | 150s |

Tempo is **eccentric – bottom pause – concentric – top pause**, in seconds. `3-0-1-0` means a 3-second lower, no pause, a 1-second lift, no top hold.

Edit this on **Program**. Add or rename exercises, change sets, rest, transition, RIR targets, and unilateral order. Nothing here requires a server.

---

## Stack

- **UI:** React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router
- **Persistence:** Dexie.js on IndexedDB (no account, no backend, no sync)
- **Coaching audio:** Web Audio API (procedural tones, not sample files)
- **Native packaging:** Capacitor 8 (`appId` `com.momentum.workout`)
- **Tests:** Vitest + Testing Library + fake-indexeddb

Platform-specific behavior (haptics, wake lock, notifications, background policy) is isolated under `src/platform/` so a Capacitor iOS shell can replace the web adapters without touching the workout engine.

---

## Repository map

```
capacitor.config.ts     Capacitor app id, name, and webDir (dist)
index.html              PWA meta tags for standalone Home Screen use
public/                 Favicon + web manifest
src/audio-engine/       Web Audio tones and sound profiles
src/components/         Shell, buttons, rest ring, resume prompt
src/database/           Dexie schema, seed program, repository
src/hooks/              Workout runner, settings, prepared workout
src/platform/           Haptics, wake lock, notifications, background policy
src/progression/        Double-progression algorithm
src/screens/            Home, workout, review, history, progress, program, settings
src/timing-engine/      Clock, cue schedule, tempo phases
src/workout-engine/     Session state machine + persistence events
```

The native `ios/` folder is **not** in the repo. Path B generates it once with `npx cap add ios`.

---

## Prerequisites

### Any computer (web app, Path A, Path C)

- [Node.js](https://nodejs.org/) 20 or newer (LTS is fine)
- npm (ships with Node)
- A current browser: Safari, Chrome, Firefox, or Edge

### Native iPhone install (Path B only)

- A Mac (Apple does not allow iOS app compilation on Windows or Linux)
- [Xcode](https://developer.apple.com/xcode/) from the Mac App Store — Capacitor 8 expects **Xcode 26 or newer**
- Xcode Command Line Tools: `xcode-select --install`
- A free Apple ID (a paid Apple Developer Program membership is **not** required to run on your own iPhone)
- An iPhone on iOS 15 or newer, a USB cable (or wireless pairing in Finder)

---

## Develop on a computer

From the repository root:

```bash
npm install
npm run dev
```

Vite prints a local URL, usually `http://localhost:5173`. Open it in a browser.

- The first visit seeds Minimalist Strength into IndexedDB.
- Click **Start workout** once so the browser can unlock `AudioContext`. Safari and Chrome block sound until a user gesture.
- `npm run dev -- --host` exposes the same dev server on your LAN if you want to preview on a phone without building (audio and wake lock are less reliable this way than a production build).

Production-style local preview:

```bash
npm run build
npm run preview
```

---

## Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage includes the workout engine, cue scheduling, progression, tempo helpers, and the Dexie repository.

---

## Bring it to iPhone

### Choose a path

| | Path A — Home Screen | Path B — Xcode | Path C — a-Shell |
| --- | --- | --- | --- |
| Need a Mac? | No | Yes | No |
| Looks like an app icon? | Yes | Yes | Yes, if you Add to Home Screen from Safari |
| Installs as a real iOS app? | No (Safari standalone) | Yes | No |
| Native haptics / local notifications | No | Yes, when Capacitor plugins run | No |
| Best for | Trying it this week | Daily training on your phone | Using the phone as the only computer |

**Path B is the one that “puts Momentum on the iPhone” as a normal app.** Path A is the fastest way to train without Xcode. Path C is for when the iPhone is the machine doing the serving.

---

### Path A — Safari Home Screen (no Mac, no App Store)

You build the web app on any computer, serve it on your Wi-Fi, open it in iPhone Safari, and save it to the Home Screen. It launches full-screen, with the Momentum name, like a lightweight app.

#### 1. Install and build

On your computer, in the repo:

```bash
npm install
npm run build
```

That writes hashed assets into `dist/`. Do not open `dist/index.html` as a file. Vite’s production paths need an HTTP server.

#### 2. Serve it on the LAN

```bash
npx vite preview --host --port 4173
```

`--host` binds to `0.0.0.0` so the phone can reach it. Leave this process running.

Find the computer’s address:

- **macOS:** System Settings → Wi-Fi → Details, or `ipconfig getifaddr en0`
- **Windows:** `ipconfig` and read **IPv4 Address**
- **Linux:** `hostname -I` or `ip addr`

Example URL: `http://192.168.1.42:4173`

The computer and the iPhone must be on the **same Wi-Fi**. Guest networks and client isolation often block this. If the phone cannot load the page, allow Node/Vite through the computer’s firewall for port `4173`.

#### 3. Open it in Safari on the iPhone

1. Open **Safari** (not Chrome — only Safari can Add to Home Screen as a standalone web app).
2. Go to `http://YOUR_LAN_IP:4173`.
3. Confirm Home loads and **Start workout** works. Tap once to allow sound if iOS asks.

#### 4. Add to Home Screen

1. Tap the **Share** button (square with an up arrow).
2. Scroll and tap **Add to Home Screen**.
3. Name it **Momentum**.
4. Tap **Add**.

The icon appears on the Home Screen. Opening it uses Safari’s standalone mode (`display: standalone` in `public/manifest.webmanifest`). It still is a web app: storage is Safari’s, and iOS can evict it under storage pressure.

#### 5. Keep the computer available — or don’t

The Home Screen shortcut points at the URL you saved.

- If that URL is your computer’s preview server, the computer must be on and serving whenever you train.
- For a URL that stays up without your laptop, put `dist/` behind any static host you control (a tiny always-on machine on your LAN, or HTTPS hosting). Then repeat Add to Home Screen with that URL.

A saved Home Screen app does **not** copy the files onto the iPhone. Path B does.

#### HTTPS note

Wake Lock and Web Notifications want a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (`https://` or `localhost`). A plain `http://192.168.…` preview still runs workouts and audio after you tap Start; keep-awake and rest notifications may not fire. Path B does not have that limitation.

---

### Path B — Native app with Xcode (recommended)

This wraps the built web app in a Capacitor iOS shell and installs it on your phone with Xcode. You get a real Momentum icon, native haptics via `@capacitor/haptics`, and a hook for local notifications via `@capacitor/local-notifications`.

Do this on a **Mac**. You do not need to pay Apple to install on a device you own.

#### 1. One-time Mac setup

1. Install **Xcode** from the App Store and open it once so it can finish installing components.
2. Install CLTs:

   ```bash
   xcode-select --install
   ```

3. In Xcode: **Xcode → Settings → Accounts** → add your **Apple ID**.

#### 2. Install JS dependencies and add iOS

From the repo (first time only for the native project):

```bash
npm install
npm install @capacitor/ios
npm run build
npx cap add ios
```

`npx cap add ios` creates `ios/`. Capacitor 8 defaults to Swift Package Manager. You should not need CocoaPods unless a plugin forces it.

`capacitor.config.ts` already has:

- `appId`: `com.momentum.workout`
- `appName`: `Momentum`
- `webDir`: `dist`

If Xcode later complains that the bundle id is unavailable, change `appId` to something unique (for example `com.yourname.momentum`) and run `npx cap sync`.

#### 3. Sync the web build into iOS

Whenever the web app changes:

```bash
npm run cap:sync
```

That script is `npm run build && npx cap sync`. It typechecks, production-builds Vite, and copies `dist/` into the Xcode project.

#### 4. Open Xcode

```bash
npx cap open ios
```

Or: `open ios/App/App.xcworkspace`.

#### 5. Signing (free Apple ID)

1. In the left sidebar, select the **App** target.
2. Open **Signing & Capabilities**.
3. Check **Automatically manage signing**.
4. **Team:** your personal Apple ID team (it may appear as your name).
5. Confirm the bundle identifier is `com.momentum.workout` (or the unique id you chose).

Xcode will create a development certificate and a provisioning profile. The first time, it may ask you to sign in again.

#### 6. Enable Developer Mode on the iPhone (iOS 16+)

On the iPhone:

1. **Settings → Privacy & Security → Developer Mode** → turn it **On**.
2. Restart when iOS asks.
3. After reboot, confirm **Turn On** on the passcode screen.

Without Developer Mode, Xcode can build but the phone will refuse to run the app.

#### 7. Plug in the iPhone and trust the computer

1. Unlock the iPhone and connect it with a cable.
2. If iOS shows **Trust This Computer?**, tap **Trust** and enter the passcode.
3. On the Mac, if Finder asks to trust the device, confirm.

Wireless later: in Finder, select the iPhone, enable **Show this iPhone when on Wi-Fi**, then pick the phone in Xcode’s device list.

#### 8. Run it on the device

1. In Xcode’s toolbar, choose your **iPhone** as the run destination (not a simulator, if you want it in your pocket).
2. Press **Run** (▶) or `⌘R`.
3. Wait for the build, install, and launch.

If iOS says the developer is not trusted:

1. **Settings → General → VPN & Device Management** (wording varies by iOS version).
2. Tap your Apple ID certificate.
3. **Trust**.
4. Open **Momentum** from the Home Screen.

The app stays installed after you unplug. A **free** Apple ID provisioning profile expires after **7 days**. Open Xcode and Run again to refresh it. A paid Developer Program membership extends that to a year and is what you would need for TestFlight or the App Store — not required just to train.

#### 9. Simulator (optional)

In Xcode, pick an iPhone simulator and Run. Good for UI checks. IndexedDB in the simulator is not your real phone’s history. Hardware haptics will not feel like a device.

#### 10. If something fails

- **Code signing error:** Team not selected, or bundle id conflict — fix Signing & Capabilities, unique `appId`, `npx cap sync`.
- **Could not launch / Untrusted developer:** Developer Mode + trust the certificate (steps 6 and 8).
- **Blank screen:** `dist/` missing or stale — `npm run cap:sync`, then Run again.
- **Sound missing:** tap **Start workout** once; check the mute switch and Settings → Sounds in the app.
- **Plugin / SPM package errors:** `npx cap sync` from the repo root, then build in Xcode again.

Official references: [Capacitor iOS](https://capacitorjs.com/docs/ios) and [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

---

### Path C — a-Shell on the iPhone

Use this when you want the files **on the phone** and a local server, without Xcode. You still build `dist/` on a computer first. This Vite app is not a single HTML file; a-Shell cannot compile TypeScript without Node.

#### 1. Build on a computer

```bash
npm install
npm run build
```

#### 2. Get `dist/` onto the iPhone

Pick one:

- **Git:** commit only if you *intentionally* want a built snapshot in the repo (`dist/` is gitignored by default). Otherwise, copy the folder.
- **Files / iCloud / AirDrop:** copy the `dist` directory into a-Shell’s reachable storage (a-Shell can see its own documents and, depending on version, iCloud).
- **Clone then replace:** clone this repo in a-Shell, then overwrite or add `dist/` from the computer.

#### 3. Serve and open

In [a-Shell](https://apps.apple.com/app/a-shell/id1473805438):

```sh
cd dist
python3 -m http.server 8080
```

Then, still on the iPhone, open **Safari** to `http://127.0.0.1:8080` and follow Path A’s **Add to Home Screen** steps.

Leave a-Shell running in the background while you train, or the local server stops. This path is more fragile than Path B; it exists so you can run without a Mac at session time, after you have a `dist/` folder.

---

## First workout on the phone

1. Unmute the ringer if you want audible cues. Silent Mode can swallow sounds depending on Safari vs native WebView.
2. In **Settings**, keep **Sounds** on, pick **Standard** or **Loud**, and turn **Keep screen awake** on.
3. Optional: enable **Haptics** (native Path B uses Capacitor; Safari uses `navigator.vibrate`, which iOS does not support).
4. Put the phone face-up where you can see the tempo phase (LOWER / PAUSE / LIFT / HOLD).
5. Tap **Start workout**. The first tap also unlocks audio.
6. Do not lock the phone during a set. Rest periods catch up from wall-clock time if you return to the app; the metronome does not continue under a locked screen in V1.

---

## Rebuild after you change the code

| You are using | After editing `src/` |
| --- | --- |
| Computer browser | `npm run dev` hot-reloads |
| Path A Home Screen | `npm run build`, restart `vite preview --host`, pull-to-refresh in Safari, or delete and re-add the Home Screen icon if the URL changed |
| Path B native app | `npm run cap:sync`, then Run in Xcode |
| Path C a-Shell | Rebuild `dist/` on a computer, copy it back, restart `python3 -m http.server` |

The `ios/` native project, once generated, is yours to keep. You do not run `npx cap add ios` again unless you deleted `ios/`.

---

## Progression rules

Double progression, evaluated when an exercise finishes:

- Hit the current target on a set → next session that set’s target goes up by 1, capped at **max reps**.
- Hit **max reps on every set**, with effort/RIR in range → recommend **increase difficulty** (harder variation or more load) and reset targets near the bottom of the range. Review can apply that.
- Too hard, RIR 0, poor form, missed min reps, a reduced target, or a sharp drop vs last time → **hold** the current resistance and targets.

Unilateral work (pistol squats) uses the weaker side for completed-rep math.

---

## Settings

| Setting | Effect |
| --- | --- |
| Theme | System, dark, or light |
| Sound profile | Minimal, standard, loud, silent |
| Volume | Web Audio gain |
| Sounds / haptics | Master toggles |
| Keep screen awake | Screen Wake Lock when the browser/OS allows it |
| Notifications | Rest-complete ping (web Notification API, or Capacitor local notifications on native) |
| Large text / high contrast / reduce motion | Display |

**Test cues** on the Settings screen fire sample tones so you can set volume before you load a bar.

---

## Browser and iOS limits

V1 **cannot** guarantee metronome playback when the screen is locked or the app is backgrounded. iOS Safari suspends `AudioContext` and throttles timers.

What V1 does instead:

- Pause countdown/metronome when the tab hides during a set (`src/platform/background.ts`).
- Catch up rest and transition timers from wall-clock time when you return.
- Request a screen wake lock during the session when supported.
- Keep native background audio as a future Capacitor adapter behind that same port (`guaranteedBackgroundAudio: false` today).

iOS Safari also does not implement `navigator.vibrate`. Expect haptic ticks on Path B, not Path A.

---

## Privacy

- No analytics, accounts, or network calls are required to train or log.
- Workout history never leaves the device unless you back up that browser/app container yourself.
- Clearing website data (Path A) or deleting the app (Path B) deletes the Dexie database.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then production Vite build into `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Vitest once |
| `npm run test:watch` | Vitest watch |
| `npm run cap:sync` | Production build + `npx cap sync` (needs `ios/` from Path B) |
